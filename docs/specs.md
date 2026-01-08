# WhatsApp Gateway – Technical Specifications (MVP)

Date: 2026-01-09  
Scope: Multi-number WhatsApp gateway with campaign/broadcast, auto-reply, contacts import, audit log, and RBAC dashboard.

---

## 1. Goals and Non-Goals

### 1.1 Goals
- Operate multiple WhatsApp numbers (multi-account) with high availability controls.
- Support campaign/broadcast with scalable target snapshotting and delivery tracking.
- Provide auto-reply rules (pattern/custom webhook) with safe execution and cooldown.
- Import contacts at scale (CSV initially) with preview + commit workflow.
- Provide complete audit log coverage for security and compliance.
- Provide RBAC with role/permission matrix UI.
- Provide modern admin dashboard UI using **Astro + shadcn/ui** (React islands).

### 1.2 Non-Goals (initial MVP)
- Group message campaigns (1:1 only).
- Complex media ingestion pipeline (MVP uses media URLs; storage-backed fileRef can follow).
- Advanced analytics (beyond delivery/read aggregates and basic export).

---

## 2. Stack and Services

### 2.1 Core stack
- WhatsApp client: **Baileys**
- Runtime: **Node.js**
- Queue/State: **Redis**
- Primary DB: **PostgreSQL**
- Admin UI: **Astro + shadcn/ui** (React islands), Tailwind

### 2.2 Services (recommended deployment)
1. **api**
   - REST API for dashboard + authentication + RBAC enforcement
   - Publishes control commands to Redis for wa-runtime
   - Publishes SSE stream to dashboard

2. **wa-runtime**
   - Runs Baileys **Socket Manager** (multi-number)
   - Runs send workers (message send, campaign send)
   - Owns in-memory sockets; receives commands via Redis PubSub

3. **worker** (optional / can be merged into wa-runtime)
   - Non-socket background jobs: contacts import validate/commit, reports export, housekeeping (if you prefer separation)
   - If separated, keep all send-related workers in wa-runtime.

---

## 3. Key Features

### 3.1 Multiple numbers
- Multiple WhatsApp accounts per workspace.
- Distributed lock ensures one runtime instance owns one WA account at a time.
- QR flow for pairing; status updates via SSE.

### 3.2 Campaign/Broadcast
- Draft → Preview targets → Start (enqueue plan) → Send jobs.
- Target snapshot table (`campaign_targets`) for deterministic delivery.
- Per-number rate limiting and least-busy routing.

### 3.3 Auto-reply
- Rule types: KEYWORD / CONTAINS / REGEX
- Response types: STATIC reply payload, or WEBHOOK response actions
- Cooldown per rule per sender (Redis TTL)
- Regex safety via RE2 (prevents catastrophic backtracking)
- Webhook safety: allowlist + timeout + no redirects + optional HMAC

### 3.4 Import contacts
- Upload CSV → Validate (staging) → Preview → Commit to main tables
- Large imports handled asynchronously with progress in UI

### 3.5 Audit log
- Record all sensitive actions: WA connect/reset, campaign start/pause/cancel, RBAC changes, imports, exports.
- Append-only table, queryable via dashboard.

### 3.6 RBAC
- Permissions are fixed codes.
- Roles are per workspace; mapping role→permissions and user→roles.
- UI permission matrix for easy management.

---

## 4. High-Level Architecture

### 4.1 Runtime ownership
- `wa-runtime` is the only service that holds live Baileys socket instances.
- `api` and other workers never directly access sockets.

### 4.2 Control plane (commands)
- `api` publishes commands to Redis PubSub channel `cmd:wa-runtime`:
  - START, STOP, RECONNECT, RESET_CREDS
- `wa-runtime` executes and may publish acknowledgements (optional).

### 4.3 Dashboard updates
- Server-Sent Events (SSE) endpoint: `GET /v1/events`
- `api` subscribes to Redis PubSub channel `ev:ws:{workspaceId}` and forwards to browser via SSE.

---

## 5. Redis Keys and Channels

### 5.1 Connection status & QR
- `wa:ws:{workspaceId}:connected` (SET) → connected waAccountIds
- `wa:qr:{waAccountId}` (STRING, TTL 60s) → latest QR string for pairing

### 5.2 Load and routing
- `wa:load:{waAccountId}` (INT) → inflight sends counter

### 5.3 Rate limiting
- `rl:wa:{waAccountId}:tokens` (FLOAT/STRING) + TTL
- `rl:wa:{waAccountId}:ts` (INT ms) + TTL
- Uses Lua token-bucket (atomic)

### 5.4 Debounce progress
- `dirty:ws:{workspaceId}:campaigns` (SET) → campaignIds needing progress recompute

