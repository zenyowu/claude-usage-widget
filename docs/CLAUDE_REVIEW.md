# Claude peer review of EXECUTION_PLAN.md

## Node.js revision — 2026-11-27

Source: local `ask_claude` MCP timed out; fallback `ai-bridge` `runClaude`
(`claude -p --output-format text`), 2026-11-27.
Reviewed: `docs/EXECUTION_PLAN.md` (Node.js stack, `schema_version: 2`) and
`docs/AGY_REVIEW.md` (prior section still present at review time).
Workspace: `C:\workspace\claude-usage-widget` on branch `cursor/nodejs-execution-plan`.
Host check: Node **v24.22.1** (Claude could not independently re-verify `~\.gemini` paths in this session).

### Scores

| # | Topic | Score |
| --- | --- | --- |
| 1 | Feasibility | 3.5/5 |
| 2 | Architecture | 4/5 |
| 3 | Security | 4/5 |
| 4 | MVP scope | 4/5 |
| 5 | Schema | Must change 2 items |
| 6 | Milestone order | Reorder suggested (see below) |
| 7 | Antigravity / agy on Windows | 4/5 (trusts prior AGY proof; not re-verified here) |
| 8 | Verdict | Start **only M0.5**; patch four hard gaps first |

### Consensus vs agy Node.js review

| Topic | AGY (Node.js) | Claude (Node.js) | Notes |
| --- | --- | --- | --- |
| Feasibility | 4/5 | 3.5/5 | Both require `node:sqlite`; Claude more wary of Cursor token freshness / safeStorage |
| Architecture | 4.5/5; in-process serve | 4/5; prefer cloudflared as Windows service | Soft conflict on who owns cloudflared |
| Security | Dir-wide icacls + tmp purge | Add tunnel credential class; ntfy ACL in M0.5 | Aligned on ntfy early; Claude adds CF tunnel JSON as credential class |
| MVP | 4/5 | 4/5 | Both cut grace/preview; Claude wants fixture unit tests |
| Schema | `disabled` + enums | Keep last-success limits + `last_success_at`; define or drop `today`/`last30` | Soft conflict on failure semantics |
| Milestone | Unify M1/M2a; ntfy in M0.5 | Expand M0.5 → collectors → M1 → watchdog → M3a → M5 | Soft conflict on when Tunnel lands vs collectors |
| Antigravity | 5/5 local proof | 4/5; accepts prior proof | No factual path conflict |
| Start now? | After four fixes, M0.5 | Only M0.5 until fixtures | Aligned |

**Shared must-dos:** prefer `node:sqlite` (Node ≥ 22.13/24); verify ntfy ACL in M0.5; fix M1↔M2a acceptance contradiction; keep `tasks[]` best-effort; headless/no-console flash for scheduler.

**Claude-only hard gaps:** do not self-refresh Cursor tokens; keep last successful `limits` on collector failure; treat cloudflared tunnel JSON as its own credential class; fixture-driven `node:test` parsers.

---

### Full Claude reply (verbatim)

我讀完了計畫全文和 `AGY_REVIEW.md`，以下是 8 點審查。本機驗證受限：權限設定擋掉了讀 `~\.gemini` 和多條路徑的檢查，只確認到 **Node v24.22.1**。第 7 點的路徑因此只是我的已知資訊加上計畫原文，我沒有實際查證。

---

## 1. 可行性：3.5／5

**Cursor**：可行，但最脆弱。
- `GetCurrentPeriodUsage` 是未公開的 Connect API，隨時可能改名或改欄位。
- `accessToken` 由 Cursor App 開著時才會刷新。Cursor 幾天沒開，token 一過期就會變成 `signed_out`，這是常態而不是例外。計畫應明說：**不要用 refreshToken 自己續期**，否則可能讓 Cursor 本身的登入狀態失效。
- 新版 Cursor 可能把 token 用 safeStorage／DPAPI 加密。M0.5 必須確認讀出來的是明文。

**Antigravity**：只取額度的話，`agy -p /usage` 這條路最可靠，前提是 0-turn 檢查一直成立。
- 最大風險：CLI 改版後 `/usage` 變成會走模型。計畫已有「自動停用」的防護，這點很好。

**任務**：兩邊都只能猜，降為 best-effort 是對的。

