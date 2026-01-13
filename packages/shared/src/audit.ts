import { prisma } from "@repo/db";

type AuditLogInput = {
  workspaceId: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  beforeJson?: any;
  afterJson?: any;
  metaJson?: any;
};

export async function logAudit(input: AuditLogInput) {
  try {
    await prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        beforeJson: input.beforeJson,
        afterJson: input.afterJson,
        metaJson: input.metaJson,
      },
    });
  } catch (error) {
    console.error("Failed to create audit log:", error);
  }
}

export async function getAuditLogs(filters: {
  workspaceId: string;
  from?: Date;
  to?: Date;
  actorUserId?: string;
  action?: string;
  entityType?: string;
  cursor?: string;
  limit?: number;
}) {
  const where: any = {
    workspaceId: filters.workspaceId,
  };

  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) {
      where.createdAt.gte = filters.from;
    }
    if (filters.to) {
      where.createdAt.lte = filters.to;
    }
  }

  if (filters.actorUserId) {
    where.actorUserId = filters.actorUserId;
  }

  if (filters.action) {
    where.action = filters.action;
  }

  if (filters.entityType) {
    where.entityType = filters.entityType;
  }

  const limit = filters.limit || 50;
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  let nextCursor: string | undefined;
  if (logs.length > limit) {
    const nextItem = logs.pop();
    nextCursor = nextItem!.id;
  }

  return {
    data: logs,
    nextCursor,
  };
}
