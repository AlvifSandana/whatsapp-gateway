import dotenv from "dotenv";

dotenv.config();

export const config = {
    port: Number(process.env.PORT) || 3000,
    redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
    logLevel: process.env.LOG_LEVEL || "info",
    corsOrigin: (process.env.CORS_ORIGIN || "*")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    hstsEnabled: process.env.HSTS_ENABLED === "true",
    exportWorkerEnabled: process.env.EXPORT_WORKER_ENABLED !== "false",
    exportRetryMax: Number(process.env.EXPORT_RETRY_MAX || 3),
    exportRetryBaseDelayMs: Number(process.env.EXPORT_RETRY_BASE_DELAY_MS || 2000),
    autoReplyRegexMaxLength: Number(process.env.AUTO_REPLY_REGEX_MAX_LENGTH || 200),
    contactImportWorkerEnabled: process.env.CONTACT_IMPORT_WORKER_ENABLED !== "false",
    exportDownloadSecret: process.env.EXPORT_DOWNLOAD_SECRET || "dev-export-secret",
    rateLimitWindowSeconds: Number(process.env.RATE_LIMIT_WINDOW_SECONDS || 60),
    rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 120),
};
