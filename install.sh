#!/bin/bash
# Claude 用量小工具：Mac 端安裝。
#   bash install.sh                 全部安裝（用量匯出＋心跳＋插電不睡）
#   bash install.sh --no-keepawake  不要讓 Mac 插電時保持清醒
#   bash install.sh --no-heartbeat  不要心跳（不檢查、不自動重開 Claude Desktop）
# 可重複執行：已裝過的服務會先停掉再換成新版。
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="${CLAUDE_USAGE_HOME:-$HOME/.claude/token-usage}"
AGENTS="$HOME/Library/LaunchAgents"
SCRIPTABLE="$HOME/Library/Mobile Documents/iCloud~dk~simonbs~Scriptable/Documents"
PREFIX="claude-usage-widget"
KEEPAWAKE=1
HEARTBEAT=1
for a in "$@"; do
  case "$a" in
    --no-keepawake) KEEPAWAKE=0 ;;
    --no-heartbeat) HEARTBEAT=0 ;;
    *) echo "不認得的選項：$a" >&2; exit 2 ;;
  esac
done

PY="$(command -v python3 || true)"
[ -n "$PY" ] || { echo "找不到 python3，請先安裝（例如 brew install python 或 Xcode 命令列工具）。" >&2; exit 1; }
[ -d "$HOME/.claude/projects" ] || echo "提醒：還沒有 ~/.claude/projects，用過 Claude Code 之後才會有資料。"

mkdir -p "$DEST" "$AGENTS"
cp "$HERE/mac/export_usage.py" "$HERE/mac/heartbeat.py" "$DEST/"
mkdir -p "$DEST/preview" && cp "$HERE/tools/preview/index.html" "$DEST/preview/"

# 小工具腳本放進 Scriptable 的 iCloud 資料夾（要先在 iPhone 裝 Scriptable 並開過一次）。
if [ -d "$SCRIPTABLE" ]; then
  cp "$HERE/ios/Claude Token 用量.js" "$SCRIPTABLE/"
  echo "已把小工具腳本放進 Scriptable 的 iCloud 資料夾。"
else
  echo "找不到 Scriptable 的 iCloud 資料夾：請在 iPhone 安裝 Scriptable、打開一次並允許 iCloud，再重跑本腳本；"
  echo "或手動把 ios/Claude Token 用量.js 的內容貼進 Scriptable 的新腳本。"
fi

plist() {  # name, interval(0 = keep running), program args...
  local name="$1" interval="$2"; shift 2
  local file="$AGENTS/$PREFIX.$name.plist"
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
    echo '<plist version="1.0"><dict>'
    echo "  <key>Label</key><string>$PREFIX.$name</string>"
    echo '  <key>ProgramArguments</key><array>'
    for arg in "$@"; do echo "    <string>$arg</string>"; done
    echo '  </array>'
    echo '  <key>RunAtLoad</key><true/>'
    if [ "$interval" = 0 ]; then
      echo '  <key>KeepAlive</key><true/>'
    else
      echo "  <key>StartInterval</key><integer>$interval</integer>"
      echo '  <key>Nice</key><integer>10</integer>'
      echo '  <key>LowPriorityIO</key><true/>'
      echo "  <key>StandardOutPath</key><string>$DEST/$name.log</string>"
      echo "  <key>StandardErrorPath</key><string>$DEST/$name.log</string>"
    fi
    echo '</dict></plist>'
  } > "$file"
  plutil -lint "$file" >/dev/null
  if [ -z "${SKIP_LAUNCHCTL:-}" ]; then
    launchctl bootout "gui/$(id -u)/$PREFIX.$name" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$file"
  fi
  echo "已安裝 $PREFIX.$name"
}
remove() {
  local name="$1"
  local file="$AGENTS/$PREFIX.$name.plist"
  [ -z "${SKIP_LAUNCHCTL:-}" ] && launchctl bootout "gui/$(id -u)/$PREFIX.$name" 2>/dev/null || true
  rm -f "$file"
}

[ "$HEARTBEAT" = 1 ] && plist heartbeat 60 "$PY" "$DEST/heartbeat.py" || remove heartbeat
[ "$KEEPAWAKE" = 1 ] && plist keepawake 0 /usr/bin/caffeinate -s || remove keepawake
# 最後裝匯出：它一啟動就會讀心跳結果並寫出 claude-usage.json。
plist export 300 "$PY" "$DEST/export_usage.py"

echo
echo "完成。Mac 每 5 分鐘把用量寫到 iCloud 的 Scriptable 資料夾（claude-usage.json）。"
echo "第一次執行約需 10–30 秒；記錄在 $DEST/export.log。"
echo "接著照 README 的「iPhone 端」把小工具加到主畫面。"
