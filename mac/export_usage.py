#!/usr/bin/env python3
"""Claude token usage from local Claude Code transcripts (~/.claude/projects/**/*.jsonl).

Writes usage-daily.csv: one row per local day, model and app (Claude Desktop Code tab or CLI) with
input (uncached), output, cache_write, cache_read and the number of replies. Each reply is counted
once (the same message id and request id can appear on several lines). Desktop chat conversations
are kept on Claude's servers and are not in these files.
"""
import csv, datetime, glob, json, os, re, signal, sys
from collections import defaultdict

DAYS = int(os.environ.get("USAGE_DAYS", "90"))
root = os.path.expanduser("~/.claude/projects")
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "usage-daily.csv")
now = datetime.datetime.now().astimezone()
since = (now - datetime.timedelta(days=DAYS)).replace(hour=0, minute=0, second=0, microsecond=0)
fields = ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")
rows = defaultdict(lambda: [0, 0, 0, 0, 0])
seen = set()
# Extra detail for the widget, last 30 days only.
start30 = (now - datetime.timedelta(days=29)).replace(hour=0, minute=0, second=0, microsecond=0)
home_prefix = os.path.expanduser("~").replace("/", "-")
# API list prices per million tokens (input, output) and cache-read multiplier, from the claude-api skill
# (2026-11-03). Cache writes: 1.25x input for the 5-minute TTL, 2x for the 1-hour TTL.
PRICES = {"claude-fable-5-2": (8, 40, 0.025), "claude-mythos-5-2": (8, 40, 0.025), "claude-fable-5-1": (10, 50, 0.025), "claude-fable-5": (10, 50, 0.1),
          "claude-opus-5-5": (4, 20, 0.05), "claude-opus-5": (5, 25, 0.1), "claude-opus-4-8": (5, 25, 0.1),
          "claude-opus-4-7": (5, 25, 0.1), "claude-opus-4-6": (5, 25, 0.1), "claude-sonnet-5-5": (2, 10, 0.05),
          "claude-sonnet-5": (2, 10, 0.1), "claude-sonnet-4-6": (3, 15, 0.1), "claude-haiku-5-5": (0.1, 0.5, 0.1),
          "claude-haiku-4-5": (1, 5, 0.1)}
hours = [[0, 0] for _ in range(24)]          # replies, output tokens by local hour
weekdays = [0] * 7                           # replies by weekday (Mon=0)
projects = defaultdict(lambda: [0, 0])       # tokens, replies
apps = defaultdict(int)                      # actual tokens by app
cost = [0.0, 0.0]                            # API-price estimate with cache, and if every cached token were plain input
unpriced = set()
longest = [0, ""]
tools = defaultdict(int)                     # tool calls by friendly name
tool_ids = set()
sessions = defaultdict(lambda: [0, "", ""])  # replies, project, last day
sub_replies = [0]                            # replies made by subagents
thinking = [0]
today_span = [None, None]                    # first and last reply today (local time)
today_iso = now.date().isoformat()
for path in glob.glob(root + "/**/*.jsonl", recursive=True):
    if os.path.getmtime(path) < since.timestamp():
        continue
    with open(path, errors="ignore") as f:
        for line in f:
            if '"usage"' not in line:
                continue
            try:
                d = json.loads(line)
            except ValueError:
                continue
            m = d.get("message") or {}
            u, ts = m.get("usage"), d.get("timestamp")
            if d.get("type") != "assistant" or not u or not ts or m.get("model") in (None, "<synthetic>"):
                continue
            t = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone()
            if t < since:
                continue
            # One reply can be split over several lines that share its id, each with other content blocks,
            # so tool calls and thinking blocks are counted per block before the reply-level dedup.
            if t >= start30:
                for b in m.get("content") or []:
                    if not isinstance(b, dict):
                        continue
                    if b.get("type") == "tool_use" and b.get("id") not in tool_ids:
                        tool_ids.add(b.get("id"))
                        name = b.get("name") or "?"
                        if not name.startswith("mcp__ccd_turn"):
                            tools[name.split("__")[-1]] += 1
                    elif b.get("type") == "thinking":
                        thinking[0] += 1
            key = (m.get("id"), d.get("requestId"))
            if key in seen:
                continue
            seen.add(key)
            app = "Desktop" if d.get("entrypoint") == "claude-desktop" else "CLI"
            r = rows[(t.date().isoformat(), m["model"], app)]
            v = [int(u.get(k) or 0) for k in fields]
            for i in range(4):
                r[i] += v[i]
            r[4] += 1
            if t >= start30:
                hours[t.hour][0] += 1
                hours[t.hour][1] += v[1]
                weekdays[t.weekday()] += 1
                proj = os.path.relpath(path, root).split(os.sep)[0]
                proj = proj[len(home_prefix):].lstrip("-") if proj.startswith(home_prefix) else proj
                proj = re.sub(r"--claude-worktrees-.*|-scratchpad-.*|-wt-.*", "", proj)  # fold worktrees into their repo
                projects[proj or "~"][0] += sum(v)
                projects[proj or "~"][1] += 1
                if d.get("isSidechain"):
                    sub_replies[0] += 1
                else:
                    sess = sessions[d.get("sessionId") or path]
                    sess[0] += 1
                    sess[1], sess[2] = proj or "~", t.date().isoformat()
                if t.date().isoformat() == today_iso:
                    hm = t.strftime("%H:%M")
                    today_span[0] = min(today_span[0] or hm, hm)
                    today_span[1] = max(today_span[1] or hm, hm)
                apps[app] += v[0] + v[1]
                if v[1] > longest[0]:
                    longest[:] = [v[1], t.date().isoformat()]
                price = PRICES.get(m["model"])
                if price:
                    pin, pout, read = price
                    w1h = int((u.get("cache_creation") or {}).get("ephemeral_1h_input_tokens") or 0)
                    w5m = max(0, v[2] - w1h)
                    cost[0] += (v[0] * pin + v[1] * pout + w5m * pin * 1.25 + w1h * pin * 2 + v[3] * pin * read) / 1e6
                    cost[1] += ((v[0] + v[2] + v[3]) * pin + v[1] * pout) / 1e6
                else:
                    unpriced.add(m["model"])
