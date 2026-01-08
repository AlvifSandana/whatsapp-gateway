# 00 — Context and Specs Alignment (WhatsApp Gateway)

You are working on the **WhatsApp Gateway** project. The canonical specification is `specs.md`.

## Non-negotiable alignment
- Treat `specs.md` as source of truth for:
  - Services: `api`, `wa-runtime`, optional `worker`
  - Queues, Redis keys/channels, DB tables, endpoints, RBAC codes, UI pages
- If an implementation decision conflicts with `specs.md`, **do not proceed** with the conflicting change.
  - Instead: propose a minimal spec amendment + rationale, then implement.

## Service boundaries (must follow)
- **wa-runtime** is the only process that owns live Baileys sockets (in-memory).
  - All send-related workers (`q:message:send`, `q:campaign:send`) run in `wa-runtime`.
- **api** never assumes direct access to sockets; it:
  - enqueues jobs
  - publishes control commands to Redis PubSub (`cmd:wa-runtime`)
  - serves SSE (`/v1/events`) to the dashboard
- Optional `worker` is allowed for non-socket tasks only (imports, exports, housekeeping).

## Multi-tenancy invariants
- Every DB query touching tenant data MUST filter by `workspace_id`.
- Uniqueness constraints are workspace-scoped where applicable (e.g., contacts by `workspace_id + phone_e164`).

## Queue and idempotency invariants
- Job IDs use only `[A-Za-z0-9_-]` characters.
- Campaign target jobs are idempotent: `c-{campaignId}-{contactId}`.

## UI invariants
- Dashboard is **Astro + shadcn/ui** using **React islands** for interactive screens.
- Real-time updates use SSE, not heavy websocket infrastructure.

## Deliverables discipline
When asked to implement or change features, always produce:
- DB migration (if schema changes)
- API contract changes (routes + payload schema)
- Queue/job updates (if needed)
- UI changes (pages + components)
- Audit log coverage for sensitive operations
