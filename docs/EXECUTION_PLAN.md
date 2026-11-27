# Agent Status Widget — Executable Plan for AI Agents

> Language for user-facing UI/docs: Traditional Chinese (繁體中文).
> Code identifiers, comments, JSON keys, commit messages: English.
> This document is the single source of truth for implementation. Do not reopen product decisions unless a hard blocker appears.
>
> **Peer-review amendments (2026-11-27):** Three reviewers (Composer 2.5, Grok 4.6, Grok 4.7)
> agreed: (1) live `tasks[]` is best-effort, not an MVP hard gate; (2) Antigravity quota via
> `agy -p /usage --output-format json` with a version gate — never drive the TUI; (3) run a
> Windows collector spike before productizing Tunnel/parsers; (4) named Cloudflare Tunnel is
> the production path; (5) ntfy ACL + high-entropy topic are mandatory; (6) `limits[].percent`
> means **used** 0–100; add `stale_after_seconds`; prefer per-provider `collected_at`; keep
> notify fingerprints off the public JSON when possible.

---

## 0. Mission

Build a **new independent fork/repo** (not a patch to `claude-usage-widget` mainline) that lets the user glance at **Cursor** and **Antigravity** subscription usage + live agent task state on an **iPhone**, without opening each app.

Two delivery surfaces:

| Surface | Code | What |
| --- | --- | --- |
| **A Watch** | Scriptable widgets | Pull unified JSON over HTTPS |
| **B Alert** | ntfy | Push short Traditional Chinese alerts when something needs attention |

**Non-goals for MVP:** Codex collector, Claude collector, Cloudflare Access, pet/fun pages, iCloud file sync, keeping Mac LaunchAgents.

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

Open defaults if still unset by human:

| Item | Default |
| --- | --- |
| Widget title | `Agent 狀態` |
| ntfy | `https://ntfy.sh` + **unguableable topic** + **required** publish token (subscribe ACL on phone) |
| CF hostname | **Named Tunnel required for install**; Quick Tunnel = smoke test only |
| Refresh | Aggregate every **5 min**; notify check every **1 min**; `stale_after_seconds: 1200` |
| Machines | Single Windows PC (scheduler must run as the **logged-in user**, not SYSTEM) |
| Scriptable pages | MVP may ship Overview first; Tasks / per-provider pages can follow |
| Live tasks | **Best-effort**; empty `tasks[]` is a passing MVP |

---

## 2. Architecture

```
[Windows PC]
  collectors/cursor.py ──┐
  collectors/antigravity.py ─┼─► aggregate.py ─► status.json (disk cache)
                             │         │
                             │         ├─► serve.py (127.0.0.1) ──Bearer──► cloudflared ──HTTPS──► iPhone Scriptable
                             │         └─► notify.py ──► ntfy ──► iPhone ntfy App
  token_mgmt.py (endpoint Bearer only)
  Prefer one watchdog process (serve + cloudflared) with timers for aggregate/notify;
  if using Task Scheduler, jobs must share health checks (avoid four silent failures).
```

### Credential classes (do not confuse)

| Class | Examples | Where allowed |
| --- | --- | --- |
| **Provider secrets** | Cursor `accessToken`, Antigravity CLI login | Windows process memory / existing CLI stores only. Never in JSON, git, ntfy, logs. |
| **Endpoint read token** | Random Bearer for `/status.json` | Windows `endpoint.token` file + iPhone Scriptable parameter. Rotate-able. |
| **ntfy publish secret** | ntfy access token / password | Windows config only. |

---

## 3. Repository layout (create in new fork)

```
README.md                 # 繁中安裝與使用
AGENTS.md / CLAUDE.md     # agent setup instructions (繁中步驟)
VERSION                   # YYYY.M.D
docs/EXECUTION_PLAN.md    # this file
docs/STATUS_SCHEMA.md     # JSON contract + examples
win/
  collectors/
    __init__.py
    base.py               # ProviderResult TypedDict / protocol
    cursor.py
    antigravity.py
  aggregate.py
  serve.py
  token_mgmt.py
  notify.py
  heartbeat.py            # optional: Cursor/Antigravity process + api reachability
  cloudflared.yml.example
  config.example.toml
install.ps1
doctor.ps1
uninstall.ps1
ios/
  Agent 狀態.js           # Scriptable main (繁中)
tools/preview/
  sample.json
  index.html              # optional local preview
```

