# Claude peer review of EXECUTION_PLAN.md

Source: local `ask_claude` MCP timed out; fallback `ai-bridge` `runClaude` (`claude -p --output-format text`), 2026-11-27.
Reviewed files: `docs/EXECUTION_PLAN.md` (main tip including agy-review amendments) and `docs/AGY_REVIEW.md`.
Workspace: `C:\workspace\claude-usage-widget` on branch `cursor/claude-plan-review-03e1` (from `origin/main` @ `a32e2d8`).

## Scores

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

## Consensus vs `docs/AGY_REVIEW.md`

| Topic | AGY | Claude | Notes |
| --- | --- | --- | --- |
| Feasibility | 4/5 | 3.5/5 | Both OK on quotas; Claude more skeptical of undocumented Cursor API + silent source failure |
| Architecture | 4/5 | 3.5/5 | Agree Tunnel+Bearer works; Claude wants offline Scriptable cache and optional Worker-push / CF Access earlier |
| Security | 4/5 | 3.5/5 | Agree CF-Connecting-IP + ntfy ACL check; Claude adds vscdb temp copy hardening, Keychain for Bearer, redact `error`/`host` |
| MVP | 4.5/5 | 4/5 | Both cut extras; Claude adds source-failure notify as higher value than task notify |
| Schema | 4/5 + optional `limits[].group` | **Must** define `tasks[]` fields; unify `needs_user` vs `waiting_*`; optional raw used/limit | Conflict: Claude treats schema gaps as blocking |
| Milestone | 4/5; spike before final schema | Hard gate: no collectors/Tunnel until M0.5 fixtures | Aligned direction; Claude stricter |
| Antigravity paths | 4.5/5 locally verified | Cannot independently verify; trust AGY_REVIEW | No factual conflict on paths/CLI |
| Start now? | After small fixes | Yes, but **only M0.5** until fixtures land | Soft conflict on how much to start |

**Shared must-dos:** one logged-in-user watchdog; verify ntfy ACL tier before M3a; rate-limit by `CF-Connecting-IP`; unify waiting-state naming; keep live `tasks[]` best-effort.

**Claude-only hard gaps to fold into the plan:** Scriptable last-success cache for sleep/offline; Bearer in Scriptable Keychain (not Parameter); define `tasks[]` row fields; treat M0.5 fixtures as a hard gate.

---

## Full Claude reply (verbatim)

# EXECUTION_PLAN.md 審查意見（Agent Status Widget）

我只讀了 `docs/EXECUTION_PLAN.md` 和 `docs/AGY_REVIEW.md`，沒有改任何檔案。下面的判斷是我自己的。我沒在本機跑過 `agy` 或 Cursor API，標「不確定」的地方都要在 M0.5 實際測過。

---

## 1. 可行性：3.5 / 5

**額度：大致做得到。任務狀態：不太做得到。**

- **Cursor 額度**
  - 從 `state.vscdb` 讀 `cursorAuth/accessToken`，再打 api2.cursor.sh，這做法社群工具確實有人用。
  - **我無法確認 `DashboardService/GetCurrentPeriodUsage` 這個 endpoint 和它的欄位名稱。** M0.5 必須實際抓一份回應存成 fixture。
  - 風險一：這是未公開的 API，Cursor 的計費模式（以次數計或以金額計）2025 年已經改過幾次，欄位隨時可能再變。
  - 風險二：access token 的更新靠 Cursor App 本身。如果 App 很久沒開，token 會過期，結果就是 `signed_out`，計畫裡沒有提到這個情況。
- **Antigravity 額度**：AGY_REVIEW 說已在 1.5.18 上實測成功，我接受這是本機事實，但我自己無法獨立證實（見第 7 點）。
- **任務狀態（tasks[]）**：兩邊都只能從 SQLite 或對話紀錄去反推，沒有正式介面。版本一升，對應方式就可能失效。計畫把它降為盡力而為（best-effort）是對的。
- **最大風險**：兩個資料源都是未公開的介面，而且這台 PC 上沒人盯著。壞掉時只會「默默變成空的」。計畫有考慮「資料過期」的告警，但**沒有「資料源壞掉」的告警**。

## 2. 架構：3.5 / 5

