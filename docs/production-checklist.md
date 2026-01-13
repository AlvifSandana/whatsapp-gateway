# Production Checklist

## Security
- Set `CORS_ORIGIN` to known dashboard domains.
- Set `HSTS_ENABLED=true` behind HTTPS.
- Rotate secrets: `EXPORT_DOWNLOAD_SECRET`, session tokens.
- Enable `RATE_LIMIT_WINDOW_SECONDS` and `RATE_LIMIT_MAX`.
- Verify webhook allowlist and HMAC secret config.

## Reliability
- Validate retries for `q:message:send` and `q:campaign:send`.
- Monitor DLQ: `q:message:dead`, `q:campaign:dead`.
- Configure `CAMPAIGN_SEND_RETRY_MAX`, `MESSAGE_SEND_RETRY_MAX`.
- Ensure graceful shutdown (SIGTERM) in api/wa-runtime/worker.

## Observability
- Scrape `/health` and `/health/ready`.
- Monitor `/v1/metrics` for queue backlogs.
- Centralize logs and set retention policy.

## Infra
- Separate envs: dev/staging/prod.
- Backups for Postgres and Redis (AOF/RDB).
- Redis/Postgres HA with monitoring.
- Run migrations before deploy.

## Ops
- Runbook for DLQ requeue and incident response.
- Rollout plan + rollback strategy.
- Data retention policy and access log policy.
