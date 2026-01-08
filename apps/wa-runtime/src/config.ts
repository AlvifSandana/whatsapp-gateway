import dotenv from "dotenv";

dotenv.config();

export const config = {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
    logLevel: process.env.LOG_LEVEL || "info",
};
