# Agent Status Widget — Executable Plan for AI Agents

> Language for user-facing UI/docs: Traditional Chinese (繁體中文).
> Code identifiers, comments, JSON keys, commit messages: English.
> This document is the single source of truth for implementation. Do not reopen product decisions unless a hard blocker appears.
>
> **Stack (locked 2026-11-27):** Implementation language is **Node.js** (not Python).
> Collectors, aggregate, localhost HTTP serve, notify, and the single watchdog loop run on Node.
> `install.ps1` / `doctor.ps1` may call `node` or a small `.cmd` wrapper; there is **no Python runtime**.
>
> **Peer-review amendments (2026-11-27):** Three reviewers (Composer 2.5, Grok 4.6, Grok 4.7)
> agreed: (1) live `tasks[]` is best-effort, not an MVP hard gate; (2) Antigravity quota via
> `agy -p /usage --output-format json` with a version gate — never drive the TUI; (3) run a
> Windows collector spike before productizing Tunnel/parsers; (4) named Cloudflare Tunnel is
> the production path; (5) ntfy ACL + high-entropy topic are mandatory; (6) `limits[].percent`
> means **used** 0–100; add `stale_after_seconds`; prefer per-provider `collected_at`; keep
> notify fingerprints off the public JSON when possible.
>
> **agy local review (2026-11-27, agy 1.5.18):** Confirmed binary path and
> `agy -p /usage --output-format json` (also `/quota`). Parse `command.data.groups[].buckets[]`;
> map epoch `reset_time` `1970-01-01T00:00:00Z` → `resets: null`; version via `agy --version`
> (not PE FileVersionInfo); prefer `--print-timeout 20s`; require SUCCESS + `num_turns==0`.
> `~\.gemini\antigravity\` is still active (not legacy); `antigravity-ide\conversations` absent
> after migration. Prefer one logged-in-user watchdog; rate-limit with `CF-Connecting-IP`;
> verify ntfy ACL tier before M3a. See `docs/AGY_REVIEW.md`.
>
> **Claude local review (2026-11-27):** Folded hard gaps into this plan — Scriptable last-success
> cache; Bearer in Scriptable Keychain (not widget Parameter); define `tasks[]` row fields;
> source-failure ntfy alerts; single watchdog loop; M0.5 spike as hard gate before collectors/
> Tunnel productization. See `docs/CLAUDE_REVIEW.md`.
>
> **Changelog:** `schema_version` **2** marks the Node.js stack rewrite (same public contract
> shape as v1 plus the hard-gap fields below). Prior Python/`*.py` assumptions are retired.

---

## 0. Mission

Build a **new independent fork/repo** (not a patch to `claude-usage-widget` mainline) that lets the user glance at **Cursor** and **Antigravity** subscription usage + live agent task state on an **iPhone**, without opening each app.

Two delivery surfaces:

| Surface | Code | What |
| --- | --- | --- |
| **A Watch** | Scriptable widgets | Pull unified JSON over HTTPS |
| **B Alert** | ntfy | Push short Traditional Chinese alerts when something needs attention |

**Non-goals for MVP:** Codex collector, Claude collector, Cloudflare Access, pet/fun pages, iCloud file sync, keeping Mac LaunchAgents, any Python runtime.

---

## 1. Locked product decisions

| # | Decision |
| --- | --- |
| 1 | A (widget) **and** B (push) |
| 2 | Transport: **Cloudflare Tunnel** to localhost HTTP |
| 3 | Provider login/API credentials **never leave the Windows machine** |
| 4 | PC sleep/hibernate → stale data is acceptable; UI must show staleness |
| 5 | Endpoint auth MVP: application-layer **`Authorization: Bearer`** only (no Cloudflare Access yet) |
| 6 | Push MVP: **ntfy** (pluggable; self-hosted URL configurable) |
| 7 | UI / ntfy / install+doctor console: **Traditional Chinese** |
| 8 | MVP providers: **Cursor + Antigravity** only (Codex + Claude = later) |
| 9 | **Implementation stack: Node.js** (one package under `win/`; Task Scheduler invokes `node` or `.cmd`) |

Open defaults if still unset by human:

| Item | Default |
| --- | --- |
| Widget title | `Agent 狀態` |
| ntfy | `https://ntfy.sh` + **unguessable topic** + **required** publish token (subscribe ACL on phone) |
| CF hostname | **Named Tunnel required for install**; Quick Tunnel = smoke test only |
| Refresh | Single watchdog: aggregate every **5 min**; notify check on same loop (or 1 min only if tasks need it); `stale_after_seconds: 1200` |
| Machines | Single Windows PC (scheduler / watchdog must run as the **logged-in user**, not SYSTEM) |
| Scriptable pages | MVP may ship Overview first; Tasks / per-provider pages can follow |
| Live tasks | **Best-effort**; empty `tasks[]` is a passing MVP |

