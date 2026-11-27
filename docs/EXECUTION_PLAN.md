# Agent Status Widget — Executable Plan for AI Agents

> Language for user-facing UI/docs: Traditional Chinese (繁體中文).
> Code identifiers, comments, JSON keys, commit messages: English.
> This document is the single source of truth for implementation. Do not reopen product decisions unless a hard blocker appears.

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
| ntfy | `https://ntfy.sh` + random topic + publish token |
| CF hostname | Prefer named tunnel if domain exists; else Quick Tunnel for smoke test |
| Refresh | Aggregate every **5 min**; notify check every **1 min** |
| Machines | Single Windows PC |
| Scriptable pages | Overview / Tasks / Cursor detail / Antigravity detail |

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
  Task Scheduler: aggregate@5m, notify@1m, serve+cloudflared KeepAlive
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
  "host": "TW_ZY_26",
  "schema_version": 1,
  "providers": {
    "cursor": { "...": "see below" },
    "antigravity": { "...": "see below" }
  },
  "tasks": [
    {
      "id": "stable-id",
      "provider": "cursor",
      "title": "…",
      "state": "waiting_approval",
      "ask": "optional short question",
      "updated_at": "2026-11-27T09:59:00+08:00"
    }
  ],
  "alerts_hint": [
    {
      "fingerprint": "cursor:waiting:abc",
      "severity": "high",
      "title": "Cursor：有任務等你核准",
      "body": "短摘要",
      "kind": "waiting_approval"
    }
  ]
}
```

### Provider block

```json
{
  "id": "cursor",
  "label": "Cursor",
  "ok": true,
  "error": null,
  "limits": [
    {
      "label": "本週期方案",
      "percent": 42,
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

### `tasks[].state` enum

`running` | `waiting_user` | `waiting_approval` | `unread` | `failed`

Omit idle tasks from the array.

### Staleness rule (Scriptable)

If `now - generated > 15–20 minutes` → show 「可能睡著／離線」 (do not pretend live).

---

## 5. Collectors

### 5.1 Cursor (`win/collectors/cursor.py`)

**Limits (authoritative for billing %):**

1. Open `%APPDATA%\Cursor\User\globalStorage\state.vscdb` SQLite **read-only** (`mode=ro`, fallback `immutable=1`).
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

**Limits:**

- Prefer Antigravity CLI `/usage` or `/quota` (or documented equivalent) using the already-logged-in CLI on PATH (`agy` / antigravity). Parse 5h / weekly style quotas into `limits[]`.
- Never scrape passwords; use CLI session only.

**Activity / live tasks:**

- Use local Antigravity session/state paths on Windows as discovered by doctor probe.
- Populate `tasks[]` when an interaction is running or waiting on the user.

**Hardening:** Any collector failure sets `ok: false`, `error: "<safe message>"`, empty limits/tasks for that provider; never crash the whole aggregate.

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
topic = "<random>"          # install-generated, unguessable
token = "<optional publish token>"

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

Dedup by `fingerprint` + cooldown. Optional single 「恢復」 notification when condition clears.

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
| **M0** | Schema + `tools/preview/sample.json` + Scriptable skeleton (繁中) | Preview renders fake Cursor+Antigravity data |
| **M1** | `serve` + Bearer + token rotate + CF Tunnel wiring | doctor dual probe 401/200; phone or curl via tunnel with Bearer works |
| **M2** | Real Cursor + Antigravity collectors + aggregate + schedule | Overview shows two live limit rows; staleness works when PC sleeps |
| **M3** | `tasks[]` + ntfy rules | Waiting task → ntfy on phone within ~1–2 min |
| **M4** | Codex + Claude collectors | Four providers on overview |
| **M5** | Polish install/doctor/README; optional CF Access | Clean machine install from docs |

---

## 11. Security checklist (must pass review)

- [ ] No provider secret in repo, JSON, ntfy, Scriptable source committed to git  
- [ ] serve bound to localhost only  
- [ ] Bearer required for `/status.json`  
- [ ] Token rotate documented  
- [ ] ntfy topic unguessable  
- [ ] Logs redact Authorization headers and tokens  
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
