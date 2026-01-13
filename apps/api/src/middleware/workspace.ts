import type { Context, Next } from "hono";
import { prisma } from "@repo/db";

const WORKSPACE_HEADER = "X-Workspace-ID";

export const workspaceMiddleware = async (c: Context, next: Next) => {
  const auth = c.get("auth") as { workspaceId?: string } | undefined;
  if (!auth?.workspaceId) return next();

  const headerWorkspaceId = c.req.header(WORKSPACE_HEADER);
  if (headerWorkspaceId && headerWorkspaceId !== auth.workspaceId) {
    return c.json({ error: "Workspace mismatch" }, 403);
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: auth.workspaceId },
    select: { id: true, name: true },
  });
  if (!workspace) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  c.set("workspaceId", workspace.id);
  c.set("workspace", workspace);

  return next();
};
