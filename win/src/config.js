import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parse as parseToml } from 'smol-toml';
import { configPath, ensureStateDir, stateDir } from './paths.js';
import { applyUserOnlyAcl } from './util.js';

const DEFAULTS = {
  host: 'home-pc',
  port: 8787,
  stale_after_seconds: 1200,
  aggregate_interval_seconds: 300,
  notify_interval_seconds: 300,
  antigravity_min_interval_seconds: 900,
  cursor: {
    enabled: true,
  },
  antigravity: {
    enabled: true,
    agy_path: '',
  },
  ntfy: {
    base_url: 'https://ntfy.sh',
    topic: '',
    token: '',
  },
  alerts: {
    quota_warn: 80,
    quota_crit: 95,
    source_fail_streak: 3,
    cooldown_minutes: 45,
  },
  tunnel: {
    // Prefer cloudflared Windows service; watchdog does not own the tunnel process.
    mode: 'service',
  },
};

export function loadConfig() {
  ensureStateDir();
  const p = configPath();
  let fileCfg = {};
  if (fs.existsSync(p)) {
    const text = fs.readFileSync(p, 'utf8');
    if (p.endsWith('.json')) fileCfg = JSON.parse(text);
    else fileCfg = parseToml(text);
  }
  const cfg = deepMerge(structuredClone(DEFAULTS), fileCfg);
  if (!cfg.antigravity.agy_path) {
    const guess = path.join(process.env.LOCALAPPDATA || '', 'agy', 'bin', 'agy.exe');
    if (guess && fs.existsSync(guess)) cfg.antigravity.agy_path = guess;
  }
  if (!cfg.host || cfg.host === 'home-pc') {
    cfg.host = sanitizeHost(os.hostname()) || 'home-pc';
  }
  return cfg;
}

export function writeDefaultConfig(overrides = {}) {
  ensureStateDir();
  const cfg = deepMerge(structuredClone(DEFAULTS), overrides);
  if (!cfg.antigravity.agy_path) {
    const guess = path.join(process.env.LOCALAPPDATA || '', 'agy', 'bin', 'agy.exe');
    if (fs.existsSync(guess)) cfg.antigravity.agy_path = guess;
  }
  const p = path.join(stateDir(), 'config.toml');
  const body = `# Agent Status config — do not commit
host = ${tomlStr(cfg.host)}
port = ${cfg.port}
stale_after_seconds = ${cfg.stale_after_seconds}
aggregate_interval_seconds = ${cfg.aggregate_interval_seconds}
notify_interval_seconds = ${cfg.notify_interval_seconds}
antigravity_min_interval_seconds = ${cfg.antigravity_min_interval_seconds}

[cursor]
enabled = true

[antigravity]
enabled = true
agy_path = ${tomlStr(cfg.antigravity.agy_path || '')}

[ntfy]
base_url = ${tomlStr(cfg.ntfy.base_url)}
topic = ${tomlStr(cfg.ntfy.topic || '')}
token = ${tomlStr(cfg.ntfy.token || '')}

[alerts]
quota_warn = ${cfg.alerts.quota_warn}
quota_crit = ${cfg.alerts.quota_crit}
source_fail_streak = ${cfg.alerts.source_fail_streak}
cooldown_minutes = ${cfg.alerts.cooldown_minutes}

[tunnel]
mode = ${tomlStr(cfg.tunnel.mode)}
`;
  fs.writeFileSync(p, body, 'utf8');
  applyUserOnlyAcl(stateDir());
  return p;
}

function tomlStr(s) {
  return JSON.stringify(String(s ?? ''));
}

function sanitizeHost(h) {
  return String(h || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function deepMerge(a, b) {
  if (!b || typeof b !== 'object') return a;
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      a[k] = deepMerge(a[k] && typeof a[k] === 'object' ? a[k] : {}, v);
    } else if (v !== undefined) {
      a[k] = v;
    }
  }
  return a;
}
