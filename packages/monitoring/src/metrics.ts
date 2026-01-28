import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

// Campaign Metrics
export const campaignCounter = new Counter({
    name: 'campaign_sends_total',
    help: 'Total number of campaign messages sent',
    labelNames: ['status', 'workspace_id'],
    registers: [registry],
});

// Message Metrics
export const messageGauge = new Gauge({
    name: 'message_queue_depth',
    help: 'Current depth of message queues',
    labelNames: ['queue_name'],
    registers: [registry],
});

// Latency Metrics
export const apiLatencyHistogram = new Histogram({
    name: 'api_request_duration_seconds',
    help: 'API request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
    registers: [registry],
});
