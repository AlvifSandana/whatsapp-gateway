import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "@repo/db";
import { redis } from "../redis";
import { logAudit } from "@repo/shared";

const app = new Hono();

// List Campaigns
app.get("/", async (c) => {
  const auth = c.get("auth") as any;
  const campaigns = await prisma.campaign.findMany({
    where: { workspaceId: auth.workspaceId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { targets: true, messages: true } } },
  });
  return c.json({ data: campaigns });
});

// Get Campaign
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const auth = c.get("auth") as any;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: { _count: { select: { targets: true, messages: true } } },
  });
  if (!campaign || campaign.workspaceId !== auth.workspaceId) return c.json({ error: "Not found" }, 404);
  return c.json({ data: campaign });
});

// Update Campaign (draft only)
app.put(
  "/:id",
  zValidator(
    "json",
    z.object({
      name: z.string().optional(),
      waAccountId: z.string().nullable().optional(),
      message: z.string().optional(),
      tagIds: z.array(z.string()).optional(),
      contactIds: z.array(z.string()).optional(),
      scheduleAt: z.string().datetime().nullable().optional(),
    }),
  ),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth") as any;
    const input = c.req.valid("json");

    const campaign = await prisma.campaign.findUnique({
      where: { id },
    });
    if (!campaign || campaign.workspaceId !== auth.workspaceId) {
      return c.json({ error: "Not found" }, 404);
    }
    if (campaign.status !== "DRAFT") {
      return c.json({ error: "Only draft campaigns can be edited" }, 409);
    }

    if (input.waAccountId) {
      const account = await prisma.waAccount.findFirst({
        where: { id: input.waAccountId, workspaceId: auth.workspaceId },
        select: { id: true },
      });
      if (!account) {
        return c.json({ error: "Invalid waAccountId" }, 400);
      }
    }

    const nextPayload =
      input.message !== undefined ? { type: "text", text: input.message } : campaign.payload;
    const nextTagIds = input.tagIds ?? (campaign.targetFilter as any)?.tagIds ?? [];
    const nextContactIds =
      input.contactIds ?? (campaign.targetFilter as any)?.contactIds ?? [];

    const updated = await prisma.campaign.update({
      where: { id },
      data: {
        name: input.name ?? campaign.name,
        waAccountId: input.waAccountId === undefined ? campaign.waAccountId : input.waAccountId,
        payload: nextPayload,
        targetFilter: { tagIds: nextTagIds, contactIds: nextContactIds },
        scheduleAt: input.scheduleAt === undefined ? campaign.scheduleAt : input.scheduleAt ? new Date(input.scheduleAt) : null,
      },
    });

    await prisma.campaignTarget.deleteMany({ where: { campaignId: id } });
    const targetContactIds = new Set<string>();
    if (nextTagIds.length > 0) {
      const contacts = await prisma.contact.findMany({
        where: {
          workspaceId: auth.workspaceId,
          tags: { some: { tagId: { in: nextTagIds } } },
        },
        select: { id: true },
      });
      contacts.forEach((contact) => targetContactIds.add(contact.id));
    }
    if (nextContactIds.length > 0) {
      const contacts = await prisma.contact.findMany({
        where: { workspaceId: auth.workspaceId, id: { in: nextContactIds } },
        select: { id: true },
      });
      contacts.forEach((contact) => targetContactIds.add(contact.id));
    }
    if (targetContactIds.size > 0) {
      await prisma.campaignTarget.createMany({
        data: Array.from(targetContactIds).map((contactId) => ({
          campaignId: id,
          contactId,
          status: "QUEUED",
        })),
        skipDuplicates: true,
      });
    }

    await logAudit({
      workspaceId: auth.workspaceId,
      action: "campaign.update",
      entityType: "Campaign",
      entityId: id,
      beforeJson: { name: campaign.name },
      afterJson: { name: updated.name },
    });

    return c.json({ data: updated });
  },
);

