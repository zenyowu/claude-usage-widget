#Requires -Version 5.1
<#
.SYNOPSIS
  Install Agent Status Widget (Node.js) on Windows.
.DESCRIPTION
  Creates %USERPROFILE%\.agent-status, npm install, endpoint token, ntfy topic,
  and one Task Scheduler KeepAlive job for the watchdog (logged-in user).
  No Python. Named Cloudflare Tunnel is required for production; Quick Tunnel = smoke only.
#>
param(
  [string]$NodePath = "",
  [switch]$SkipTask,
  [switch]$SkipNtfyPrompt
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Zh($msg) { Write-Host $msg }

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$WinDir = Join-Path $RepoRoot "win"
$HomeDir = Join-Path $env:USERPROFILE ".agent-status"

function Resolve-Node {
  if ($NodePath -and (Test-Path $NodePath)) { return (Resolve-Path $NodePath).Path }
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) { throw "找不到 Node.js。請安裝 Node ≥ 22.13 並加入 PATH，或用 -NodePath。" }
  return $cmd.Source
}

$node = Resolve-Node
$ver = & $node -v
if ($ver -notmatch '^v?(2[2-9]|[3-9]\d)\.') {
  Write-Warning "建議 Node ≥ 22.13（目前 $ver）。node:sqlite 需要 22.13+。"
}

Write-Zh "建立 $HomeDir …"
New-Item -ItemType Directory -Force -Path $HomeDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $HomeDir "tmp") | Out-Null

# User-only ACL on the whole state directory (DOMAIN\user form)
$who = (whoami).Trim()
try {
  icacls $HomeDir /inheritance:r /grant:r "${who}:(OI)(CI)F" | Out-Null
} catch {
  Write-Warning "無法設定 icacls，請手動限制 $HomeDir 權限。"
}

Write-Zh "安裝 npm 依賴（win/）…"
Push-Location $WinDir
$npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
$npm = if ($npmCmd) { $npmCmd.Source } else { "npm" }
if (Test-Path "package-lock.json") {
  & $npm ci --omit=dev
} else {
  & $npm install --omit=dev
}
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
Pop-Location

$env:AGENT_STATUS_NODE = $node
$cli = Join-Path $WinDir "src\cli.js"

# ntfy topic + placeholder token
$topic = -join ((48..57 + 97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
$ntfyToken = ""
if (-not $SkipNtfyPrompt) {
  Write-Zh ""
  Write-Zh "ntfy：免費 ntfy.sh 無法強制發布 ACL。請擇一："
  Write-Zh "  1) 自架／付費 ntfy 並貼上 publish token"
  Write-Zh "  2) 先只用高熵 topic（風險：猜到 topic 就能發）"
  $ntfyToken = Read-Host "ntfy publish token（可留空稍後再填）"
}

& $node $cli init-config | Out-Null
# Patch topic/token into config.toml
$cfgPath = Join-Path $HomeDir "config.toml"
if (Test-Path $cfgPath) {
  $agy = Join-Path $env:LOCALAPPDATA "agy\bin\agy.exe"
  $agyLine = if (Test-Path $agy) { $agy -replace '\\', '\\' } else { "" }
  $text = Get-Content $cfgPath -Raw
  $text = $text -replace 'topic = ".*"', "topic = `"$topic`""
  $text = $text -replace 'token = ".*"', "token = `"$ntfyToken`""
  if ($agyLine) {
    $text = $text -replace 'agy_path = ".*"', "agy_path = `"$($agy -replace '\\','\\')`""
  }
  Set-Content -Path $cfgPath -Value $text -Encoding UTF8
}

Write-Zh "產生 endpoint Bearer…"
$tokenOut = & $node $cli token generate

# Task Scheduler — at logon, restart on failure, do not start a second instance
if (-not $SkipTask) {
  $taskName = "AgentStatusWatchdog"
  $cmdPath = Join-Path $WinDir "agent-status.cmd"
  $actionArgs = "-WindowStyle Hidden -NoProfile -Command `"`$env:AGENT_STATUS_NODE='$node'; & '$cmdPath' watchdog`""
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArgs
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew -StartWhenAvailable
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
  Write-Zh "已註冊工作排程器：$taskName（登入時啟動 watchdog）"
  Start-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
}

Write-Zh ""
Write-Zh "=== 安裝完成（請立刻抄下，不會再完整顯示）==="
Write-Zh "1) Endpoint Bearer：見上方 token generate 輸出 → 存進 iPhone Scriptable Keychain"
Write-Zh "2) ntfy topic：$topic"
Write-Zh "3) 命名 Cloudflare Tunnel：把 ingress 指到 http://127.0.0.1:8787"
Write-Zh "   建議：cloudflared service install（Windows 服務），不要用 Quick Tunnel 當正式環境"
Write-Zh "4) iPhone：安裝 Scriptable，加入「Agent 狀態」小工具；Parameter 填 overview／tasks／cursor／antigravity"
Write-Zh "5) 驗證：.\doctor.ps1"
Write-Zh ""
Write-Zh "安全提醒：Bearer 不要放進小工具 Parameter；ntfy 免費版無 ACL，請用高熵 topic + publish token 或自架。"
