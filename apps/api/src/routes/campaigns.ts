import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "@repo/db";
import { pubSubPublisher } from "../redis";

const app = new Hono();

// List Campaigns
app.get("/", async (c) => {
    const campaigns = await prisma.campaign.findMany({
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { targets: true, messages: true } } }
    });
    return c.json({ data: campaigns });
});

// Create Campaign
app.post(
    "/",
    zValidator(
        "json",
        z.object({
            name: z.string(),
            waAccountId: z.string(), // Sender
            message: z.string(),
            tagIds: z.array(z.string()).optional() // Target by tags
        })
    ),
    async (c) => {
        const { name, waAccountId, message, tagIds } = c.req.valid("json");
        const workspaceId = c.req.header("X-Workspace-ID") || "00000000-0000-0000-0000-000000000000";

        // Create Campaign
        const campaign = await prisma.campaign.create({
            data: {
                workspaceId,
                name,
                status: "DRAFT",
                waAccountId,
                payload: { type: "text", text: message },
                scheduleAt: null,
            }
        });

        // Add Targets
        if (tagIds && tagIds.length > 0) {
            const contacts = await prisma.contact.findMany({
                where: {
                    workspaceId,
                    tags: { some: { tagId: { in: tagIds } } }
                }
            });

            if (contacts.length > 0) {
                await prisma.campaignTarget.createMany({
                    data: contacts.map(c => ({
                        campaignId: campaign.id,
                        contactId: c.id,
                        status: "QUEUED"
                    })),
                    skipDuplicates: true
                });
            }
        }

        return c.json({ data: campaign }, 201);
    }
);

// Start Campaign (Simple/MVP: Loop and Push)
app.post("/:id/start", async (c) => {
    const id = c.req.param("id");

    const campaign = await prisma.campaign.findUnique({
        where: { id },
        include: { targets: { include: { contact: true } } }
    });

    if (!campaign) return c.json({ error: "Not found" }, 404);
    if (!campaign.waAccountId) return c.json({ error: "No sender account" }, 400);

    // Update status
    await prisma.campaign.update({
        where: { id },
        data: { status: "PROCESSING" }
    });

    // Iterate targets and send
    // In production, this loop should be a background job/queue.
    for (const target of campaign.targets) {
        if (target.status !== "QUEUED") continue;

        // Create Message Record
        const msg = await prisma.message.create({
            data: {
                workspaceId: campaign.workspaceId,
                waAccountId: campaign.waAccountId,
                contactId: target.contactId,
                direction: "OUT",
                status: "QUEUED",
                type: "text",
                payload: campaign.payload ?? {},
                sourceCampaignId: campaign.id
            }
        });

        // Publish to Runtime
        const cmd = {
            type: "SEND_MESSAGE",
            waAccountId: campaign.waAccountId,
            payload: {
                to: target.contact.phoneE164,
                message: campaign.payload,
                dbMessageId: msg.id
            }
        };
        await pubSubPublisher.publish("cmd:wa-runtime", JSON.stringify(cmd));

        // Update Target Status (Optimistic)
        await prisma.campaignTarget.update({
            where: { campaignId_contactId: { campaignId: campaign.id, contactId: target.contactId } },
            data: { status: "SENT", lastTryAt: new Date(), attemptCount: { increment: 1 } }
        });
    }

    await prisma.campaign.update({
        where: { id },
        data: { status: "COMPLETED" }
    });

    return c.json({ message: "Campaign started" });
});

export default app;
