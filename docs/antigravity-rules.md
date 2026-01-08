# Antigravity IDE – Workspace Rules (WhatsApp Gateway)

This folder contains **workspace rules** for Google Antigravity IDE to keep implementation clean and aligned with `specs.md`.

## Where to place these files
Copy the `.agent/rules/` directory into the **git root** of your repository.

Antigravity rules are Markdown files and are applied automatically when stored under:
- `.agent/rules/` (workspace rules)

Optional (global rules across all workspaces):
- `~/.gemini/GEMINI.md`

## Recommended usage
- Keep these rules under version control.
- Update rules only via PR, and note any spec changes in `specs.md`.

Files:
- `00_context_and_specs.md` – project constraints and architecture guardrails
- `10_code_quality.md` – TypeScript/Node, DB, UI conventions, review checklist
- `20_security_and_safety.md` – SSRF, secrets, terminal safety, audit requirements
- `30_change_management.md` – how to handle deviations, ADRs, and spec updates
- `40_repo_tooling.md`