---

## 4. `status.json` contract (MVP)

Top-level keys (stable):

```json
{
  "generated": "2026-11-27T10:00:00+08:00",
  "stale_after_seconds": 1200,
  "host": "TW_ZY_26",
  "schema_version": 1,
  "providers": {
    "cursor": { "...": "see below" },
    "antigravity": { "...": "see below" }
  },
  "tasks": []
}
```

> Notify fingerprints live in Windows `notify.py` state — **do not** put `alerts_hint` on the public `/status.json` endpoint (peer-review consensus). Truncate or omit `tasks[].ask` on the wire.

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
      "unit": "percent",
      "window": "billing_cycle",
      "quality": "exact",
      "resets": "2026-12-01T00:00:00+08:00",
      "resets_text": "12/1",
      "source": "api",
      "at": "2026-11-27T10:00:00+08:00"
    }
  ],
  "today": { "requests": 12, "estimated_tokens": null },
  "last30": { "requests": 400, "estimated_tokens": null },
  "meta": {}
}
```

**`limits[].percent` = used 0–100** (never “remaining”). Antigravity may emit multiple rows (e.g. Gemini 5h / weekly, partner-model 5h / weekly) with distinct `id` values.

`status`: `ok` | `missing` | `signed_out` | `error` (keep boolean `ok` for simple clients).

### `tasks[].state` enum (best-effort)

Prefer only states you can defend: `running` | `failed` | optional `waiting_user` / `waiting_approval` when confidently mapped. Omit uncertain rows. Do **not** hard-require `unread`.

### Staleness rule (Scriptable)

Use top-level `stale_after_seconds` (default **1200**). If `now - generated` exceeds it → 「可能睡著／離線」. Prefer also checking each provider’s `collected_at` so one failed collector does not stale the other.

---

## 5. Collectors

### 5.1 Cursor (`win/collectors/cursor.py`)

**Limits (authoritative for billing %):**

1. Prefer **copy** `state.vscdb` (+ `-wal`/`-shm` if present) to a temp dir, then open SQLite read-only (live WAL + `immutable=1` can miss the current access token).
2. Read Cursor auth access token from ItemTable / cursorDiskKV (`cursorAuth/accessToken` or current equivalent). Never print it.
3. `POST https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage`  
   Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`, `Connect-Protocol-Version: 1`  
   Body: `{}`
4. Map `planUsage` / `spendLimitUsage` / `billingCycleEnd` into `limits[]` (Traditional Chinese labels). Prefer spend-based % when percent fields disagree with includedSpend/limit (known Cursor quirk).

**Activity (best-effort):**

- Prefer reconstructing request counts from `state.vscdb` bubbles / `~\.cursor\chats\**\store.db`.
- Do **not** claim exact tokens if `tokenCount` is `{0,0}`; leave `estimated_tokens` null or mark estimated in `meta`.
- Optional CSV ledger under `%USERPROFILE%\.agent-status\usage-cursor.csv` so cleaned history does not shrink.

**Live tasks:**

- Infer composer/agent waiting/running from local state if reliable; otherwise return empty `tasks` for Cursor rather than guessing.

### 5.2 Antigravity (`win/collectors/antigravity.py`)

**Limits (scriptable path — peer-reviewed):**

