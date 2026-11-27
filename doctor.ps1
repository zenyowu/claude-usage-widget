#Requires -Version 5.1
param(
  [switch]$Wait,
  [string]$NodePath = ""
)

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$script:Fail = 0
function OK($m) { Write-Host "[OK] $m" }
function Bad($m) { Write-Host "[!!] $m"; $script:Fail++ }
function Info($m) { Write-Host "[--] $m" }

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$WinDir = Join-Path $RepoRoot "win"
$HomeDir = Join-Path $env:USERPROFILE ".agent-status"

function Resolve-Node {
  if ($NodePath -and (Test-Path $NodePath)) { return (Resolve-Path $NodePath).Path }
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) { return $null }
  return $cmd.Source
}

$node = Resolve-Node
if (-not $node) { Bad "找不到 Node.js（需要 ≥ 22.13）" }
else {
  $ver = & $node -v
  if ($ver -match '^v?(2[2-9]|[3-9]\d)\.') { OK "Node.js $ver" }
  else { Bad "Node.js $ver 過舊，請升級到 ≥ 22.13（node:sqlite）" }
}

if ($env:OS -notmatch 'Windows') { Bad "此 doctor 僅支援 Windows" } else { OK "Windows" }

if (Test-Path (Join-Path $WinDir "node_modules")) { OK "win/node_modules 存在" }
else { Bad "缺少 win/node_modules，請在 win/ 執行 npm ci --omit=dev" }

$cursorDb = Join-Path $env:APPDATA "Cursor\User\globalStorage\state.vscdb"
if (Test-Path $cursorDb) { OK "找到 Cursor state.vscdb" } else { Info "找不到 Cursor 資料（未安裝或未登入）" }

$agy = Join-Path $env:LOCALAPPDATA "agy\bin\agy.exe"
if (Test-Path $agy) { OK "找到 agy：$agy" } else { Info "找不到 agy（Antigravity CLI）" }

$tokenPath = Join-Path $HomeDir "endpoint.token"
if (Test-Path $tokenPath) {
  OK "endpoint.token 存在"
  try {
    $acl = icacls $tokenPath 2>$null | Out-String
    if ($acl -match 'Everyone|Authenticated Users|BUILTIN\\Users') {
      Bad "endpoint.token ACL 可能過寬，請 icacls 設成僅目前使用者"
    } else { OK "endpoint.token ACL 看起來非共用群組" }
  } catch { Info "無法檢查 ACL" }
} else { Bad "缺少 endpoint.token（請跑 install.ps1 或 node win/src/cli.js token generate）" }

$cfg = Join-Path $HomeDir "config.toml"
if (Test-Path $cfg) {
  OK "config.toml 存在"
  $raw = Get-Content $cfg -Raw
  if ($raw -match 'topic = ""' -or $raw -notmatch 'topic = ".+"') { Info "ntfy topic 尚未設定" }
  else { OK "ntfy topic 已設定" }
  if ($raw -match 'token = ""') {
    Info "ntfy publish token 空白 — 免費 ntfy.sh 無 ACL，僅靠高熵 topic"
  }
} else { Info "尚無 config.toml" }

Info "信任邊界：/status.json 失敗次數以 CF-Connecting-IP 限速；本機行程可偽造此標頭"

# Probe localhost
$port = 8787
if (Test-Path $cfg) {
  $m = Select-String -Path $cfg -Pattern '^\s*port\s*=\s*(\d+)' | Select-Object -First 1
  if ($m) { $port = [int]$m.Matches[0].Groups[1].Value }
}

function Probe-Health {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/healthz" -UseBasicParsing -TimeoutSec 3
    return $r.StatusCode -eq 200
  } catch { return $false }
}

if ($Wait) {
  Write-Host "等待 /healthz 最多 90 秒…"
  $deadline = (Get-Date).AddSeconds(90)
  while ((Get-Date) -lt $deadline) {
    if (Probe-Health) { break }
    Start-Sleep -Seconds 2
  }
}

if (Probe-Health) { OK "localhost /healthz" }
else { Bad "localhost /healthz 無回應（請啟動 watchdog：win\agent-status.cmd watchdog）" }

$token = $null
if (Test-Path $tokenPath) {
  try {
    $token = (Get-Content $tokenPath -Raw -ErrorAction Stop).Trim()
  } catch {
    # Fallback: node can often read when PowerShell ACL check is awkward
    if ($node) {
      $token = & $node -e "process.stdout.write(require('fs').readFileSync(process.argv[1],'utf8').trim())" $tokenPath 2>$null
    }
    if (-not $token) { Info "無法讀取 endpoint.token（ACL？）— 略過 Bearer 探測" }
  }
}

if ($token) {
  try {
    $bad = Invoke-WebRequest -Uri "http://127.0.0.1:$port/status.json" -Headers @{ Authorization = "Bearer wrong" } -UseBasicParsing -TimeoutSec 3
    Bad "/status.json 錯 token 應為 401，實際 $($bad.StatusCode)"
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 401) { OK "/status.json 錯 token → 401" }
    else { Bad "/status.json 錯 token 狀態碼 $code" }
  }
  try {
    $ok = Invoke-WebRequest -Uri "http://127.0.0.1:$port/status.json" -Headers @{ Authorization = "Bearer $token" } -UseBasicParsing -TimeoutSec 3
    if ($ok.StatusCode -eq 200) { OK "/status.json 正確 token → 200" }
    else { Bad "/status.json 正確 token → $($ok.StatusCode)" }
  } catch {
    Bad "/status.json 正確 token 失敗：$($_.Exception.Message)"
  }
}

$statusPath = Join-Path $HomeDir "status.json"
if (Test-Path $statusPath) {
  $age = (Get-Date) - (Get-Item $statusPath).LastWriteTime
  if ($age.TotalMinutes -lt 12) { OK "status.json 年齡 $([int]$age.TotalMinutes) 分鐘" }
  else { Info "status.json 較舊（$([int]$age.TotalMinutes) 分鐘）— PC 可能睡著或尚未 aggregate" }
} else { Info "尚無 status.json（跑 aggregate 或等 watchdog）" }

if ($script:Fail -eq 0) {
  Write-Host ""
  Write-Host "doctor 通過（無 [!!]）"
  exit 0
} else {
  Write-Host ""
  Write-Host "doctor 失敗：$script:Fail 項 [!!]"
  exit 1
}