---

## 2. Architecture

```
[Windows PC — Node.js]
  win/src/collectors/cursor.js ──┐
  win/src/collectors/antigravity.js ─┼─► aggregate.js ─► status.json (disk cache)
                                     │         │
                                     │         ├─► serve.js (127.0.0.1) ──Bearer──► cloudflared ──HTTPS──► iPhone Scriptable
                                     │         └─► notify.js ──► ntfy ──► iPhone ntfy App
  win/src/token_mgmt.js (endpoint Bearer only)
  win/src/watchdog.js  — ONE logged-in-user process:
      timers for aggregate + notify; child/supervise cloudflared + serve;
      CREATE_NO_WINDOW / no flashing consoles
```

Prefer **one logged-in-user watchdog** over four independent Scheduled Tasks (Credential Manager / DPAPI need an interactive user session). If Task Scheduler is used, register a single KeepAlive task that starts `watchdog.js` (or `agent-status.cmd`), and share health checks so four silent failures cannot diverge.

### Credential classes (do not confuse)

| Class | Examples | Where allowed |
| --- | --- | --- |
| **Provider secrets** | Cursor `accessToken`, Antigravity CLI login | Windows process memory / existing CLI stores only. Never in JSON, git, ntfy, logs. Collectors must **not** read Credential Manager `gemini:antigravity`. |
| **Endpoint read token** | Random Bearer for `/status.json` | Windows `endpoint.token` file (user-only ACL via `icacls`, **required**) + iPhone Scriptable **Keychain** (not widget Parameter). Rotate-able. |
| **ntfy publish secret** | ntfy access token / password | Windows config only. |

---

## 3. Repository layout (create in new fork)

```
README.md                 # 繁中安裝與使用
AGENTS.md / CLAUDE.md     # agent setup instructions (繁中步驟)
VERSION                   # YYYY.M.D
docs/EXECUTION_PLAN.md    # this file
docs/STATUS_SCHEMA.md     # JSON contract + examples
docs/SOURCES.md           # M0.5 spike notes + redacted fixtures index
win/
  package.json            # type: module; engines.node >= 20
  package-lock.json
  agent-status.cmd        # thin wrapper: node "%~dp0src\cli.js" %*
  src/
    cli.js                # subcommands: aggregate | serve | notify | watchdog | token
    collectors/
      cursor.js
      antigravity.js
    aggregate.js
    serve.js
    token_mgmt.js
    notify.js
    watchdog.js           # single process: timers + supervise serve/cloudflared
  cloudflared.yml.example
  config.example.toml
install.ps1               # PowerShell orchestrator; calls node / .cmd (no Python)
doctor.ps1
uninstall.ps1
ios/
  Agent 狀態.js           # Scriptable main (繁中); Keychain + last-success cache
tools/preview/
  sample.json
  index.html              # optional local preview
```

### Node.js dependencies & Windows packaging

| Concern | Expectation |
| --- | --- |
| Runtime | **Node.js ≥ 20** LTS on PATH (or path recorded by `install.ps1`). No Python. |
| Package | One package under `win/` (`"type": "module"`). Prefer zero native addons when possible. |
| SQLite (`state.vscdb`) | Prefer **`better-sqlite3`** if native build is reliable on the install machine; fallback **`sql.js`** (WASM, no compile) when `node-gyp`/VS Build Tools are absent. Spike both in M0.5; document the chosen default in `SOURCES.md`. Always **copy** DB (+ `-wal`/`-shm`) to a user-only temp dir before open; delete in `finally`. |
| Spawn agy | `child_process.spawn` / `execFile` with absolute path from config; `windowsHide: true` (no console flash); timeout via `--print-timeout 20s` + process kill. |
| HTTP serve | Node `http` (or lightweight `node:http` wrapper) — no Express required for MVP. |
| Config | TOML via a small pure-JS parser (e.g. `@iarna/toml` / `smol-toml`) or JSON if TOML dep is undesirable. |
| Install | `install.ps1` runs `npm ci --omit=dev` (or `npm install --omit=dev`) inside `win/`; registers one Task Scheduler job for `watchdog`. Ship `agent-status.cmd` so tasks do not depend on interactive PATH quirks. |
| Packaging | Source + `package-lock.json` in repo; no need for pkg/electron. Optional later: bundle with `esbuild` if startup size matters. |

