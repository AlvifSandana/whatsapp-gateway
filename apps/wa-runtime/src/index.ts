import { config } from "./config";
import { redis, pubSubSubscriber } from "./redis";
import { socketManager } from "./socket/manager";
import { prisma } from "@repo/db";
import pino from "pino";
import Redis from "ioredis";

const logger = pino({ level: config.logLevel });

type CommandMeta = {
    userId?: string;
    workspaceId?: string;
    permissions?: string[];
};

const requiredPermissionByType: Record<string, string> = {
    START: "wa_accounts:connect",
    STOP: "wa_accounts:write",
    RECONNECT: "wa_accounts:reconnect",
    RESET_CREDS: "wa_accounts:reset_creds",
    SEND_MESSAGE: "contacts:write",
};

const authorizeCommand = async (type: string, waAccountId?: string, meta?: CommandMeta) => {
    const required = requiredPermissionByType[type];
    if (!required) return { ok: true };
    if (!meta?.workspaceId || !meta?.permissions) {
        return { ok: false, reason: "missing_meta" };
    }
    if (!meta.permissions.includes(required)) {
        return { ok: false, reason: "missing_permission" };
    }
    if (waAccountId) {
        const account = await prisma.waAccount.findUnique({
            where: { id: waAccountId },
            select: { workspaceId: true },
        });
        if (!account || account.workspaceId !== meta.workspaceId) {
            return { ok: false, reason: "workspace_mismatch" };
        }
    }
    return { ok: true };
};

