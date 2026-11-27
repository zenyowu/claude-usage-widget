#Requires -Version 5.1
param([switch]$KeepData)

$ErrorActionPreference = "Continue"
$taskName = "AgentStatusWatchdog"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "已移除工作排程：$taskName"

if (-not $KeepData) {
  $home = Join-Path $env:USERPROFILE ".agent-status"
  if (Test-Path $home) {
    Remove-Item -Recurse -Force $home
    Write-Host "已刪除 $home"
  }
} else {
  Write-Host "保留 $($env:USERPROFILE)\.agent-status"
}

Write-Host "請在 iPhone 刪除 Scriptable「Agent 狀態」小工具；cloudflared 服務請自行 cloudflared service uninstall（若有）。"
