import { config } from "./config";
import { redis, pubSubSubscriber } from "./redis";
import { socketManager } from "./socket/manager";
import { prisma } from "@repo/db";
import pino from "pino";

const logger = pino({ level: config.logLevel });

async function main() {
    logger.info("Starting WA Runtime...");

    // 1. Subscribe to commands
    // Pattern: cmd:wa-runtime
    await pubSubSubscriber.subscribe("cmd:wa-runtime");

    pubSubSubscriber.on("message", async (channel, message) => {
        if (channel === "cmd:wa-runtime") {
            try {
                const { type, waAccountId, payload } = JSON.parse(message);
                logger.info({ type, waAccountId }, "Received command");

                if (type === "START") {
                    if (waAccountId) await socketManager.start(waAccountId);
                } else if (type === "STOP") {
                    if (waAccountId) await socketManager.stop(waAccountId);
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

    logger.info("WA Runtime initialized");
}

main().catch(err => {
    logger.fatal(err, "Fatal error in main");
    process.exit(1);
});