---

## 4. `status.json` contract (MVP)

Top-level keys (stable):

```json
{
  "generated": "2026-11-27T10:00:00+08:00",
  "stale_after_seconds": 1200,
  "host": "home-pc",
  "schema_version": 2,
  "providers": {
    "cursor": { "...": "see below" },
    "antigravity": { "...": "see below" }
  },
  "tasks": []
}
```

> Notify fingerprints live in Windows `notify.js` state — **do not** put `alerts_hint` on the public `/status.json` endpoint (peer-review consensus). Truncate or omit `tasks[].ask` on the wire.
>
> `host` is a **user-chosen alias** (install default: sanitized hostname or `home-pc`), never a raw sensitive machine name if the user opts out. Public `error` must be a fixed Traditional Chinese message keyed by `error_code` — never raw paths or usernames.

### Provider block

```json
{
  "id": "cursor",
  "label": "Cursor",
  "status": "ok",
  "ok": true,
  "error": null,
  "error_code": null,
  "collected_at": "2026-11-27T10:00:00+08:00",
  "limits": [
    {
      "id": "cursor:plan",
      "label": "本週期方案",
      "percent": 42,
      "used": null,
      "limit": null,
      "unit": "percent",
      "unit_raw": null,
      "window": "billing_cycle",
      "quality": "exact",
      "resets": "2026-12-01T00:00:00+08:00",
      "group": null,
      "source": "api",
      "at": "2026-11-27T10:00:00+08:00"
    }
  ],
  "today": null,
  "last30": null,
  "meta": {}
}
```

**`limits[].percent` = used 0–100** (never “remaining”); may be `null` when unknown / unlimited. Optional `used` / `limit` / `unit_raw` (e.g. `usd`, `requests`) for debugging when percent and spend disagree. Optional `limits[].group` (e.g. `Gemini Models`). `quality`: `exact` | `estimated` | `unknown`.

`status`: `ok` | `missing` | `signed_out` | `error` (keep boolean `ok` for simple clients).

Do **not** put display-only `resets_text` on the wire — Scriptable formats `resets` in the phone timezone.

`today` / `last30` may be entire `null` (MVP may omit request counting).

### `tasks[]` row fields (best-effort)

```json
{
  "id": "cursor:composer:abc",
  "provider": "cursor",
  "title": "truncated title ≤80 chars",
  "state": "waiting_user",
  "since": "2026-11-27T09:50:00+08:00",
  "updated_at": "2026-11-27T09:55:00+08:00"
}
```

**`state` enum (unified):** `running` | `failed` | `waiting_user` | `waiting_approval`.  
Do **not** use `needs_user` or require `unread`. Omit uncertain rows. Never ship raw `ask` / prompt bodies on the public endpoint.

### Staleness rule (Scriptable)

Use top-level `stale_after_seconds` (default **1200**). If `now - generated` exceeds it → 「可能睡著／離線」. Prefer also checking each provider’s `collected_at` so one failed collector does not stale the other.

**Last-success cache (required):** On HTTP success, Scriptable writes the JSON via `FileManager.local()`. On network / Tunnel failure (PC asleep), render the cached copy and clearly mark 「可能睡著／離線」— do not show a blank widget.

---

## 5. Collectors

### 5.1 Cursor (`win/src/collectors/cursor.js`)

**Limits (authoritative for billing %):**

