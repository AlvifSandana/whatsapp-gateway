import type { Context, Next } from "hono";
import pino from "pino";
import { config } from "../config";

export const pinoLogger = pino({
    level: config.logLevel,
    formatters: {
        level: (label) => {
            return { level: label.toUpperCase() };
        },
    },
});


export const pinoLoggerMiddleware = async (c: Context, next: Next) => {
    const requestId = c.get("requestId");
    const auth = c.get("auth") as any;
    const logger = pinoLogger.child({
        requestId,
        workspaceId: auth?.workspaceId,
        userId: auth?.userId,
    });


    c.set("logger", logger);

    const start = Date.now();
    await next();
    const end = Date.now();

    logger.info({
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        duration: `${end - start}ms`,
    }, "Request completed");
};
