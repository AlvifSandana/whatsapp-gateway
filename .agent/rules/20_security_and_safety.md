# 20 — Security and Safety Rules

These rules protect credentials, prevent SSRF and prompt-injection risks, and ensure safe ops.

## Secrets and sensitive data (absolute rules)
- Never read, print, or paste secrets from `.env`, cloud metadata, key stores, or local credentials.
- Do not log:
  - access tokens, session credentials, webhook secrets
  - WA auth state
  - full message contents unless explicitly required and redacted
- Avoid writing any secrets into repository files.

## Terminal safety (agent operations)
- Do not run destructive commands without explicit user instruction:
  - `rm -rf`, `del /s`, `format`, disk/partition tools, mass delete/move
- For any command that could modify many files:
  - prefer `git status` + targeted changes
  - show intended paths before execution
- Never execute shell commands derived from untrusted input.

## Webhook SSRF hardening (required)
For auto-reply webhook mode:
- Allowlist hostnames/domains.
- Resolve DNS and block private/internal IP ranges.
- Disable redirects or enforce allowlist on redirect target.
- Enforce strict timeout (2–3s) and response size limit.
- Support request signing (HMAC) with timestamp and replay window.

## Regex safety (required)
- Do not use backtracking-heavy regex engines for untrusted patterns.
- Use RE2 (or equivalent safe engine) for user-configurable regex.

## RBAC enforcement (required)
- Every privileged endpoint requires permission checks.
- RBAC mutations must be audited:
  - role create/update/delete
  - role permission updates
  - user role assignments

## Audit log coverage (required)
Record an audit log for:
- WA connect / reconnect / reset creds
- campaign start/pause/cancel
- contacts import commit
- exports creation and download (where relevant)
- RBAC changes

## Multi-number safety
- Enforce distributed lock: one WA account can be owned by one runtime instance only.
- Stop auto-reconnect loops for “logged out / forbidden / connection replaced”.
- Reset creds only on explicit operator action or auth-broken reasons.
