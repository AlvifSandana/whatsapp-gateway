import Redis from "ioredis";
import pino from "pino";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@repo/db";
import { config } from "../config";
import { buildContactsCsv, buildMessagesCsv } from "../lib/reports";
import { logAudit } from "../lib/audit";
import { getUserPermissionCodes } from "../lib/rbac";

const logger = pino({ level: config.logLevel });

type ExportJobPayload = {
  exportId: string;
};

export const canProcessExport = (job: { type: string }, permissions: string[]) => {
  return ["contacts", "messages"].includes(job.type) && permissions.includes("reports:export");
};

export const startExportWorker = () => {
  const queueRedis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
  });

  const retryKey = (exportId: string) => `export:attempts:${exportId}`;

  const scheduleRetry = async (exportId: string) => {
    const attempt = await queueRedis.incr(retryKey(exportId));
    if (attempt > config.exportRetryMax) {
      await queueRedis.del(retryKey(exportId));
      await prisma.export.update({
        where: { id: exportId },
        data: { status: "FAILED" },
      });
      return false;
    }
    const delay = config.exportRetryBaseDelayMs * Math.pow(2, attempt - 1);
    setTimeout(() => {
      queueRedis.rpush("q:reports:export", JSON.stringify({ exportId })).catch((err) => {
        logger.error({ err }, "Failed to requeue export");
      });
    }, delay);
    return true;
  };

  const run = async () => {
    while (true) {
      const res = await queueRedis.blpop("q:reports:export", 0);
      if (!res || res.length < 2) continue;
      const payload = JSON.parse(res[1]) as ExportJobPayload;
      if (!payload?.exportId) continue;

      try {
        const job = await prisma.export.findUnique({ where: { id: payload.exportId } });
        if (!job) continue;

        if (!job.createdBy) {
          await prisma.export.update({
            where: { id: job.id },
            data: { status: "FAILED" },
          });
          await logAudit({
            workspaceId: job.workspaceId,
            action: "reports.export.denied",
            entityType: "Export",
            entityId: job.id,
            afterJson: { reason: "missing_creator" },
          });
          continue;
        }

        const permissions = await getUserPermissionCodes(job.createdBy, job.workspaceId);
        if (!permissions.includes("reports:export")) {
          await prisma.export.update({
            where: { id: job.id },
            data: { status: "FAILED" },
          });
          await logAudit({
            workspaceId: job.workspaceId,
            action: "reports.export.denied",
            entityType: "Export",
            entityId: job.id,
            afterJson: { reason: "missing_permission", userId: job.createdBy },
          });
          continue;
        }

        if (!canProcessExport(job, permissions)) {
          await prisma.export.update({
            where: { id: job.id },
            data: { status: "FAILED" },
          });
          continue;
        }

        await prisma.export.update({
          where: { id: job.id },
          data: { status: "PROCESSING" },
        });

        const csv =
          job.type === "messages"
            ? await buildMessagesCsv(job.workspaceId, (job.params || {}) as any)
            : await buildContactsCsv(job.workspaceId, (job.params || {}) as any);
        const outputDir = path.join(process.cwd(), "exports");
        await mkdir(outputDir, { recursive: true });
        const filename = `${job.type}-${job.id}.${job.format || "csv"}`;
        const filePath = path.join(outputDir, filename);
        await writeFile(filePath, csv, "utf8");

        await prisma.export.update({
          where: { id: job.id },
          data: { status: "DONE", fileRef: filename },
        });
        await queueRedis.del(retryKey(job.id));

        await logAudit({
          workspaceId: job.workspaceId,
          action: "reports.export.completed",
          entityType: "Export",
          entityId: job.id,
          afterJson: { fileRef: filename },
        });
      } catch (err) {
        logger.error(err, "Export worker error");
        await scheduleRetry(payload.exportId);
      }
    }
  };

  run().catch((err) => logger.error(err, "Export worker exited"));
  return queueRedis;
};
