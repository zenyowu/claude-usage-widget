import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const WIN_ROOT = path.resolve(__dirname, '..');
export const REPO_ROOT = path.resolve(WIN_ROOT, '..');

export function stateDir() {
  return process.env.AGENT_STATUS_HOME || path.join(os.homedir(), '.agent-status');
}

export function statusJsonPath() {
  return path.join(stateDir(), 'status.json');
}

export function endpointTokenPath() {
  return path.join(stateDir(), 'endpoint.token');
}

export function configPath() {
  const home = stateDir();
  const toml = path.join(home, 'config.toml');
  const json = path.join(home, 'config.json');
  if (fs.existsSync(toml)) return toml;
  if (fs.existsSync(json)) return json;
  return toml;
}

export function notifyStatePath() {
  return path.join(stateDir(), 'notify-state.json');
}

export function lockPath() {
  return path.join(stateDir(), 'watchdog.lock');
}

export function tmpDir() {
  return path.join(stateDir(), 'tmp');
}

export function readRepoVersion() {
  try {
    return fs.readFileSync(path.join(REPO_ROOT, 'VERSION'), 'utf8').trim();
  } catch {
    return '0.0.0';
  }
}

export function ensureStateDir() {
  const dir = stateDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(tmpDir(), { recursive: true });
  return dir;
}
