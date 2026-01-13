import pino from "pino";
import { startExportWorker, startContactImportWorker } from "@repo/workers";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

logger.info("Starting background workers...");
startExportWorker();
startContactImportWorker();
logger.info("Workers running");
