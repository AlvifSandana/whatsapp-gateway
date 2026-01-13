# Runbook: DLQ Requeue

## Inspect DLQ

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/v1/queues/dlq?type=message"
```

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/v1/queues/dlq?type=campaign"
```

## Requeue Items

```bash
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"type":"message","limit":20}' \
  "http://localhost:3000/v1/queues/dlq/requeue"
```

```bash
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"type":"campaign","limit":20}' \
  "http://localhost:3000/v1/queues/dlq/requeue"
```

## Notes
- Only requeue after root cause is resolved (e.g., connectivity, creds).
- Monitor queue sizes and failures in `/v1/metrics`.