### 5.5 PubSub
- Commands: `cmd:wa-runtime`
- Events: `ev:ws:{workspaceId}`
- (Optional) acknowledgements: `ack:ws:{workspaceId}`

---

## 6. PostgreSQL Schema (Core Tables)

> Notes:
> - UUID primary keys.
> - All multi-tenant tables include `workspace_id`.
> - Use `timestamptz` for timestamps.

### 6.1 Workspaces & users
- `workspaces(id, name, created_at, ...)`
- `users(id, workspace_id, email, name, password_hash, is_active, created_at, ...)`

### 6.2 WA accounts
- `wa_accounts(id, workspace_id, phone_e164, label, status, last_seen_at, settings jsonb, created_at, updated_at)`
  - `settings.needs_pairing` boolean flag recommended

### 6.3 Auth state (Baileys in Postgres)
- `wa_account_sessions(wa_account_id PK, workspace_id, creds_enc bytea, keys_enc bytea, updated_at)`
- `wa_account_keys(wa_account_id, workspace_id, category, key_id, value_enc bytea, updated_at, PK(wa_account_id, category, key_id))`

### 6.4 Contacts and tags
- `contacts(id, workspace_id, phone_e164, display_name, notes, created_at, updated_at, UNIQUE(workspace_id, phone_e164))`
- `tags(id, workspace_id, name, created_at, UNIQUE(workspace_id, name))`
- `contact_tags(contact_id, tag_id, created_at, PK(contact_id, tag_id))`
  - Index: `(tag_id, contact_id)` recommended

### 6.5 Campaigns
- `campaigns(id, workspace_id, name, status, routing_mode, wa_account_id nullable, target_filter jsonb, payload jsonb, schedule_at timestamptz, settings jsonb, created_by, created_at, updated_at)`

### 6.6 Campaign targets (snapshot)
- `campaign_targets(campaign_id, contact_id, status, attempt_count, last_error, last_try_at, created_at, PK(campaign_id, contact_id))`
  - statuses: QUEUED, SENT, DELIVERED, READ, FAILED, CANCELED

### 6.7 Messages
- `messages(id, workspace_id, wa_account_id, contact_id, direction, status, provider_msg_id, type, payload jsonb, error_code, error_message, created_by, source_campaign_id, source_contact_id, created_at, updated_at)`
  - direction: IN/OUT
  - status: QUEUED, SENT, DELIVERED, READ, FAILED
  - Index: `(source_campaign_id, source_contact_id, created_at desc)` for campaign receipts

- `message_events(id, message_id, event, detail jsonb, created_at)`

### 6.8 Auto-reply
- `auto_reply_rules(id, workspace_id, wa_account_id nullable, name, is_active, priority, pattern_type, pattern_value, reply_mode, reply_payload jsonb, webhook_url, webhook_secret, cooldown_seconds, time_window jsonb, created_at, updated_at)`

### 6.9 Audit
- `audit_logs(id, workspace_id, actor_user_id, action, entity_type, entity_id, before_json, after_json, meta_json, created_at)`
  - Append-only

### 6.10 RBAC
- `permissions(id, code UNIQUE, group_name, description)`
- `roles(id, workspace_id, name, description, created_at, UNIQUE(workspace_id, name))`
- `role_permissions(role_id, permission_id, PK(role_id, permission_id))`
- `user_roles(user_id, role_id, PK(user_id, role_id))`

### 6.11 Import jobs (contacts)
- `contact_import_jobs(id, workspace_id, filename, status, total_rows, valid_rows, invalid_rows, duplicate_rows, created_by, created_at, updated_at)`
- `contact_import_rows(id, job_id, row_no, raw jsonb, normalized_phone, normalized_name, tags text[], is_valid, error, created_at)`

### 6.12 Exports (reports)
- `exports(id, workspace_id, type, params jsonb, format, status, file_ref, created_by, created_at, updated_at)`

---

## 7. Queues and Jobs (BullMQ)

### 7.1 Queues
- `q:campaign:plan`
- `q:campaign:send`
- `q:message:send`
- `q:auto-reply:handle`
- `q:contacts:import:validate`
- `q:contacts:import:commit`
- `q:reports:export`
- `q:housekeeping`

### 7.2 Job Id conventions
- Use only `[A-Za-z0-9_-]` in jobId.
- For idempotent campaign target jobs:
  - `c-{campaignId}-{contactId}`

### 7.3 Retry strategy
- Default: attempts 5–10 with exponential backoff.
- Hard failures stop retries using an unrecoverable error mechanism.
- Throttled sends use a custom backoff strategy that delays based on retry_after_ms with jitter.

---

## 8. Socket Manager (wa-runtime)

