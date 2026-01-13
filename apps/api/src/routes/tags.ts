import { Hono } from "hono";
import { prisma } from "@repo/db";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { logAudit } from "@repo/shared";

const app = new Hono();

// List Tags
app.get("/", async (c) => {
  const auth = c.get("auth") as any;
  const workspaceId = auth.workspaceId;
  const tags = await prisma.tag.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
    include: { _count: { select: { contacts: true } } },
  });
  return c.json({ data: tags });
});

app.post(
  "/",
  zValidator(
    "json",
    z.object({
      name: z.string().min(1),
    }),
  ),
  async (c) => {
    const auth = c.get("auth") as any;
    const workspaceId = auth.workspaceId;
    const input = c.req.valid("json");

    const tag = await prisma.tag.create({
      data: { workspaceId, name: input.name.trim() },
    });

    await logAudit({
      workspaceId,
      action: "tags.create",
      entityType: "Tag",
      entityId: tag.id,
      afterJson: { name: tag.name },
    });

    return c.json({ data: tag }, 201);
  },
);

app.patch(
  "/:id",
  zValidator(
    "json",
    z.object({
      name: z.string().min(1),
    }),
  ),
  async (c) => {
    const auth = c.get("auth") as any;
    const workspaceId = auth.workspaceId;
    const id = c.req.param("id");
    const input = c.req.valid("json");

    const tag = await prisma.tag.findFirst({
      where: { id, workspaceId },
    });
    if (!tag) return c.json({ error: "Not found" }, 404);

    const updated = await prisma.tag.update({
      where: { id },
      data: { name: input.name.trim() },
    });

    await logAudit({
      workspaceId,
      action: "tags.update",
      entityType: "Tag",
      entityId: id,
      beforeJson: { name: tag.name },
      afterJson: { name: updated.name },
    });

    return c.json({ data: updated });
  },
);

app.delete("/:id", async (c) => {
  const auth = c.get("auth") as any;
  const workspaceId = auth.workspaceId;
  const id = c.req.param("id");

  const tag = await prisma.tag.findFirst({
    where: { id, workspaceId },
  });
  if (!tag) return c.json({ error: "Not found" }, 404);

  await prisma.tag.delete({ where: { id } });

  await logAudit({
    workspaceId,
    action: "tags.delete",
    entityType: "Tag",
    entityId: id,
    beforeJson: { name: tag.name },
  });

  return c.json({ message: "Deleted" });
});

export default app;
