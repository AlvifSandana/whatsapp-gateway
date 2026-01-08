import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "@repo/db";
import { redis, pubSubPublisher } from "../redis";

const app = new Hono();

// List Accounts
app.get("/", async (c) => {
    const workspaceId = c.req.header("X-Workspace-ID"); // TODO: Middleware 

    const accounts = await prisma.waAccount.findMany({
        orderBy: { createdAt: "desc" }
    });
    return c.json({ data: accounts });
});

// Create Account
app.post(
    "/",
    zValidator(
        "json",
        z.object({
            phoneE164: z.string(),
            label: z.string().optional(),
            workspaceId: z.string().uuid(), // Temporary: should come from Auth
        })
    ),
    async (c) => {
        const { phoneE164, label, workspaceId } = c.req.valid("json");

        // Ensure workspace exists (mock check or FK constraint handles it)
        try {
            const account = await prisma.waAccount.create({
                data: {
                    workspaceId,
                    phoneE164,
                    label,
                    status: "DISCONNECTED",
                    settings: { needs_pairing: true }
                }
            });
            return c.json({ data: account }, 201);
        } catch (err) {
            return c.json({ error: "Failed to create account" }, 500);
        }
    }
);

// Get QR
app.get("/:id/qr", async (c) => {
    const id = c.req.param("id");
    const qr = await redis.get(`wa:qr:${id}`);

    if (!qr) {
        return c.json({ error: "QR not available or expired" }, 404);
    }
    return c.json({ data: { qr } });
});

// Connect (Command)
app.post("/:id/connect", async (c) => {
    const id = c.req.param("id");

    // Validate existence
    const account = await prisma.waAccount.findUnique({ where: { id } });
    if (!account) return c.json({ error: "Not found" }, 404);

    // Publish command
    const cmd = { type: "START", waAccountId: id };
    await pubSubPublisher.publish("cmd:wa-runtime", JSON.stringify(cmd));

    return c.json({ message: "Connect command sent" });
});

// Disconnect (Command)
app.post("/:id/disconnect", async (c) => {
    const id = c.req.param("id");

    // Publish command
    const cmd = { type: "STOP", waAccountId: id };
    await pubSubPublisher.publish("cmd:wa-runtime", JSON.stringify(cmd));

    return c.json({ message: "Disconnect command sent" });
});

export default app;