**Tunnel + Bearer 能用，但有兩個問題沒處理：**

1. **電腦睡著時，小工具根本拿不到資料。** Tunnel 斷了，Cloudflare 會回錯誤，連 `generated` 都讀不到，所以「依時間判斷過期」那套邏輯無從運作。
   - 必改：Scriptable 端要用 `FileManager.local()` 存下最後一份成功的 JSON。請求失敗時顯示這份快取，並標「可能睡著／離線」。
2. **替代方案：改成由電腦主動推送。** 做法是 PC 定時把 `status.json` 推到 Cloudflare Worker + KV（或 R2），iPhone 從 Worker 讀。
   - 好處：PC 完全不對外開放任何連線入口，也不用常駐 cloudflared；電腦睡著時手機自然讀到最後一份；攻擊面明顯更小。
   - 代價：要部署一個 Worker，而且 Worker 上要有一組「寫入 token」（屬於另一類憑證）。
   - 建議：若暫時維持 Tunnel，至少把 **Cloudflare Access service token** 從 M5 提早成 M1 的選用項。Scriptable 的 `Request` 可以加 `CF-Access-Client-Id/Secret` 這兩個 header，這樣掃描器在 Cloudflare 邊緣就被擋掉，到不了你的 PC。
- **ntfy**：可以。但 notify 每 1 分鐘檢查一次、aggregate 每 5 分鐘才更新一次，額度告警每分鐘檢查沒有意義。建議合併成單一 watchdog 的同一個迴圈。只有在任務狀態真的需要更快時，才另開一個較快的迴圈。

## 3. 安全：3.5 / 5

憑證分成三類的架構是對的，但有幾個缺口：

| 缺口 | 建議 |
| --- | --- |
| **把 Cursor 的 vscdb 複製到暫存資料夾，等於在磁碟上多了一份 access token** | 暫存資料夾權限只給目前使用者；讀完立即刪除（用 `try/finally`）；不要放在共用的 `%TEMP%` 根目錄 |
| Bearer 放在 Scriptable 小工具的 **Parameter** | 「編輯小工具」畫面看得到，截圖或分享時容易外洩。改存 Scriptable 的 `Keychain`，Parameter 只放頁面名稱 |
| ntfy.sh「必須有發布 token」 | **不確定**免費帳號能不能對 topic 做存取控制。我的印象是保留 topic 要付費，未保留的 topic 有 token 也擋不住別人發布。M3a 前要先確認，不行就自架 ntfy，或承認實際防護只有「topic 夠難猜」 |
| 依 `CF-Connecting-IP` 限流 | 方向正確。但 serve 只綁本機、本機其他程式可以偽造這個 header，doctor 應說明這個信任邊界 |
| `error` 是自由文字 | 可能把本機路徑或使用者名稱帶到公開 JSON。對外只送 `error_code` 加固定好的繁中訊息 |
| `host: "TW_ZY_26"` | 會洩漏機器名稱。改成使用者自訂的別名，或拿掉 |
| `endpoint.token` 的檔案權限寫「能做到再做」 | Windows 用 `icacls` 一定做得到，改成**必做** |

## 4. MVP 範圍：4 / 5

整體切得算合理。

- **先砍**
  - `rotate` 的 24 小時寬限期：MVP 只要 `generate`／`rotate` 就好。
  - `heartbeat.py`。
  - Cursor 的 CSV 用量帳本。
  - `today/last30` 的次數統計（不準又費工）。
  - 各 provider 的獨立頁面（先只做總覽）。
- **先加**
  1. 小工具端快取最後一份資料（第 2 點）。
  2. Token 存 Keychain。
  3. 「資料源失效」推播：某個 provider 連續 N 次 `error/signed_out` 就推一次，例如「Cursor：登入過期，請開一次 Cursor」。這比任務告警更有用。
  4. 只用單一 watchdog，加上日誌輪替。

## 5. Schema：**是，有必改**

