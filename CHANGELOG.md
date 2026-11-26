# 更新紀錄

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
