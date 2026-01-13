import { Hono } from "hono";
import { prisma } from "@repo/db";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { logAudit } from "@repo/shared";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { redis } from "../redis";

const app = new Hono();

// List Contacts
app.get("/", async (c) => {
  const auth = c.get("auth") as any;
  const contacts = await prisma.contact.findMany({
    where: { workspaceId: auth.workspaceId },
    orderBy: { createdAt: "desc" },
    include: { tags: { include: { tag: true } } },
  });
  return c.json({ data: contacts });
});

// Get Contact
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const auth = c.get("auth") as any;
  const contact = await prisma.contact.findFirst({
    where: { id, workspaceId: auth.workspaceId },
    include: { tags: { include: { tag: true } } },
  });
  if (!contact) return c.json({ error: "Not found" }, 404);
  return c.json({ data: contact });
});

// Update Contact (name + notes)
app.patch(
  "/:id",
  zValidator(
    "json",
    z.object({
      displayName: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    }),
  ),
  async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const auth = c.get("auth") as any;
    const contact = await prisma.contact.findFirst({
      where: { id, workspaceId: auth.workspaceId },
    });
    if (!contact) return c.json({ error: "Not found" }, 404);

    const updated = await prisma.contact.update({
      where: { id },
      data: {
        displayName: input.displayName ?? null,
        notes: input.notes ?? null,
      },
    });

    await logAudit({
      workspaceId: contact.workspaceId,
      action: "contacts.update",
      entityType: "Contact",
      entityId: id,
      beforeJson: { displayName: contact.displayName, notes: contact.notes },
      afterJson: { displayName: updated.displayName, notes: updated.notes },
    });

    return c.json({ data: updated });
  },
);

// Update Contact Tags (replace)
app.post(
  "/:id/tags",
  zValidator(
    "json",
    z.object({
      tagIds: z.array(z.string()).optional(),
    }),
  ),
  async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const auth = c.get("auth") as any;
    const contact = await prisma.contact.findFirst({
      where: { id, workspaceId: auth.workspaceId },
    });
    if (!contact) return c.json({ error: "Not found" }, 404);

    const tagIds = input.tagIds || [];
    await prisma.contactTag.deleteMany({ where: { contactId: id } });
    if (tagIds.length > 0) {
      await prisma.contactTag.createMany({
        data: tagIds.map((tagId) => ({
          contactId: id,
          tagId,
        })),
        skipDuplicates: true,
      });
    }

    await logAudit({
      workspaceId: contact.workspaceId,
      action: "contacts.update_tags",
      entityType: "Contact",
      entityId: id,
      afterJson: { tagIds },
    });

    return c.json({ message: "Updated" });
  },
);

// Contact Messages
app.get("/:id/messages", async (c) => {
  const id = c.req.param("id");
  const auth = c.get("auth") as any;
  const contact = await prisma.contact.findFirst({
    where: { id, workspaceId: auth.workspaceId },
  });
  if (!contact) return c.json({ error: "Not found" }, 404);

  const messages = await prisma.message.findMany({
    where: { contactId: id },
    orderBy: { createdAt: "desc" },
  });

  return c.json({ data: messages });
});

// Delete Contact
app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const auth = c.get("auth") as any;
  const contact = await prisma.contact.findFirst({
    where: { id, workspaceId: auth.workspaceId },
  });
  if (!contact) return c.json({ error: "Not found" }, 404);

  const messageCount = await prisma.message.count({ where: { contactId: id } });
  if (messageCount > 0) {
    return c.json({ error: "Cannot delete contact with messages." }, 409);
  }

  await prisma.contact.delete({ where: { id } });

  await logAudit({
    workspaceId: contact.workspaceId,
    action: "contacts.delete",
    entityType: "Contact",
    entityId: id,
    beforeJson: { phoneE164: contact.phoneE164 },
  });

  return c.json({ message: "Deleted" });
});