**Node.js 額外風險（必改）**：
- **SQLite 選型**：本機是 Node 24，已內建 `node:sqlite`，免編譯也不需要 WASM。建議改成以 `node:sqlite` 為首選，`engines.node` 拉到 `>=22.13`，`better-sqlite3`／`sql.js` 只當備案。
- **主控台視窗閃爍**：`windowsHide` 只管子行程。Task Scheduler 直接跑 `.cmd`／`node.exe`，會閃出主控台視窗。需要在 M0.5 一併驗證無視窗啟動方式，例如 `conhost.exe --headless`、VBS／`wscript` 啟動器，或 `pwsh -WindowStyle Hidden`。

## 2. 架構：4／5

方向正確。兩個建議改：

- **cloudflared 不要讓 watchdog 管**：改用 `cloudflared service install` 裝成 Windows 服務。它不碰廠商憑證，用 SYSTEM 跑沒問題，watchdog 也少一個要看顧的行程。
- **「KeepAlive」不是 Task Scheduler 的概念**：要具體寫成「登入時觸發 + 失敗時每 1 分鐘重啟 + 已在執行時不另開新實例」，必要時再加每 5 分鐘重複觸發作保險。

替代方案只記錄、不推翻已鎖定的決策：改由電腦主動推 JSON 到 CF Worker／KV，手機從 Worker 讀。這樣不需要對外通道，電腦睡著時手機仍讀得到最後一份資料。代價是衍生資料會離開電腦。可以列為 M5 之後的選項。

## 3. 安全：4／5

主體夠用，以下要補：

- **必改**：憑證分級表少了 **cloudflared 通道憑證 JSON**（`~\.cloudflared\<id>.json`），它等同對外端點的控制權。
- **必改**：ntfy.sh 免費版沒有保留 topic 和發布權限控管（要付費或自架）。這是會影響架構的決定，應該**提前到 M0.5 定案**，不要拖到 M3a 前才決定。
- **建議改**：
  - cloudflared ingress 只開放 `/status.json` 路徑，`/healthz` 只在本機用，不經通道對外。
  - 比對 Bearer 時，先對兩邊各做 SHA-256 再 `timingSafeEqual`，避免洩漏長度。
  - 免費版可設 1 條 CF WAF 速率限制規則，作為 `CF-Connecting-IP` 之外的第二層。
- **vscdb 暫存檔**：`%TEMP%` 本來就是每個使用者專屬，夠用，不必每次跑 `icacls`。但要加**啟動時清掃殘留暫存**，因為行程崩潰時 `finally` 不會執行，而這份副本含有完整 token。
- **建議改**：`meta` 改成白名單。Cursor API 的回應可能含 email，不要原樣塞進去。

## 4. MVP 範圍：4／5

- **先砍**：token rotate 的寬限期、單一廠商頁、`today`／`last30`。
- **先加**：
  - 用 M0.5 錄下的 fixtures 寫解析器單元測試（`node:test`）。
  - Cursor 的 `signed_out` 偵測和提醒提前，因為它是最常見的狀態。
- **必改（規格自相矛盾）**：開工順序是 M0 → **M2a → M1**，但 M2a 的驗收要「手機總覽看到 Cursor 長條」，而這需要 M1 的通道。請把 M2a 的驗收改成本機預覽，或把 M1 移到 M2a 前面。

## 5. Schema：有 2 項必改

1. **必改**：「收集失敗時清空該廠商的 limits」會讓一次短暫的 agy 失敗就把額度長條清空。應改成**保留上次成功的 limits**，加上 `last_success_at`，並設 `status: error`。手機端用 `collected_at` 判斷是否過時。
2. **必改**：`today`／`last30` 沒有定義結構，卻放在「穩定」契約裡。要嘛從 v2 拿掉，要嘛寫死成 `null` 並註明保留。

建議改：
- 定義 `window` 的列舉值：`billing_cycle | weekly | 5h | …`。
- `percent` 明定為整數。
- `limits[].at` 和 `collected_at` 重複，二選一。
- 加 `generator_version`，方便手機端提示更新。
- 若顯示順序重要，`providers` 加一個 `order` 欄位。

## 6. 實作順序

1. **M0.5（擴大）**：Cursor API 加 token 是否為明文、`agy` JSON、`node:sqlite` 能否用、無視窗啟動、named tunnel 冒煙測試、ntfy 方案定案。
2. **M0**：schema v2 定稿、`sample.json`、fixture 單元測試。
3. **M2a + M2b 合併**：兩個收集器加 aggregate，先只用 CLI 輸出（agy 路徑已驗證，不必拆開）。
4. **M1**：serve、Bearer、cloudflared 服務、Scriptable 在手機上實測。
5. **watchdog** 與 Task Scheduler。
6. **M3a**：額度和來源失敗通知。
7. **M5**：install、doctor 精修（提前到 M3b 前，乾淨環境安裝是真正的 MVP 門檻）。
8. **M3b**：tasks。
9. **M4**：Codex、Claude。

