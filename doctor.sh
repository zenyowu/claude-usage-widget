#!/bin/bash
# Claude 用量小工具健檢。安裝前後都可以跑，每一項印 [OK] / [!!]（必須修）/ [--]（建議，不影響基本功能）。
#   bash doctor.sh          全部檢查（安裝後）
#   bash doctor.sh --pre    只檢查安裝前需要的東西
#   bash doctor.sh --wait   等匯出第一次寫出資料（最多 90 秒）再檢查
# 結束碼：0 = 沒有必須修的項目；1 = 有。
set -uo pipefail

PRE=0; WAIT=0
for a in "$@"; do case "$a" in --pre) PRE=1 ;; --wait) WAIT=1 ;; esac; done
DEST="${CLAUDE_USAGE_HOME:-$HOME/.claude/token-usage}"
SCRIPTABLE="$HOME/Library/Mobile Documents/iCloud~dk~simonbs~Scriptable/Documents"
EXPORT_LABEL="${DOCTOR_EXPORT_LABEL:-claude-usage-widget.export}"
HEART_LABEL="${DOCTOR_HEARTBEAT_LABEL:-claude-usage-widget.heartbeat}"
FAIL=0
ok()   { echo "[OK] $*"; }
bad()  { echo "[!!] $*"; FAIL=1; }
warn() { echo "[--] $*"; }

# ---- 安裝前 ----
[ "$(uname)" = Darwin ] && ok "macOS" || bad "這個工具只支援 macOS"
PY="$(command -v python3 || true)"
[ -n "$PY" ] && ok "python3：$PY" || bad "找不到 python3：安裝 Xcode 命令列工具（xcode-select --install）或 Homebrew 的 python"
n=$(find "$HOME/.claude/projects" -name '*.jsonl' 2>/dev/null | head -200 | wc -l | tr -d ' ')
[ "$n" -gt 0 ] && ok "找到 Claude Code 使用紀錄（~/.claude/projects）" \
  || bad "沒有 Claude Code 使用紀錄：先用 Claude Code（Desktop 的 Code 分頁或終端機 claude）做過一些事"
CLAUDE_BIN=""
for c in "$HOME/.local/bin/claude" /opt/homebrew/bin/claude /usr/local/bin/claude "$(command -v claude 2>/dev/null)"; do
  [ -n "$c" ] && [ -x "$c" ] && { CLAUDE_BIN="$c"; break; }
done
[ -n "$CLAUDE_BIN" ] && ok "claude CLI：${CLAUDE_BIN}（用來讀 5 小時／每週額度）" \
  || warn "沒有 claude CLI：額度頁會改用 Claude Desktop 的舊紀錄或留空（其他頁不受影響）"
[ -d "$HOME/Library/Mobile Documents/com~apple~CloudDocs" ] && ok "iCloud 雲碟已開啟" \
  || bad "iCloud 雲碟沒開：系統設定 → Apple 帳號 → iCloud → iCloud 雲碟，打開「同步這台 Mac」"
if [ -d "$SCRIPTABLE" ]; then ok "Scriptable 的 iCloud 資料夾存在"
else bad "還沒有 Scriptable 的 iCloud 資料夾：在 iPhone 安裝 Scriptable（App Store 免費）、打開一次並允許 iCloud，一兩分鐘後這台 Mac 會出現該資料夾"; fi
[ -d "/Applications/Claude.app" ] && ok "Claude Desktop 已安裝" \
  || warn "沒有 Claude Desktop：「狀態」「寵物」頁與 Remote Control 心跳需要它"
[ "$PRE" = 1 ] && { echo; [ "$FAIL" = 0 ] && echo "安裝前檢查通過。" || echo "請先處理 [!!] 項目。"; exit "$FAIL"; }

# ---- 安裝後 ----
echo
agent() {  # label → prints state line, returns 0 if loaded
  launchctl print "gui/$(id -u)/$1" >/dev/null 2>&1
}
if agent "$EXPORT_LABEL"; then
  code=$(launchctl print "gui/$(id -u)/$EXPORT_LABEL" | awk '/last exit code/ {print $NF; exit}')
  case "$code" in
    0|""|"exited)") ok "背景匯出（${EXPORT_LABEL}）已載入" ;;   # "(never exited)" = has not finished a run yet
    *) bad "背景匯出上次失敗（exit ${code}）：看 $DEST/export.log" ;;
  esac
else bad "背景匯出沒有載入：執行 bash install.sh"; fi
if agent "$HEART_LABEL"; then ok "心跳（${HEART_LABEL}）已載入"; else warn "沒有心跳（安裝時選了 --no-heartbeat，或還沒安裝）"; fi

JSON="$SCRIPTABLE/claude-usage.json"
if [ "$WAIT" = 1 ]; then
  for _ in $(seq 1 45); do [ -s "$JSON" ] && break; sleep 2; done
fi
if [ -s "$JSON" ]; then
  # Read the file with python (not by rewriting it: only the background job may write it).
  "$PY" - "$JSON" <<'EOF'
import json, sys, datetime
d = json.load(open(sys.argv[1]))
age = (datetime.datetime.now().astimezone() - datetime.datetime.fromisoformat(d["generated"])).total_seconds() / 60
print(("[OK] " if age < 12 else "[!!] ") + "小工具資料 claude-usage.json：%d 分鐘前更新（近 30 天 %d 次回覆）" % (age, d["last30"]["replies"]))
lim = d.get("limits") or []
print(("[OK] 額度：" + "、".join("%s %d%%" % (x["label"], x["percent"]) for x in lim)) if lim else "[--] 這次沒讀到額度（見上方 claude CLI 項目）")
hb = d.get("heartbeat")
if hb: print("[OK] 心跳：Claude %s、Remote Control %s、網路 %s" % ("開著" if hb.get("app_running") else "沒開",
          "服務中" if hb.get("rc_serve") else "關著", "正常" if hb.get("online") else "不通"))
sys.exit(0 if age < 12 else 1)
EOF
  [ $? = 0 ] || FAIL=1
else
  bad "還沒有 claude-usage.json：第一次匯出約需 10–30 秒，用 bash doctor.sh --wait 再看；仍沒有就看 $DEST/export.log"
fi
[ -f "$SCRIPTABLE/Claude Token 用量.js" ] && ok "小工具腳本已在 Scriptable 資料夾" \
  || bad "Scriptable 資料夾裡沒有「Claude Token 用量.js」：重跑 bash install.sh"

echo
if [ "$FAIL" = 0 ]; then
  echo "Mac 端完成。接著在 iPhone：打開 Scriptable 等「Claude Token 用量」出現 → 主畫面加 Scriptable 小工具 → 編輯小工具選這個腳本。"
else
  echo "請先處理 [!!] 項目。"
fi
exit "$FAIL"
