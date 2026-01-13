import pino from "pino";
import { startExportWorker, startContactImportWorker } from "@repo/workers";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

logger.info("Starting background workers...");
const exportRedis = startExportWorker();
const importRedis = startContactImportWorker();
logger.info("Workers running");

const shutdown = async (signal: string) => {
  logger.info({ signal }, "Shutting down workers");
  await exportRedis.quit();
  await importRedis.quit();
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
