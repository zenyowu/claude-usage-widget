import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { emptyProvider } from '../errors.js';
import { clampPercent, copyFileIfExists, msEpochToIso, nowIso, purgeTmp } from '../util.js';
import { tmpDir, ensureStateDir } from '../paths.js';

const API_URL =
  'https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage';

/**
 * Map GetCurrentPeriodUsage JSON → provider block.
 * Exported for fixture unit tests.
 */
export function mapCursorUsage(data, { collectedAt, meta = {} } = {}) {
  const at = collectedAt || nowIso();
  const plan = data?.planUsage || {};
  const spend = data?.spendLimitUsage || {};
  const limits = [];

  const spendBased =
    Number.isFinite(plan.includedSpend) &&
    Number.isFinite(plan.limit) &&
    plan.limit > 0
      ? (plan.includedSpend / plan.limit) * 100
      : null;
  const reported = Number.isFinite(plan.totalPercentUsed) ? plan.totalPercentUsed : null;
  // Prefer spend-based % when it disagrees meaningfully with totalPercentUsed (Cursor quirk).
  let percent = reported;
  if (spendBased != null && reported != null && Math.abs(spendBased - reported) > 5) {
    percent = spendBased;
  } else if (percent == null) {
    percent = spendBased;
  }

  limits.push({
    id: 'cursor:plan',
    label: '本週期方案',
    percent: clampPercent(percent),
    used: centsToUsd(plan.includedSpend ?? plan.totalSpend),
    limit: centsToUsd(plan.limit),
    unit: 'usd',
    unit_raw: 'usd',
    window: 'billing_cycle',
    quality: 'exact',
    resets: msEpochToIso(data.billingCycleEnd),
    group: null,
    source: 'api',
    at,
  });

  const indivLimit = Number(spend.individualLimit || 0);
  const pooledLimit = Number(spend.pooledLimit || 0);
  if (indivLimit > 0) {
    const used = Number(spend.individualUsed || 0);
    limits.push({
      id: 'cursor:ondemand',
      label: '隨用隨付上限',
      percent: clampPercent((used / indivLimit) * 100),
      used: centsToUsd(used),
      limit: centsToUsd(indivLimit),
      unit: 'usd',
      unit_raw: 'usd',
      window: 'billing_cycle',
      quality: 'exact',
      resets: msEpochToIso(data.billingCycleEnd),
      group: null,
      source: 'api',
      at,
    });
  } else if (pooledLimit > 0) {
    const used = Number(spend.pooledUsed || 0);
    limits.push({
      id: 'cursor:ondemand-pool',
      label: '團隊隨用隨付',
      percent: clampPercent((used / pooledLimit) * 100),
      used: centsToUsd(used),
      limit: centsToUsd(pooledLimit),
      unit: 'usd',
      unit_raw: 'usd',
      window: 'billing_cycle',
      quality: 'exact',
      resets: msEpochToIso(data.billingCycleEnd),
      group: null,
      source: 'api',
      at,
    });
  }

  return {
    id: 'cursor',
    label: 'Cursor',
    status: 'ok',
    ok: true,
    error: null,
    error_code: null,
    collected_at: at,
    last_success_at: at,
    limits,
    today: null,
    last30: null,
    meta: whitelistMeta(meta),
  };
}

function centsToUsd(cents) {
  if (cents == null || !Number.isFinite(Number(cents))) return null;
  return Math.round(Number(cents)) / 100;
}

function whitelistMeta(meta) {
  const out = {};
  if (meta?.membership_type) out.membership_type = String(meta.membership_type);
  if (meta?.subscription_status) out.subscription_status = String(meta.subscription_status);
  return out;
}

function cursorDbDir() {
  return path.join(process.env.APPDATA || '', 'Cursor', 'User', 'globalStorage');
}

function readAuthFromDb() {
  ensureStateDir();
  purgeTmp(tmpDir());
  const srcDir = cursorDbDir();
  const dbSrc = path.join(srcDir, 'state.vscdb');
  if (!fs.existsSync(dbSrc)) {
    return { error_code: 'missing_cli', meta: {} };
  }
  const stamp = randomBytes(4).toString('hex');
  const work = path.join(tmpDir(), `cursor-${stamp}`);
  fs.mkdirSync(work, { recursive: true });
  try {
    for (const f of ['state.vscdb', 'state.vscdb-wal', 'state.vscdb-shm']) {
      copyFileIfExists(path.join(srcDir, f), path.join(work, f));
    }
    const db = new DatabaseSync(path.join(work, 'state.vscdb'), { readOnly: true });
    const get = (key) => {
      try {
        const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(key);
        return row ? row.value : null;
      } catch {
        return null;
      }
    };
    const token = get('cursorAuth/accessToken');
    const enc = String(get('cursor.storage.authTokenEncryptionAtRest') || '');
    const meta = {
      membership_type: get('cursorAuth/stripeMembershipType'),
      subscription_status: get('cursorAuth/stripeSubscriptionStatus'),
      encryption_at_rest: enc === 'true',
    };
    db.close();
    if (!token || String(token).length < 20) {
      return { error_code: 'signed_out', meta };
    }
    // JWT starts with eyJ; opaque encrypted blobs are not usable as Bearer.
    const s = String(token);
    const looksJwt = /^eyJ/.test(s);
    if (!looksJwt && meta.encryption_at_rest) {
      return { error_code: 'signed_out', meta, reason: 'encrypted_token' };
    }
    return { token: s, meta };
  } finally {
    try {
      fs.rmSync(work, { recursive: true, force: true });
    } catch {
      /* startup purge covers leftovers */
    }
  }
}

export async function collectCursor(prev = null) {
  const collectedAt = nowIso();
  const keep = (error_code) =>
    emptyProvider('cursor', 'Cursor', error_code === 'signed_out' ? 'signed_out' : 'error', error_code, {
      collected_at: collectedAt,
      last_success_at: prev?.last_success_at ?? null,
      limits: Array.isArray(prev?.limits) ? prev.limits : [],
      meta: prev?.meta || {},
    });

  let auth;
  try {
    auth = readAuthFromDb();
  } catch {
    return keep('unknown');
  }
  if (auth.error_code) return keep(auth.error_code);

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1',
      },
      body: '{}',
    });
    if (res.status === 401 || res.status === 403) {
      return keep('signed_out');
    }
    if (!res.ok) {
      return keep('api_error');
    }
    const data = await res.json();
    return mapCursorUsage(data, { collectedAt, meta: auth.meta });
  } catch (e) {
    if (e?.name === 'TimeoutError' || /timeout/i.test(String(e))) return keep('timeout');
    return keep('api_error');
  }
}
