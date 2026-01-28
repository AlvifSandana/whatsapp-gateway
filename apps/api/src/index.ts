import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { config } from "./config";
import waAccountRoutes from "./routes/wa-accounts";
import pino from "pino";
import { authMiddleware } from "./middleware/auth";
import { workspaceMiddleware } from "./middleware/workspace";
import { rbacMiddleware } from "./middleware/rbac";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { securityHeadersMiddleware } from "./middleware/security-headers";
import { requestIdMiddleware } from "./middleware/request-id";
import { prisma } from "@repo/db";
import { metricsMiddleware, initSentry, sentryErrorHandler } from "@repo/monitoring";
import { pinoLogger, pinoLoggerMiddleware } from "./middleware/pino-logger";


initSentry(config.sentryDsn, config.nodeEnv);



const app = new Hono();


app.onError(sentryErrorHandler);


import eventsRoutes from "./routes/events";
import contactsRoutes from "./routes/contacts";
import campaignsRoutes from "./routes/campaigns";
import autoReplyRoutes from "./routes/auto-replies";
import tagsRoutes from "./routes/tags";
import auditRoutes from "./routes/audit";
import messagesRoutes from "./routes/messages";
import authRoutes from "./routes/auth";
import teamRoutes from "./routes/team";
import workspaceRoutes from "./routes/workspace";
import rbacRoutes from "./routes/rbac";
import reportsRoutes from "./routes/reports";
import queuesRoutes from "./routes/queues";
import metricsRoutes from "./routes/metrics";
import analyticsRoutes from "./routes/analytics";

import { startExportWorker, startContactImportWorker } from "@repo/workers";
import { pubSubPublisher, pubSubSubscriber, redis } from "./redis";

app.use("*", requestIdMiddleware);
app.use("*", metricsMiddleware);
app.use("*", pinoLoggerMiddleware);


app.use(
  "*",
  cors({
    origin: config.corsOrigin.length === 1 ? config.corsOrigin[0] : config.corsOrigin,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-Workspace-ID", "Authorization"],
  }),
);
app.use("*", securityHeadersMiddleware);

app.get("/health", (c) => c.json({ status: "ok" }));
app.get("/health/ready", async (c) => {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - start;

    await redis.ping();

    return c.json({
      status: "ready",
      timestamp: new Date().toISOString(),
      version: config.version || "1.0.0",
      checks: {
        db: { status: "up", latencyMs: dbLatency },
        redis: { status: "up" },
        uptime: process.uptime(),
        memory: process.memoryUsage()
      }
    });
  } catch (err) {
    pinoLogger.error({ err }, "Health check failed");
    return c.json({ status: "not_ready", error: String(err) }, 503);
  }
});


app.use("/v1/*", rateLimitMiddleware);
app.use("/v1/*", authMiddleware);
app.use("/v1/*", workspaceMiddleware);
app.use("/v1/*", rbacMiddleware);

app.route("/v1/auth", authRoutes);
app.route("/v1/wa-accounts", waAccountRoutes);
app.route("/v1/events", eventsRoutes);
app.route("/v1/contacts", contactsRoutes);
app.route("/v1/campaigns", campaignsRoutes);
app.route("/v1/auto-replies", autoReplyRoutes);
app.route("/v1/tags", tagsRoutes);
app.route("/v1/audit", auditRoutes);
app.route("/v1/messages", messagesRoutes);
app.route("/v1/team", teamRoutes);
app.route("/v1/workspace", workspaceRoutes);
app.route("/v1/rbac", rbacRoutes);
app.route("/v1/reports", reportsRoutes);
app.route("/v1/queues", queuesRoutes);
app.route("/v1/analytics", analyticsRoutes);
app.route("/v1/metrics", metricsRoutes);


pinoLogger.info(`Server is starting on port ${config.port}`);

if (config.exportWorkerEnabled) {
  startExportWorker({ eventPublisher: pubSubPublisher.publish.bind(pubSubPublisher) });
  pinoLogger.info("Export worker started");
}
if (config.contactImportWorkerEnabled) {
  startContactImportWorker();
  pinoLogger.info("Contact import worker started");
}

const queueMetrics = [
  "q:campaign:plan",
  "q:campaign:send",
  "q:campaign:dead",
  "q:message:send",
  "q:message:dead",
  "q:contacts:import:validate",
  "q:contacts:import:commit",
  "q:reports:export",
];

setInterval(async () => {
  try {
    const lengths = await Promise.all(queueMetrics.map((key) => redis.llen(key)));
    const activeKeys = queueMetrics.map((key) => `metrics:q:${key}:active`);
    const failedKeys = queueMetrics.map((key) => `metrics:q:${key}:failed`);
    const [actives, faileds] = await Promise.all([
      redis.mget(activeKeys),
      redis.mget(failedKeys),
    ]);
    const payload = queueMetrics.reduce<Record<string, number>>((acc, key, idx) => {
      acc[key] = lengths[idx] ?? 0;
      acc[`${key}:active`] = Number(actives[idx] || 0);
      acc[`${key}:failed`] = Number(faileds[idx] || 0);
      acc[`${key}:delayed`] = 0;
      return acc;
    }, {});
    await pubSubPublisher.publish(
      "ev:global",
      JSON.stringify({
        type: "queue.metrics",
        payload,
        timestamp: new Date().toISOString(),
      }),
    );
  } catch (err) {
    pinoLogger.warn({ err }, "Failed to publish queue metrics");
  }
}, 5000);

const server = serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    pinoLogger.info(`Server listening on http://localhost:${info.port}`);
  },
);

const shutdown = async (signal: string) => {
  pinoLogger.info({ signal }, "Shutting down API");
  const timer = setTimeout(() => {
    pinoLogger.warn("Shutdown timed out, forcing exit");
    process.exit(1);
  }, 10000);

  try {
    server.close(() => {
      pinoLogger.info("HTTP server closed");
    });
    await pubSubPublisher.quit();
    await pubSubSubscriber.quit();
    await redis.quit();
    await prisma.$disconnect();
  } finally {
    clearTimeout(timer);
    process.exit(0);
  }
};


process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