- Binary: `%LOCALAPPDATA%\agy\bin\agy.exe` (or `Get-Command agy`).
- **Require** a minimum CLI version that supports print-mode slash commands (community: **≥ 1.1.11**). Below that → `status: missing` / `unsupported_agy_version`, do not run.
- Headless: `agy -p /usage --output-format json` (alias `/quota`). **Never** drive the interactive TUI from Task Scheduler.
- Reject responses that look like a real agent turn (e.g. non-zero model turns) — older CLIs can burn quota if slash commands are disabled.
- Parse groups into multiple `limits[]` rows (`window`: `5h` | `weekly`; separate model pools). Convert remaining fractions → **used** `percent`.
- Settings / auth (do not log): `%USERPROFILE%\.gemini\antigravity-cli\`; Windows Credential Manager service `gemini` / account `antigravity` (version-dependent).

**Activity / live tasks (experimental):**

- Probe paths: `%USERPROFILE%\.gemini\antigravity-cli\conversations`, `antigravity-ide\conversations`, legacy `antigravity\`; IDE DB `%APPDATA%\Antigravity IDE\User\globalStorage\state.vscdb`.
- Populate `tasks[]` only with high confidence; otherwise leave empty.

**Hardening:** Any collector failure sets `status`/`ok: false`, safe `error`/`error_code`, empty limits/tasks for that provider; never crash the whole aggregate.

---

## 6. Endpoint + token management

### `serve.py`

- Bind **`127.0.0.1` only**.
- `GET /healthz` → `200 ok` (no auth).
- `GET /status.json` → require `Authorization: Bearer <token>`; constant-time compare; `401` empty body on failure.
- Serve last aggregated JSON from disk (aggregate writes atomically: write temp + replace).

### `token_mgmt.py`

| Command | Behavior |
| --- | --- |
| `generate` | ≥32 bytes url-safe secret; write `%USERPROFILE%\.agent-status\endpoint.token`; print once |
| `rotate` | New token; keep previous valid for 24h grace |
| `revoke-old` | Drop grace tokens |
| doctor hooks | File exists; ACL is user-only if enforceable |

**Forbidden:** put token in query string (avoid CF/proxy logs).

### Cloudflare Tunnel

- `cloudflared` runs as scheduled task; ingress only to `http://127.0.0.1:<port>`.
- Document named tunnel setup; allow Quick Tunnel for first smoke test.
- MVP does **not** require Cloudflare Access.

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
cooldown_minutes = 45
```

### Rules

| Condition | Priority | Example title |
| --- | --- | --- |
| task state `waiting_user` / `waiting_approval` | high | `Cursor：有任務等你核准` |
| any limit percent ≥ 95 | urgent | `Antigravity：額度 96%` |
| any limit percent ≥ 80 | default | `Cursor：本週期已用 82%` |
| task `failed` | urgent | `Cursor：任務失敗` |

Dedup by `fingerprint` + cooldown (state file on disk, not public JSON). Optional single 「恢復」 notification when condition clears. Prefer short titles like 「有任務等你核准」 — do not push raw `ask` / prompt fragments.

**Never** include endpoint Bearer, provider tokens, or full prompts in ntfy payloads.

Implement `notify` as a small provider interface so Pushover/Telegram can be added later without rewriting rules.

---

## 8. iOS Scriptable (繁中)

File: `ios/Agent 狀態.js` (+ optional page copies named `Agent 狀態・總覽` / `・任務` / `・Cursor` / `・Antigravity`).

**Parameters (widget Parameter or settings):**

- `url` = Cloudflare HTTPS URL to `/status.json`
- `token` = endpoint Bearer

**Pages (MVP):**

1. **總覽** — both providers’ primary limit bars + generated age  
2. **任務** — `tasks[]` list with provider badge + state  
3. **Cursor / Antigravity** — that provider’s limits + today requests  

On HTTP 401 → 「讀取 token 失效，請在電腦輪替後更新參數」.  
On stale generated → 「可能睡著／離線」.

---

## 9. Windows install / doctor

### `install.ps1`

1. Require Python 3 + write cloudflared (or instruct install).  
2. Create `%USERPROFILE%\.agent-status\`.  
3. Copy `win/*`, generate endpoint token + ntfy topic.  
4. Register Task Scheduler jobs: `aggregate` (5m), `notify` (1m), `serve` (KeepAlive), `cloudflared` (KeepAlive).  
5. Print **once**: Tunnel URL instructions, Bearer token, ntfy topic subscribe steps (繁中).

### `doctor.ps1`

Checks (print `[OK]` / `[!!]` / `[--]` like upstream widget):

- Windows + Python  
- Cursor data dir / Antigravity CLI present  
- endpoint.token present  
- localhost `/healthz`  
- `/status.json` with wrong token → 401; right token → 200  
- Tunnel URL reachable (optional)  
- ntfy config present  
- `status.json` age < 12 minutes after `--wait`

Exit code 0 iff no `[!!]`.

---

## 10. Milestones & acceptance

| ID | Deliverable | Acceptance |
| --- | --- | --- |
| **M0** | Schema (amended) + `sample.json` + Scriptable skeleton (繁中) | Preview renders multi-limit bars + stale |
| **M0.5** | Windows **collector spike** → `docs/SOURCES.md` + redacted fixtures | Cursor API JSON and/or `agy -p /usage` captured; gate before parsers |
| **M1** | `serve` + Bearer + rotate + **named** Tunnel docs | doctor 401/200; Quick Tunnel only for smoke |
| **M2a** | Cursor limits collector + aggregate schedule + stale UI | Overview shows Cursor bar after sleep test |
| **M2b** | Antigravity limits (multi-window); degrade per-provider | Failure does not blank Cursor |
| **M3a** | ntfy **quota** 80/95 (+ recover) with mandatory ACL | Phone gets quota alert; no task dependency |
| **M3b** | Optional `tasks[]` + waiting notify | Empty tasks still ships; notify only on confident `needs_user` |
| **M4** | Codex + Claude collectors | Four providers on overview |
| **M5** | Polish install/doctor/README; optional CF Access | Clean machine install from docs |

---

## 11. Security checklist (must pass review)

- [ ] No provider secret in repo, JSON, ntfy, Scriptable source committed to git  
- [ ] serve bound to localhost only  
- [ ] Bearer required for `/status.json`  
- [ ] Token rotate documented  
- [ ] ntfy topic unguessable **and** publish token required  
- [ ] 401 rate-limiting on `/status.json`  
- [ ] Logs redact Authorization headers and tokens  
- [ ] Public JSON omits or truncates sensitive `ask` / long titles  
- [ ] doctor never prints secret values  

---

## 12. Implementation constraints for coding agents

1. Follow this plan; do not reintroduce iCloud file write path for MVP.  
2. Prefer small PRs per milestone (M0→M1→…).  
3. One collector failure must not block the other provider.  
4. Defensive parsing for undocumented Cursor/Antigravity APIs — degrade gracefully.  
5. User replies and UI strings: 繁體中文.  
6. Before claiming “done”, run `doctor.ps1` on Windows (or document blockers).  
7. Do not run interactive writes that lock shared cloud files; Tunnel+localhost only.  
8. Reference inspiration only: upstream `claude-usage-widget` Mac export/Scriptable patterns — reimplement for Windows/multi-provider, do not assume Claude paths.

---

## 13. Evaluation questions (for peer AIs reviewing this plan)

Please answer in Traditional Chinese, structured as:

1. **可行性** (1–5)：Windows 上 Cursor + Antigravity 取額度／任務是否現實？最大風險？  
2. **架構** (1–5)：A Tunnel+Bearer + B ntfy 有無更好替代？  
3. **安全** (1–5)：憑證分級與端點 token 設計缺口？  
4. **MVP 範圍** (1–5)：M0–M3 是否切得合理？該先砍／先加什麼？  
5. **Schema**：`status.json` 欄位有無必改之處？  
6. **實作順序**：你會怎麼改 milestone？  
7. **Antigravity 具體資料源**：你知道的 Windows 路徑／CLI 命令是什麼？  
8. **總評**：一句話；是否建議照此開工？

---

## 14. Out of scope reminders

- Reading or exfiltrating user API keys to any cloud vault  
- Automating App Store / iCloud login on iPhone  
- Exact Cursor token billing from local transcripts (local tokens are unreliable)  
- keepawake / caffeinate equivalents on Windows for MVP  
