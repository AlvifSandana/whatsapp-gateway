import dotenv from "dotenv";

dotenv.config();

const campaignSendIntervalMs = Number(process.env.CAMPAIGN_SEND_INTERVAL_MS || 800);

export const config = {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
    logLevel: process.env.LOG_LEVEL || "info",
    autoReplyWebhookAllowlist: (process.env.AUTO_REPLY_WEBHOOK_ALLOWLIST || "")
        .split(",")
        .map((host) => host.trim())
        .filter(Boolean),
    autoReplyWebhookTimeoutMs: Number(process.env.AUTO_REPLY_WEBHOOK_TIMEOUT_MS || 3000),
    autoReplyWebhookMaxActions: Number(process.env.AUTO_REPLY_WEBHOOK_MAX_ACTIONS || 3),
    autoReplyWebhookMaxTextLength: Number(process.env.AUTO_REPLY_WEBHOOK_MAX_TEXT_LENGTH || 2000),
    autoReplyRegexMaxLength: Number(process.env.AUTO_REPLY_REGEX_MAX_LENGTH || 200),
    autoReplySenderLimit: Number(process.env.AUTO_REPLY_SENDER_LIMIT || 5),
    autoReplySenderWindowSeconds: Number(process.env.AUTO_REPLY_SENDER_WINDOW || 60),
    campaignSendIntervalMs,
    campaignRateLimitPerSecond: Number(
        process.env.CAMPAIGN_RATE_LIMIT_PER_SECOND || (1000 / campaignSendIntervalMs),
    ),
    campaignRateBurst: Number(process.env.CAMPAIGN_RATE_BURST || 1),
    campaignSendRetryMax: Number(process.env.CAMPAIGN_SEND_RETRY_MAX || 5),
    campaignSendRetryBaseDelayMs: Number(process.env.CAMPAIGN_SEND_RETRY_BASE_DELAY_MS || 1000),
    messageSendRetryMax: Number(process.env.MESSAGE_SEND_RETRY_MAX || 5),
    messageSendRetryBaseDelayMs: Number(process.env.MESSAGE_SEND_RETRY_BASE_DELAY_MS || 1000),
    sentryDsn: process.env.SENTRY_DSN || "",
    nodeEnv: process.env.NODE_ENV || "development",
};

