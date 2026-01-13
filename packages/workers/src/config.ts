import dotenv from "dotenv";

dotenv.config();

export const config = {
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  logLevel: process.env.LOG_LEVEL || "info",
  exportRetryMax: Number(process.env.EXPORT_RETRY_MAX || 3),
  exportRetryBaseDelayMs: Number(process.env.EXPORT_RETRY_BASE_DELAY_MS || 2000),
};