### 8.1 Responsibilities
- Acquire distributed lock per waAccountId.
- Load and persist Postgres auth state (creds + keys).
- Create Baileys socket and handle events:
  - `connection.update` → status updates + QR caching
  - `creds.update` → persist creds
  - `messages.upsert` → inbound ingestion (via api or runtime handler)
  - `messages.update` / receipts → update message delivery/read status

### 8.2 Distributed lock
- Key: `lock:wa:{waAccountId}`
- `SET NX EX 30`, refresh every 10s while socket is active.
- Release on stop.

### 8.3 Reset creds flow
Triggered by:
- Operator action (`RESET_CREDS`), or
- Disconnect reasons indicating broken auth (e.g., bad session, multi-device mismatch).

Steps:
1) Stop socket and release lock.
2) Delete Postgres auth rows: `wa_account_sessions`, `wa_account_keys`.
3) Mark `needs_pairing=true` in wa_accounts.settings.
4) Auto-start socket to generate new QR (recommended).
5) Publish `numbers.status` event; UI pulls QR.

---

## 9. Message Send Pipeline

### 9.1 Outbound message lifecycle
1) API or campaign worker creates `messages` row status QUEUED.
2) `q:message:send` sends via Baileys:
   - Enforces rate limiter per waAccountId.
   - Updates message to SENT and stores provider_msg_id.
3) Receipt updates map to DELIVERED/READ via Baileys updates.
4) Errors are classified as:
   - HARD_FAIL: invalid recipient/blocked/payload invalid (no retry)
   - SOFT_FAIL: timeouts/temporary failures (retry)
   - ACCOUNT_FAIL: auth/session/account (may require reconnect/reset)

### 9.2 Campaign send
- `q:campaign:plan` snapshots targets into `campaign_targets` and enqueues `q:campaign:send` per contact.
- `q:campaign:send` selects account from connected set and least-busy.
- Token bucket rate limiting + jitter to reduce spikes.
- Updates `campaign_targets` and marks campaign dirty for debounced progress recompute.

---

## 10. Auto-reply Engine

### 10.1 Matching
- Normalize text (trim, collapse whitespace, lowercase).
- Pattern types:
  - KEYWORD: token match
  - CONTAINS: substring
  - REGEX: RE2 (safe regex engine)
- Deterministic selection:
  - sort by `priority ASC`, first match wins.

### 10.2 Cooldown
- Redis key: `cooldown:{ruleId}:{senderJid}` TTL = cooldown_seconds
- Prevents loops/spam.

### 10.3 Webhook mode
- POST JSON to webhook endpoint with message context.
- Safety:
  - allowlist hostnames
  - DNS resolve and block private/internal IPs
  - timeout 2–3s
  - disable redirects
  - optional HMAC signature (`x-timestamp`, `x-signature`)
- Response constraints:
  - max 3 actions
  - max 2000 chars per message

---

## 11. Contacts Import Wizard

### 11.1 Workflow
1) Upload CSV → create `contact_import_jobs` status UPLOADED
2) Validate job:
   - parse CSV with streaming
   - normalize + validate
   - stage into `contact_import_rows`
   - set status READY with counters
3) Preview (UI reads job + sample rows)
4) Commit job:
   - batch upsert contacts
   - upsert tags
   - insert contact_tags
   - status DONE

### 11.2 UI requirements
- Show progress and counts (valid/invalid/duplicate).
- Allow download of invalid rows (optional).
- Audit log entry on commit.

---

## 12. SSE Event Stream

### 12.1 Endpoint
- `GET /v1/events` (text/event-stream)

### 12.2 Event types
- `numbers.status` { waAccountId, status, lastSeenAt, needsPairing?, reasonCode? }
- `campaign.progress` { campaignId, total, byStatus }
- `queue.metrics` { queue, waiting, active, delayed, failed, timestamp }
- (Optional) `export.status` { exportId, status }

### 12.3 Debounce strategy
- Do not emit progress on every receipt.
- Use dirty set and periodic flusher (1–3s interval) to compute aggregated progress and publish.

---

## 13. REST API (Selected)

### 13.1 Numbers (WA accounts)
- `GET /v1/wa-accounts`
- `POST /v1/wa-accounts/:id/connect`  → START
- `POST /v1/wa-accounts/:id/reconnect` → RECONNECT
- `POST /v1/wa-accounts/:id/reset-creds` → RESET_CREDS
- `GET /v1/wa-accounts/:id/qr`

### 13.2 Campaigns
- `POST /v1/campaigns`
- `PUT /v1/campaigns/:id`
- `GET /v1/campaigns/:id`
- `POST /v1/campaigns/:id/preview-targets`
- `POST /v1/campaigns/:id/start`
- `POST /v1/campaigns/:id/pause`
- `POST /v1/campaigns/:id/cancel`
- `GET /v1/campaigns/:id/progress`
- `GET /v1/campaigns/:id/targets`
- `GET /v1/campaigns/:id/messages`

