import Redis from "ioredis";
import { config } from "./config";
import pino from "pino";

const logger = pino({ level: config.logLevel });

export const redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
});

redis.on("connect", () => {
    logger.info("Redis connected");
});

redis.on("error", (err) => {
    logger.error(err, "Redis connection error");
});

// PubSub needs separate connections
export const pubSubSubscriber = new Redis(config.redisUrl);
export const pubSubPublisher = new Redis(config.redisUrl);
