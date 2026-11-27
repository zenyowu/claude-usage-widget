# Cloudflare Tunnel（命名通道）

正式安裝**必須**用 Named Tunnel；Quick Tunnel 只適合冒煙測試（URL 會變、無穩定 DNS）。

## 建議架構

1. Node watchdog 只綁 `127.0.0.1:8787`（`serve` 內建於 watchdog）。
2. **cloudflared 裝成 Windows 服務**（`cloudflared service install`），不要由 watchdog 監管（服務可用 SYSTEM；不碰廠商登入憑證）。
3. Ingress 只轉到 `http://127.0.0.1:8787`。
4. 手機 Scriptable 用 HTTPS 主機名 + Keychain Bearer 讀 `/status.json`。
5. `/healthz` 可對外也可靠 WAF／路徑規則只留本機；MVP 不強制 Cloudflare Access。

## 步驟摘要

```powershell
# 登入並建立 tunnel（互動，需你自己的 Cloudflare 帳號）
cloudflared tunnel login
cloudflared tunnel create agent-status
# 編輯 %USERPROFILE%\.cloudflared\config.yml（參考 win/cloudflared.yml.example）
cloudflared tunnel route dns agent-status agent-status.example.com
cloudflared service install
```

憑證 JSON（`~\.cloudflared\<id>.json`）屬**通道控制平面憑證**：勿提交 git、勿塞進 status.json。

## Scriptable

1. 執行 `ios/Agent 狀態.js` 一次，把 `https://你的主機名` 與 Bearer 存進 Keychain。
2. 小工具 Parameter 只填頁面：`overview` / `tasks` / `cursor` / `antigravity`。
