import { loadConfig } from './config.js';
import { notifyStatePath, statusJsonPath } from './paths.js';
import { atomicWriteJson, readJsonSafe, sha256Hex } from './util.js';

/**
 * Pluggable notifier — ntfy today; swap provider later.
 */
export async function runNotify() {
  const cfg = loadConfig();
  const status = readJsonSafe(statusJsonPath(), null);
  if (!status) return { sent: 0, skipped: 'no_status' };

  const topic = cfg.ntfy?.topic;
  const token = cfg.ntfy?.token;
  const base = (cfg.ntfy?.base_url || 'https://ntfy.sh').replace(/\/$/, '');
  if (!topic) return { sent: 0, skipped: 'no_topic' };

  const state = readJsonSafe(notifyStatePath(), { fingerprints: {}, failStreak: {} });
  const alerts = [];
  const warn = cfg.alerts?.quota_warn ?? 80;
  const crit = cfg.alerts?.quota_crit ?? 95;
  const streakNeed = cfg.alerts?.source_fail_streak ?? 3;
  const cooldownMs = (cfg.alerts?.cooldown_minutes ?? 45) * 60_000;

  for (const [pid, prov] of Object.entries(status.providers || {})) {
    if (!prov) continue;
    // Source failure streak
    const bad = prov.status === 'error' || prov.status === 'signed_out' || prov.status === 'disabled';
    if (bad) {
      state.failStreak[pid] = (state.failStreak[pid] || 0) + 1;
      if (state.failStreak[pid] >= streakNeed) {
        const title =
          prov.status === 'signed_out'
            ? `${prov.label}：登入過期，請開一次 ${prov.label}`
            : `${prov.label}：來源讀取失敗`;
        alerts.push({
          fingerprint: `source:${pid}:${prov.status}`,
          title,
          priority: 'high',
          tags: ['warning'],
        });
      }
    } else {
      state.failStreak[pid] = 0;
    }

    for (const lim of prov.limits || []) {
      if (lim.percent == null) continue;
      if (lim.percent >= crit) {
        alerts.push({
          fingerprint: `quota-crit:${lim.id}`,
          title: `${prov.label}：額度 ${lim.percent}%`,
          priority: 'urgent',
          tags: ['rotating_light'],
        });
      } else if (lim.percent >= warn) {
        alerts.push({
          fingerprint: `quota-warn:${lim.id}`,
          title: `${prov.label}：${lim.label || '額度'}已用 ${lim.percent}%`,
          priority: 'default',
          tags: ['chart_with_upwards_trend'],
        });
      }
    }
  }

  // Best-effort task alerts (optional; empty tasks = no-op)
  for (const t of status.tasks || []) {
    if (t.state === 'waiting_user' || t.state === 'waiting_approval') {
      alerts.push({
        fingerprint: `task-wait:${t.id}`,
        title: `${providerLabel(t.provider)}：有任務等你核准`,
        priority: 'high',
        tags: ['hand'],
      });
    } else if (t.state === 'failed') {
      alerts.push({
        fingerprint: `task-fail:${t.id}`,
        title: `${providerLabel(t.provider)}：任務失敗`,
        priority: 'urgent',
        tags: ['x'],
      });
    }
  }

  let sent = 0;
  const now = Date.now();
  for (const a of alerts) {
    const fp = sha256Hex(a.fingerprint);
    const last = state.fingerprints[fp] || 0;
    if (now - last < cooldownMs) continue;
    const ok = await publishNtfy({ base, topic, token, title: a.title, priority: a.priority, tags: a.tags });
    if (ok) {
      state.fingerprints[fp] = now;
      sent += 1;
    }
  }

  // Prune old fingerprints (>7d)
  for (const [k, ts] of Object.entries(state.fingerprints)) {
    if (now - ts > 7 * 86400_000) delete state.fingerprints[k];
  }
  atomicWriteJson(notifyStatePath(), state);
  return { sent };
}

function providerLabel(id) {
  if (id === 'cursor') return 'Cursor';
  if (id === 'antigravity') return 'Antigravity';
  return id || 'Agent';
}

async function publishNtfy({ base, topic, token, title, priority, tags }) {
  const headers = {
    Title: title,
    Priority: String(priority || 'default'),
    Tags: (tags || []).join(','),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`${base}/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers,
      body: title,
    });
    return res.ok;
  } catch {
    return false;
  }
}
