# agy (Antigravity) peer review of EXECUTION_PLAN.md

## Node.js revision — 2026-11-27

Source: local `ask_agy` MCP timed out; fallback `ai-bridge` `runAgy`
(`agy --dangerously-skip-permissions`), 2026-11-27.
Host: agy **1.5.18**, Node.js **v24.22.1**.
Reviewed: `docs/EXECUTION_PLAN.md` on branch `cursor/nodejs-execution-plan`
(`schema_version: 2`, Node.js stack rewrite).

### Scores

| # | Topic | Score |
| --- | --- | --- |
| 1 | Feasibility | 4/5 (must-fix: `node:sqlite`) |
| 2 | Architecture | 4.5/5 |
| 3 | Security | 4/5 (must-fix: dir ACL + temp cleanup) |
| 4 | MVP scope | 4/5 |
| 5 | Schema | Must change 2 items (`disabled` + time/`limits[].id` rules) |
| 6 | Milestone order | 4/5 (must unify table vs Start-now rule) |
| 7 | Antigravity paths / CLI | **5/5** (locally verified) |
| 8 | Verdict | Fix four items, then start at **M0.5** |

### Must-fix before coding collectors

1. Raise Node floor to **≥ 22.13 / 24 LTS** and prefer built-in **`node:sqlite` (`DatabaseSync`)** — drop `sql.js` as WAL-capable default (`sql.js` cannot replay `-wal`/`-shm`; Cursor `state.vscdb` ~35MB + multi-MB WAL observed). Keep `better-sqlite3` only as last resort if native build is required elsewhere.
2. Apply **user-only `icacls` ACL to the whole `%USERPROFILE%\.agent-status\`** directory (covers `endpoint.token`, `config.*` with ntfy token, tmp, cloudflared creds) — not only `endpoint.token`.
3. Put vscdb copies under `.agent-status\tmp\` (user-only) and **purge leftover copies on startup** (`finally` may not run after kill/crash).
4. Schema: add provider `status: disabled` for circuit-breaker; lock `error_code` enum; RFC 3339 times; stable `limits[].id` (e.g. `antigravity:gemini-weekly`).
5. Unify milestone order: table vs Start-now rule disagree on M1 vs M2a; prefer end-to-end M1 skeleton earlier; verify ntfy ACL in **M0.5**.

### Suggested (non-blocking)

- In-process `serve` inside watchdog; recursive `setTimeout` + inFlight mutex; single-instance lock; optional zero-dep via `config.json`.
- Rate-limit Map LRU cap; missing `CF-Connecting-IP` → fallback `remoteAddress`.
- Antigravity breaker reset command + log rotation; drop HTML preview / grace tokens from MVP.

### Antigravity paths (this host)

| Item | Path / command | Note |
| --- | --- | --- |
| CLI | `%LOCALAPPDATA%\agy\bin\agy.exe` | `agy --version` → 1.5.18 |
| Quota | `agy -p /usage --output-format json --print-timeout 20s` | SUCCESS, `num_turns:0`, groups Gemini + Claude/GPT buckets; unused `reset_time` = `1970-01-01T00:00:00Z` |
| CLI summaries DB | `~\.gemini\antigravity-cli\conversation_summaries.db` (+ WAL) | Readable via `node:sqlite` on copy |
| Active home | `~\.gemini\antigravity\` | Still actively written |
| IDE / desktop | `%APPDATA%\Antigravity IDE\…\state.vscdb`, `%APPDATA%\antigravity\` | Lower churn; `antigravity-ide` not primary |

### Verdict

Quota path for Antigravity remains verified. After `node:sqlite`, directory ACL/temp cleanup, Schema `disabled`, and milestone-order fix: **start at M0.5**.

---

## Prior Python-stack review — 2026-11-27 (historical)

Source: local `ask_agy` / `runAgy` path (`agy --dangerously-skip-permissions`), 2026-11-27.
Host agy version: **1.5.18**.

### Scores (historical)

| # | Topic | Score |
| --- | --- | --- |
| 1 | Feasibility | 4/5 |
| 2 | Architecture | 4/5 |
| 3 | Security | 4/5 |
| 4 | MVP scope | 4.5/5 |
| 5 | Schema | 4/5 |
| 6 | Milestone order | 4/5 |
| 7 | Antigravity paths / CLI | 4.5/5 (locally verified) |
| 8 | Verdict | Start after small fixes |

### Must-fix before coding collectors (historical)

1. Prefer **one logged-in-user watchdog** over four independent Scheduled Tasks; Credential Manager / DPAPI need interactive user session.
2. Confirm **ntfy.sh ACL/token** is available on free vs paid/self-hosted before locking M3a acceptance.
3. Rate-limit by **`CF-Connecting-IP`**, not socket peer (always 127.0.0.1 behind cloudflared).
4. Antigravity parser: path is `command.data.groups[].buckets[]`; treat `reset_time == 1970-01-01T00:00:00Z` as `resets: null`; version via `agy --version` string (exe FileVersionInfo empty); add `--print-timeout 20s`; require `num_turns==0`, `status==SUCCESS`, `command.name==usage`, `usage.total_tokens==0`.
5. Paths: drop `antigravity-ide\conversations` (migrated); keep `~\.gemini\antigravity\` as **active**, not legacy; `%APPDATA%\antigravity\` desktop app also present.
6. Put **spike/SOURCES before final schema**; unify `needs_user` vs `waiting_*` naming; optional `limits[].group`.

### Verdict (historical)

Quota path for Antigravity is verified on this machine. Start after applying the small gaps above; keep live `tasks[]` best-effort.