1. Prefer **copy** `state.vscdb` (+ `-wal`/`-shm` if present) to a **user-only** temp dir, then open SQLite read-only (live WAL + `immutable=1` can miss the current access token). Delete the copy in `finally`.
2. Read Cursor auth access token from ItemTable / cursorDiskKV (`cursorAuth/accessToken` or current equivalent). Never print it.
3. `POST https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage`  
   Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`, `Connect-Protocol-Version: 1`  
   Body: `{}`
4. Map `planUsage` / `spendLimitUsage` / `billingCycleEnd` into `limits[]` (Traditional Chinese labels). Prefer spend-based % when percent fields disagree with includedSpend/limit (known Cursor quirk).
5. Expired / missing token → `status: signed_out` (user must open Cursor once).

**Activity (best-effort; MVP may leave null):**

- Prefer reconstructing request counts from `state.vscdb` bubbles / `~\.cursor\chats\**\store.db`.
- Do **not** claim exact tokens if `tokenCount` is `{0,0}`; leave `estimated_tokens` null or mark estimated in `meta`.
- Optional CSV ledger under `%USERPROFILE%\.agent-status\usage-cursor.csv` is **post-MVP**.

**Live tasks:**

- Infer composer/agent waiting/running from local state if reliable; otherwise return empty `tasks` for Cursor rather than guessing.

### 5.2 Antigravity (`win/src/collectors/antigravity.js`)

**Limits (scriptable path — peer-reviewed):**

- Binary: `%LOCALAPPDATA%\agy\bin\agy.exe` (or path written into config at install — **prefer absolute path**, do not re-resolve PATH each run).
- Version: check via `agy --version` text (PE `FileVersionInfo` may be empty). Prefer accepting payloads that match `command.data.groups[].buckets[]` structure; treat version as advisory (historical floor ≥ 1.1.11; host verified **1.5.18**).
- Headless: `agy -p /usage --output-format json` (alias `/quota`; prefer `--print-timeout 20s`). **Never** drive the interactive TUI from Task Scheduler / watchdog.
- Accept only payloads with `status == SUCCESS`, `command.name == "usage"`, `num_turns == 0`, `usage.total_tokens == 0`, empty `conversation_id`. Otherwise treat as error; **auto-disable** this collector and fire a source-failure notify rather than burning another turn next cycle.
- Parse `command.data.groups[].buckets[]` (`id` e.g. `gemini-weekly`, `3p-5h`; `window` `weekly`|`5h`; `remaining_fraction`; `reset_time`). Convert to **used** `percent = round((1 - remaining_fraction) * 100)` clamped 0–100. Optional `limits[].group` from group name (`Gemini Models` / `Claude and GPT models`).
- If `reset_time` is `1970-01-01T00:00:00Z` (unused bucket sentinel observed on host) → `resets: null`.
- Settings / auth (do not log; do not read Credential Manager): `%USERPROFILE%\.gemini\antigravity-cli\`.
- Quota poll cadence: prefer **≤ every 15 minutes** with disk cache (stricter than aggregate tick if needed).

**Activity / live tasks (experimental):**

- Probe: `%USERPROFILE%\.gemini\antigravity-cli\conversations` (+ `conversation_summaries.db`); `%USERPROFILE%\.gemini\antigravity\` (**still active**, not merely legacy); IDE DB `%APPDATA%\Antigravity IDE\User\globalStorage\state.vscdb`; desktop `%APPDATA%\antigravity\`.
- Do **not** rely on `~\.gemini\antigravity-ide\conversations` (may be migrated away).
- Populate `tasks[]` only with high confidence; otherwise leave empty.

**Hardening:** Any collector failure sets `status`/`ok: false`, safe `error`/`error_code`, empty limits/tasks for that provider; never crash the whole aggregate.

---

## 6. Endpoint + token management

### `serve.js`

- Bind **`127.0.0.1` only**.
- `GET /healthz` → `200 ok` (no auth).
- `GET /status.json` → require `Authorization: Bearer <token>`; constant-time compare; `401` empty body on failure.
- Serve last aggregated JSON from disk (aggregate writes atomically: write temp + `fs.rename`).
- **Rate-limit** failed auth by **`CF-Connecting-IP`** (not the socket peer — behind cloudflared the peer is always 127.0.0.1). Document trust boundary: any local process can spoof that header; doctor should mention it.
- Logs must redact Authorization headers and tokens.

### `token_mgmt.js` (via `cli.js token …`)

| Command | Behavior |
| --- | --- |
| `generate` | ≥32 bytes url-safe secret; write `%USERPROFILE%\.agent-status\endpoint.token`; **`icacls` user-only ACL required**; print once |
| `rotate` | New token (MVP: immediate cutover; 24h grace is optional/post-MVP) |
| `revoke-old` | Drop grace tokens if grace is implemented |
| doctor hooks | File exists; ACL is user-only |

**Forbidden:** put token in query string (avoid CF/proxy logs).

### Cloudflare Tunnel

- Named Tunnel required for install; Quick Tunnel = smoke only.
- `cloudflared` supervised by watchdog (or KeepAlive task); ingress only to `http://127.0.0.1:<port>`.
- MVP does **not** require Cloudflare Access (optional later / M5).

