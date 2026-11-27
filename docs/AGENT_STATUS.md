# Agent 狀態小工具（Windows + iPhone）

獨立於原 Mac／Claude Token 用量流程。Stack：**Node.js ≥ 22.13**（無 Python）。

## 快速開始

```powershell
# 在 repo 根目錄
.\install.ps1
.\doctor.ps1 -Wait
```

手動一次：

```powershell
cd win
npm ci --omit=dev
node src/cli.js init-config
node src/cli.js token generate
node src/cli.js aggregate
node src/cli.js watchdog
# 另開視窗：.\doctor.ps1
```

## 里程碑對應

| ID | 內容 |
| --- | --- |
| M0.5 | `docs/SOURCES.md` + `docs/fixtures/*` |
| M0 | `docs/STATUS_SCHEMA.md` + `tools/preview/agent-status-sample.json` + `ios/Agent 狀態.js` |
| Collectors | `win/src/collectors/*` + `aggregate.js` |
| M1 | `serve.js` + `token_mgmt.js` + `docs/TUNNEL.md` |
| M3a | `notify.js` + `watchdog.js` + `install.ps1` / `doctor.ps1` |

詳見 `docs/EXECUTION_PLAN.md`。
