Belum Diimplementasikan (Audit Singkat)

- [x] Auth & session: login/logout, session/token, dan proteksi endpoint.
- [x] Multi-tenant enforcement: middleware workspace + header validation.
- [x] Team management: API dan UI undang/edit/aktif-nonaktif sudah tersedia.
- [x] Roles & permissions: API + UI pengelolaan roles/permissions.
- [x] Workspace management: API + UI update workspace + list/switch/migrate/delete.
- [x] Tag management: API create/rename/delete tag + UI.
- [x] Contact notes: API edit + UI catatan contact.
- [x] Export jobs: queue + worker + UI export center (async CSV).
- [x] Contact import: async validate/commit worker.
- [x] Campaign wizard: stepper create/edit flow.
- [x] Auto-reply test: safe regex (RE2) + length guard.
- [x] Reports: signed download + messages export.
- [x] Dashboard root: landing page + privacy policy + ToS.
- [x] README screenshot: updated with local preview asset.

## Selesai

- [x] Manual messaging / inbox: inbox + kirim manual + SSE + hapus percakapan.
- [x] Production Readiness (Phase 1):
    - [x] Vitest testing infrastructure & basic integration tests.
    - [x] Prometheus metrics monitoring (`@repo/monitoring`).
    - [x] Centralized Zod validation (`@repo/validation`).
    - [x] Better Rate Limiting (workspace-aware).
    - [x] Enhanced Health Checks with system metrics.
    - [x] Graceful Shutdown with timeout guards.
    - [x] Dockerization (Dockerfiles + `docker-compose.prod.yml`).
    - [x] Campaign processing optimization (caching).
    - [x] CI/CD Pipeline (GitHub Actions).
    - [x] Sentry Integration for error tracking.

## Pending Production Readiness
- [ ] 100% Test Coverage for critical paths.
- [ ] Advanced Rate Limiting (Redis-based sliding window).