# Claude Code deletes transcripts after cleanupPeriodDays (30 by default), so the CSV doubles as a ledger:
# a day already counted keeps its larger value instead of shrinking when its transcripts are cleaned up.
if os.path.exists(out):
    with open(out, newline="") as f:
        for rec in csv.DictReader(f):
            key = (rec["date"], rec["model"], rec["app"])
            old = [int(rec[k]) for k in ("input", "output", "cache_write", "cache_read", "replies")]
            cur = rows.get(key)
            if cur is None or sum(old[:4]) > sum(cur[:4]):
                rows[key] = old
with open(out, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["date", "model", "app", "input", "output", "cache_write", "cache_read", "replies"])
    for (day, model, app), r in sorted(rows.items()):
        w.writerow([day, model, app, *r])

def plan_limits():
    """5-hour and weekly plan limits, read with Claude Code's own /usage command.

    Claude Code handles its sign-in (and refreshes it) itself; this script never touches the credentials.
    --no-session-persistence keeps it from leaving a transcript every run. Returns [] when unavailable.
    """
    import subprocess
    import shutil
    # launchd starts with a bare PATH, so look in the usual install places too.
    claude = next((c for c in (os.path.expanduser("~/.local/bin/claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude",
                               shutil.which("claude")) if c and os.path.exists(c)), None)
    if not claude:
        print("plan_limits: claude CLI not found, using Claude Desktop's last sample", file=sys.stderr)
        return desktop_limits()
    try:
        r = subprocess.run([claude, "-p", "/usage", "--no-session-persistence"], capture_output=True, text=True,
                           timeout=90, cwd=os.path.expanduser("~/.claude/token-usage"))
    except (OSError, subprocess.TimeoutExpired) as e:
        print("plan_limits:", e, file=sys.stderr)
        return []
    out = []
    for line in r.stdout.splitlines():
        m = re.match(r"\s*Current (session|week \(([^)]+)\)): (\d+)% used(?: · resets (.+?)(?: \(([^)]+)\))?)?\s*$", line)
        if not m:
            continue
        label = "5 小時" if m.group(1) == "session" else ("每週" if m.group(2) == "all models" else "每週 " + m.group(2))
        resets = None
        if m.group(4):
            txt = m.group(4).strip()
            for fmt_ in ("%b %d at %I:%M%p", "%b %d at %I%p", "%I:%M%p", "%I%p"):
                try:
                    t = datetime.datetime.strptime("%d %s" % (now.year, txt.replace("\u202f", " ")), "%Y " + fmt_)
                except ValueError:
                    continue
                if "%b" in fmt_:
                    if t.month < now.month - 6:
                        t = t.replace(year=now.year + 1)
                else:
                    t = datetime.datetime.combine(now.date(), t.time())
                    if t.time() < now.time():
                        t += datetime.timedelta(days=1)
                resets = t.astimezone().isoformat(timespec="minutes")  # the CLI prints the Mac's local time
                break
        out.append({"label": label, "percent": int(m.group(3)), "resets": resets, "resets_text": m.group(4),
                    "source": "cli", "at": now.isoformat(timespec="minutes")})
    if not out:
        print("plan_limits: no limits in /usage output (exit %s), using Claude Desktop's last sample" % r.returncode,
              file=sys.stderr)
        out = desktop_limits()
    return out


def desktop_limits():
    """Fallback: the last plan-usage sample Claude Desktop saved (only when its usage card was shown)."""
    try:
        with open(os.path.expanduser("~/Library/Application Support/Claude/plan-usage-history.json")) as f:
            last = (json.load(f).get("samples") or [])[-1]
    except (OSError, ValueError, IndexError):
        return []
    at = datetime.datetime.fromtimestamp(last["t"] / 1000).astimezone().isoformat(timespec="minutes")
    u = last.get("u") or {}
    return [{"label": label, "percent": int(u[key]), "resets": None, "resets_text": None, "source": "desktop", "at": at}
            for key, label in (("fh", "5 小時"), ("sd", "每週")) if key in u]


def read_heartbeat():
    try:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "heartbeat.json")) as f:
            hb = json.load(f)
        hb["events"] = hb.get("events", [])[-5:]
        return hb
    except (OSError, ValueError):
        return None


