import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';

export function nowIso(tzOffsetMinutes = -480) {
  // Default display zone Asia/Taipei = UTC+8 → offset minutes for Date is -480
  const d = new Date();
  const offset = typeof process.env.AGENT_STATUS_TZ_OFFSET_MIN === 'string'
    ? Number(process.env.AGENT_STATUS_TZ_OFFSET_MIN)
    : tzOffsetMinutes;
  const local = new Date(d.getTime() - offset * 60_000);
  const pad = (n) => String(n).padStart(2, '0');
  const y = local.getUTCFullYear();
  const m = pad(local.getUTCMonth() + 1);
  const day = pad(local.getUTCDate());
  const h = pad(local.getUTCHours());
  const min = pad(local.getUTCMinutes());
  const s = pad(local.getUTCSeconds());
  const sign = offset <= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const oh = pad(Math.floor(abs / 60));
  const om = pad(abs % 60);
  return `${y}-${m}-${day}T${h}:${min}:${s}${sign}${oh}:${om}`;
}

export function clampPercent(n) {
  if (n == null || Number.isNaN(Number(n))) return null;
  return Math.max(0, Math.min(100, Math.round(Number(n))));
}

export function epoch1970ToNull(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  if (t <= Date.parse('1970-01-01T00:00:00Z')) return null;
  return new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function msEpochToIso(ms) {
  const n = typeof ms === 'string' ? Number(ms) : ms;
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function atomicWriteJson(filePath, obj) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', { encoding: 'utf8' });
  fs.renameSync(tmp, filePath);
}

export function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

export function sha256Hex(s) {
  return createHash('sha256').update(String(s)).digest('hex');
}

/** Constant-time compare after hashing both sides (equalizes length). */
export function bearerEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function redactSecrets(text) {
  if (!text) return text;
  return String(text)
    .replace(/Bearer\s+[A-Za-z0-9._\-+=/]+/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+/g, '[REDACTED_JWT]');
}

export function applyUserOnlyAcl(targetPath) {
  if (process.platform !== 'win32') return;
  try {
    const user = osUser(); // DOMAIN\user form preferred by icacls
    const isFile = (() => {
      try {
        return fs.statSync(targetPath).isFile();
      } catch {
        return false;
      }
    })();
    const perm = isFile ? `${user}:F` : `${user}:(OI)(CI)F`;
    execFileSync(
      'icacls',
      [targetPath, '/inheritance:r', '/grant:r', perm],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch {
    // doctor will surface ACL problems
  }
}

function osUser() {
  try {
    return execFileSync('whoami', { encoding: 'utf8', windowsHide: true }).trim();
  } catch {
    return process.env.USERNAME || process.env.USER || 'USER';
  }
}

export function purgeTmp(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    try {
      fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

export function copyFileIfExists(src, dest) {
  if (fs.existsSync(src)) fs.copyFileSync(src, dest);
}
