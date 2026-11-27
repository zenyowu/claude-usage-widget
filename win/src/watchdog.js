import fs from 'node:fs';
import { runAggregate } from './aggregate.js';
import { loadConfig } from './config.js';
import { runNotify } from './notify.js';
import { ensureStateDir, lockPath } from './paths.js';
import { startServer } from './serve.js';
import { purgeTmp } from './util.js';
import { tmpDir } from './paths.js';

/**
 * Single logged-in-user process:
 * - in-process HTTP serve
 * - aggregate + notify timers
 * - cloudflared preferred as Windows service (not supervised here)
 */
export async function runWatchdog() {
  ensureStateDir();
  purgeTmp(tmpDir());
  if (!acquireLock()) {
    console.error('另一個 watchdog 已在執行');
    process.exit(1);
  }

  const cfg = loadConfig();
  startServer({ port: cfg.port });

  let aggInFlight = false;
  let notifyInFlight = false;

  const tickAggregate = async () => {
    if (aggInFlight) return;
    aggInFlight = true;
    try {
      await runAggregate();
    } catch (e) {
      console.error('aggregate failed', e?.message || e);
    } finally {
      aggInFlight = false;
    }
  };

  const tickNotify = async () => {
    if (notifyInFlight) return;
    notifyInFlight = true;
    try {
      await runNotify();
    } catch (e) {
      console.error('notify failed', e?.message || e);
    } finally {
      notifyInFlight = false;
    }
  };

  // Kick once, then recursive setTimeout (avoids overlap pile-up).
  const aggMs = (cfg.aggregate_interval_seconds || 300) * 1000;
  const notifyMs = (cfg.notify_interval_seconds || 300) * 1000;

  const loopAgg = async () => {
    await tickAggregate();
    setTimeout(loopAgg, aggMs);
  };
  const loopNotify = async () => {
    await tickNotify();
    setTimeout(loopNotify, notifyMs);
  };

  loopAgg();
  setTimeout(loopNotify, 5_000);

  const shutdown = () => {
    releaseLock();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function acquireLock() {
  const p = lockPath();
  try {
    if (fs.existsSync(p)) {
      const prev = Number(fs.readFileSync(p, 'utf8'));
      try {
        process.kill(prev, 0);
        return false; // still alive
      } catch {
        /* stale */
      }
    }
    fs.writeFileSync(p, String(process.pid));
    return true;
  } catch {
    return true;
  }
}

function releaseLock() {
  try {
    const p = lockPath();
    if (fs.existsSync(p) && Number(fs.readFileSync(p, 'utf8')) === process.pid) {
      fs.unlinkSync(p);
    }
  } catch {
    /* ignore */
  }
}
