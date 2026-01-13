import Redis from "ioredis";
import pino from "pino";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { prisma } from "@repo/db";
import { config } from "../config";
import { logAudit } from "../lib/audit";

const logger = pino({ level: config.logLevel });

type ImportJobPayload = {
  jobId: string;
};

const importFolder = () => path.join(process.cwd(), "contact-imports");

const parseCsvFile = async (jobId: string) => {
  const filePath = path.join(importFolder(), `${jobId}.csv`);
  const text = await readFile(filePath, "utf8");
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];
};

const extractValue = (record: Record<string, string>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) {
      const trimmed = String(value).trim();
      if (trimmed) return trimmed;
    }
  }
  return "";
};

const normalizeTags = (value: string) => {
  if (!value) return [];
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
};

const buildRows = async (jobId: string, workspaceId: string, records: Record<string, string>[]) => {
  const phones = records
    .map((record) => extractValue(record, ["phone", "Phone", "PHONE"]))
    .filter(Boolean);

  const existing = await prisma.contact.findMany({
    where: { workspaceId, phoneE164: { in: phones } },
    select: { phoneE164: true },
  });
  const existingSet = new Set(existing.map((c) => c.phoneE164));
  const seenInFile = new Set<string>();

  return records.map((record, idx) => {
    const rawPhone = extractValue(record, ["phone", "Phone", "PHONE"]);
    const rawName = extractValue(record, ["name", "Name", "NAME"]);
    const rawTags = extractValue(record, ["tags", "Tags", "TAGS"]);
    const tags = normalizeTags(rawTags);

    let error = "";
    let isValid = true;
    if (!rawPhone) {
      error = "Missing phone";
      isValid = false;
    } else if (existingSet.has(rawPhone)) {
      error = "Duplicate (already exists)";
      isValid = false;
    } else if (seenInFile.has(rawPhone)) {
      error = "Duplicate in file";
      isValid = false;
    }

    if (rawPhone) seenInFile.add(rawPhone);

    return {
      jobId,
      rowNo: idx + 1,
      raw: record,
      normalizedPhone: rawPhone || null,
      normalizedName: rawName || null,
      tags,
      isValid,
      error: error || null,
    };
  });
};

const validateJob = async (payload: ImportJobPayload) => {
  const job = await prisma.contactImportJob.findUnique({
    where: { id: payload.jobId },
  });
  if (!job) return;

  await prisma.contactImportJob.update({
    where: { id: job.id },
    data: { status: "PROCESSING" },
  });

  try {
    const records = await parseCsvFile(job.id);
    const rows = await buildRows(job.id, job.workspaceId, records);

    const totalRows = rows.length;
    const validRows = rows.filter((row) => row.isValid).length;
    const invalidRows = rows.filter(
      (row) => !row.isValid && row.error !== "Duplicate (already exists)",
    ).length;
    const duplicateRows = rows.filter(
      (row) => row.error === "Duplicate (already exists)" || row.error === "Duplicate in file",
    ).length;

    await prisma.contactImportRow.deleteMany({ where: { jobId: job.id } });
    if (rows.length > 0) {
      await prisma.contactImportRow.createMany({ data: rows });
    }

    await prisma.contactImportJob.update({
      where: { id: job.id },
      data: {
        status: "READY",
        totalRows,
        validRows,
        invalidRows,
        duplicateRows,
      },
    });

    await logAudit({
      workspaceId: job.workspaceId,
      action: "contacts.import.validate",
      entityType: "ContactImport",
      entityId: job.id,
      afterJson: { filename: job.filename, totalRows, validRows, invalidRows, duplicateRows },
    });
  } catch (err) {
    logger.error({ err, jobId: job.id }, "Failed to validate import");
    await prisma.contactImportJob.update({
      where: { id: job.id },
      data: { status: "FAILED" },
    });
  }
};

const commitJob = async (payload: ImportJobPayload) => {
  const job = await prisma.contactImportJob.findUnique({
    where: { id: payload.jobId },
  });
  if (!job) return;

  if (job.status !== "COMMITTING") {
    await prisma.contactImportJob.update({
      where: { id: job.id },
      data: { status: "FAILED" },
    });
    return;
  }

  const rows = await prisma.contactImportRow.findMany({
    where: { jobId: job.id, isValid: true },
    orderBy: { rowNo: "asc" },
  });

  try {
    for (const row of rows) {
      if (!row.normalizedPhone) continue;
      await prisma.contact.upsert({
        where: {
          workspaceId_phoneE164: {
            workspaceId: job.workspaceId,
            phoneE164: row.normalizedPhone,
          },
        },
        create: {
          workspaceId: job.workspaceId,
          phoneE164: row.normalizedPhone,
          displayName: row.normalizedName || undefined,
          tags: {
            create: row.tags.map((tagName) => ({
              tag: {
                connectOrCreate: {
                  where: {
                    workspaceId_name: { workspaceId: job.workspaceId, name: tagName },
                  },
                  create: { workspaceId: job.workspaceId, name: tagName },
                },
              },
            })),
          },
        },
        update: {
          displayName: row.normalizedName || undefined,
        },
      });
    }

    await prisma.contactImportJob.update({
      where: { id: job.id },
      data: { status: "DONE" },
    });

    await logAudit({
      workspaceId: job.workspaceId,
      action: "contacts.import.commit",
      entityType: "ContactImport",
      entityId: job.id,
      afterJson: { imported: rows.length },
    });
  } catch (err) {
    logger.error({ err, jobId: job.id }, "Failed to commit import");
    await prisma.contactImportJob.update({
      where: { id: job.id },
      data: { status: "FAILED" },
    });
  }
};

export const startContactImportWorker = () => {
  const queueRedis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
  });

  const run = async () => {
    while (true) {
      const res = await queueRedis.blpop(
        ["q:contacts:import:validate", "q:contacts:import:commit"],
        0,
      );
      if (!res || res.length < 2) continue;
      const queue = res[0];
      const payload = JSON.parse(res[1]) as ImportJobPayload;
      if (!payload?.jobId) continue;
      if (queue === "q:contacts:import:validate") {
        await validateJob(payload);
      } else {
        await commitJob(payload);
      }
    }
  };

  run().catch((err) => logger.error(err, "Contact import worker exited"));
  return queueRedis;
};
