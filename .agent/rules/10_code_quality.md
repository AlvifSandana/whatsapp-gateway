# 10 — Code Quality Rules (Node.js / TypeScript / Astro)

These rules ensure clean, maintainable code and consistency across the monorepo.

## TypeScript (required)
- Use **TypeScript** everywhere for runtime services and UI components.
- Enable strictness: `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- Avoid `any`. If unavoidable, isolate and justify with a short comment.
- Export types explicitly; keep boundaries clear (`domain`, `infra`, `api`, `ui`).
- Use Zod (or equivalent) to validate any untrusted input (HTTP body, query, webhook payloads).

## Node.js service conventions
- Prefer small modules with single responsibility.
- Centralize:
  - logging (structured logs with correlation IDs)
  - error mapping (domain error codes)
  - configuration (env parsing + validation)
- Always use explicit timeouts on outbound network calls (webhooks, storage).

## Database conventions (PostgreSQL)
- All writes that must be atomic **must use transactions**.
- Prefer set-based operations for bulk work:
  - `UNNEST` batch inserts
  - `ON CONFLICT` upserts
- Always create/maintain indexes for query paths used by UI:
  - campaign progress/targets
  - contacts by tags
  - audit log filtering
- Never do large table scans in request/response paths; offload to background jobs.

## Redis conventions
- Key naming must match `specs.md` exactly.
- All rate limiting must be **atomic** (Lua).
- Use TTLs for ephemeral keys (QR, cooldowns, dedupe).

## Queue conventions (BullMQ)
- Use explicit `attempts` + `backoff`.
- Use idempotent job IDs when feasible.
- Worker handlers must be:
  - deterministic
  - safe to retry (or explicitly unrecoverable)
  - observable (log jobId + entity identifiers)

## UI conventions (Astro + shadcn/ui)
- Use Astro for layout/shell, React islands for interactive screens.
- Keep islands minimal; avoid heavy global state libraries unless clearly justified.
- Use shadcn/ui components for consistency; do not introduce custom styling systems.

## Reviews / acceptance checklist (must pass)
Before marking a change “done”:
- Lint passes (ESLint) and formatting is consistent (Prettier).
- Typecheck passes.
- Unit tests for new domain logic; integration tests where critical.
- Any endpoint change includes request validation + consistent error responses.
- Audit logging added for privileged actions.
- `specs.md` updated if behavior changes.
