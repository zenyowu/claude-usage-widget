# 更新紀錄

## 2026-11-26（深夜）

### 第八頁「洞察」：每則回覆背後發生了什麼

Mac 端多讀逐字稿裡的使用者與系統紀錄（不只帶 usage 的回覆），近 30 天新增 `insights`：

| 指標 | 來源欄位 |
| --- | --- |
| 你送出的訊息數、你說一句它回幾次 | 使用者訊息（排除工具結果、系統注入、子代理與壓縮摘要） |
| 每回合平均動手幾次 | 回覆的 `stop_reason`：`tool_use` ÷ `end_turn` |
| 思考占輸出、思考時間中位數與 p90 | `usage.output_tokens_details.thinking_tokens`、`thinkingDurationMs` |
| 工具成功率、逾時 | `tool_result.is_error`、`toolUseResult.timedOutAfterMs` |
| 中斷、壓縮對話與當時 token 數、API 錯誤 | `[Request interrupted`、`compact_boundary.compactMetadata.preTokens`、`api_error` |
| 子代理實際模型 | `toolUseResult.resolvedModel` |
| 自動核准／親手核准／擋下 | `permissionDecision` |
| Claude Code 版本、碰過的 git 分支數 | `version`、`gitBranch` |

使用者訊息的分類以抽樣檢查：計入的都是人打的指令，任務通知、子代理訊息、壓縮摘要與圖片說明都被排除。
匯出時間由約 4 秒增為約 13 秒（每 5 分鐘一次、低優先權）。

## 2026-11-26（晚）

### 新功能

- **鎖定畫面小工具**：圓形（5 小時額度圓環；有人等你時寫「等你 N」）、長方形（額度、即時倒數、每週額度、今天用量）、
  單行（一句話摘要）。全白繪製，由 iOS 依鎖定畫面配色上色。
- **第七頁「日曆」**：半年使用熱力圖（中尺寸 26 週、大尺寸 20 週較大的格子），目前與最長連續天數、最忙的一週。
  Mac 端新增 `calendar`（182 天每日用量，來自 CSV 帳本，逐字稿被清掉的日子也在）與 `best_streak`。
- **Siri 語音摘要**：從捷徑或 Siri 執行時回傳一句可朗讀的話（額度、剩多久重置、誰在等你、今天用量）。
- 預覽器：`&lock=1` 看鎖定畫面三種樣式。

驗證：預覽器檢查日曆三種尺寸與鎖定畫面三種樣式，無超框；Siri 摘要以 node 實跑（有資料／讀不到資料兩種）；Mac 端匯出在背景服務實跑、產出 182 天日曆。
尚未在 iPhone 實機確認鎖定畫面的實際字級與上色（Scriptable 官方文件站目前無法連線，依已知 API 實作）。

## 2026-11-26

### 交給 Claude 就能自動設定

在 Mac 打開 Claude Code，貼上 README 最上面那一句，Claude 會依 [CLAUDE.md](CLAUDE.md)：

1. 取得 repo（`~/claude-usage-widget`）
2. `doctor.sh --pre` 檢查環境
3. 問兩個選項：插電時是否保持清醒、是否要心跳
4. 執行 `install.sh`
5. `doctor.sh --wait` 驗證全部 `[OK]`
6. 帶使用者做 iPhone 上的 4 步（安裝 Scriptable、加小工具、選腳本、填參數；Apple 不允許程式代勞）

新增檔案：

| 檔案 | 作用 |
| --- | --- |
| `CLAUDE.md` | 給 Claude 的安裝說明書：完成條件、每一步的指令、iPhone 步驟範本、規則與疑難排解。Claude Code 開這個 repo 時會自動讀 |
| `AGENTS.md` | 讓 Codex、Cursor 等其他 AI 工具也找到同一份流程 |
| `doctor.sh` | 健檢：每項 `[OK]`／`[!!]`（必須修）／`[--]`（建議），附修法 |

CLAUDE.md 規定代理不能做的事：不從終端機直接寫 iCloud 上的資料檔（會讓背景服務之後卡住）、不讀不印任何登入憑證、
只動這個工具自己的檔案、不替使用者在 App Store 下載或購買。

其他改進：

- 先裝 Mac 端、後裝 Scriptable 也可以：背景匯出發現 Scriptable 資料夾出現後，5 分鐘內自動放好小工具腳本，不必重跑安裝。
- 修正：bash 變數後面緊接中文時會被誤讀成變數名稱的一部分。

驗證：

- 已安裝的 Mac 上 `doctor.sh` 13 項全部 `[OK]`、結束碼 0；空的家目錄正確列出 6 個 `[!!]`、結束碼 1。
- 「晚裝 Scriptable」情境：腳本自動補上，內容與原檔一致。
- 從 GitHub 重新 clone：`.sh` 可直接執行，`doctor.sh --pre` 通過，`install.sh` 在隔離的假家目錄安裝成功。
- 尚未驗證：在一台全新的 Mac 上由另一位使用者把那句話交給 Claude、從頭跑完。

### 六頁 × 三種尺寸模擬圖

README 每一頁改成小／中／大對照表，共 18 張（示範資料，不含任何真實帳號資訊），由預覽器的 `only=`／`shot=` 單一小工具模式輸出。
預覽器同時修正：WebKit 下文字只超出一點點時會被截成「…」，現在與 iPhone 一樣先縮小字級。

### 第一版

- iPhone Scriptable 小工具，六頁：用量、趣味、更多、狀態、寵物（小克）、額度；小、中、大三種尺寸。
- Mac 端：每 5 分鐘匯出用量與方案額度、每分鐘心跳（Claude Desktop、Remote Control、網路），插電時可保持清醒。
- 「幾分鐘前」與重置倒數由 iOS 即時跳動；額度一重置就請 iOS 刷新。
- 安裝／移除腳本、瀏覽器預覽器與示範資料、MIT 授權。
