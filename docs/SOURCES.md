# Data sources — M0.5 spike notes

Captured on Windows host **2026-11-27** (Asia/Taipei). Stack: Node **v24.22.1** (`node:sqlite` OK), agy **1.5.18**.

## Fixtures

| File | Source | Live? |
| --- | --- | --- |
| `docs/fixtures/agy-usage.redacted.json` | `agy -p /usage --output-format json --print-timeout 20s` | **Yes** — SUCCESS, `num_turns:0`, `usage.total_tokens:0` |
| `docs/fixtures/cursor-GetCurrentPeriodUsage.sample.json` | Public Connect RPC response shape (PaceBar / community) | **No live body** — see Cursor notes |

## Antigravity / agy

- Binary: `%LOCALAPPDATA%\agy\bin\agy.exe` (`agy --version` → `1.5.18`)
- Quota command (headless only):  
  `agy -p /usage --output-format json --print-timeout 20s` (alias `/quota`)
- Accept only: `status == SUCCESS`, `command.name == "usage"`, `num_turns == 0`, empty `conversation_id`, `usage.total_tokens == 0`
- Parse: `command.data.groups[].buckets[]`  
  - `percent_used = round((1 - remaining_fraction) * 100)` clamped 0–100  
  - `reset_time == 1970-01-01T00:00:00Z` → `resets: null` (unused bucket sentinel; observed on Claude/GPT buckets)
- Observed groups: `Gemini Models` (`gemini-weekly`, `gemini-5h`), `Claude and GPT models` (`3p-weekly`, `3p-5h`)
- Do **not** read Credential Manager `gemini:antigravity`

## Cursor

- DB: `%APPDATA%\Cursor\User\globalStorage\state.vscdb` (+ `-wal`/`-shm`)
- Spike: copy DB to temp, open with **`node:sqlite` `DatabaseSync` read-only** — works (DB ~35MB + multi-MB WAL)
- Auth key: `ItemTable` → `cursorAuth/accessToken` (present; length ~800; **not** a JWT)
- Flag: `cursor.storage.authTokenEncryptionAtRest = true`
- API: `POST https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage`  
  Headers: `Authorization: Bearer …`, `Content-Type: application/json`, `Connect-Protocol-Version: 1`, body `{}`
- Live result on this host: **HTTP 401** `ERROR_NOT_LOGGED_IN` — treat as `signed_out` until Cursor persists a usable plaintext bearer (open Cursor / re-login). **Do not** auto-refresh via `refreshToken` (risk of invalidating the desktop session).
- Membership metadata readable without API: `cursorAuth/stripeMembershipType=premium`, `stripeSubscriptionStatus=active`
- Parser unit tests use the structural sample fixture above

## SQLite choice

- **Default: `node:sqlite`** (requires Node **≥ 22.13** / 24 LTS). Verified on this host.
- `sql.js` is **not** the default (no WAL replay). `better-sqlite3` only as last resort.

## ntfy ACL (pre-M3a)

- Probe: unauthenticated `POST https://ntfy.sh/<random-topic>` returned **200** on free tier.
- Conclusion: free ntfy.sh **cannot** enforce publish ACL. MVP requires:
  1. install-generated **unguessable topic**, and
  2. **publish token** in Windows config; phone subscribes with the matching credential **or**
  3. self-hosted / paid ntfy with ACL.
- Documented in install/doctor as `[--]` / warning when only “unguessable topic” protects the channel.

## No-window launch

- Task Scheduler + `agent-status.cmd` can flash a console. Prefer:
  - `pwsh -WindowStyle Hidden -File …`, or
  - `conhost.exe --headless` wrapping `node`, or
  - VBS/`wscript` launcher.
- Collectors use `windowsHide: true` on child spawns (`agy`).

## Credential classes (reminder)

| Class | Allowed location |
| --- | --- |
| Provider secrets | Process memory / existing CLI stores only — never git, status.json, ntfy |
| Endpoint Bearer | `%USERPROFILE%\.agent-status\endpoint.token` (dir-wide user ACL) + Scriptable Keychain |
| ntfy publish token | Windows config only |
| cloudflared tunnel JSON | `%USERPROFILE%\.cloudflared\` — treat as endpoint control plane |
