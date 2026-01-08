# 40 — Repo Tooling and Enforcement (CI / Lint / Format / Tests)

This rule makes “clean code” enforceable, not just advisory. The goal is to ensure the codebase stays aligned with `specs.md` and remains maintainable under rapid iteration.

## 1) Monorepo conventions (recommended)
- Use a workspace monorepo manager (pnpm recommended).
- Keep service apps separated:
  - `apps/api`
  - `apps/wa-runtime`
  - `apps/worker` (optional; never include socket send workers here)
  - `apps/dashboard` (Astro)
- Keep shared libraries under:
  - `packages/shared` (types, schemas, error codes, utilities)
  - `packages/db` (migrations, sql helpers)
  - `packages/infra` (redis/queue/logging wrappers)

## 2) Required toolchain
- Node.js LTS (pin via `.nvmrc` or `volta`).
- Package manager: `pnpm` with `pnpm-lock.yaml` committed.
- Formatter: Prettier (single source of truth).
- Linter: ESLint with TypeScript + React + import rules.
- Typecheck: `tsc --noEmit` for all TypeScript packages.
- Tests: Vitest (unit) + optional integration tests (DB/Redis) in CI.

## 3) Mandatory scripts (package.json at repo root)
Ensure these scripts exist and are used in CI:
- `lint`: ESLint across repo
- `format`: Prettier write
- `format:check`: Prettier check
- `typecheck`: `tsc --noEmit`
- `test`: unit tests
- `test:integration`: (optional) DB/Redis integration suite
- `build`: build all apps/packages
- `ci`: runs `format:check && lint && typecheck && test && build`

## 4) Pre-commit enforcement (recommended)
Use Husky + lint-staged:
- Run Prettier on staged files.
- Run ESLint on staged TS/TSX.
- (Optional) run `tsc -p` on changed packages when fast enough.

If Husky is not desired, enforce via CI only; however, local hooks are strongly recommended.

## 5) TypeScript and lint rules (must)
- `strict: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`
- ESLint rules (minimum):
  - no floating promises (`@typescript-eslint/no-floating-promises`)
  - consistent type imports (`consistent-type-imports`)
  - no unused vars (`no-unused-vars`) with `_` ignore
  - forbid `any` except explicit allowlist file(s)
  - import ordering + no cycles for core modules

## 6) API quality gates (must)
- Every endpoint must:
  - validate inputs (Zod or equivalent)
  - enforce RBAC (`requirePerm`)
  - return consistent error envelopes (error code + message)
  - emit audit logs for privileged operations
- Add contract tests for critical flows:
  - connect/reconnect/reset-creds command publishing
  - campaign draft → start
  - contacts import commit
  - RBAC mutations

## 7) Database migration discipline (must)
- All schema changes must be additive when possible.
- Migrations must be deterministic and idempotent.
- For each migration:
  - add required indexes
  - avoid long-running locks (use `CONCURRENTLY` where appropriate)
- Provide rollback notes (even if not automated).

## 8) Runtime safety gates (must)
- Webhook calls:
  - must have timeouts
  - must not follow redirects
  - must enforce allowlist + SSRF blocking
- Regex rules:
  - must use RE2 for user patterns
- Redis keys must follow `specs.md` naming.

## 9) CI pipeline (minimum)
CI must block merges unless all pass:
- format:check
- lint
- typecheck
- unit tests
- build

Recommended CI extras:
- dependency audit (e.g., `pnpm audit` or SCA tool)
- integration tests (Postgres + Redis services)
- migrations smoke test against an empty DB

## 10) Definition of Done (repo-enforced)
A PR is not mergeable unless:
- CI passes
- new endpoints include validation + RBAC + audit if privileged
- migrations are included for schema changes
- `specs.md` updated if behavior diverges
