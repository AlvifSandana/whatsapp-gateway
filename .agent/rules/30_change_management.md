# 30 — Change Management and Spec Governance

## Spec governance
- `specs.md` is the contract. Do not “quietly” diverge.
- If you need to change behavior:
  1) write a short note (what/why/impact)
  2) update `specs.md`
  3) implement the change
  4) ensure migrations/rollouts are safe

## ADR-lite (recommended)
For non-trivial decisions (architecture, queue strategy, schema redesign):
- Add a short markdown note under `docs/adr/`:
  - context
  - decision
  - alternatives
  - consequences

## Backward compatibility
- Prefer additive DB migrations.
- Avoid breaking API contracts without versioning or coordinated migration.

## “Done” definition (for any feature)
A feature is not complete unless:
- DB schema (if needed) is migrated and tested
- API endpoints are implemented with validation + RBAC
- Worker/queue integration is in place
- UI supports the flow end-to-end
- Audit coverage exists for sensitive actions
- SSE events are emitted where expected (status/progress)
- Documentation is updated (`specs.md` and any relevant README)
