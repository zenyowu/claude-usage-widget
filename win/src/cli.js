#!/usr/bin/env node
import { runAggregate } from './aggregate.js';
import { writeDefaultConfig } from './config.js';
import { runNotify } from './notify.js';
import { startServer } from './serve.js';
import { generateToken, rotateToken, readToken, tokenExists } from './token_mgmt.js';
import { runWatchdog } from './watchdog.js';
import { ensureStateDir } from './paths.js';

const [cmd, ...rest] = process.argv.slice(2);

async function main() {
  switch (cmd) {
    case 'aggregate':
      await runAggregate({ forceAgy: rest.includes('--force-agy') });
      console.log('wrote status.json');
      break;
    case 'serve':
      startServer();
      break;
    case 'notify':
      console.log(JSON.stringify(await runNotify()));
      break;
    case 'watchdog':
      await runWatchdog();
      break;
    case 'token': {
      const sub = rest[0] || 'generate';
      if (sub === 'generate') generateToken();
      else if (sub === 'rotate') rotateToken();
      else if (sub === 'show-exists') console.log(tokenExists() ? 'yes' : 'no');
      else if (sub === 'print-for-install') {
        // Used by install.ps1 once; still prints.
        if (!tokenExists()) generateToken();
        else console.log(readToken());
      } else {
        usage(1);
      }
      break;
    }
    case 'init-config':
      ensureStateDir();
      console.log(writeDefaultConfig());
      break;
    case 'help':
    case undefined:
      usage(0);
      break;
    default:
      usage(1);
  }
}

function usage(code) {
  console.log(`agent-status <command>

Commands:
  aggregate [--force-agy]   Collect providers → status.json
  serve                     Localhost HTTP (Bearer /status.json, open /healthz)
  notify                    Evaluate ntfy rules once
  watchdog                  Single process: serve + timers
  token generate|rotate     Endpoint Bearer management
  init-config               Write ~/.agent-status/config.toml
`);
  process.exit(code);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