remote = [0]  # recent sessions reachable through Remote Control, set by live_sessions()


def live_sessions():
    """Claude Desktop Code-tab sessions that are running or waiting on the user, for the status page.

    Reads the app's own session records (an internal format that may change) and the tail of each
    session's transcript. Never raises: the status page is optional.
    """
    out = []
    remote[0] = 0
    base = os.path.expanduser("~/Library/Application Support/Claude/claude-code-sessions")
    now_ms = now.timestamp() * 1000
    for meta_path in glob.glob(base + "/*/*/local_*.json"):
        try:
            with open(meta_path) as f:
                meta = json.load(f)
            last = meta.get("lastActivityAt") or 0
            if meta.get("isArchived") or now_ms - last > 7 * 86400e3:
                continue
            # Remote Control: switched on for this session, or left at the default and eligible for it.
            rc = meta.get("remoteControlUserEnabled")
            if rc or (rc is None and meta.get("remoteControlAutoEligible")):
                remote[0] += 1
            cli = meta.get("cliSessionId")
            found = glob.glob(root + "/*/" + cli + ".jsonl") if cli else []
            state, ask = "idle", ""
            if found:
                tp = found[0]
                idle_min = (now.timestamp() - os.path.getmtime(tp)) / 60
                with open(tp, "rb") as f:
                    f.seek(max(0, os.path.getsize(tp) - 400_000))
                    lines = f.read().decode("utf-8", "ignore").splitlines()[1:]
                last_asst, pending = None, {}
                for line in lines:
                    if '"type":"assistant"' not in line and '"type":"user"' not in line:
                        continue
                    try:
                        d = json.loads(line)
                    except ValueError:
                        continue
                    if d.get("isSidechain"):
                        continue
                    content = (d.get("message") or {}).get("content")
                    if d.get("type") == "assistant":
                        last_asst = d["message"]
                        for b in content or []:
                            if isinstance(b, dict) and b.get("type") == "tool_use":
                                pending[b.get("id")] = b
                                if b.get("name", "").endswith("wrap_up"):
                                    inp = b.get("input") or {}
                                    ask = inp.get("ask") or ""
                    elif isinstance(content, list):
                        for b in content:
                            if isinstance(b, dict) and b.get("type") == "tool_result":
                                pending.pop(b.get("tool_use_id"), None)
                    else:
                        ask = ""  # a new user prompt starts a new turn
                names = [b.get("name") or "" for b in pending.values()]
                ended = last_asst is not None and last_asst.get("stop_reason") == "end_turn" and not pending
                if any(n in ("AskUserQuestion", "ExitPlanMode") for n in names):
                    state = "question"
                elif pending and idle_min > 2 and not any(n in ("Bash", "Agent", "Workflow", "Monitor") for n in names):
                    state = "approval"
                elif not ended and idle_min < 15:
                    state = "running"
                elif ended and ask:
                    state = "decide"
                elif ended and (meta.get("lastFocusedAt") or 0) < (meta.get("lastTurnEdgeAt") or 0):
                    state = "unread"
            if meta.get("interruptedAwaitingPerson") and state == "idle":
                state = "decide"
            if state == "idle":
                continue
            out.append({"title": meta.get("title") or "（未命名）", "state": state, "ask": ask[:80],
                        "bridge": (meta.get("bridgeSessionIds") or [""])[-1] if (rc or (rc is None and meta.get("remoteControlAutoEligible"))) else "",
                        "at": datetime.datetime.fromtimestamp(last / 1000).astimezone().isoformat(timespec="minutes")})
        except Exception as e:  # noqa: BLE001 - one bad record must not stop the export
            print("live_sessions:", meta_path, e, file=sys.stderr)
    order = {"question": 0, "approval": 1, "decide": 2, "unread": 3, "running": 4}
    return sorted(out, key=lambda x: (order[x["state"]], x["at"]), reverse=False)


