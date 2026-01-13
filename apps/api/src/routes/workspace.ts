import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "@repo/db";
import { logAudit } from "@repo/shared";

const app = new Hono();

const migrateSchema = z.object({
  name: z.string().min(1),
  migrateData: z.boolean().optional(),
  moveUsers: z.boolean().optional(),
});

const deleteSchema = z.object({
  confirmName: z.string().min(1),
});

app.get("/", async (c) => {
  const auth = c.get("auth") as any;
  const workspace = await prisma.workspace.findUnique({
    where: { id: auth.workspaceId },
    select: { id: true, name: true, createdAt: true },
  });
  if (!workspace) return c.json({ error: "Not found" }, 404);
  return c.json({ data: workspace });
});

app.get("/list", async (c) => {
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return c.json({ data: workspaces });
});

app.post(
  "/switch",
  zValidator(
    "json",
    z.object({
      workspaceId: z.string().min(1),
    }),
  ),
  async (c) => {
    const auth = c.get("auth") as any;
    const input = c.req.valid("json");

    const workspace = await prisma.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { id: true, name: true },
    });
    if (!workspace) return c.json({ error: "Workspace not found" }, 404);

    await prisma.user.update({
      where: { id: auth.userId },
      data: { workspaceId: workspace.id },
    });

    await logAudit({
      workspaceId: workspace.id,
      action: "workspace.switch",
      entityType: "Workspace",
      entityId: workspace.id,
      afterJson: { fromWorkspaceId: auth.workspaceId },
    });

    return c.json({ data: workspace });
  },
);

app.patch(
  "/",
  zValidator(
    "json",
    z.object({
      name: z.string().min(1),
    }),
  ),
  async (c) => {
    const auth = c.get("auth") as any;
    const input = c.req.valid("json");
    const workspace = await prisma.workspace.findUnique({
      where: { id: auth.workspaceId },
    });
    if (!workspace) return c.json({ error: "Not found" }, 404);

    const updated = await prisma.workspace.update({
      where: { id: workspace.id },
      data: { name: input.name.trim() },
    });

    await logAudit({
      workspaceId: workspace.id,
      action: "workspace.update",
      entityType: "Workspace",
      entityId: workspace.id,
      beforeJson: { name: workspace.name },
      afterJson: { name: updated.name },
    });

    return c.json({ data: { id: updated.id, name: updated.name } });
  },
);

app.post(
  "/migrate",
  zValidator("json", migrateSchema),
  async (c) => {
    const auth = c.get("auth") as any;
    const input = c.req.valid("json");
    const migrateData = input.migrateData ?? false;
    const moveUsers = migrateData ? true : input.moveUsers ?? false;

    const currentWorkspace = await prisma.workspace.findUnique({
      where: { id: auth.workspaceId },
    });
    if (!currentWorkspace) return c.json({ error: "Not found" }, 404);

    const nextWorkspace = await prisma.workspace.create({
      data: { name: input.name.trim() },
    });

    if (migrateData) {
      await prisma.$transaction([
        prisma.waAccount.updateMany({
          where: { workspaceId: currentWorkspace.id },
          data: { workspaceId: nextWorkspace.id },
        }),
        prisma.waAccountSession.updateMany({
          where: { workspaceId: currentWorkspace.id },
          data: { workspaceId: nextWorkspace.id },
        }),
        prisma.waAccountKey.updateMany({
          where: { workspaceId: currentWorkspace.id },
          data: { workspaceId: nextWorkspace.id },
        }),
        prisma.contact.updateMany({
          where: { workspaceId: currentWorkspace.id },
          data: { workspaceId: nextWorkspace.id },
        }),
        prisma.tag.updateMany({
          where: { workspaceId: currentWorkspace.id },
          data: { workspaceId: nextWorkspace.id },
        }),
        prisma.campaign.updateMany({
          where: { workspaceId: currentWorkspace.id },
          data: { workspaceId: nextWorkspace.id },
        }),
        prisma.autoReplyRule.updateMany({
          where: { workspaceId: currentWorkspace.id },
          data: { workspaceId: nextWorkspace.id },
        }),
        prisma.role.updateMany({
          where: { workspaceId: currentWorkspace.id },
          data: { workspaceId: nextWorkspace.id },
        }),
        prisma.contactImportJob.updateMany({
          where: { workspaceId: currentWorkspace.id },
          data: { workspaceId: nextWorkspace.id },
        }),
        prisma.export.updateMany({
          where: { workspaceId: currentWorkspace.id },
          data: { workspaceId: nextWorkspace.id },
        }),
        prisma.auditLog.updateMany({
          where: { workspaceId: currentWorkspace.id },
          data: { workspaceId: nextWorkspace.id },
        }),
        prisma.message.updateMany({
          where: { workspaceId: currentWorkspace.id },
          data: { workspaceId: nextWorkspace.id },
        }),
      ]);
    }

    if (moveUsers) {
      await prisma.user.updateMany({
        where: { workspaceId: currentWorkspace.id },
        data: { workspaceId: nextWorkspace.id },
      });
    } else {
      await prisma.user.update({
        where: { id: auth.userId },
        data: { workspaceId: nextWorkspace.id },
      });
    }

    await logAudit({
      workspaceId: nextWorkspace.id,
      action: "workspace.migrate",
      entityType: "Workspace",
      entityId: nextWorkspace.id,
      afterJson: {
        name: nextWorkspace.name,
        fromWorkspaceId: currentWorkspace.id,
        migrateData,
        moveUsers,
      },
    });

    return c.json({
      data: {
        id: nextWorkspace.id,
        name: nextWorkspace.name,
        migratedData: migrateData,
        movedUsers: moveUsers,
      },
    });
  },
);

