import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "@repo/db";
import { redis, pubSubPublisher } from "../redis";
import { logAudit } from "@repo/shared";

const app = new Hono();

// List Accounts
app.get("/", async (c) => {
  const auth = c.get("auth") as any;
  const workspaceId = auth.workspaceId;
  const includeMetrics = c.req.query("includeMetrics") === "true";

  const accounts = await prisma.waAccount.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
  if (!includeMetrics || accounts.length === 0) {
    return c.json({ data: accounts });
  }

  const metricKeys = accounts.flatMap((account) => [
    `metrics:wa:${account.id}:sent`,
    `metrics:wa:${account.id}:failed`,
    `metrics:wa:${account.id}:incoming`,
    `metrics:wa:${account.id}:sent:1h`,
    `metrics:wa:${account.id}:failed:1h`,
    `metrics:wa:${account.id}:incoming:1h`,
  ]);
  const metrics = await redis.mget(metricKeys);
  const data = accounts.map((account, index) => {
    const base = index * 6;
    return {
      ...account,
      metrics: {
        sent: Number(metrics[base] || 0),
        failed: Number(metrics[base + 1] || 0),
        incoming: Number(metrics[base + 2] || 0),
        sent1h: Number(metrics[base + 3] || 0),
        failed1h: Number(metrics[base + 4] || 0),
        incoming1h: Number(metrics[base + 5] || 0),
      },
    };
  });

  return c.json({ data });
});

app.get("/:id/metrics", async (c) => {
  const id = c.req.param("id");
  const auth = c.get("auth") as any;
  const account = await prisma.waAccount.findFirst({
    where: { id, workspaceId: auth.workspaceId },
    select: { id: true },
  });
  if (!account) return c.json({ error: "Not found" }, 404);

  const [sent, failed, incoming] = await redis.mget(
    `metrics:wa:${id}:sent`,
    `metrics:wa:${id}:failed`,
    `metrics:wa:${id}:incoming`,
  );
  const [sent1h, failed1h, incoming1h] = await redis.mget(
    `metrics:wa:${id}:sent:1h`,
    `metrics:wa:${id}:failed:1h`,
    `metrics:wa:${id}:incoming:1h`,
  );

  return c.json({
    data: {
      waAccountId: id,
      sent: Number(sent || 0),
      failed: Number(failed || 0),
      incoming: Number(incoming || 0),
      sent1h: Number(sent1h || 0),
      failed1h: Number(failed1h || 0),
      incoming1h: Number(incoming1h || 0),
    },
  });
});

// Create Account
app.post(
  "/",
  zValidator(
    "json",
    z.object({
      phoneE164: z.string(),
      label: z.string().optional(),
    }),
  ),
  async (c) => {
    const { phoneE164, label } = c.req.valid("json");
    const auth = c.get("auth") as any;
    const workspaceId = auth.workspaceId;

    // Ensure workspace exists (mock check or FK constraint handles it)
    try {
      const account = await prisma.waAccount.create({
        data: {
          workspaceId,
          phoneE164,
          label,
          status: "DISCONNECTED",
          settings: { needs_pairing: true },
        },
      });

      await logAudit({
        workspaceId,
        action: "wa_account.create",
        entityType: "WaAccount",
        entityId: account.id,
        afterJson: account,
      });

      return c.json({ data: account }, 201);
    } catch (err) {
      return c.json({ error: "Failed to create account" }, 500);
    }
  },
);

// Update Account (label only for now)
app.patch(
  "/:id",
  zValidator(
    "json",
    z.object({
      label: z.string().nullable().optional(),
    }),
  ),
  async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");

    const auth = c.get("auth") as any;
    const account = await prisma.waAccount.findFirst({
      where: { id, workspaceId: auth.workspaceId },
    });
    if (!account) return c.json({ error: "Not found" }, 404);

    const updated = await prisma.waAccount.update({
      where: { id },
      data: { label: input.label ?? null },
    });

    await logAudit({
      workspaceId: account.workspaceId,
      action: "wa_account.update",
      entityType: "WaAccount",
      entityId: id,
      beforeJson: { label: account.label },
      afterJson: { label: updated.label },
    });

    return c.json({ data: updated });
  },
);

// Update Account Label (POST fallback)
app.post(
  "/:id/label",
  zValidator(
    "json",
    z.object({
      label: z.string().nullable().optional(),
    }),
  ),
  async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");

    const auth = c.get("auth") as any;
    const account = await prisma.waAccount.findFirst({
      where: { id, workspaceId: auth.workspaceId },
    });
    if (!account) return c.json({ error: "Not found" }, 404);

    const updated = await prisma.waAccount.update({
      where: { id },
      data: { label: input.label ?? null },
    });

    await logAudit({
      workspaceId: account.workspaceId,
      action: "wa_account.update",
      entityType: "WaAccount",
      entityId: id,
      beforeJson: { label: account.label },
      afterJson: { label: updated.label },
    });

    return c.json({ data: updated });
  },
);

