import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "@repo/db";
import { createToken, hashPassword, hashToken, verifyPassword } from "../lib/auth";
import { ensureDefaultRoles } from "@repo/shared";

const app = new Hono();

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  workspaceName: z.string().optional(),
});

app.post("/register", zValidator("json", registerSchema), async (c) => {
  const input = c.req.valid("json");

  const existing = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });
  if (existing) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const workspace = await prisma.workspace.create({
    data: { name: input.workspaceName?.trim() || "Default Workspace" },
  });

  const user = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: input.email.toLowerCase(),
      name: input.name.trim(),
      passwordHash: hashPassword(input.password),
    },
  });

  const roles = await ensureDefaultRoles(workspace.id);
  const ownerRole = roles.find((role) => role.name === "Owner");
  if (ownerRole) {
    await prisma.userRole.create({
      data: { userId: user.id, roleId: ownerRole.id },
    });
  }

  const token = createToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  return c.json({
    data: {
      token,
      user: { id: user.id, email: user.email, name: user.name },
      workspace: { id: workspace.id, name: workspace.name },
    },
  });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

app.post("/login", zValidator("json", loginSchema), async (c) => {
  const input = c.req.valid("json");

  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });
  if (!user || !user.isActive) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const ok = verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = createToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  const workspace = await prisma.workspace.findUnique({
    where: { id: user.workspaceId },
  });

  return c.json({
    data: {
      token,
      user: { id: user.id, email: user.email, name: user.name },
      workspace: workspace ? { id: workspace.id, name: workspace.name } : null,
    },
  });
});

app.get("/me", async (c) => {
  const auth = c.get("auth") as any;
  if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

  const workspace = await prisma.workspace.findUnique({
    where: { id: auth.workspaceId },
  });

  return c.json({
    data: {
      user: auth.user,
      workspace: workspace ? { id: workspace.id, name: workspace.name } : null,
    },
  });
});

app.post("/logout", async (c) => {
  const authHeader = c.req.header("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  const tokenHash = hashToken(token);
  await prisma.session.deleteMany({ where: { tokenHash } });

  return c.json({ message: "Logged out" });
});

export default app;
