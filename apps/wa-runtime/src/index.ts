import { config } from "./config";
import { redis, pubSubPublisher, pubSubSubscriber } from "./redis";
import { socketManager } from "./socket/manager";
import { prisma } from "@repo/db";
import { logAudit } from "@repo/shared";
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

const publishEvent = async (type: string, payload: Record<string, any>) => {
    const workspaceId = payload?.workspaceId;
    const channel = workspaceId ? `ev:ws:${workspaceId}` : "ev:global";
    await pubSubPublisher.publish(
        channel,
        JSON.stringify({ type, payload, timestamp: new Date().toISOString() }),
    );
};

const publishAck = async (workspaceId: string | undefined, payload: Record<string, any>) => {
    if (!workspaceId) return;
    await pubSubPublisher.publish(
        `ack:ws:${workspaceId}`,
        JSON.stringify({
            type: "ack",
            payload,
            timestamp: new Date().toISOString(),
        }),
    );
};

const publishCampaignProgress = async (campaignId: string, workspaceId: string) => {
    const total = await prisma.campaignTarget.count({ where: { campaignId } });
    const grouped = await prisma.campaignTarget.groupBy({
        by: ["status"],
        where: { campaignId },
        _count: { status: true },
    });
    const byStatus = grouped.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = row._count.status;
        return acc;
    }, {});
    await publishEvent("campaign.progress", { campaignId, workspaceId, total, byStatus });
};

const rateLimiterScript = `
local tokens = tonumber(redis.call("GET", KEYS[1]))
local last_ts = tonumber(redis.call("GET", KEYS[2]))
local rate = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])

if not tokens then tokens = capacity end
if not last_ts then last_ts = now end

local delta = math.max(0, now - last_ts)
local refill = delta * rate
tokens = math.min(capacity, tokens + refill)

local allowed = 0
local retry_after = 0
if tokens >= 1 then
  allowed = 1
  tokens = tokens - 1
else
  retry_after = math.ceil((1 - tokens) / rate)
end

redis.call("SET", KEYS[1], tokens, "PX", ttl)
redis.call("SET", KEYS[2], now, "PX", ttl)

return { allowed, retry_after }
`;

const markCampaignDirty = async (workspaceId: string, campaignId: string) => {
    await redis.sadd(`dirty:ws:${workspaceId}:campaigns`, campaignId);
    await redis.sadd("dirty:workspaces", workspaceId);
};

const flushCampaignProgress = async () => {
    const workspaces = await redis.smembers("dirty:workspaces");
    if (workspaces.length === 0) return;

    for (const workspaceId of workspaces) {
        const campaignIds = await redis.smembers(`dirty:ws:${workspaceId}:campaigns`);
        if (campaignIds.length === 0) {
            await redis.srem("dirty:workspaces", workspaceId);
            continue;
        }

        await redis.del(`dirty:ws:${workspaceId}:campaigns`);
        await redis.srem("dirty:workspaces", workspaceId);

        for (const campaignId of campaignIds) {
            await publishCampaignProgress(campaignId, workspaceId);
        }
    }
};

