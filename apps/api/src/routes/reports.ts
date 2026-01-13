import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "@repo/db";
import { logAudit } from "@repo/shared";
import { readFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { redis } from "../redis";
import { config } from "../config";

const app = new Hono();

const exportSchema = z.object({
  type: z.enum(["contacts", "messages"]),
  format: z.string().optional(),
  params: z
    .object({
      ids: z.array(z.string()).optional(),
      tagIds: z.array(z.string()).optional(),
      contactId: z.string().optional(),
      waAccountId: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    })
    .optional(),
});

const signToken = (exportId: string, expiresAt: number) => {
  const payload = `${exportId}.${expiresAt}`;
  const signature = crypto
    .createHmac("sha256", config.exportDownloadSecret)
    .update(payload)
    .digest("hex");
  return `${payload}.${signature}`;
};

const verifyToken = (token: string, exportId: string) => {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [id, exp, sig] = parts;
  if (id !== exportId) return false;
  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  const expected = signToken(id, expiresAt).split(".")[2];
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
};

app.get("/exports", async (c) => {
  const auth = c.get("auth") as any;
  const exportsList = await prisma.export.findMany({
    where: { workspaceId: auth.workspaceId },
    orderBy: { createdAt: "desc" },
  });
  return c.json({ data: exportsList });
});

app.post("/exports", zValidator("json", exportSchema), async (c) => {
  const auth = c.get("auth") as any;
  const input = c.req.valid("json");
  const format = input.format || "csv";

  const exportJob = await prisma.export.create({
    data: {
      workspaceId: auth.workspaceId,
      type: input.type,
      params: input.params || {},
      format,
      status: "PENDING",
      createdBy: auth.userId,
    },
  });

  try {
    await redis.rpush("q:reports:export", JSON.stringify({ exportId: exportJob.id }));
  } catch (err) {
    await prisma.export.update({
      where: { id: exportJob.id },
      data: { status: "FAILED" },
    });
    return c.json({ error: "Failed to queue export" }, 500);
  }

  await logAudit({
    workspaceId: auth.workspaceId,
    action: "reports.export.requested",
    entityType: "Export",
    entityId: exportJob.id,
    afterJson: { type: input.type, format },
  });

  return c.json({ data: exportJob }, 201);
});

app.get("/exports/:id", async (c) => {
  const auth = c.get("auth") as any;
  const id = c.req.param("id");
  const exportJob = await prisma.export.findFirst({
    where: { id, workspaceId: auth.workspaceId },
  });
  if (!exportJob) return c.json({ error: "Not found" }, 404);
  return c.json({ data: exportJob });
});

app.get("/exports/:id/signed-url", async (c) => {
  const auth = c.get("auth") as any;
  const id = c.req.param("id");
  const exportJob = await prisma.export.findFirst({
    where: { id, workspaceId: auth.workspaceId },
  });
  if (!exportJob) return c.json({ error: "Not found" }, 404);
  if (exportJob.status !== "DONE") {
    return c.json({ error: "Export not ready" }, 409);
  }
  const expiresAt = Date.now() + 1000 * 60 * 15;
  const token = signToken(exportJob.id, expiresAt);
  const url = new URL(c.req.url);
  url.pathname = `/v1/reports/exports/${exportJob.id}/download`;
  url.searchParams.set("token", token);
  return c.json({ data: { url: url.toString(), expiresAt } });
});

app.get("/exports/:id/download", async (c) => {
  const id = c.req.param("id");
  const token = c.req.query("token");
  const auth = c.get("auth") as any;
  const exportJob = await prisma.export.findFirst({
    where: auth?.workspaceId ? { id, workspaceId: auth.workspaceId } : { id },
  });
  if (!exportJob) return c.json({ error: "Not found" }, 404);
  if (!auth && token) {
    if (!verifyToken(token, exportJob.id)) {
      return c.json({ error: "Invalid token" }, 401);
    }
  } else if (!auth) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (exportJob.status !== "DONE" || !exportJob.fileRef) {
    return c.json({ error: "Export not ready" }, 409);
  }

  const filePath = path.join(process.cwd(), "exports", exportJob.fileRef);
  try {
    const file = await readFile(filePath, "utf8");
    return new Response(file, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=\"${exportJob.fileRef}\"`,
      },
    });
  } catch (err) {
    return c.json({ error: "Export file missing" }, 404);
  }
});

export default app;