---

## 7. ntfy notifier

### Config (`config.toml`)

```toml
[ntfy]
base_url = "https://ntfy.sh"
topic = "<random>"          # install-generated, unguessable — required
token = "<required publish token>"

[alerts]
quota_warn = 80
quota_crit = 95
source_fail_streak = 3
cooldown_minutes = 45
```

### Rules

| Condition | Priority | Example title |
| --- | --- | --- |
| task state `waiting_user` / `waiting_approval` | high | `Cursor：有任務等你核准` |
| any limit percent ≥ 95 | urgent | `Antigravity：額度 96%` |
| any limit percent ≥ 80 | default | `Cursor：本週期已用 82%` |
| task `failed` | urgent | `Cursor：任務失敗` |
| provider `error` / `signed_out` for N consecutive aggregates | high | `Cursor：登入過期，請開一次 Cursor` |

Dedup by `fingerprint` + cooldown (state file on disk, not public JSON). Optional single 「恢復」 notification when condition clears. Prefer short titles like 「有任務等你核准」 — do not push raw `ask` / prompt fragments.

**Never** include endpoint Bearer, provider tokens, or full prompts in ntfy payloads.

**Before M3a:** verify ntfy.sh ACL / reserved-topic tier (free vs paid vs self-hosted). If free tier cannot enforce publish ACL, require self-hosted ntfy or document that protection is “unguessable topic only”.

Implement `notify` as a small provider interface so Pushover/Telegram can be added later without rewriting rules.

---

## 8. iOS Scriptable (繁中)

File: `ios/Agent 狀態.js` (+ optional page copies named `Agent 狀態・總覽` / `・任務` / `・Cursor` / `・Antigravity`).

**Storage:**

- Widget **Parameter**: page name only (e.g. `overview` / `tasks` / `cursor` / `antigravity`).
- **Keychain**: endpoint Bearer (`token`) and base HTTPS URL (`url`) — never leave the Bearer in Parameter (visible in Edit Widget / screenshots).

**Pages (MVP):**

1. **總覽** — both providers’ primary limit bars + generated age  
2. **任務** — `tasks[]` list with provider badge + state (can follow Overview)  
3. **Cursor / Antigravity** — that provider’s limits (optional after Overview)

**Behavior:**

- On HTTP 401 → 「讀取 token 失效，請在電腦輪替後更新 Keychain」.
- On success → save JSON to `FileManager.local()` last-success cache.
- On fetch failure → show last-success cache + 「可能睡著／離線」.
- On stale `generated` / `collected_at` → 「可能睡著／離線」.

---

## 9. Windows install / doctor

### `install.ps1`

