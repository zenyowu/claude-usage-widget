import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { emptyProvider } from '../errors.js';
import { clampPercent, epoch1970ToNull, nowIso } from '../util.js';

const execFileAsync = promisify(execFile);

const BUCKET_LABELS = {
  'gemini-weekly': 'Gemini 每週',
  'gemini-5h': 'Gemini 5 小時',
  '3p-weekly': 'Claude／GPT 每週',
  '3p-5h': 'Claude／GPT 5 小時',
};

/**
 * Map agy /usage JSON → provider block. Exported for fixture tests.
 */
export function mapAgyUsage(payload, { collectedAt } = {}) {
  const at = collectedAt || nowIso();
  if (
    payload?.status !== 'SUCCESS' ||
    payload?.command?.name !== 'usage' ||
    payload?.num_turns !== 0 ||
    Number(payload?.usage?.total_tokens || 0) !== 0 ||
    (payload?.conversation_id != null && String(payload.conversation_id) !== '')
  ) {
    const err = new Error('agy usage payload rejected');
    err.code = 'parse_error';
    throw err;
  }

  const groups = payload?.command?.data?.groups || [];
  const limits = [];
  for (const g of groups) {
    const groupName = g.name || g.id || null;
    for (const b of g.buckets || []) {
      const remaining = Number(b.remaining_fraction);
      const percent =
        Number.isFinite(remaining) ? clampPercent((1 - remaining) * 100) : null;
      const window = b.window === '5h' ? '5h' : b.window === 'weekly' ? 'weekly' : String(b.window || 'weekly');
      limits.push({
        id: `antigravity:${b.id}`,
        label: BUCKET_LABELS[b.id] || String(b.id),
        percent,
        used: null,
        limit: null,
        unit: 'percent',
        unit_raw: null,
        window,
        quality: 'exact',
        resets: epoch1970ToNull(b.reset_time),
        group: groupName,
        source: 'cli',
        at,
      });
    }
  }

  return {
    id: 'antigravity',
    label: 'Antigravity',
    status: 'ok',
    ok: true,
    error: null,
    error_code: null,
    collected_at: at,
    last_success_at: at,
    limits,
    today: null,
    last30: null,
    meta: {},
  };
}

async function runAgy(agyPath) {
  const { stdout } = await execFileAsync(
    agyPath,
    ['-p', '/usage', '--output-format', 'json', '--print-timeout', '20s'],
    {
      windowsHide: true,
      timeout: 45_000,
      maxBuffer: 2 * 1024 * 1024,
      encoding: 'utf8',
    },
  );
  return JSON.parse(stdout);
}

export async function collectAntigravity(cfg, prev = null, { force = false, lastAgyAt = 0 } = {}) {
  const collectedAt = nowIso();
  const keep = (status, error_code) =>
    emptyProvider('antigravity', 'Antigravity', status, error_code, {
      collected_at: collectedAt,
      last_success_at: prev?.last_success_at ?? null,
      limits: Array.isArray(prev?.limits) ? prev.limits : [],
      meta: prev?.meta || {},
    });

  if (cfg?.antigravity?.enabled === false || prev?.status === 'disabled') {
    return keep('disabled', 'disabled');
  }

  const agyPath = cfg?.antigravity?.agy_path;
  if (!agyPath || !fs.existsSync(agyPath)) {
    return keep('missing', 'missing_cli');
  }

  const minInterval = (cfg.antigravity_min_interval_seconds || 900) * 1000;
  if (!force && lastAgyAt && Date.now() - lastAgyAt < minInterval && prev?.ok) {
    // Reuse last good within cadence; still refresh collected_at? Keep previous block.
    return { ...prev, collected_at: prev.collected_at };
  }

  try {
    // Version is advisory
    try {
      await execFileAsync(agyPath, ['--version'], {
        windowsHide: true,
        timeout: 10_000,
        encoding: 'utf8',
      });
    } catch {
      /* ignore */
    }

    const payload = await runAgy(agyPath);
    return mapAgyUsage(payload, { collectedAt });
  } catch (e) {
    if (e?.code === 'parse_error') {
      // Circuit-breaker candidate: bad payload may burn a turn next time.
      const out = keep('disabled', 'disabled');
      out.meta = { ...(prev?.meta || {}), breaker: 'agy_usage_invalid' };
      return out;
    }
    if (e?.killed || e?.code === 'ETIMEDOUT') return keep('error', 'timeout');
    return keep('error', 'api_error');
  }
}
