#!/bin/bash
# 停掉並移除 Claude 用量小工具的 Mac 背景服務。資料與腳本留在原處（要刪請自己刪 ~/.claude/token-usage）。
set -uo pipefail
for name in export heartbeat keepawake; do
  launchctl bootout "gui/$(id -u)/claude-usage-widget.$name" 2>/dev/null
  rm -f "$HOME/Library/LaunchAgents/claude-usage-widget.$name.plist"
  echo "已移除 claude-usage-widget.$name"
done
echo "iPhone 上的小工具與 Scriptable 腳本請在手機上自行刪除。"
