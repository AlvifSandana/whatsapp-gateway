import type { Context, Next } from "hono";
import { prisma } from "@repo/db";
import { hashToken } from "../lib/auth";

const SKIP_PATHS = ["/v1/auth/login", "/v1/auth/register", "/health"];

export const authMiddleware = async (c: Context, next: Next) => {
  const path = c.req.path;
  const isSignedDownload =
    path.startsWith("/v1/reports/exports/") &&
    path.endsWith("/download") &&
    !!c.req.query("token");
  if (isSignedDownload) {
    return next();
  }
  if (SKIP_PATHS.some((prefix) => path.startsWith(prefix))) {
    return next();
  }

  const authHeader = c.req.header("Authorization") || "";
  let token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token && path.startsWith("/v1/events")) {
    token = c.req.query("token") || "";
  }

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const tokenHash = hashToken(token);
  const session = await prisma.session.findFirst({
    where: {
      tokenHash,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });

  if (!session || !session.user?.isActive) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("auth", {
    sessionId: session.id,
    userId: session.userId,
    workspaceId: session.user.workspaceId,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
  });

  return next();
};
