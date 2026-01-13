import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "@repo/db";
import { logAudit } from "@repo/shared";
import { config } from "../config";

const app = new Hono();
let re2Loaded = false;
let re2Module: any = null;

const loadRe2 = async () => {
  if (re2Loaded) return re2Module;
  re2Loaded = true;
  try {
    re2Module = await import("re2");
  } catch {
    re2Module = null;
  }
  return re2Module;
};

const timeWindowSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  days: z.array(z.number().int().min(0).max(6)).optional(),
  timeZone: z.string().optional(),
});

const baseSchema = z.object({
  name: z.string().min(1),
  waAccountId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().optional(),
  patternType: z.enum(["KEYWORD", "CONTAINS", "REGEX"]),
  patternValue: z.string().min(1),
  replyMode: z.enum(["STATIC", "WEBHOOK"]),
  replyText: z.string().optional(),
  replyPayload: z.unknown().optional(),
  webhookUrl: z.string().url().nullable().optional(),
  webhookSecret: z.string().nullable().optional(),
  cooldownSeconds: z.number().int().min(0).optional(),
  timeWindow: z.union([timeWindowSchema, z.null()]).optional(),
});

const updateSchema = baseSchema.partial();

function buildReplyPayload(
  input: z.infer<typeof baseSchema> | z.infer<typeof updateSchema>,
) {
  if (input.replyMode !== "STATIC") return input.replyPayload;
  if (input.replyText) return { text: input.replyText };
  return input.replyPayload;
}

