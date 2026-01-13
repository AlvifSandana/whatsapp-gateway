import { prisma } from "@repo/db";

export const permissionSeed = [
  { code: "wa_accounts:read", groupName: "WA Accounts", description: "View accounts" },
  { code: "wa_accounts:connect", groupName: "WA Accounts", description: "Connect accounts" },
  { code: "wa_accounts:reconnect", groupName: "WA Accounts", description: "Reconnect accounts" },
  { code: "wa_accounts:reset_creds", groupName: "WA Accounts", description: "Reset credentials" },
  { code: "wa_accounts:write", groupName: "WA Accounts", description: "Update accounts" },
  { code: "campaigns:read", groupName: "Campaigns", description: "View campaigns" },
  { code: "campaigns:write", groupName: "Campaigns", description: "Create/edit campaigns" },
  { code: "campaigns:run", groupName: "Campaigns", description: "Start campaigns" },
  { code: "campaigns:pause", groupName: "Campaigns", description: "Pause campaigns" },
  { code: "campaigns:cancel", groupName: "Campaigns", description: "Cancel campaigns" },
  { code: "campaigns:report", groupName: "Campaigns", description: "View campaign reports" },
  { code: "contacts:read", groupName: "Contacts", description: "View contacts" },
  { code: "contacts:write", groupName: "Contacts", description: "Create/edit contacts" },
  { code: "contacts:import", groupName: "Contacts", description: "Import contacts" },
  { code: "auto_reply:read", groupName: "Auto Reply", description: "View auto-reply rules" },
  { code: "auto_reply:write", groupName: "Auto Reply", description: "Create/edit auto-reply rules" },
  { code: "auto_reply:test", groupName: "Auto Reply", description: "Test auto-reply rules" },
  { code: "audit:read", groupName: "Audit", description: "View audit logs" },
  { code: "reports:read", groupName: "Reports", description: "View exports" },
  { code: "reports:export", groupName: "Reports", description: "Create exports" },
  { code: "rbac:manage", groupName: "RBAC", description: "Manage roles and permissions" },
];

export const ensurePermissions = async () => {
  await prisma.permission.createMany({
    data: permissionSeed,
    skipDuplicates: true,
  });
  return prisma.permission.findMany({ orderBy: { code: "asc" } });
};

export const ensureDefaultRoles = async (workspaceId: string) => {
  const existing = await prisma.role.findMany({
    where: { workspaceId },
    select: { id: true, name: true },
  });
  if (existing.length === 0) {
    await prisma.role.createMany({
      data: [
        { workspaceId, name: "Owner", description: "Full access" },
        { workspaceId, name: "Member", description: "Standard access" },
      ],
      skipDuplicates: true,
    });
  }
  return prisma.role.findMany({ where: { workspaceId } });
};

export const ensureDefaultRolePermissions = async (workspaceId: string) => {
  const [permissions, roles] = await Promise.all([
    ensurePermissions(),
    ensureDefaultRoles(workspaceId),
  ]);

  const roleIds = roles.map((role) => role.id);
  const existingCounts = await prisma.rolePermission.groupBy({
    by: ["roleId"],
    where: { roleId: { in: roleIds } },
    _count: { _all: true },
  });
  const countMap = new Map(existingCounts.map((item) => [item.roleId, item._count._all]));

  const owner = roles.find((role) => role.name === "Owner");
  const member = roles.find((role) => role.name === "Member");

  if (owner && (countMap.get(owner.id) || 0) === 0) {
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId: owner.id, permissionId: permission.id })),
      skipDuplicates: true,
    });
  }

  if (member && (countMap.get(member.id) || 0) === 0) {
    const memberPermissions = permissions
      .filter((permission) => permission.code !== "rbac:manage")
      .map((permission) => permission.id);
    await prisma.rolePermission.createMany({
      data: memberPermissions.map((permissionId) => ({ roleId: member.id, permissionId })),
      skipDuplicates: true,
    });
  }
};

export const getUserPermissionCodes = async (userId: string, workspaceId: string) => {
  await ensureDefaultRolePermissions(workspaceId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) {
    return [];
  }
  const roleCount = await prisma.userRole.count({ where: { userId } });
  if (roleCount === 0) {
    const memberRole = await prisma.role.findFirst({
      where: { workspaceId, name: "Member" },
      select: { id: true },
    });
    if (memberRole) {
      await prisma.userRole.create({
        data: { userId, roleId: memberRole.id },
      });
    }
  }
  const roles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  const codes = new Set<string>();
  roles.forEach((role) => {
    role.role.permissions.forEach((rp) => codes.add(rp.permission.code));
  });
  return Array.from(codes);
};
