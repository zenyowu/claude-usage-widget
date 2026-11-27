@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
REM Prefer PATH node; install.ps1 may set AGENT_STATUS_NODE
if defined AGENT_STATUS_NODE (
  "%AGENT_STATUS_NODE%" "%SCRIPT_DIR%src\cli.js" %*
) else (
  node "%SCRIPT_DIR%src\cli.js" %*
)
endlocal
