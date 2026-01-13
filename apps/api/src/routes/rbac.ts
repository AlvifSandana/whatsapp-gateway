import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "@repo/db";
import { logAudit } from "@repo/shared";
import { ensureDefaultRolePermissions, ensureDefaultRoles, ensurePermissions } from "@repo/shared";

const app = new Hono();

app.get("/permissions", async (c) => {
  await ensurePermissions();
  const permissions = await prisma.permission.findMany({ orderBy: { code: "asc" } });
  return c.json({ data: permissions });
});

app.get("/roles", async (c) => {
  const auth = c.get("auth") as any;
  await ensureDefaultRolePermissions(auth.workspaceId);

  const roles = await prisma.role.findMany({
    where: { workspaceId: auth.workspaceId },
    include: {
      permissions: { include: { permission: true } },
    },
    orderBy: { name: "asc" },
  });

  return c.json({
    data: roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions.map((rp) => rp.permission.code),
    })),
  });
});

app.post(
  "/roles",
  zValidator(
    "json",
    z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      permissionCodes: z.array(z.string()).optional(),
    }),
  ),
  async (c) => {
    const auth = c.get("auth") as any;
    const input = c.req.valid("json");

    const role = await prisma.role.create({
      data: {
        workspaceId: auth.workspaceId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
      },
    });

    if (input.permissionCodes?.length) {
      const permissions = await prisma.permission.findMany({
        where: { code: { in: input.permissionCodes } },
        select: { id: true },
      });
      await prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });
    }

    await logAudit({
      workspaceId: auth.workspaceId,
      action: "rbac.roles.create",
      entityType: "Role",
      entityId: role.id,
      afterJson: { name: role.name },
    });

    return c.json({ data: role }, 201);
  },
);

app.put(
  "/roles/:id",
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
    }),
  ),
  async (c) => {
    const auth = c.get("auth") as any;
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const role = await prisma.role.findFirst({
      where: { id, workspaceId: auth.workspaceId },
    });
    if (!role) return c.json({ error: "Not found" }, 404);

    const updated = await prisma.role.update({
      where: { id },
      data: {
        name: input.name?.trim() ?? role.name,
        description: input.description?.trim() ?? role.description,
      },
    });

    await logAudit({
      workspaceId: auth.workspaceId,
      action: "rbac.roles.update",
      entityType: "Role",
      entityId: role.id,
      beforeJson: { name: role.name, description: role.description },
      afterJson: { name: updated.name, description: updated.description },
    });

    return c.json({ data: updated });
  },
);

app.delete("/roles/:id", async (c) => {
  const auth = c.get("auth") as any;
  const id = c.req.param("id");
  const role = await prisma.role.findFirst({
    where: { id, workspaceId: auth.workspaceId },
  });
  if (!role) return c.json({ error: "Not found" }, 404);

  const userCount = await prisma.userRole.count({ where: { roleId: id } });
  if (userCount > 0) {
    return c.json({ error: "Role is assigned to users" }, 409);
  }

  await prisma.role.delete({ where: { id } });

  await logAudit({
    workspaceId: auth.workspaceId,
    action: "rbac.roles.delete",
    entityType: "Role",
    entityId: role.id,
    beforeJson: { name: role.name },
  });

  return c.json({ message: "Deleted" });
});

app.get("/roles/:id/permissions", async (c) => {
  const auth = c.get("auth") as any;
  const id = c.req.param("id");
  const role = await prisma.role.findFirst({
    where: { id, workspaceId: auth.workspaceId },
  });
  if (!role) return c.json({ error: "Not found" }, 404);

  const permissions = await prisma.rolePermission.findMany({
    where: { roleId: id },
    include: { permission: true },
  });

  return c.json({ data: permissions.map((rp) => rp.permission.code) });
});

app.put(
  "/roles/:id/permissions",
  zValidator(
    "json",
    z.object({
      permissionCodes: z.array(z.string()),
    }),
  ),
  async (c) => {
    const auth = c.get("auth") as any;
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const role = await prisma.role.findFirst({
      where: { id, workspaceId: auth.workspaceId },
    });
    if (!role) return c.json({ error: "Not found" }, 404);

    const permissions = await prisma.permission.findMany({
      where: { code: { in: input.permissionCodes } },
      select: { id: true },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });

    await logAudit({
      workspaceId: auth.workspaceId,
      action: "rbac.roles.update_permissions",
      entityType: "Role",
      entityId: role.id,
      afterJson: { permissionCodes: input.permissionCodes },
    });

    return c.json({ message: "Updated" });
  },
);

app.get("/users", async (c) => {
  const auth = c.get("auth") as any;
  const users = await prisma.user.findMany({
    where: { workspaceId: auth.workspaceId },
    include: { roles: { include: { role: true } } },
    orderBy: { createdAt: "asc" },
  });

  return c.json({
    data: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      isActive: user.isActive,
      roles: user.roles.map((r) => ({ id: r.roleId, name: r.role.name })),
    })),
  });
});

app.get("/users/:id/roles", async (c) => {
  const auth = c.get("auth") as any;
  const id = c.req.param("id");
  const user = await prisma.user.findFirst({
    where: { id, workspaceId: auth.workspaceId },
  });
  if (!user) return c.json({ error: "Not found" }, 404);

  const roles = await prisma.userRole.findMany({
    where: { userId: id },
    include: { role: true },
  });

  return c.json({ data: roles.map((r) => ({ id: r.roleId, name: r.role.name })) });
});

app.put(
  "/users/:id/roles",
  zValidator(
    "json",
    z.object({
      roleIds: z.array(z.string().uuid()),
    }),
  ),
  async (c) => {
    const auth = c.get("auth") as any;
    const id = c.req.param("id");
    const input = c.req.valid("json");

    const user = await prisma.user.findFirst({
      where: { id, workspaceId: auth.workspaceId },
    });
    if (!user) return c.json({ error: "Not found" }, 404);

    await prisma.userRole.deleteMany({ where: { userId: id } });
    if (input.roleIds.length > 0) {
      await prisma.userRole.createMany({
        data: input.roleIds.map((roleId) => ({ userId: id, roleId })),
        skipDuplicates: true,
      });
    }

    await logAudit({
      workspaceId: auth.workspaceId,
      action: "rbac.users.update_roles",
      entityType: "User",
      entityId: user.id,
      afterJson: { roleIds: input.roleIds },
    });

    return c.json({ message: "Updated" });
  },
);

export default app;