1. Require **Node.js ≥ 20** on PATH (or accept `-NodePath`); download/instruct cloudflared if missing. **No Python check.**  
2. Create `%USERPROFILE%\.agent-status\`.  
3. Copy / link `win/*`, run `npm ci --omit=dev` in `win/`, generate endpoint token (icacls) + ntfy topic.  
4. Write absolute `agy` path into config when found.  
5. Register **one** Task Scheduler job (logged-in user, highest privileges optional): KeepAlive → `agent-status.cmd watchdog`.  
6. Print **once**: Tunnel URL instructions, Bearer token (for Keychain), ntfy topic subscribe steps (繁中).

### `doctor.ps1`

Checks (print `[OK]` / `[!!]` / `[--]` like upstream widget):

- Windows + Node.js ≥ 20  
- `win/node_modules` present (or `npm ci` hint)  
- Cursor data dir / Antigravity CLI present  
- endpoint.token present + user-only ACL  
- localhost `/healthz`  
- `/status.json` with wrong token → 401; right token → 200  
- Tunnel URL reachable (optional)  
- ntfy config present  
- `status.json` age < 12 minutes after `--wait`  
- Document CF-Connecting-IP trust boundary  

Exit code 0 iff no `[!!]`.

---

## 10. Milestones & acceptance

| ID | Deliverable | Acceptance |
| --- | --- | --- |
| **M0.5** | Windows **collector spike** (Node) → `docs/SOURCES.md` + redacted fixtures | Cursor API JSON and/or `agy -p /usage --output-format json` captured; **hard gate** — no productized collectors/Tunnel until fixtures land |
| **M0** | Schema v2 + `sample.json` + Scriptable skeleton (繁中, Keychain + last-success cache) | Preview renders multi-limit bars + stale/offline cache |
| **M1** | `serve` + Bearer + rotate + **named** Tunnel docs (Node `http`) | doctor 401/200; Quick Tunnel only for smoke |
| **M2a** | Cursor limits collector + **single watchdog** (aggregate + local serve) + stale UI | Overview shows Cursor bar after sleep test |
| **M2b** | Antigravity limits (multi-window); degrade per-provider | Failure does not blank Cursor |
| **M3a** | ntfy **quota** 80/95 (+ recover) + **source-failure** alerts; ACL verified | Phone gets quota / signed_out alert; no task dependency |
| **M3b** | Optional `tasks[]` + `waiting_user` / `waiting_approval` notify | Empty tasks still ships; notify only on confident waiting states |
| **M4** | Codex + Claude collectors | Four providers on overview |
| **M5** | Polish install/doctor/README; optional CF Access | Clean machine install from docs |

**Start-now rule:** Begin with **M0.5 only** until fixtures prove Cursor API + agy JSON on this Windows host; then M0 → M2a → M1 → M2b → M3a…

---

## 11. Security checklist (must pass review)

- [ ] No provider secret in repo, JSON, ntfy, Scriptable source committed to git  
- [ ] serve bound to localhost only  
- [ ] Bearer required for `/status.json`  
- [ ] Token rotate documented; `endpoint.token` **icacls** user-only  
- [ ] Scriptable stores Bearer in **Keychain**, not Parameter  
- [ ] ntfy topic unguessable **and** publish token required (ACL tier verified before M3a)  
- [ ] 401 rate-limiting on `/status.json` by **`CF-Connecting-IP`**  
- [ ] Logs redact Authorization headers and tokens  
- [ ] Public JSON omits or truncates sensitive `ask` / long titles; `error` is code→fixed 繁中  
- [ ] vscdb temp copies are user-only ACL and deleted in `finally`  
- [ ] doctor never prints secret values  
- [ ] Single watchdog runs as logged-in user (not SYSTEM)  

---

## 12. Implementation constraints for coding agents

1. Follow this plan; do not reintroduce iCloud file write path for MVP.  
2. Prefer small PRs per milestone (M0.5→M0→…).  
3. One collector failure must not block the other provider.  
4. Defensive parsing for undocumented Cursor/Antigravity APIs — degrade gracefully.  
5. User replies and UI strings: 繁體中文.  
6. Before claiming “done”, run `doctor.ps1` on Windows (or document blockers).  
7. Do not run interactive writes that lock shared cloud files; Tunnel+localhost only.  
8. Reference inspiration only: upstream `claude-usage-widget` Mac export/Scriptable patterns — reimplement for Windows/multi-provider/Node.js, do not assume Claude paths or Python.  
9. **No Python** in runtime, install, or doctor paths.  
10. Open PRs only against `zenyowu/claude-usage-widget` `main` — never upstream `zeuikli`.

---

## 13. Evaluation questions (for peer AIs reviewing this plan)

Please answer in Traditional Chinese, structured as:

1. **可行性** (1–5)：Windows 上 Cursor + Antigravity 取額度／任務是否現實？最大風險？Node.js 實作有無額外風險？  
2. **架構** (1–5)：A Tunnel+Bearer + B ntfy + 單一 Node watchdog 有無更好替代？  
3. **安全** (1–5)：憑證分級、Keychain、CF-Connecting-IP、vscdb 暫存是否足夠？  
4. **MVP 範圍** (1–5)：M0.5–M3 是否切得合理？該先砍／先加什麼？  
5. **Schema**：`status.json`（schema_version 2）欄位有無必改之處？  
6. **實作順序**：你會怎麼改 milestone？  
7. **Antigravity 具體資料源**：你知道的 Windows 路徑／CLI 命令是什麼？  
8. **總評**：一句話；是否建議照此開工？

---

## 14. Out of scope reminders

- Reading or exfiltrating user API keys to any cloud vault  
- Automating App Store / iCloud login on iPhone  
- Exact Cursor token billing from local transcripts (local tokens are unreliable)  
- keepawake / caffeinate equivalents on Windows for MVP  
- Python collectors, venv, or `pip` install paths  
