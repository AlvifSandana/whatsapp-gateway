import Redis from "ioredis";
import { config } from "./config";
import pino from "pino";
import { EventEmitter } from "events";

const logger = pino({ level: config.logLevel });

export const redis = new Redis(config.redisUrl);
export const pubSubPublisher = new Redis(config.redisUrl);
export const pubSubSubscriber = new Redis(config.redisUrl);
export const eventBus = new EventEmitter();

redis.on("error", (err) => logger.error(err, "Redis error"));

pubSubSubscriber.subscribe("ev:wa-runtime", (err) => {
    if (err) logger.error(err, "Failed to subscribe");
});

pubSubSubscriber.on("message", (channel, message) => {
    eventBus.emit("message", channel, message);
});