# Compact summary for the iPhone widget (Scriptable reads it from iCloud Drive).
widget_dir = os.path.expanduser(os.environ.get(
    "USAGE_WIDGET_DIR", "~/Library/Mobile Documents/iCloud~dk~simonbs~Scriptable/Documents"))
if os.path.isdir(widget_dir):
    today = now.date()
    def total(lo, hi):
        t = [0, 0, 0, 0, 0]
        for (day, _, _), r in rows.items():
            if lo <= day <= hi:
                t = [a + b for a, b in zip(t, r)]
        return {"input": t[0], "output": t[1], "cache_write": t[2], "cache_read": t[3], "replies": t[4],
                "actual": t[0] + t[1], "cache": t[2] + t[3], "total": sum(t[:4])}
    d = lambda n: (today - datetime.timedelta(days=n)).isoformat()
    daily = []
    for n in range(29, -1, -1):
        x = total(d(n), d(n))
        daily.append({"date": d(n), "actual": x["actual"], "cache": x["cache"]})
    by_model = defaultdict(int)
    for (day, model, _), r in rows.items():
        if d(29) <= day:
            by_model[model] += sum(r[:4])
    summary = {"generated": now.isoformat(timespec="seconds"), "range": [d(29), d(0)],
               "last30": total(d(29), d(0)), "prev30": total(d(59), d(30)), "today": total(d(0), d(0)),
               "daily": daily, "models": sorted(by_model.items(), key=lambda kv: -kv[1])[:5]}
    active = {day for (day, _, _) in rows}
    streak = 0
    while d(streak) in active:
        streak += 1
    busiest = max(daily, key=lambda x: x["actual"])
    summary.update({
        "streak": streak, "active_days": sum(1 for x in daily if x["actual"] or x["cache"]),
        "busiest": busiest, "hours": hours, "weekdays": weekdays,
        "projects": sorted(([k, *v] for k, v in projects.items()), key=lambda x: -x[1])[:5],
        "apps": dict(apps), "longest_reply": longest,
        "cost_usd": round(cost[0], 2), "cost_nocache_usd": round(cost[1], 2), "unpriced_models": sorted(unpriced),
        "tools": sorted(tools.items(), key=lambda kv: -kv[1])[:8], "tool_calls": sum(tools.values()),
        "sessions": len(sessions), "longest_session": max(sessions.values(), default=[0, "", ""]),
        "subagent_replies": sub_replies[0], "thinking_blocks": thinking[0], "today_span": today_span,
        "live": live_sessions(), "remote_sessions": remote[0], "limits": plan_limits(),
        "heartbeat": read_heartbeat()})
    # Written in place by the LaunchAgent. Under launchd, opening or renaming onto an iCloud Drive file
    # that another process (an interactive shell) created blocks indefinitely, so only the agent writes it;
    # the alarm turns such a hang into a failed run instead of a stuck job.
    signal.alarm(120)
    with open(os.path.join(widget_dir, "claude-usage.json"), "w") as f:
        json.dump(summary, f, ensure_ascii=False)
    signal.alarm(0)
print(out, len(rows), "rows", len(seen), "replies", "generated", now.isoformat(timespec="seconds"))