async function main() {
    logger.info("Starting WA Runtime...");

    const queueRedis = new Redis(config.redisUrl, {
        maxRetriesPerRequest: null,
    });

    // 1. Subscribe to commands
    // Pattern: cmd:wa-runtime
    await pubSubSubscriber.subscribe("cmd:wa-runtime");

    pubSubSubscriber.on("message", async (channel, message) => {
        if (channel === "cmd:wa-runtime") {
            try {
                const { type, waAccountId, payload, meta } = JSON.parse(message);
                logger.info({ type, waAccountId }, "Received command");

                const authz = await authorizeCommand(type, waAccountId, meta);
                if (!authz.ok) {
                    logger.warn({ type, waAccountId, reason: authz.reason }, "Command rejected");
                    if (meta?.workspaceId) {
                        await prisma.auditLog.create({
                            data: {
                                workspaceId: meta.workspaceId,
                                actorUserId: meta.userId || null,
                                action: "rbac.command_denied",
                                entityType: "WaRuntimeCommand",
                                entityId: waAccountId || null,
                                metaJson: {
                                    type,
                                    reason: authz.reason,
                                },
                            },
                        });
                    }
                    return;
                }

                if (type === "START") {
                    if (waAccountId) await socketManager.start(waAccountId);
                } else if (type === "STOP") {
                    if (waAccountId) await socketManager.stop(waAccountId);
                } else if (type === "RECONNECT") {
                    if (waAccountId) {
                        await socketManager.stop(waAccountId);
                        setTimeout(() => {
                            socketManager.start(waAccountId).catch((err) => logger.error({ err }, "Failed to reconnect"));
                        }, 500);
                    }
                } else if (type === "RESET_CREDS") {
                    if (waAccountId) {
                        await socketManager.stop(waAccountId);
                        await prisma.waAccountSession.deleteMany({
                            where: { waAccountId },
                        });
                        await prisma.waAccountKey.deleteMany({
                            where: { waAccountId },
                        });
                        const account = await prisma.waAccount.findUnique({
                            where: { id: waAccountId },
                            select: { settings: true },
                        });
                        const settings = (account?.settings as any) || {};
                        await prisma.waAccount.update({
                            where: { id: waAccountId },
                            data: {
                                status: "DISCONNECTED",
                                settings: { ...settings, needs_pairing: true },
                            },
                        });
                        setTimeout(() => {
                            socketManager.start(waAccountId).catch((err) => logger.error({ err }, "Failed to start after reset"));
                        }, 500);
                    }
                } else if (type === "SEND_MESSAGE") {
                    // payload: { to, message, dbMessageId }
                    if (payload && waAccountId) {
                        await socketManager.sendMessage(waAccountId, payload.to, payload.payload || payload.message, payload.dbMessageId);
                    } else {
                        logger.warn({ type, waAccountId, payload }, "SEND_MESSAGE command missing waAccountId or payload");
                    }
                } else {
                    logger.warn({ type }, "Unknown command type");
                }
            } catch (err) {
                logger.error(err, "Error processing command");
            }
        }
    });

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const pickAccount = async () => {
        const connected = await redis.smembers("wa:connected");
        if (connected.length === 0) return null;
        let best = connected[0];
        let bestLoad = Number(await redis.get(`wa:load:${best}`)) || 0;
        for (const id of connected.slice(1)) {
            const load = Number(await redis.get(`wa:load:${id}`)) || 0;
            if (load < bestLoad) {
                best = id;
                bestLoad = load;
            }
        }
        return best;
    };

    const canSend = async (waAccountId: string) => {
        const key = `wa:rl:last:${waAccountId}`;
        const last = Number(await redis.get(key)) || 0;
        const now = Date.now();
        const interval = config.campaignSendIntervalMs;
        if (now - last < interval) {
            await sleep(interval - (now - last));
        }
        await redis.set(key, String(Date.now()), "PX", interval * 2);
    };

    const processCampaignJob = async (payload: { campaignId: string; contactId: string }) => {
        const campaign = await prisma.campaign.findUnique({
            where: { id: payload.campaignId },
            select: {
                id: true,
                status: true,
                waAccountId: true,
                payload: true,
                workspaceId: true,
            },
        });
        if (!campaign) return;

        if (campaign.status === "PAUSED") {
            await sleep(1000);
            await queueRedis.rpush("q:campaign:send", JSON.stringify(payload));
            return;
        }
        if (campaign.status === "CANCELED") {
            await prisma.campaignTarget.updateMany({
                where: { campaignId: campaign.id, contactId: payload.contactId, status: "QUEUED" },
                data: { status: "CANCELED" },
            });
            return;
        }
        if (campaign.status !== "PROCESSING") return;

        const contact = await prisma.contact.findUnique({
            where: { id: payload.contactId },
            select: { phoneE164: true },
        });
        if (!contact) return;

        const waAccountId = campaign.waAccountId || (await pickAccount());
        if (!waAccountId) {
            await sleep(1000);
            await queueRedis.rpush("q:campaign:send", JSON.stringify(payload));
            return;
        }

        await canSend(waAccountId);

        await redis.incr(`wa:load:${waAccountId}`);
        try {
            const message = await prisma.message.create({
                data: {
                    workspaceId: campaign.workspaceId,
                    waAccountId,
                    contactId: payload.contactId,
                    direction: "OUT",
                    status: "QUEUED",
                    type: "text",
                    payload: campaign.payload ?? {},
                    sourceCampaignId: campaign.id,
                },
            });

            const ok = await socketManager.sendMessage(
                waAccountId,
                contact.phoneE164,
                campaign.payload,
                message.id,
            );

            await prisma.campaignTarget.updateMany({
                where: {
                    campaignId: campaign.id,
                    contactId: payload.contactId,
                },
                data: {
                    status: ok ? "SENT" : "FAILED",
                    lastTryAt: new Date(),
                    attemptCount: { increment: 1 },
                    ...(ok ? {} : { lastError: "SEND_FAILED" }),
                },
            });
        } finally {
            await redis.decr(`wa:load:${waAccountId}`);
        }

        const remaining = await prisma.campaignTarget.count({
            where: { campaignId: campaign.id, status: "QUEUED" },
        });
        if (remaining === 0) {
            await prisma.campaign.update({
                where: { id: campaign.id },
                data: { status: "COMPLETED" },
            });
        }
    };

    const startCampaignWorker = async () => {
        while (true) {
            const res = await queueRedis.blpop("q:campaign:send", 0);
            if (!res) continue;
            try {
                const payload = JSON.parse(res[1]);
                if (payload?.campaignId && payload?.contactId) {
                    await processCampaignJob(payload);
                }
            } catch (err) {
                logger.error({ err }, "Failed to process campaign job");
            }
        }
    };

    const startScheduler = () => {
        setInterval(async () => {
            const now = new Date();
            const campaigns = await prisma.campaign.findMany({
                where: { status: "SCHEDULED", scheduleAt: { lte: now } },
                select: { id: true, workspaceId: true, targetFilter: true },
            });
            for (const campaign of campaigns) {
                await prisma.campaign.update({
                    where: { id: campaign.id },
                    data: { status: "PROCESSING" },
                });

                const existingCount = await prisma.campaignTarget.count({
                    where: { campaignId: campaign.id },
                });
                if (existingCount === 0) {
                    const tagIds = (campaign.targetFilter as any)?.tagIds;
                    if (Array.isArray(tagIds) && tagIds.length > 0) {
                        const contacts = await prisma.contact.findMany({
                            where: {
                                workspaceId: campaign.workspaceId,
                                tags: { some: { tagId: { in: tagIds } } },
                            },
                            select: { id: true },
                        });
                        if (contacts.length > 0) {
                            await prisma.campaignTarget.createMany({
                                data: contacts.map((contact) => ({
                                    campaignId: campaign.id,
                                    contactId: contact.id,
                                    status: "QUEUED",
                                })),
                                skipDuplicates: true,
                            });
                        }
                    }
                }

                const targets = await prisma.campaignTarget.findMany({
                    where: { campaignId: campaign.id, status: "QUEUED" },
                    select: { contactId: true },
                });
                if (targets.length === 0) {
                    await prisma.campaign.update({
                        where: { id: campaign.id },
                        data: { status: "COMPLETED" },
                    });
                    continue;
                }
                for (const target of targets) {
                    await queueRedis.rpush(
                        "q:campaign:send",
                        JSON.stringify({ campaignId: campaign.id, contactId: target.contactId }),
                    );
                }
            }
        }, 5000);
    };

    // 2. Auto-start connected accounts?
    // In a robust system, we would ask a coordinator or check DB for "should be connected"
    // For MVP, lets just fetch all accounts that were CONNECTED? 
    // Or better, wait for explicit START commands from API/Dash.
    // But on restart, recover?

    const accounts = await prisma.waAccount.findMany({
        where: { status: "CONNECTED" } // Simple recovery
    });

    for (const acc of accounts) {
        logger.info({ waAccountId: acc.id }, "Auto-starting account");
        socketManager.start(acc.id).catch(err => logger.error({ err }, "Failed to auto-start"));
    }

    startCampaignWorker().catch((err) => logger.error({ err }, "Campaign worker crashed"));
    startScheduler();

    logger.info("WA Runtime initialized");
}

main().catch(err => {
    logger.fatal(err, "Fatal error in main");
    process.exit(1);
});
