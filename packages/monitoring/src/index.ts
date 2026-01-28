export * from './metrics';

import { Context } from 'hono';
import { registry } from './metrics';

import * as Sentry from '@sentry/node';

export const initSentry = (dsn: string, environment: string) => {
    if (!dsn) return;
    Sentry.init({
        dsn,
        environment,
        tracesSampleRate: 1.0,
    });
};

export const sentryErrorHandler = (err: Error, c: Context) => {
    Sentry.withScope((scope) => {
        scope.setContext('request', {
            method: c.req.method,
            url: c.req.url,
            path: c.req.path,
        });
        const auth = c.get('auth') as any;
        if (auth) {
            scope.setUser({ id: auth.userId, username: auth.workspaceId });
        }
        Sentry.captureException(err);
    });

    console.error(err);
    return c.json({ error: 'Internal Server Error', message: err.message }, 500);
};

export const metricsEndpoint = async (c: Context) => {
    c.header('Content-Type', registry.contentType);
    return c.text(await registry.metrics());
};

export const metricsMiddleware = async (c: Context, next: () => Promise<void>) => {
    const start = Date.now();
    await next();
    const end = Date.now();
    const duration = (end - start) / 1000;

    const route = c.req.path;
    const method = c.req.method;
    const status = c.res.status;

    const { apiLatencyHistogram } = await import('./metrics');

    apiLatencyHistogram.observe(
        { method, route, status_code: status.toString() },
        duration
    );
};