const handleBulkDelete = async (c: any) => {
  const auth = c.get("auth") as any;
  const workspaceId = auth.workspaceId;
  const body = await c.req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];

  if (ids.length === 0) {
    return c.json({ error: "No contact ids provided" }, 400);
  }

  const contacts = await prisma.contact.findMany({
    where: { id: { in: ids }, workspaceId },
    select: { id: true },
  });
  const scopedIds = contacts.map((c) => c.id);
  if (scopedIds.length === 0) {
    return c.json({ error: "No contacts found" }, 404);
  }

  const messageCounts = await prisma.message.groupBy({
    by: ["contactId"],
    where: { contactId: { in: scopedIds } },
    _count: { _all: true },
  });
  const blocked = new Set(messageCounts.map((m) => m.contactId));
  const deletable = scopedIds.filter((id) => !blocked.has(id));

  if (deletable.length > 0) {
    await prisma.contact.deleteMany({
      where: { id: { in: deletable }, workspaceId },
    });
  }

  await logAudit({
    workspaceId,
    action: "contacts.bulk_delete",
    entityType: "Contact",
    afterJson: { deleted: deletable.length, blocked: blocked.size },
  });

  return c.json({
    data: {
      deleted: deletable.length,
      blocked: Array.from(blocked),
    },
  });
};

// Bulk Delete Contacts
app.post("/bulk-delete", handleBulkDelete);
app.post("/bulk-delete/", handleBulkDelete);

// Bulk Tag Add/Remove
app.post(
  "/bulk-tags",
  zValidator(
    "json",
    z.object({
      ids: z.array(z.string()),
      tagIds: z.array(z.string()),
      mode: z.enum(["add", "remove"]),
    }),
  ),
  async (c) => {
    const auth = c.get("auth") as any;
    const workspaceId = auth.workspaceId;
    const { ids, tagIds, mode } = c.req.valid("json");

    if (ids.length === 0 || tagIds.length === 0) {
      return c.json({ error: "ids and tagIds are required" }, 400);
    }

    const contacts = await prisma.contact.findMany({
      where: { id: { in: ids }, workspaceId },
      select: { id: true },
    });
    const scopedIds = contacts.map((c) => c.id);
    if (scopedIds.length === 0) return c.json({ error: "No contacts found" }, 404);

    if (mode === "add") {
      await prisma.contactTag.createMany({
        data: scopedIds.flatMap((contactId) =>
          tagIds.map((tagId) => ({ contactId, tagId })),
        ),
        skipDuplicates: true,
      });
    } else {
      await prisma.contactTag.deleteMany({
        where: { contactId: { in: scopedIds }, tagId: { in: tagIds } },
      });
    }

    await logAudit({
      workspaceId,
      action: mode === "add" ? "contacts.bulk_add_tags" : "contacts.bulk_remove_tags",
      entityType: "Contact",
      afterJson: { count: scopedIds.length, tagIds },
    });

    return c.json({ message: "Updated" });
  },
);