// Get QR
app.get("/:id/qr", async (c) => {
  const id = c.req.param("id");
  const auth = c.get("auth") as any;
  const account = await prisma.waAccount.findFirst({
    where: { id, workspaceId: auth.workspaceId },
    select: { id: true },
  });
  if (!account) return c.json({ error: "Not found" }, 404);
  const qr = await redis.get(`wa:qr:${id}`);

  if (!qr) {
    return c.json({ error: "QR not available or expired" }, 404);
  }
  return c.json({ data: { qr } });
});

// Connect (Command)
app.post("/:id/connect", async (c) => {
  const id = c.req.param("id");

  // Validate existence
  const auth = c.get("auth") as any;
  const account = await prisma.waAccount.findFirst({
    where: { id, workspaceId: auth.workspaceId },
  });
  if (!account) return c.json({ error: "Not found" }, 404);

  // Publish command
  const permissions = (c.get("permissions") as string[]) || [];
  const cmd = {
    type: "START",
    waAccountId: id,
    meta: {
      userId: auth.userId,
      workspaceId: auth.workspaceId,
      permissions,
    },
  };
  await pubSubPublisher.publish("cmd:wa-runtime", JSON.stringify(cmd));

  await logAudit({
    workspaceId: account.workspaceId,
    action: "wa_account.connect",
    entityType: "WaAccount",
    entityId: id,
    afterJson: { status: "CONNECTING" },
  });

  return c.json({ message: "Connect command sent" });
});

// Disconnect (Command)
app.post("/:id/disconnect", async (c) => {
  const id = c.req.param("id");

  const auth = c.get("auth") as any;
  const account = await prisma.waAccount.findFirst({
    where: { id, workspaceId: auth.workspaceId },
  });
  if (!account) return c.json({ error: "Not found" }, 404);

  // Publish command
  const permissions = (c.get("permissions") as string[]) || [];
  const cmd = {
    type: "STOP",
    waAccountId: id,
    meta: {
      userId: auth.userId,
      workspaceId: auth.workspaceId,
      permissions,
    },
  };
  await pubSubPublisher.publish("cmd:wa-runtime", JSON.stringify(cmd));

  await logAudit({
    workspaceId: account.workspaceId,
    action: "wa_account.disconnect",
    entityType: "WaAccount",
    entityId: id,
    beforeJson: { status: account.status },
  });

  return c.json({ message: "Disconnect command sent" });
});

// Reconnect (Command)
app.post("/:id/reconnect", async (c) => {
  const id = c.req.param("id");

  const auth = c.get("auth") as any;
  const account = await prisma.waAccount.findFirst({
    where: { id, workspaceId: auth.workspaceId },
  });
  if (!account) return c.json({ error: "Not found" }, 404);

  const permissions = (c.get("permissions") as string[]) || [];
  const cmd = {
    type: "RECONNECT",
    waAccountId: id,
    meta: {
      userId: auth.userId,
      workspaceId: auth.workspaceId,
      permissions,
    },
  };
  await pubSubPublisher.publish("cmd:wa-runtime", JSON.stringify(cmd));

  await logAudit({
    workspaceId: account.workspaceId,
    action: "wa_account.reconnect",
    entityType: "WaAccount",
    entityId: id,
  });

  return c.json({ message: "Reconnect command sent" });
});

// Reset Credentials (Command)
app.post("/:id/reset-creds", async (c) => {
  const id = c.req.param("id");

  const auth = c.get("auth") as any;
  const account = await prisma.waAccount.findFirst({
    where: { id, workspaceId: auth.workspaceId },
  });
  if (!account) return c.json({ error: "Not found" }, 404);

  const permissions = (c.get("permissions") as string[]) || [];
  const cmd = {
    type: "RESET_CREDS",
    waAccountId: id,
    meta: {
      userId: auth.userId,
      workspaceId: auth.workspaceId,
      permissions,
    },
  };
  await pubSubPublisher.publish("cmd:wa-runtime", JSON.stringify(cmd));

  await logAudit({
    workspaceId: account.workspaceId,
    action: "wa_account.reset_creds",
    entityType: "WaAccount",
    entityId: id,
  });

  return c.json({ message: "Reset creds command sent" });
});

