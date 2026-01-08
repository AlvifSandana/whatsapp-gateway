import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { config } from "./config";
import waAccountRoutes from "./routes/wa-accounts";
import pino from "pino";

const pinoLogger = pino({ level: config.logLevel });

const app = new Hono();

import eventsRoutes from "./routes/events";
import contactsRoutes from "./routes/contacts";
import campaignsRoutes from "./routes/campaigns";

app.use("*", logger());

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/v1/wa-accounts", waAccountRoutes);
app.route("/v1/events", eventsRoutes);
app.route("/v1/contacts", contactsRoutes);
app.route("/v1/campaigns", campaignsRoutes);

pinoLogger.info(`Server is starting on port ${config.port}`);

serve({
    fetch: app.fetch,
    port: config.port,
}, (info) => {
    pinoLogger.info(`Server listening on http://localhost:${info.port}`);
});
