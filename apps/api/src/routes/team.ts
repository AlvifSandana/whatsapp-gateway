import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "@repo/db";
import { hashPassword } from "../lib/auth";
import { logAudit } from "@repo/shared";
import { ensureDefaultRoles } from "@repo/shared";

const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth") as any;
  const workspaceId = auth.workspaceId;

  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      include: {
        roles: { include: { role: true } },
      },
    }),
    ensureDefaultRoles(workspaceId),
  ]);

  return c.json({
    data: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      isActive: user.isActive,
      createdAt: user.createdAt,
      roles: user.roles.map((r) => r.role.name),
    })),
    meta: { roles: roles.map((r) => ({ id: r.id, name: r.name })) },
  });
});

const inviteSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  roleId: z.string().uuid().optional(),
});

app.post("/invite", zValidator("json", inviteSchema), async (c) => {
  const auth = c.get("auth") as any;
  const workspaceId = auth.workspaceId;
  const input = c.req.valid("json");

  const existing = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });
  if (existing) return c.json({ error: "Email already exists" }, 409);

  const roles = await ensureDefaultRoles(workspaceId);
  const roleId = input.roleId || roles.find((r) => r.name === "Member")?.id;

  const tempPassword = Math.random().toString(36).slice(2, 10);
  const user = await prisma.user.create({
    data: {
      workspaceId,
      name: input.name.trim(),
      email: input.email.toLowerCase(),
      passwordHash: hashPassword(tempPassword),
    },
  });

  if (roleId) {
    await prisma.userRole.create({
      data: { userId: user.id, roleId },
    });
  }

  await logAudit({
    workspaceId,
    action: "team.invite",
    entityType: "User",
    entityId: user.id,
    afterJson: { email: user.email, roleId },
  });

  return c.json({
    data: {
      id: user.id,
      email: user.email,
      name: user.name,
      tempPassword,
    },
  });
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  roleId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});

app.patch("/:id", zValidator("json", updateSchema), async (c) => {
  const auth = c.get("auth") as any;
  const workspaceId = auth.workspaceId;
  const id = c.req.param("id");
  const input = c.req.valid("json");

  const user = await prisma.user.findFirst({
    where: { id, workspaceId },
    include: { roles: true },
  });
  if (!user) return c.json({ error: "Not found" }, 404);

  const updated = await prisma.user.update({
    where: { id },
    data: {
      name: input.name ?? user.name,
      isActive: input.isActive ?? user.isActive,
    },
  });

  if (input.roleId) {
    await prisma.userRole.deleteMany({ where: { userId: id } });
    await prisma.userRole.create({ data: { userId: id, roleId: input.roleId } });
  }

  await logAudit({
    workspaceId,
    action: "team.update",
    entityType: "User",
    entityId: user.id,
    beforeJson: { name: user.name, isActive: user.isActive },
    afterJson: { name: updated.name, isActive: updated.isActive },
  });

  return c.json({ data: { id: updated.id, name: updated.name, isActive: updated.isActive } });
});

export default app;
