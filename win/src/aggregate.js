import { loadConfig } from './config.js';
import { collectCursor } from './collectors/cursor.js';
import { collectAntigravity } from './collectors/antigravity.js';
import { ensureStateDir, readRepoVersion, statusJsonPath } from './paths.js';
import { atomicWriteJson, nowIso, readJsonSafe } from './util.js';

/**
 * Run collectors independently; one failure must not blank the other.
 * On failure keep last successful limits + last_success_at.
 */
export async function runAggregate({ forceAgy = false } = {}) {
  ensureStateDir();
  const cfg = loadConfig();
  const prev = readJsonSafe(statusJsonPath(), null);
  const prevCursor = prev?.providers?.cursor || null;
  const prevAgy = prev?.providers?.antigravity || null;
  const lastAgyAt = prevAgy?.last_success_at
    ? Date.parse(prevAgy.last_success_at)
    : 0;

  const [cursor, antigravity] = await Promise.all([
    cfg.cursor?.enabled === false
      ? Promise.resolve({
          ...prevCursor,
          id: 'cursor',
          label: 'Cursor',
          status: 'disabled',
          ok: false,
          error_code: 'disabled',
          error: '此來源已停用（連續失敗）',
          limits: prevCursor?.limits || [],
          today: null,
          last30: null,
        })
      : collectCursor(prevCursor).catch(() =>
          collectCursorFallback(prevCursor),
        ),
    collectAntigravity(cfg, prevAgy, { force: forceAgy, lastAgyAt }).catch(() =>
      collectAgyFallback(prevAgy),
    ),
  ]);

  const doc = {
    generated: nowIso(),
    stale_after_seconds: cfg.stale_after_seconds || 1200,
    host: cfg.host || 'home-pc',
    schema_version: 2,
    generator_version: readRepoVersion(),
    providers: {
      cursor,
      antigravity,
    },
    tasks: Array.isArray(prev?.tasks) ? prev.tasks : [],
  };

  atomicWriteJson(statusJsonPath(), doc);
  return doc;
}

function collectCursorFallback(prev) {
  return {
    id: 'cursor',
    label: 'Cursor',
    status: 'error',
    ok: false,
    error: '暫時讀不到額度，稍後再試',
    error_code: 'unknown',
    collected_at: nowIso(),
    last_success_at: prev?.last_success_at ?? null,
    limits: prev?.limits || [],
    today: null,
    last30: null,
    meta: prev?.meta || {},
  };
}

function collectAgyFallback(prev) {
  return {
    id: 'antigravity',
    label: 'Antigravity',
    status: 'error',
    ok: false,
    error: '暫時讀不到額度，稍後再試',
    error_code: 'unknown',
    collected_at: nowIso(),
    last_success_at: prev?.last_success_at ?? null,
    limits: prev?.limits || [],
    today: null,
    last30: null,
    meta: prev?.meta || {},
  };
}
