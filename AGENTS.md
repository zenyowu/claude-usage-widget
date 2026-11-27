# AGENTS.md

## Mac / Claude Token 用量（upstream 流程）

Setup and maintenance for the original Mac + Scriptable Claude widget live in [CLAUDE.md](CLAUDE.md).
Follow it exactly: run `doctor.sh --pre`, ask the two install options, run `install.sh`, verify with `doctor.sh --wait`,
then walk the user through the iPhone steps. Never run `export_usage.py` by hand against the iCloud folder.

## Agent 狀態（此 fork：Windows + Cursor/Antigravity）

Source of truth: [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md). Stack is **Node.js** (no Python).

1. Read `docs/SOURCES.md`, `docs/STATUS_SCHEMA.md`, peer reviews.
2. Implement under `win/` + `ios/Agent 狀態.js` + `install.ps1` / `doctor.ps1`.
3. Open PRs only against `zenyowu/claude-usage-widget` `main` — never upstream `zeuikli`.
4. Never put provider credentials in git or `status.json`.