## 7. Antigravity 資料來源

以下我**沒有在本機驗證**，請以 M0.5 實測為準。

| 來源 | 內容 | 可信度 |
| --- | --- | --- |
| `%LOCALAPPDATA%\agy\bin\agy.exe` 加 `agy -p /usage --output-format json --print-timeout 20s`（別名 `/quota`）、`agy --version` | CLI 額度，首選 | 計畫原文與 AGY_REVIEW 寫「本機已驗證 1.5.18」 |
| `%USERPROFILE%\.gemini\antigravity-cli\` | CLI 設定與對話（`conversations\`、`conversation_summaries.db`） | 計畫原文 |
| `%USERPROFILE%\.gemini\antigravity\` | IDE 的對話與成品，含 `conversations\*.pb`（protobuf）、`brain\<id>\` | 我的印象，格式未公開 |
| `%APPDATA%\Antigravity\User\globalStorage\state.vscdb` | IDE 狀態（VS Code 分支的標準位置） | **請同時檢查**計畫寫的 `Antigravity IDE` 與 `Antigravity` 兩種目錄名 |
| IDE 本機 language server 的 `GetUserStatus` | IDE 額度（社群擴充套件的做法） | **不建議**：要從行程命令列讀 CSRF token，等同讀取憑證 |

## 8. 總評

**建議照此開工，但只開 M0.5。** 開工前先修 4 處：
1. SQLite 改用 `node:sqlite`。
2. 失敗時保留上次成功的 limits。
3. 修正 M2a 驗收和 M1 順序的矛盾。
4. ntfy 方案與 cloudflared 憑證的定位提前到 M0.5 決定。

---

| # | 項目 | 分數／判定 | 重點 |
| --- | --- | --- | --- |
| 1 | 可行性 | 3.5／5 | Cursor token 需要 App 開著才會刷新；改用 `node:sqlite`；Task Scheduler 會閃主控台視窗 |
| 2 | 架構 | 4／5 | 建議改：cloudflared 改成 Windows 服務；把「KeepAlive」改寫成 Task Scheduler 的具體設定 |
| 3 | 安全 | 4／5 | 必改：補上通道憑證、ntfy 方案提前定案；建議改：只開放 `/status.json`、清掃殘留暫存、`meta` 白名單 |
| 4 | MVP 範圍 | 4／5 | 必改：M2a 驗收和 M1 順序矛盾；先加 fixture 測試 |
| 5 | Schema | 必改 2 項 | 失敗時保留上次成功的 limits 並加 `last_success_at`；`today`／`last30` 要定義或拿掉 |
| 6 | 實作順序 | 建議改 | 擴大 M0.5 → M0 → M2a+M2b → M1 → watchdog → M3a → M5 → M3b → M4 |
| 7 | Antigravity 來源 | 4／5 | `agy -p /usage` 為首選；IDE 路徑要確認是否叫 `Antigravity`；不讀 language server 的 CSRF token（我未能本機驗證） |
| 8 | 總評 | 可開工（僅 M0.5） | 計畫紮實，修完上面 4 處就可以進入收集器開發 |

---

## Prior Python-stack review — 2026-11-27 (historical)

Source: local `ask_claude` MCP timed out; fallback `ai-bridge` `runClaude` (`claude -p --output-format text`), 2026-11-27.
Reviewed files: `docs/EXECUTION_PLAN.md` (main tip including agy-review amendments) and `docs/AGY_REVIEW.md`.
Workspace: `C:\workspace\claude-usage-widget` on branch `cursor/claude-plan-review-03e1` (from `origin/main` @ `a32e2d8`).

### Scores (historical)

| # | Topic | Score |
| --- | --- | --- |
| 1 | Feasibility | 3.5/5 |
| 2 | Architecture | 3.5/5 |
| 3 | Security | 3.5/5 |
| 4 | MVP scope | 4/5 |
| 5 | Schema | Must change (see below) |
| 6 | Milestone order | Reorder: M0.5 → M0 → M2a → M1 → M2b → M3a… |
| 7 | Antigravity / agy on Windows | Uncertain independently; accepts AGY_REVIEW local proof |
| 8 | Verdict | Start **only** M0.5 spike now; patch four hard gaps into the plan |

(Full historical verbatim body retained in git history at PR #3 / commit `3d2cf80`.)