// Export Contacts CSV
app.post("/export", async (c) => {
  const auth = c.get("auth") as any;
  const workspaceId = auth.workspaceId;
  const body = await c.req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
  if (ids.length === 0) {
    return c.json({ error: "No contact ids provided" }, 400);
  }

  const contacts = await prisma.contact.findMany({
    where: { id: { in: ids }, workspaceId },
    include: { tags: { include: { tag: true } } },
  });

  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = ["name", "phone", "tags"].join(",");
  const lines = contacts.map((contact) => {
    const name = contact.displayName || "";
    const phone = contact.phoneE164 || "";
    const tags = contact.tags.map((t) => t.tag.name).join(", ");
    return [escape(name), escape(phone), escape(tags)].join(",");
  });
  const csv = [header, ...lines].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="contacts-export.csv"`,
    },
  });
});

// Import Contacts (Create Job + Validate)
app.post("/import", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];

  if (!file || !(file instanceof File)) {
    return c.json({ error: "No file uploaded" }, 400);
  }

  const auth = c.get("auth") as any;
  const workspaceId = auth.workspaceId;

  const job = await prisma.contactImportJob.create({
    data: {
      workspaceId,
      filename: file.name,
      status: "UPLOADED",
    },
  });

  const buffer = Buffer.from(await file.arrayBuffer());
  const folder = path.join(process.cwd(), "contact-imports");
  await mkdir(folder, { recursive: true });
  const filePath = path.join(folder, `${job.id}.csv`);
  await writeFile(filePath, buffer);

  try {
    await redis.rpush("q:contacts:import:validate", JSON.stringify({ jobId: job.id }));
  } catch (err) {
    await prisma.contactImportJob.update({
      where: { id: job.id },
      data: { status: "FAILED" },
    });
    return c.json({ error: "Failed to queue import" }, 500);
  }

  await logAudit({
    workspaceId,
    action: "contacts.import.upload",
    entityType: "ContactImport",
    entityId: job.id,
    afterJson: { filename: file.name },
  });

  return c.json({ data: { jobId: job.id } }, 201);
});

// Import Job Status
app.get("/import/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  const auth = c.get("auth") as any;
  const job = await prisma.contactImportJob.findUnique({
    where: { id: jobId },
    include: {
      rows: {
        take: 20,
        orderBy: { rowNo: "asc" },
      },
    },
  });
  if (!job) return c.json({ error: "Not found" }, 404);
  if (job.workspaceId !== auth.workspaceId) return c.json({ error: "Not found" }, 404);
  return c.json({ data: job });
});

// Download Invalid Rows CSV
app.get("/import/:jobId/invalid.csv", async (c) => {
  const jobId = c.req.param("jobId");
  const auth = c.get("auth") as any;
  const job = await prisma.contactImportJob.findUnique({
    where: { id: jobId },
    select: { id: true, filename: true, workspaceId: true },
  });
  if (!job) return c.json({ error: "Not found" }, 404);
  if (job.workspaceId !== auth.workspaceId) return c.json({ error: "Not found" }, 404);

  const rows = await prisma.contactImportRow.findMany({
    where: { jobId, isValid: false },
    orderBy: { rowNo: "asc" },
  });

  const escape = (value: string) => {
    const escaped = value.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const header = ["rowNo", "name", "phone", "tags", "error"].join(",");
  const lines = rows.map((row) => {
    const raw = row.raw as any;
    const name = raw?.name || raw?.Name || raw?.NAME || row.normalizedName || "";
    const phone = raw?.phone || raw?.Phone || raw?.PHONE || row.normalizedPhone || "";
    const tags = Array.isArray(row.tags) ? row.tags.join(", ") : "";
    const error = row.error || "";
    return [
      row.rowNo,
      escape(String(name)),
      escape(String(phone)),
      escape(String(tags)),
      escape(String(error)),
    ].join(",");
  });

  const csv = [header, ...lines].join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="invalid-contacts-${job.id}.csv"`,
    },
  });
});

// Commit Import Job
app.post("/import/:jobId/commit", async (c) => {
  const jobId = c.req.param("jobId");
  const auth = c.get("auth") as any;
  const job = await prisma.contactImportJob.findUnique({
    where: { id: jobId },
  });
  if (!job) return c.json({ error: "Not found" }, 404);
  if (job.workspaceId !== auth.workspaceId) return c.json({ error: "Not found" }, 404);
  if (job.status !== "READY") {
    return c.json({ error: "Job not ready" }, 400);
  }

  await prisma.contactImportJob.update({
    where: { id: jobId },
    data: { status: "COMMITTING" },
  });

  try {
    await redis.rpush("q:contacts:import:commit", JSON.stringify({ jobId }));
  } catch (err) {
    await prisma.contactImportJob.update({
      where: { id: jobId },
      data: { status: "FAILED" },
    });
    return c.json({ error: "Failed to queue commit" }, 500);
  }

  return c.json({ message: "Commit queued" });
});

export default app;