// Delete Account
app.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const auth = c.get("auth") as any;
  const account = await prisma.waAccount.findFirst({
    where: { id, workspaceId: auth.workspaceId },
  });
  if (!account) return c.json({ error: "Not found" }, 404);

  const [messageCount, campaignCount, ruleCount] = await Promise.all([
    prisma.message.count({ where: { waAccountId: id } }),
    prisma.campaign.count({ where: { waAccountId: id } }),
    prisma.autoReplyRule.count({ where: { waAccountId: id } }),
  ]);

  if (messageCount > 0 || campaignCount > 0 || ruleCount > 0) {
    return c.json(
      {
        error: "Cannot delete account with related records.",
        details: {
          messages: messageCount,
          campaigns: campaignCount,
          autoReplyRules: ruleCount,
        },
      },
      409,
    );
  }

  const permissions = (c.get("permissions") as string[]) || [];
  const cmd = {
    type: "STOP",
    waAccountId: id,
    meta: {
      userId: auth.userId,
      workspaceId: auth.workspaceId,
      permissions,
    },
  };
  await pubSubPublisher.publish("cmd:wa-runtime", JSON.stringify(cmd));

  await prisma.waAccount.delete({ where: { id } });

  await logAudit({
    workspaceId: account.workspaceId,
    action: "wa_account.delete",
    entityType: "WaAccount",
    entityId: id,
    beforeJson: { phoneE164: account.phoneE164, status: account.status },
  });

  return c.json({ message: "Deleted" });
});

// Delete Account (POST fallback)
app.post("/:id/delete", async (c) => {
  const id = c.req.param("id");

  const auth = c.get("auth") as any;
  const account = await prisma.waAccount.findFirst({
    where: { id, workspaceId: auth.workspaceId },
  });
  if (!account) return c.json({ error: "Not found" }, 404);

  const [messageCount, campaignCount, ruleCount] = await Promise.all([
    prisma.message.count({ where: { waAccountId: id } }),
    prisma.campaign.count({ where: { waAccountId: id } }),
    prisma.autoReplyRule.count({ where: { waAccountId: id } }),
  ]);

  if (messageCount > 0 || campaignCount > 0 || ruleCount > 0) {
    return c.json(
      {
        error: "Cannot delete account with related records.",
        details: {
          messages: messageCount,
          campaigns: campaignCount,
          autoReplyRules: ruleCount,
        },
      },
      409,
    );
  }

  const permissions = (c.get("permissions") as string[]) || [];
  const cmd = {
    type: "STOP",
    waAccountId: id,
    meta: {
      userId: auth.userId,
      workspaceId: auth.workspaceId,
      permissions,
    },
  };
  await pubSubPublisher.publish("cmd:wa-runtime", JSON.stringify(cmd));

  await prisma.waAccount.delete({ where: { id } });

  await logAudit({
    workspaceId: account.workspaceId,
    action: "wa_account.delete",
    entityType: "WaAccount",
    entityId: id,
    beforeJson: { phoneE164: account.phoneE164, status: account.status },
  });

  return c.json({ message: "Deleted" });
});

const deleteWithData = async (c: any) => {
  const id = c.req.param("id");

  const auth = c.get("auth") as any;
  const account = await prisma.waAccount.findFirst({
    where: { id, workspaceId: auth.workspaceId },
  });
  if (!account) return c.json({ error: "Not found" }, 404);

  const permissions = (c.get("permissions") as string[]) || [];
  const cmd = {
    type: "STOP",
    waAccountId: id,
    meta: {
      userId: auth.userId,
      workspaceId: auth.workspaceId,
      permissions,
    },
  };
  await pubSubPublisher.publish("cmd:wa-runtime", JSON.stringify(cmd));

  await prisma.$transaction([
    prisma.message.deleteMany({ where: { waAccountId: id } }),
    prisma.autoReplyRule.deleteMany({ where: { waAccountId: id } }),
    prisma.campaignTarget.deleteMany({
      where: { campaign: { waAccountId: id } },
    }),
    prisma.campaign.deleteMany({ where: { waAccountId: id } }),
    prisma.waAccountSession.deleteMany({ where: { waAccountId: id } }),
    prisma.waAccountKey.deleteMany({ where: { waAccountId: id } }),
    prisma.waAccount.delete({ where: { id } }),
  ]);

  await logAudit({
    workspaceId: account.workspaceId,
    action: "wa_account.delete_with_data",
    entityType: "WaAccount",
    entityId: id,
    beforeJson: { phoneE164: account.phoneE164, status: account.status },
  });

  return c.json({ message: "Deleted" });
};

// Delete Account + Related Data (hard delete)
app.delete("/:id/delete-with-data", deleteWithData);
app.post("/:id/delete-with-data", deleteWithData);

export default app;