async function main() {
    logger.info("Starting WA Runtime...");

    const queueRedis = new Redis(config.redisUrl, {
        maxRetriesPerRequest: null,
    });

    const shutdown = async (signal: string) => {
        logger.info({ signal }, "Shutting down WA runtime");
        await socketManager.stopAll();
        await queueRedis.quit();
        await pubSubSubscriber.quit();
        await pubSubPublisher.quit();
        await redis.quit();
        process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

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
                    await publishAck(meta?.workspaceId, {
                        type,
                        waAccountId,
                        status: "rejected",
                        reason: authz.reason,
                    });
                    return;
                }

                if (type === "START") {
                    if (waAccountId) await socketManager.start(waAccountId);
                    await publishAck(meta?.workspaceId, { type, waAccountId, status: "ok" });
                } else if (type === "STOP") {
                    if (waAccountId) await socketManager.stop(waAccountId);
                    await publishAck(meta?.workspaceId, { type, waAccountId, status: "ok" });
                } else if (type === "RECONNECT") {
                    if (waAccountId) {
                        await socketManager.stop(waAccountId);
                        setTimeout(() => {
                            socketManager.start(waAccountId).catch((err) => logger.error({ err }, "Failed to reconnect"));
                        }, 500);
                    }
                    await publishAck(meta?.workspaceId, { type, waAccountId, status: "ok" });
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
                            select: { settings: true, workspaceId: true },
                        });
                        const settings = (account?.settings as any) || {};
                        await prisma.waAccount.update({
                            where: { id: waAccountId },
                            data: {
                                status: "DISCONNECTED",
                                settings: { ...settings, needs_pairing: true },
                            },
                        });
                        const workspaceId = meta?.workspaceId || account?.workspaceId;
                        if (workspaceId) {
                            await logAudit({
                                workspaceId,
                                actorUserId: meta?.userId,
                                action: "wa_account.reset_creds.runtime",
                                entityType: "WaAccount",
                                entityId: waAccountId,
                                metaJson: { source: "wa-runtime" },
                            });
                        }
                        setTimeout(() => {
                            socketManager.start(waAccountId).catch((err) => logger.error({ err }, "Failed to start after reset"));
                        }, 500);
                    }
                    await publishAck(meta?.workspaceId, { type, waAccountId, status: "ok" });
                } else if (type === "SEND_MESSAGE") {
                    // payload: { to, message, dbMessageId }
                    if (payload && waAccountId) {
                        await socketManager.sendMessage(waAccountId, payload.to, payload.payload || payload.message, payload.dbMessageId);
                        await publishAck(meta?.workspaceId, { type, waAccountId, status: "ok" });
                    } else {
                        logger.warn({ type, waAccountId, payload }, "SEND_MESSAGE command missing waAccountId or payload");
                        await publishAck(meta?.workspaceId, { type, waAccountId, status: "failed", reason: "invalid_payload" });
                    }
                } else {
                    logger.warn({ type }, "Unknown command type");
                    await publishAck(meta?.workspaceId, { type, waAccountId, status: "failed", reason: "unknown_type" });
                }
            } catch (err) {
                logger.error(err, "Error processing command");
                await publishAck((() => {
                    try {
                        const parsed = JSON.parse(message);
                        return parsed?.meta?.workspaceId;
                    } catch {
                        return undefined;
                    }
                })(), { status: "error", reason: "exception" });
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
        const now = Date.now();
        const ratePerMs = config.campaignRateLimitPerSecond / 1000;
        if (!Number.isFinite(ratePerMs) || ratePerMs <= 0) {
            return;
        }
        const ttl = Math.max(2000, Math.ceil((config.campaignRateBurst / ratePerMs) * 2));
        const [allowed, retryAfter] = (await redis.eval(
            rateLimiterScript,
            2,
            `rl:wa:${waAccountId}:tokens`,
            `rl:wa:${waAccountId}:ts`,
            ratePerMs,
            config.campaignRateBurst,
            now,
            ttl,
        )) as [number, number];

        if (!allowed && retryAfter > 0) {
            const jitter = Math.floor(Math.random() * 200);
            await sleep(retryAfter + jitter);
        }
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

            const attemptKey = `retry:campaign:${campaign.id}:${payload.contactId}`;
            const attempt = Number(await redis.incr(attemptKey));
            await redis.expire(attemptKey, 60 * 60 * 24);
            const maxAttempts = config.campaignSendRetryMax;

            await prisma.campaignTarget.updateMany({
                where: {
                    campaignId: campaign.id,
                    contactId: payload.contactId,
                },
                data: {
                    status: ok ? "SENT" : attempt >= maxAttempts ? "FAILED" : "QUEUED",
                    lastTryAt: new Date(),
                    attemptCount: { increment: 1 },
                    ...(ok ? {} : { lastError: "SEND_FAILED" }),
                },
            });

                if (!ok) {
                    if (attempt >= maxAttempts) {
                        await redis.del(attemptKey);
                        await queueRedis.rpush(
                            "q:campaign:dead",
                            JSON.stringify({
                                campaignId: campaign.id,
                                contactId: payload.contactId,
                                reason: "SEND_FAILED",
                            }),
                        );
                    } else {
                    const delay = config.campaignSendRetryBaseDelayMs * Math.pow(2, attempt - 1);
                    const jitter = Math.floor(Math.random() * 200);
                    setTimeout(() => {
                        queueRedis
                            .rpush("q:campaign:send", JSON.stringify(payload))
                            .catch((err) => logger.error({ err }, "Failed to requeue campaign job"));
                    }, delay + jitter);
                }
            } else {
                await redis.del(attemptKey);
            }
            await markCampaignDirty(campaign.workspaceId, campaign.id);
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
            await markCampaignDirty(campaign.workspaceId, campaign.id);
        }
    };

    const processCampaignPlan = async (payload: { campaignId: string }) => {
        const campaign = await prisma.campaign.findUnique({
            where: { id: payload.campaignId },
            select: { id: true, status: true, workspaceId: true, targetFilter: true },
        });
        if (!campaign) return;

        if (campaign.status === "CANCELED") return;
        if (campaign.status === "SCHEDULED") {
            await prisma.campaign.update({
                where: { id: campaign.id },
                data: { status: "PROCESSING" },
            });
        }
        if (campaign.status !== "PROCESSING") return;

        const existingCount = await prisma.campaignTarget.count({
            where: { campaignId: campaign.id },
        });
        if (existingCount === 0) {
            const tagIds = (campaign.targetFilter as any)?.tagIds || [];
            const contactIds = (campaign.targetFilter as any)?.contactIds || [];
            const targetContactIds = new Set<string>();
            if (Array.isArray(tagIds) && tagIds.length > 0) {
                const contacts = await prisma.contact.findMany({
                    where: {
                        workspaceId: campaign.workspaceId,
                        tags: { some: { tagId: { in: tagIds } } },
                    },
                    select: { id: true },
                });
                contacts.forEach((contact) => targetContactIds.add(contact.id));
            }
            if (Array.isArray(contactIds) && contactIds.length > 0) {
                const contacts = await prisma.contact.findMany({
                    where: { workspaceId: campaign.workspaceId, id: { in: contactIds } },
                    select: { id: true },
                });
                contacts.forEach((contact) => targetContactIds.add(contact.id));
            }
            if (targetContactIds.size > 0) {
                await prisma.campaignTarget.createMany({
                    data: Array.from(targetContactIds).map((contactId) => ({
                        campaignId: campaign.id,
                        contactId,
                        status: "QUEUED",
                    })),
                    skipDuplicates: true,
                });
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
            await markCampaignDirty(campaign.workspaceId, campaign.id);
            return;
        }

        for (const target of targets) {
            await queueRedis.rpush(
                "q:campaign:send",
                JSON.stringify({ campaignId: campaign.id, contactId: target.contactId }),
            );
        }

        await markCampaignDirty(campaign.workspaceId, campaign.id);
    };

    const processMessageJob = async (payload: { messageId: string }) => {
        const message = await prisma.message.findUnique({
            where: { id: payload.messageId },
            include: { contact: true },
        });
        if (!message || message.direction !== "OUT") return;
        if (message.status !== "QUEUED") return;

        const waAccountId = message.waAccountId;
        if (!waAccountId || !message.contact?.phoneE164) {
            await prisma.message.update({
                where: { id: message.id },
                data: { status: "FAILED", errorCode: "INVALID_MESSAGE" },
            });
            return;
        }

        await canSend(waAccountId);

        const retryKey = `retry:message:${message.id}`;
        const attempt = Number(await redis.incr(retryKey));
        await redis.expire(retryKey, 60 * 60 * 24);
        const maxAttempts = config.messageSendRetryMax;

        await redis.incr(`wa:load:${waAccountId}`);
        try {
            const ok = await socketManager.sendMessage(
                waAccountId,
                message.contact.phoneE164,
                message.payload,
                message.id,
            );
                if (!ok) {
                    if (attempt >= maxAttempts) {
                        await prisma.message.update({
                            where: { id: message.id },
                            data: { status: "FAILED", errorCode: "SEND_FAILED" },
                        });
                        await redis.del(retryKey);
                        await queueRedis.rpush(
                            "q:message:dead",
                            JSON.stringify({
                                messageId: message.id,
                                waAccountId,
                                reason: "SEND_FAILED",
                            }),
                        );
                    } else {
                    const delay = config.messageSendRetryBaseDelayMs * Math.pow(2, attempt - 1);
                    const jitter = Math.floor(Math.random() * 200);
                    await prisma.message.update({
                        where: { id: message.id },
                        data: { status: "QUEUED", errorCode: "RETRYING" },
                    });
                    setTimeout(() => {
                        queueRedis
                            .rpush("q:message:send", JSON.stringify({ messageId: message.id }))
                            .catch((err) => logger.error({ err }, "Failed to requeue message"));
                    }, delay + jitter);
                }
            } else {
                await redis.del(retryKey);
            }
        } finally {
            await redis.decr(`wa:load:${waAccountId}`);
        }
    };

    const startCampaignWorker = async () => {
        while (true) {
            const res = await queueRedis.blpop("q:campaign:send", 0);
            if (!res) continue;
            try {
                await redis.incr("metrics:q:q:campaign:send:active");
                const payload = JSON.parse(res[1]);
                if (payload?.campaignId && payload?.contactId) {
                    await processCampaignJob(payload);
                }
                await redis.decr("metrics:q:q:campaign:send:active");
            } catch (err) {
                logger.error({ err }, "Failed to process campaign job");
                await redis.decr("metrics:q:q:campaign:send:active");
                await redis.incr("metrics:q:q:campaign:send:failed");
            }
        }
    };

    const startCampaignPlanWorker = async () => {
        while (true) {
            const res = await queueRedis.blpop("q:campaign:plan", 0);
            if (!res) continue;
            try {
                await redis.incr("metrics:q:q:campaign:plan:active");
                const payload = JSON.parse(res[1]);
                if (payload?.campaignId) {
                    await processCampaignPlan(payload);
                }
                await redis.decr("metrics:q:q:campaign:plan:active");
            } catch (err) {
                logger.error({ err }, "Failed to process campaign plan job");
                await redis.decr("metrics:q:q:campaign:plan:active");
                await redis.incr("metrics:q:q:campaign:plan:failed");
            }
        }
    };

    const startMessageWorker = async () => {
        while (true) {
            const res = await queueRedis.blpop("q:message:send", 0);
            if (!res) continue;
            try {
                await redis.incr("metrics:q:q:message:send:active");
                const payload = JSON.parse(res[1]);
                if (payload?.messageId) {
                    await processMessageJob(payload);
                }
                await redis.decr("metrics:q:q:message:send:active");
            } catch (err) {
                logger.error({ err }, "Failed to process message job");
                await redis.decr("metrics:q:q:message:send:active");
                await redis.incr("metrics:q:q:message:send:failed");
            }
        }
    };

    const startScheduler = () => {
        setInterval(async () => {
            const now = new Date();
            const campaigns = await prisma.campaign.findMany({
                where: { status: "SCHEDULED", scheduleAt: { lte: now } },
                select: { id: true },
            });
            for (const campaign of campaigns) {
                await queueRedis.rpush(
                    "q:campaign:plan",
                    JSON.stringify({ campaignId: campaign.id }),
                );
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
    startCampaignPlanWorker().catch((err) => logger.error({ err }, "Campaign plan worker crashed"));
    startMessageWorker().catch((err) => logger.error({ err }, "Message worker crashed"));
    startScheduler();
    setInterval(() => {
        flushCampaignProgress().catch((err) => logger.error({ err }, "Failed to flush campaign progress"));
    }, 2000);

    logger.info("WA Runtime initialized");
}

main().catch(err => {
    logger.fatal(err, "Fatal error in main");
    process.exit(1);
});