// Create Campaign
app.post(
  "/",
  zValidator(
    "json",
    z.object({
      name: z.string(),
      waAccountId: z.string().optional(), // Sender (optional for routing)
      message: z.string(),
      tagIds: z.array(z.string()).optional(), // Target by tags
      contactIds: z.array(z.string()).optional(), // Target specific contacts
      scheduleAt: z.string().datetime().optional(),
    }),
  ),
  async (c) => {
    const { name, waAccountId, message, tagIds, contactIds, scheduleAt } = c.req.valid("json");
    const auth = c.get("auth") as any;
    const workspaceId = auth.workspaceId;

    if (waAccountId) {
      const account = await prisma.waAccount.findFirst({
        where: { id: waAccountId, workspaceId },
        select: { id: true },
      });
      if (!account) {
        return c.json({ error: "Invalid waAccountId" }, 400);
      }
    }

    // Create Campaign
    const campaign = await prisma.campaign.create({
      data: {
        workspaceId,
        name,
        status: "DRAFT",
        waAccountId: waAccountId || null,
        targetFilter: tagIds || contactIds ? { tagIds: tagIds || [], contactIds: contactIds || [] } : undefined,
        payload: { type: "text", text: message },
        scheduleAt: scheduleAt ? new Date(scheduleAt) : null,
      },
    });

    // Add Targets
    const targetContactIds = new Set<string>();
    if (tagIds && tagIds.length > 0) {
      const contacts = await prisma.contact.findMany({
        where: {
          workspaceId,
          tags: { some: { tagId: { in: tagIds } } },
        },
        select: { id: true },
      });
      contacts.forEach((contact) => targetContactIds.add(contact.id));
    }
    if (contactIds && contactIds.length > 0) {
      const contacts = await prisma.contact.findMany({
        where: { workspaceId, id: { in: contactIds } },
        select: { id: true },
      });
      contacts.forEach((contact) => targetContactIds.add(contact.id));
    }
    if (targetContactIds.size > 0) {
      await prisma.campaignTarget.createMany({
        data: Array.from(targetContactIds).map((contactId) => ({
          campaignId: campaign.id,
          contactId,
          status: "QUEUED",
        })),
        skipDuplicates: true,
      });
    }

    await logAudit({
      workspaceId,
      action: "campaign.create",
      entityType: "Campaign",
      entityId: campaign.id,
      afterJson: {
        name,
        status: "DRAFT",
        targetCount: targetContactIds.size,
      },
    });

    return c.json({ data: campaign }, 201);
  },
);

// Preview Targets
app.post("/:id/preview-targets", async (c) => {
  const id = c.req.param("id");
  const auth = c.get("auth") as any;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: { id: true, workspaceId: true, targetFilter: true },
  });
  if (!campaign || campaign.workspaceId !== auth.workspaceId) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const tagIds = Array.isArray(body?.tagIds)
    ? body.tagIds
    : (campaign.targetFilter as any)?.tagIds;
  const contactIds = Array.isArray(body?.contactIds)
    ? body.contactIds
    : (campaign.targetFilter as any)?.contactIds;

  if ((!tagIds || tagIds.length === 0) && (!contactIds || contactIds.length === 0)) {
    return c.json({ data: { total: 0, sample: [] } });
  }

  const where: any = { workspaceId: campaign.workspaceId };
  const filters: any[] = [];
  if (Array.isArray(tagIds) && tagIds.length > 0) {
    filters.push({ tags: { some: { tagId: { in: tagIds } } } });
  }
  if (Array.isArray(contactIds) && contactIds.length > 0) {
    filters.push({ id: { in: contactIds } });
  }
  if (filters.length > 0) {
    where.OR = filters;
  }

  const total = await prisma.contact.count({ where });

  const sample = await prisma.contact.findMany({
    where,
    take: 10,
    select: { id: true, phoneE164: true, displayName: true },
  });

  return c.json({ data: { total, sample } });
});

