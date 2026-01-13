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

pubSubSubscriber.subscribe("ev:global", (err) => {
    if (err) logger.error(err, "Failed to subscribe to global events");
});
pubSubSubscriber.psubscribe("ev:ws:*", (err) => {
    if (err) logger.error(err, "Failed to subscribe to workspace events");
});
pubSubSubscriber.psubscribe("ack:ws:*", (err) => {
    if (err) logger.error(err, "Failed to subscribe to ack events");
});

pubSubSubscriber.on("message", (channel, message) => {
    eventBus.emit("message", channel, message);
});

pubSubSubscriber.on("pmessage", (_pattern, channel, message) => {
    eventBus.emit("message", channel, message);
});
