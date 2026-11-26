#!/usr/bin/env python3
"""Heartbeat for Claude Desktop Remote Control, run every minute by launchd (claude-usage-widget.heartbeat).

Each beat checks that the Mac is awake (a beat only runs when it is), that Claude Desktop is running
(it is reopened in the background if it is not), that Remote Control is serving, and that the network
reaches Anthropic. The result goes to heartbeat.json next to this file; export_usage.py copies it into
the widget data. It never sends a message to a session, so it uses no tokens.

Pause the automatic reopen by creating heartbeat.pause next to this file (for example when you quit
Claude on purpose); delete the file to resume.
"""
import datetime, glob, json, os, socket, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, "heartbeat.json")
PAUSE = os.path.join(HERE, "heartbeat.pause")
APP = "/Applications/Claude.app/Contents/MacOS/Claude"
SESSION_BIN = "/Library/Application Support/Claude/claude-code/"
RC_STATE = os.path.expanduser("~/Library/Application Support/Claude/remote-control-state.json")
now = datetime.datetime.now().astimezone()

try:
    with open(STATE) as f:
        prev = json.load(f)
except (OSError, ValueError):
    prev = {}
events = prev.get("events", [])


def event(text):
    events.append([now.isoformat(timespec="seconds"), text])


procs = subprocess.run(["ps", "-axo", "comm="], capture_output=True, text=True).stdout.splitlines()
app_running = APP in procs
session_procs = sum(1 for p in procs if SESSION_BIN in p)

# A gap well over the 60 s interval means the Mac slept (launchd does not run jobs while asleep).
last = prev.get("beat")
if last:
    gap = (now - datetime.datetime.fromisoformat(last)).total_seconds()
    if gap > 180:
        event("Mac 醒來（中斷 %d 分鐘）" % round(gap / 60))

reopened = False
if not app_running:
    if os.path.exists(PAUSE):
        event("Claude 沒開（已暫停自動重開）")
    else:
        # -g: do not bring it to the front; -j: launch hidden.
        r = subprocess.run(["open", "-g", "-j", "-b", "com.anthropic.claudefordesktop"], capture_output=True, text=True)
        reopened = r.returncode == 0
        event("Claude 沒開，已在背景重新打開" if reopened else "Claude 沒開，重開失敗：" + r.stderr.strip()[:80])

try:
    with open(RC_STATE) as f:
        rc = json.load(f)
    rc_serve = any(v.get("serve") == "on" for v in (rc.get("identities") or {}).values())
except (OSError, ValueError):
    rc_serve = None

try:
    socket.create_connection(("api.anthropic.com", 443), timeout=5).close()
    online = True
except OSError:
    online = False
if prev.get("online") is not None and online != prev.get("online"):
    event("網路恢復" if online else "連不到 Anthropic")
if prev.get("rc_serve") is not None and rc_serve != prev.get("rc_serve"):
    event("Remote Control 開啟" if rc_serve else "Remote Control 關閉")

assertions = subprocess.run(["pmset", "-g", "assertions"], capture_output=True, text=True).stdout
keep_awake = any("(caffeinate)" in l and "PreventSystemSleep" in l for l in assertions.splitlines())
on_ac = "AC Power" in subprocess.run(["pmset", "-g", "batt"], capture_output=True, text=True).stdout
# Only report a missing keep-awake when one is installed (the installer makes it optional).
keep_awake_expected = bool(glob.glob(os.path.expanduser("~/Library/LaunchAgents/*keepawake*.plist")))

state = {"beat": now.isoformat(timespec="seconds"), "app_running": app_running or reopened, "reopened": reopened,
         "session_procs": session_procs, "rc_serve": rc_serve, "online": online, "keep_awake": keep_awake, "keep_awake_expected": keep_awake_expected,
         "on_ac": on_ac, "paused": os.path.exists(PAUSE), "beats": prev.get("beats", 0) + 1,
         "since": prev.get("since") or now.isoformat(timespec="seconds"), "events": events[-20:]}
tmp = STATE + ".tmp"
with open(tmp, "w") as f:
    json.dump(state, f, ensure_ascii=False)
os.replace(tmp, STATE)