// Start Campaign (Queue)
app.post("/:id/start", async (c) => {
  const id = c.req.param("id");

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: { targets: true },
  });

  const auth = c.get("auth") as any;
  if (!campaign || campaign.workspaceId !== auth.workspaceId) return c.json({ error: "Not found" }, 404);

  const now = new Date();
  if (campaign.scheduleAt && campaign.scheduleAt > now) {
    await prisma.campaign.update({
      where: { id },
      data: { status: "SCHEDULED" },
    });
    return c.json({ message: "Campaign scheduled" });
  }

  await prisma.campaign.update({
    where: { id },
    data: { status: "PROCESSING" },
  });
  try {
    await redis.rpush("q:campaign:plan", JSON.stringify({ campaignId: campaign.id }));
  } catch (err) {
    await prisma.campaign.update({
      where: { id },
      data: { status: "DRAFT" },
    });
    return c.json({ error: "Failed to queue campaign" }, 500);
  }

  await logAudit({
    workspaceId: campaign.workspaceId,
    action: "campaign.start",
    entityType: "Campaign",
    entityId: campaign.id,
    beforeJson: { status: campaign.status },
    afterJson: { status: "PROCESSING" },
  });

  return c.json({ message: "Campaign queued" });
});

// Pause Campaign
app.post("/:id/pause", async (c) => {
  const id = c.req.param("id");
  const auth = c.get("auth") as any;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign || campaign.workspaceId !== auth.workspaceId) return c.json({ error: "Not found" }, 404);

  await prisma.campaign.update({
    where: { id },
    data: { status: "PAUSED" },
  });

  await logAudit({
    workspaceId: campaign.workspaceId,
    action: "campaign.pause",
    entityType: "Campaign",
    entityId: campaign.id,
    beforeJson: { status: campaign.status },
    afterJson: { status: "PAUSED" },
  });

  return c.json({ message: "Campaign paused" });
});

// Cancel Campaign
app.post("/:id/cancel", async (c) => {
  const id = c.req.param("id");
  const auth = c.get("auth") as any;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign || campaign.workspaceId !== auth.workspaceId) return c.json({ error: "Not found" }, 404);

  await prisma.campaign.update({
    where: { id },
    data: { status: "CANCELED" },
  });

  await prisma.campaignTarget.updateMany({
    where: { campaignId: id, status: "QUEUED" },
    data: { status: "CANCELED" },
  });

  await logAudit({
    workspaceId: campaign.workspaceId,
    action: "campaign.cancel",
    entityType: "Campaign",
    entityId: campaign.id,
    beforeJson: { status: campaign.status },
    afterJson: { status: "CANCELED" },
  });

  return c.json({ message: "Campaign canceled" });
});

// Campaign Progress
app.get("/:id/progress", async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth") as any;

    const campaign = await prisma.campaign.findUnique({
        where: { id },
        select: { id: true, workspaceId: true },
    });
    if (!campaign || campaign.workspaceId !== auth.workspaceId) return c.json({ error: "Not found" }, 404);

    const total = await prisma.campaignTarget.count({
        where: { campaignId: id },
    });

    const grouped = await prisma.campaignTarget.groupBy({
        by: ["status"],
        where: { campaignId: id },
        _count: { status: true },
    });

    const byStatus = grouped.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = row._count.status;
        return acc;
    }, {});

    return c.json({ data: { campaignId: id, total, byStatus } });
});

// Campaign Messages
app.get("/:id/messages", async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth") as any;

    const campaign = await prisma.campaign.findUnique({
        where: { id },
        select: { id: true, workspaceId: true },
    });
    if (!campaign || campaign.workspaceId !== auth.workspaceId) return c.json({ error: "Not found" }, 404);

    const messages = await prisma.message.findMany({
        where: { sourceCampaignId: id },
        orderBy: { createdAt: "desc" },
        include: {
            contact: { select: { phoneE164: true, displayName: true } },
            events: { orderBy: { createdAt: "desc" } },
        },
    });

    return c.json({ data: messages });
});

export default app;