### 13.3 Contacts import
- `POST /v1/contacts/import` (multipart)
- `GET /v1/contacts/import/:jobId`
- `POST /v1/contacts/import/:jobId/commit`

### 13.4 Auto reply
- `GET /v1/auto-replies`
- `POST /v1/auto-replies`
- `PUT /v1/auto-replies/:id`
- `POST /v1/auto-replies/:id/test`

### 13.5 Audit
- `GET /v1/audit?from=&to=&actor=&action=&cursor=...`

### 13.6 RBAC
- `GET /v1/rbac/permissions`
- `GET /v1/rbac/roles`
- `POST /v1/rbac/roles`
- `PUT /v1/rbac/roles/:id`
- `DELETE /v1/rbac/roles/:id`
- `GET /v1/rbac/roles/:id/permissions`
- `PUT /v1/rbac/roles/:id/permissions`
- `GET /v1/rbac/users`
- `GET /v1/rbac/users/:id/roles`
- `PUT /v1/rbac/users/:id/roles`

### 13.7 Reports/Export
- `POST /v1/reports/exports`
- `GET /v1/reports/exports/:id`
- `GET /v1/reports/exports/:id/download` (proxy or signed URL)

---

## 14. Dashboard UI (Astro + shadcn/ui)

### 14.1 Pages
- `/numbers` : list numbers, connect, show QR modal, status badge (SSE)
- `/contacts/import` : upload → validate → preview → commit
- `/campaigns` : list campaigns
- `/campaigns/new` : create draft
- `/campaigns/:id/edit` : wizard stepper (routing → audience → message → schedule → review)
- `/campaigns/:id` : detail + tabs (overview/targets/logs) with SSE progress
- `/settings/rbac/roles` : roles list
- `/settings/rbac/roles/:roleId` : permission matrix
- `/settings/rbac/users` : user roles assignment
- `/audit` : audit viewer
- `/reports` : export center

### 14.2 Component strategy
- Use Astro for layout/shell, React islands for heavy interactivity (wizard, tables, modals).
- Use SSE EventSource in islands for real-time updates.
- Use shadcn/ui components for consistent UI.

---

## 15. RBAC Permission Codes (Recommended Set)

### 15.1 Numbers / WA Accounts
- `wa_accounts:read`
- `wa_accounts:connect`
- `wa_accounts:reconnect`
- `wa_accounts:reset_creds`
- `wa_accounts:write`

### 15.2 Campaigns
- `campaigns:read`
- `campaigns:write`
- `campaigns:run`
- `campaigns:pause`
- `campaigns:cancel`
- `campaigns:report`

### 15.3 Contacts
- `contacts:read`
- `contacts:write`
- `contacts:import`

### 15.4 Auto Reply
- `auto_reply:read`
- `auto_reply:write`
- `auto_reply:test`

### 15.5 Audit
- `audit:read`

### 15.6 Reports/Exports
- `reports:read`
- `reports:export`

### 15.7 RBAC
- `rbac:manage`

---

## 16. Default Roles (Seed)

1) **Admin**
- All permissions.

2) **Operator**
- wa_accounts:read/connect/reconnect
- campaigns:read/write/run/pause/cancel/report
- contacts:read/write/import
- auto_reply:read/write/test
- audit:read
- reports:read/export

3) **Viewer**
- wa_accounts:read
- campaigns:read/report
- contacts:read
- auto_reply:read
- audit:read
- reports:read

---

## 17. Operational Notes

### 17.1 Observability
- SSE + queue metrics for UI.
- Persist disconnect reason codes in audit/meta for troubleshooting.
- Track per-account send throughput and failures (optional metrics table).

### 17.2 Security
- Strict RBAC enforcement in API.
- Webhook SSRF protections and signatures.
- Encrypt auth session payload at rest (pgcrypto recommended).
- Audit all sensitive operations.
- Rate-limit API endpoints to prevent abuse.

### 17.3 Scalability
- Campaign sends: snapshot targets and enqueue per contact.
- Debounced progress to reduce event flood.
- Token bucket limiter per account for smooth throughput.
- Use indexes for tags and campaign reporting.

---

## 18. Implementation Checklist (MVP)

1) DB migrations (tables + indexes + pg_trgm + pgcrypto)
2) wa-runtime:
   - Postgres auth adapter + Socket Manager + control plane subscriber
   - send workers (message/campaign) + rate limiter Lua
3) api:
   - RBAC middleware + audit logging
   - campaign endpoints + import endpoints + SSE endpoint
   - command publisher to wa-runtime
4) dashboard:
   - numbers page (connect + QR modal)
   - contacts import wizard
   - campaign wizard + detail progress view
   - RBAC roles matrix + users assignment
   - audit + reports export center
