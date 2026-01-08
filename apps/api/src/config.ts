import dotenv from "dotenv";

dotenv.config();

export const config = {
    port: Number(process.env.PORT) || 3000,
    redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
    logLevel: process.env.LOG_LEVEL || "info",
};
