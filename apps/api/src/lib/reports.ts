import { prisma } from "@repo/db";

export const buildContactsCsv = async (
  workspaceId: string,
  params?: { ids?: string[]; tagIds?: string[] },
) => {
  const where: any = { workspaceId };
  if (params?.ids?.length) {
    where.id = { in: params.ids };
  }
  if (params?.tagIds?.length) {
    where.tags = { some: { tagId: { in: params.tagIds } } };
  }

  const contacts = await prisma.contact.findMany({
    where,
    include: { tags: { include: { tag: true } } },
    orderBy: { createdAt: "desc" },
  });

  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = ["name", "phone", "tags", "notes"].join(",");
  const lines = contacts.map((contact) => {
    const name = contact.displayName || "";
    const phone = contact.phoneE164 || "";
    const tags = contact.tags.map((t) => t.tag.name).join(", ");
    const notes = contact.notes || "";
    return [escape(name), escape(phone), escape(tags), escape(notes)].join(",");
  });
  return [header, ...lines].join("\n");
};

export const buildMessagesCsv = async (
  workspaceId: string,
  params?: { contactId?: string; waAccountId?: string; from?: string; to?: string },
) => {
  const where: any = { workspaceId };
  if (params?.contactId) where.contactId = params.contactId;
  if (params?.waAccountId) where.waAccountId = params.waAccountId;
  if (params?.from || params?.to) {
    where.createdAt = {};
    if (params.from) where.createdAt.gte = new Date(params.from);
    if (params.to) where.createdAt.lte = new Date(params.to);
  }

  const messages = await prisma.message.findMany({
    where,
    include: { contact: true, waAccount: true },
    orderBy: { createdAt: "desc" },
  });

  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = ["timestamp", "direction", "status", "contact", "waAccount", "text"].join(",");
  const lines = messages.map((message) => {
    const text = (message.payload as any)?.text || "";
    return [
      escape(message.createdAt.toISOString()),
      escape(message.direction),
      escape(message.status),
      escape(message.contact?.phoneE164 || ""),
      escape(message.waAccount?.phoneE164 || ""),
      escape(String(text)),
    ].join(",");
  });
  return [header, ...lines].join("\n");
};
