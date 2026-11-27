// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: server;
// Agent 狀態 — Cursor + Antigravity usage over HTTPS Tunnel.
// Parameter: page only (overview / tasks / cursor / antigravity).
// Bearer token + base URL live in Keychain (never in Parameter).

const VERSION = "2026.11.27.7";
const KC_URL = "agent-status.url";
const KC_TOKEN = "agent-status.token";
const CACHE_NAME = "agent-status-last.json";

const C = {
  bg: Color.dynamic(new Color("#f4f6f8"), new Color("#12141a")),
  card: Color.dynamic(new Color("#ffffff"), new Color("#1c1f28")),
  text: Color.dynamic(new Color("#1a1d26"), new Color("#f2f4f8")),
  dim: Color.dynamic(new Color("#6b7280"), new Color("#9aa3b5")),
  track: new Color("#9aa3b5", 0.28),
  ok: new Color("#3d9a6a"),
  warn: new Color("#d39b2f"),
  bad: new Color("#d0554a"),
  accent: new Color("#3b6fd8"),
};

function pageName() {
  const p = (args.widgetParameter || "").trim().toLowerCase();
  if (!p || p === "總覽" || p === "overview") return "overview";
  if (p === "任務" || p === "tasks") return "tasks";
  if (p === "cursor") return "cursor";
  if (p === "antigravity" || p === "agy") return "antigravity";
  return "overview";
}

function keychainGet(key) {
  try {
    if (Keychain.contains(key)) return Keychain.get(key);
  } catch (e) {}
  return "";
}

function cachePath() {
  const fm = FileManager.local();
  return fm.joinPath(fm.documentsDirectory(), CACHE_NAME);
}

function readCache() {
  const fm = FileManager.local();
  const p = cachePath();
  try {
    if (fm.fileExists(p)) return JSON.parse(fm.readString(p));
  } catch (e) {}
  return null;
}

function writeCache(obj) {
  try {
    FileManager.local().writeString(cachePath(), JSON.stringify(obj));
  } catch (e) {}
}

async function fetchStatus() {
  const base = keychainGet(KC_URL).replace(/\/$/, "");
  const token = keychainGet(KC_TOKEN);
  if (!base || !token) {
    return { error: "missing_keychain", message: "請在腳本設定裡寫入 URL 與 Bearer（存 Keychain）" };
  }
  const req = new Request(base + "/status.json");
  req.timeoutInterval = 12;
  req.headers = { Authorization: "Bearer " + token };
  try {
    const res = await req.loadString();
    if (req.response && req.response.statusCode === 401) {
      return { error: "unauthorized", message: "讀取 token 失效，請在電腦輪替後更新 Keychain" };
    }
    if (req.response && req.response.statusCode >= 400) {
      return { error: "http", message: "暫時讀不到用量資料", cache: readCache(), offline: true };
    }
    const json = JSON.parse(res);
    writeCache(json);
    return { data: json };
  } catch (e) {
    const cached = readCache();
    if (cached) return { data: cached, offline: true, message: "可能睡著／離線" };
    return { error: "network", message: "暫時讀不到用量資料（也可能電腦睡著）" };
  }
}

function isStale(data) {
  if (!data || !data.generated) return true;
  const staleAfter = (data.stale_after_seconds || 1200) * 1000;
  const t = new Date(data.generated).getTime();
  return !t || Date.now() - t > staleAfter;
}

function barColor(pct) {
  if (pct == null) return C.dim;
  if (pct >= 95) return C.bad;
  if (pct >= 80) return C.warn;
  return C.ok;
}

function label(stack, text, size, color, weight) {
  const t = stack.addText(text);
  t.font = weight === "bold" ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
  return t;
}

function addBar(stack, pct, width) {
  const row = stack.addStack();
  row.layoutHorizontally();
  const track = row.addStack();
  track.size = new Size(width, 8);
  track.cornerRadius = 4;
  track.backgroundColor = C.track;
  if (pct != null) {
    const fill = track.addStack();
    const w = Math.max(2, Math.round((Math.min(100, Math.max(0, pct)) / 100) * width));
    fill.size = new Size(w, 8);
    fill.backgroundColor = barColor(pct);
  }
}

function primaryLimit(prov) {
  if (!prov || !prov.limits || !prov.limits.length) return null;
  return prov.limits[0];
}

function fmtReset(iso) {
  if (!iso) return "";
  try {
    const df = new DateFormatter();
    df.dateFormat = "M/d HH:mm";
    return "重置 " + df.string(new Date(iso));
  } catch (e) {
    return "";
  }
}