- **`tasks[]` 的每一列根本沒定義欄位**，只定義了 `state`。必須補上：`id`、`provider`、`title`（截斷）、`state`、`since`、`updated_at`。
- **狀態名稱不一致**：M3b 寫 `needs_user`，§4 和 §7 寫 `waiting_user/waiting_approval`。二選一，統一。
- `limits[]`
  - 加選填的 `used`、`limit`、`unit_raw`（例如 `usd`、`requests`），保留原始數值。Cursor 的百分比和金額會對不上，有原始值才好除錯。
  - `percent` 允許 `null`，用在無上限或未知的情況。
  - `quality` 的列舉值要寫清楚（`exact` | `estimated` | ...）。
- `resets_text` 是顯示用的字串，不該放進傳輸格式，交給小工具依手機時區自己格式化。
- `today`／`last30` 要明確允許整個值是 `null`。
- `host` 和 `error` 依第 3 點處理。
- `generated` 加上各 provider 的 `collected_at` 這個設計可以保留。

## 6. 實作順序

我會改成一條一條打通的直線，先證明資料拿得到，再做傳輸：

1. **M0.5 資料源實測**：Cursor 和 agy 各抓一份真實回應，去敏後存成 fixture，寫進 `SOURCES.md`。**這一步沒過就不往下做。**
2. **M0 定案 schema**：依 fixture 定 schema、做 `sample.json`、Scriptable 總覽頁（含本機快取與過期顯示）。
3. **M2a Cursor 收集器 + 單一 watchdog（aggregate + 只開本機的 serve）**。
4. **M1 Bearer + 正式命名的 Tunnel**（選配 Access service token）。完成後手機上看得到 Cursor 的額度條。
5. **M2b Antigravity**，各 provider 失敗時各自降級，互不影響。
6. **M3a ntfy**：額度告警 + 「資料源失效」告警。開始前先確認 ntfy 的存取控制支援程度。
7. M3b 任務 → M5 安裝與文件打磨 → M4 Codex 與 Claude。

## 7. Antigravity / agy 在 Windows 的實際可行性

- **不確定**：以我的知識，無法獨立證實 `agy` 這支 CLI，以及 `-p /usage --output-format json`、`--print-timeout` 這些參數存在。我只能以 AGY_REVIEW 的本機實測（1.5.18）為準。M0.5 的 fixture 必須是真實輸出。
- **版本門檻有疑點**：`≥ 1.1.11` 這個數字的來源沒寫，實測的是 1.5.18。
  - 建議改成「檢查 JSON 結構」：`command.data.groups[].buckets[]` 存在，而且檢查條件全過，就接受。
  - 版本號只當輔助提示，因為 `--version` 的輸出格式本身也可能改。
- **防護條件是事後檢查**：`num_turns==0`、`total_tokens==0` 只能在執行完之後才知道。如果真的消耗了一輪，傷害已經發生。建議：
  - agy 降到每 15 分鐘查一次，並快取結果。
  - 一旦有一次檢查沒過，**自動停用**這個收集器，並推播通知，而不是下一輪繼續跑。
  - **不確定** `/usage` 本身會不會被限流或計入用量。
- **Windows 實務問題**
  - 排程器或 watchdog 的 PATH 和互動式 shell 不一樣。安裝時應把 `agy.exe` 的**絕對路徑**寫進 config，不要每次執行再找。
  - 用 `CREATE_NO_WINDOW` 或 `pythonw` 執行，避免每 5 分鐘跳出一個主控台視窗。
  - 登入過期時，agy 可能想開瀏覽器。要靠 timeout 加上 `signed_out` 對應來處理，不能讓它卡住。
- Credential Manager 的 `gemini:antigravity`：收集器**不應讀取**它，計畫可以直接寫成禁止。
- 路徑方面：`~\.gemini\antigravity-cli\` 和 `~\.gemini\antigravity\` 只用來嘗試找任務資料。這和 AGY_REVIEW 的結論一致，我沒有能反駁的依據。

## 8. 總評

計畫已經相當成熟，但有四個硬傷：小工具端沒有快取（電腦睡著就顯示不了）、`tasks[]` 沒定義欄位、Bearer 存放位置、ntfy 的存取控制是否真的可用。**建議現在就開工，但只開工 M0.5 資料源實測**，同時把以上四點補進計畫。實測證明 Cursor API 和 agy 的 JSON 都拿得到之後，再進入 Tunnel 與正式的收集器。
