import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "@repo/db";
import { redis } from "../redis";
import { logAudit } from "@repo/shared";

const app = new Hono();

const threadsQuerySchema = z.object({
  q: z.string().optional(),
  waAccountId: z.string().uuid().optional(),
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .optional(),
});

app.get("/threads", zValidator("query", threadsQuerySchema), async (c) => {
  const auth = c.get("auth") as any;
  const workspaceId = auth.workspaceId;
  const query = c.req.valid("query");

  const where: any = { workspaceId };
  if (query.waAccountId) {
    where.waAccountId = query.waAccountId;
  }
  if (query.q) {
    const q = query.q.trim();
    if (q) {
      where.contact = {
        OR: [
          { phoneE164: { contains: q, mode: "insensitive" } },
          { displayName: { contains: q, mode: "insensitive" } },
        ],
      };
    }
  }

  const threads = await prisma.message.findMany({
    where,
    orderBy: { createdAt: "desc" },
    distinct: ["contactId"],
    take: query.limit || 50,
    include: {
      contact: true,
      waAccount: true,
    },
  });

  return c.json({
    data: threads.map((message) => ({
      contact: message.contact,
      waAccount: message.waAccount,
      lastMessage: message,
    })),
  });
});

const sendSchema = z.object({
  waAccountId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  phoneE164: z.string().optional(),
  displayName: z.string().optional(),
  text: z.string().min(1),
});

app.post("/send", zValidator("json", sendSchema), async (c) => {
  const auth = c.get("auth") as any;
  const workspaceId = auth.workspaceId;
  const input = c.req.valid("json");

  let contact = null;
  if (input.contactId) {
    contact = await prisma.contact.findFirst({
      where: { id: input.contactId, workspaceId },
    });
  } else if (input.phoneE164) {
    const phone = input.phoneE164.trim();
    if (!phone) return c.json({ error: "phoneE164 is required" }, 400);
    contact = await prisma.contact.findFirst({
      where: { workspaceId, phoneE164: phone },
    });
    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          workspaceId,
          phoneE164: phone,
          displayName: input.displayName?.trim() || null,
        },
      });
    }
  }

  if (!contact) return c.json({ error: "Contact not found" }, 404);

  let waAccountId = input.waAccountId || null;
  if (!waAccountId) {
    const connected = await redis.smembers("wa:connected");
    if (connected.length > 0) {
      waAccountId = connected[0];
    }
  }

  if (!waAccountId) {
    return c.json({ error: "No connected WhatsApp account available" }, 409);
  }

  const account = await prisma.waAccount.findFirst({
    where: { id: waAccountId, workspaceId },
  });
  if (!account) {
    return c.json({ error: "Account not found" }, 404);
  }

  const payload = { type: "text", text: input.text.trim() };

  const message = await prisma.message.create({
    data: {
      workspaceId,
      waAccountId: account.id,
      contactId: contact.id,
      direction: "OUT",
      status: "QUEUED",
      type: "text",
      payload,
    },
  });

  try {
    await redis.rpush("q:message:send", JSON.stringify({ messageId: message.id }));
  } catch (err) {
    await prisma.message.update({
      where: { id: message.id },
      data: { status: "FAILED", errorCode: "QUEUE_FAILED" },
    });
    return c.json({ error: "Failed to queue message" }, 500);
  }

  await logAudit({
    workspaceId,
    action: "messages.send",
    entityType: "Message",
    entityId: message.id,
    afterJson: { contactId: contact.id, waAccountId: account.id },
  });

  return c.json({ data: message });
});

const deleteThread = async (c: any) => {
  const auth = c.get("auth") as any;
  const workspaceId = auth.workspaceId;
  const contactId = c.req.param("contactId");

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId },
    select: { id: true, phoneE164: true },
  });
  if (!contact) return c.json({ error: "Contact not found" }, 404);

  const result = await prisma.message.deleteMany({
    where: { workspaceId, contactId },
  });

  await logAudit({
    workspaceId,
    action: "messages.thread_delete",
    entityType: "Contact",
    entityId: contactId,
    beforeJson: { phoneE164: contact.phoneE164 },
    afterJson: { deletedMessages: result.count },
  });

  return c.json({ data: { deleted: result.count } });
};

const deleteThreadWithContact = async (c: any) => {
  const auth = c.get("auth") as any;
  const workspaceId = auth.workspaceId;
  const contactId = c.req.param("contactId");

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId },
    select: { id: true, phoneE164: true },
  });
  if (!contact) return c.json({ error: "Contact not found" }, 404);

  const messageResult = await prisma.message.deleteMany({
    where: { workspaceId, contactId },
  });

  await prisma.contact.delete({
    where: { id: contactId },
  });

  await logAudit({
    workspaceId,
    action: "messages.thread_delete_with_contact",
    entityType: "Contact",
    entityId: contactId,
    beforeJson: { phoneE164: contact.phoneE164 },
    afterJson: { deletedMessages: messageResult.count },
  });

  return c.json({ data: { deletedMessages: messageResult.count } });
};

app.delete("/threads/:contactId", deleteThread);
app.post("/threads/:contactId/delete", deleteThread);

app.delete("/threads/:contactId/with-contact", deleteThreadWithContact);
app.post("/threads/:contactId/delete-with-contact", deleteThreadWithContact);

export default app;