function buildOverview(w, data, banner) {
  const root = w.addStack();
  root.layoutVertically();
  root.setPadding(12, 14, 12, 14);

  const head = root.addStack();
  head.layoutHorizontally();
  label(head, "Agent 狀態", 15, C.text, "bold");
  head.addSpacer();
  if (banner) label(head, banner, 11, C.warn);

  root.addSpacer(8);
  for (const id of ["cursor", "antigravity"]) {
    const prov = data.providers && data.providers[id];
    const card = root.addStack();
    card.layoutVertically();
    card.setPadding(8, 10, 8, 10);
    card.backgroundColor = C.card;
    card.cornerRadius = 10;

    const row = card.addStack();
    row.layoutHorizontally();
    label(row, prov ? prov.label : id, 13, C.text, "bold");
    row.addSpacer();
    const lim = primaryLimit(prov);
    if (!prov) label(row, "無資料", 12, C.dim);
    else if (!prov.ok) label(row, prov.error || prov.status, 11, C.bad);
    else if (lim && lim.percent != null) label(row, lim.percent + "%", 13, barColor(lim.percent), "bold");
    else label(row, "—", 12, C.dim);

    if (lim && lim.percent != null) {
      card.addSpacer(6);
      addBar(card, lim.percent, 280);
      const sub = lim.label || "";
      const reset = fmtReset(lim.resets);
      card.addSpacer(4);
      label(card, [sub, reset].filter(Boolean).join(" · "), 10, C.dim);
    }
    root.addSpacer(8);
  }

  const foot = root.addStack();
  foot.layoutHorizontally();
  label(foot, "v" + VERSION, 9, C.dim);
  foot.addSpacer();
  if (data.generated) {
    const df = new DateFormatter();
    df.dateFormat = "HH:mm";
    label(foot, df.string(new Date(data.generated)), 9, isStale(data) ? C.warn : C.dim);
  }
}

function buildTasks(w, data, banner) {
  const root = w.addStack();
  root.layoutVertically();
  root.setPadding(12, 14, 12, 14);
  const head = root.addStack();
  label(head, "任務", 15, C.text, "bold");
  head.addSpacer();
  if (banner) label(head, banner, 11, C.warn);
  root.addSpacer(8);
  const tasks = (data.tasks || []).slice(0, 6);
  if (!tasks.length) {
    label(root, "目前沒有可顯示的任務（best-effort）", 12, C.dim);
    return;
  }
  for (const t of tasks) {
    const row = root.addStack();
    row.layoutHorizontally();
    label(row, (t.provider || "").slice(0, 1).toUpperCase(), 11, C.accent, "bold");
    row.addSpacer(6);
    label(row, t.title || t.id, 12, C.text);
    row.addSpacer();
    label(row, t.state || "", 10, C.dim);
    root.addSpacer(6);
  }
}

function buildProvider(w, data, id, banner) {
  const prov = data.providers && data.providers[id];
  const root = w.addStack();
  root.layoutVertically();
  root.setPadding(12, 14, 12, 14);
  const head = root.addStack();
  label(head, prov ? prov.label : id, 15, C.text, "bold");
  head.addSpacer();
  if (banner) label(head, banner, 11, C.warn);
  root.addSpacer(8);
  if (!prov) {
    label(root, "無資料", 12, C.dim);
    return;
  }
  if (!prov.ok) label(root, prov.error || "錯誤", 12, C.bad);
  for (const lim of prov.limits || []) {
    const row = root.addStack();
    row.layoutVertically();
    const top = row.addStack();
    label(top, lim.label || lim.id, 12, C.text);
    top.addSpacer();
    label(top, lim.percent == null ? "—" : lim.percent + "%", 12, barColor(lim.percent), "bold");
    row.addSpacer(4);
    addBar(row, lim.percent, 280);
    const reset = fmtReset(lim.resets);
    if (reset || lim.group) {
      row.addSpacer(3);
      label(row, [lim.group, reset].filter(Boolean).join(" · "), 10, C.dim);
    }
    root.addSpacer(8);
  }
}

async function setupKeychainIfInteractive() {
  if (config.runsInWidget) return;
  const alert = new Alert();
  alert.title = "Agent 狀態設定";
  alert.message = "URL 與 Bearer 會存進 Keychain，不會寫進小工具 Parameter。";
  alert.addTextField("HTTPS 基底 URL", keychainGet(KC_URL) || "https://");
  alert.addSecureTextField("Bearer token", "");
  alert.addAction("儲存");
  alert.addCancelAction("略過");
  const idx = await alert.present();
  if (idx === 0) {
    const url = alert.textFieldValue(0).trim();
    const token = alert.textFieldValue(1).trim();
    if (url) Keychain.set(KC_URL, url);
    if (token) Keychain.set(KC_TOKEN, token);
  }
}

async function buildWidget() {
  if (!config.runsInWidget) await setupKeychainIfInteractive();
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  const page = pageName();
  const result = await fetchStatus();
  if (result.error && !result.data) {
    const root = w.addStack();
    root.layoutVertically();
    root.setPadding(14, 14, 14, 14);
    label(root, "Agent 狀態", 15, C.text, "bold");
    root.addSpacer(8);
    label(root, result.message || "錯誤", 12, C.bad);
    return w;
  }
  const data = result.data;
  let banner = "";
  if (result.offline || isStale(data)) banner = "可能睡著／離線";
  if (page === "tasks") buildTasks(w, data, banner);
  else if (page === "cursor") buildProvider(w, data, "cursor", banner);
  else if (page === "antigravity") buildProvider(w, data, "antigravity", banner);
  else buildOverview(w, data, banner);
  return w;
}

const widget = await buildWidget();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentLarge();
Script.complete();