function normalizeText(text: string) {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

async function ensureWaAccountId(
  waAccountId: string | null | undefined,
  workspaceId: string,
) {
  if (!waAccountId) return;
  const account = await prisma.waAccount.findFirst({
    where: { id: waAccountId, workspaceId },
    select: { id: true },
  });
  if (!account) {
    throw new Error("Invalid waAccountId for workspace.");
  }
}

// List rules
app.get("/", async (c) => {
  const auth = c.get("auth") as any;
  const workspaceId = auth.workspaceId;
  const rules = await prisma.autoReplyRule.findMany({
    where: { workspaceId },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
  return c.json({ data: rules });
});

// Create rule
app.post("/", zValidator("json", baseSchema), async (c) => {
  const auth = c.get("auth") as any;
  const workspaceId = auth.workspaceId;
  const input = c.req.valid("json");

  try {
    await ensureWaAccountId(input.waAccountId ?? null, workspaceId);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }

  if (input.replyMode === "STATIC" && !input.replyText && !input.replyPayload) {
    return c.json({ error: "replyText is required for STATIC replies." }, 400);
  }
  if (input.replyMode === "WEBHOOK" && !input.webhookUrl) {
    return c.json({ error: "webhookUrl is required for WEBHOOK replies." }, 400);
  }

  const rule = await prisma.autoReplyRule.create({
    data: {
      workspaceId,
      waAccountId: input.waAccountId ?? null,
      name: input.name,
      isActive: input.isActive ?? true,
      priority: input.priority ?? 0,
      patternType: input.patternType,
      patternValue: input.patternValue,
      replyMode: input.replyMode,
      replyPayload: buildReplyPayload(input),
      webhookUrl: input.webhookUrl,
      webhookSecret: input.webhookSecret,
      cooldownSeconds: input.cooldownSeconds ?? 0,
      timeWindow: input.timeWindow,
    },
  });

  await logAudit({
    workspaceId,
    action: "auto_reply.create",
    entityType: "AutoReplyRule",
    entityId: rule.id,
    afterJson: { name: rule.name, isActive: rule.isActive },
  });

  return c.json({ data: rule }, 201);
});

// Update rule
app.put("/:id", zValidator("json", updateSchema), async (c) => {
  const auth = c.get("auth") as any;
  const workspaceId = auth.workspaceId;
  const id = c.req.param("id");
  const input = c.req.valid("json");

  const existing = await prisma.autoReplyRule.findFirst({
    where: { id, workspaceId },
  });
  if (!existing) return c.json({ error: "Not found" }, 404);

  try {
    if (input.waAccountId !== undefined) {
      await ensureWaAccountId(input.waAccountId ?? null, workspaceId);
    }
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }

  const nextReplyMode = input.replyMode ?? existing.replyMode;
  if (
    nextReplyMode === "STATIC" &&
    !input.replyText &&
    !input.replyPayload &&
    !existing.replyPayload
  ) {
    return c.json({ error: "replyText is required for STATIC replies." }, 400);
  }
  if (nextReplyMode === "WEBHOOK" && !input.webhookUrl && !existing.webhookUrl) {
    return c.json({ error: "webhookUrl is required for WEBHOOK replies." }, 400);
  }

  let nextReplyPayload = existing.replyPayload;
  if (nextReplyMode === "STATIC") {
    if (input.replyText) nextReplyPayload = { text: input.replyText };
    else if (input.replyPayload !== undefined) nextReplyPayload = input.replyPayload;
  } else if (input.replyPayload !== undefined) {
    nextReplyPayload = input.replyPayload;
  }

  const rule = await prisma.autoReplyRule.update({
    where: { id },
    data: {
      name: input.name,
      waAccountId: input.waAccountId,
      isActive: input.isActive,
      priority: input.priority,
      patternType: input.patternType,
      patternValue: input.patternValue,
      replyMode: input.replyMode,
      replyPayload: nextReplyPayload,
      webhookUrl: input.webhookUrl,
      webhookSecret: input.webhookSecret,
      cooldownSeconds: input.cooldownSeconds,
      timeWindow: input.timeWindow,
    },
  });

  await logAudit({
    workspaceId,
    action: "auto_reply.update",
    entityType: "AutoReplyRule",
    entityId: rule.id,
    beforeJson: { name: existing.name, isActive: existing.isActive },
    afterJson: { name: rule.name, isActive: rule.isActive },
  });

  return c.json({ data: rule });
});

// Delete rule
app.delete("/:id", async (c) => {
  const auth = c.get("auth") as any;
  const workspaceId = auth.workspaceId;
  const id = c.req.param("id");

  const existing = await prisma.autoReplyRule.findFirst({
    where: { id, workspaceId },
  });
  if (!existing) return c.json({ error: "Not found" }, 404);

  await prisma.autoReplyRule.delete({ where: { id } });

  await logAudit({
    workspaceId,
    action: "auto_reply.delete",
    entityType: "AutoReplyRule",
    entityId: id,
    beforeJson: { name: existing.name },
  });

  return c.json({ message: "Deleted" });
});

// Test a rule match
app.post(
  "/:id/test",
  zValidator("json", z.object({ text: z.string().min(1) })),
  async (c) => {
    const auth = c.get("auth") as any;
    const workspaceId = auth.workspaceId;
    const id = c.req.param("id");
    const { text } = c.req.valid("json");

    const rule = await prisma.autoReplyRule.findFirst({
      where: { id, workspaceId },
    });
    if (!rule) return c.json({ error: "Not found" }, 404);

    let match = false;
    const input = normalizeText(text);
    const pattern = normalizeText(rule.patternValue);

    if (rule.patternType === "KEYWORD") {
      match = input === pattern;
    } else if (rule.patternType === "CONTAINS") {
      match = input.includes(pattern);
    } else if (rule.patternType === "REGEX") {
      try {
        if (rule.patternValue.length > config.autoReplyRegexMaxLength) {
          return c.json({ error: "Regex pattern too long." }, 400);
        }
        const mod = await loadRe2();
        const Re2Ctor = mod?.default || mod;
        const regex = Re2Ctor
          ? new Re2Ctor(rule.patternValue, "i")
          : new RegExp(rule.patternValue, "i");
        match = regex.test(text);
      } catch {
        return c.json({ error: "Invalid regex in rule." }, 400);
      }
    }

    return c.json({
      data: {
        match,
        replyMode: rule.replyMode,
        replyPayload: rule.replyPayload,
      },
    });
  },
);

export default app;