app.delete("/", zValidator("json", deleteSchema), async (c) => {
  const auth = c.get("auth") as any;
  const input = c.req.valid("json");

  const workspace = await prisma.workspace.findUnique({
    where: { id: auth.workspaceId },
    select: { id: true, name: true },
  });
  if (!workspace) return c.json({ error: "Not found" }, 404);
  if (workspace.name !== input.confirmName.trim()) {
    return c.json({ error: "Confirmation name does not match" }, 409);
  }

  await prisma.$transaction([
    prisma.messageEvent.deleteMany({
      where: { message: { workspaceId: workspace.id } },
    }),
    prisma.message.deleteMany({ where: { workspaceId: workspace.id } }),
    prisma.campaignTarget.deleteMany({
      where: { campaign: { workspaceId: workspace.id } },
    }),
    prisma.campaign.deleteMany({ where: { workspaceId: workspace.id } }),
    prisma.contactTag.deleteMany({
      where: { contact: { workspaceId: workspace.id } },
    }),
    prisma.contact.deleteMany({ where: { workspaceId: workspace.id } }),
    prisma.tag.deleteMany({ where: { workspaceId: workspace.id } }),
    prisma.autoReplyRule.deleteMany({ where: { workspaceId: workspace.id } }),
    prisma.waAccountSession.deleteMany({ where: { workspaceId: workspace.id } }),
    prisma.waAccountKey.deleteMany({ where: { workspaceId: workspace.id } }),
    prisma.waAccount.deleteMany({ where: { workspaceId: workspace.id } }),
    prisma.rolePermission.deleteMany({ where: { role: { workspaceId: workspace.id } } }),
    prisma.userRole.deleteMany({ where: { user: { workspaceId: workspace.id } } }),
    prisma.role.deleteMany({ where: { workspaceId: workspace.id } }),
    prisma.contactImportRow.deleteMany({
      where: { job: { workspaceId: workspace.id } },
    }),
    prisma.contactImportJob.deleteMany({ where: { workspaceId: workspace.id } }),
    prisma.export.deleteMany({ where: { workspaceId: workspace.id } }),
    prisma.auditLog.deleteMany({ where: { workspaceId: workspace.id } }),
    prisma.session.deleteMany({ where: { user: { workspaceId: workspace.id } } }),
    prisma.user.deleteMany({ where: { workspaceId: workspace.id } }),
    prisma.workspace.delete({ where: { id: workspace.id } }),
  ]);

  return c.json({ message: "Workspace deleted" });
});

export default app;
