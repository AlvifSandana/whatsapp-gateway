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

const pinoLogger = pino({ level: config.logLevel });

const app = new Hono();

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
import { startExportWorker } from "./workers/export-worker";
import { startContactImportWorker } from "./workers/contact-import-worker";

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-Workspace-ID", "Authorization"],
  }),
);

app.get("/health", (c) => c.json({ status: "ok" }));

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

pinoLogger.info(`Server is starting on port ${config.port}`);

if (config.exportWorkerEnabled) {
  startExportWorker();
  pinoLogger.info("Export worker started");
}
if (config.contactImportWorkerEnabled) {
  startContactImportWorker();
  pinoLogger.info("Contact import worker started");
}

serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    pinoLogger.info(`Server listening on http://localhost:${info.port}`);
  },
);
