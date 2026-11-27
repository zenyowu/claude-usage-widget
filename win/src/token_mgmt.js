import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { endpointTokenPath, ensureStateDir, stateDir } from './paths.js';
import { applyUserOnlyAcl } from './util.js';

export function generateToken({ print = true } = {}) {
  ensureStateDir();
  applyUserOnlyAcl(stateDir());
  const token = randomBytes(32).toString('base64url');
  const p = endpointTokenPath();
  fs.writeFileSync(p, token, { encoding: 'utf8', mode: 0o600 });
  applyUserOnlyAcl(p);
  applyUserOnlyAcl(stateDir());
  if (print) {
    console.log('Endpoint Bearer token (store in Scriptable Keychain; shown once):');
    console.log(token);
  }
  return token;
}

export function rotateToken() {
  // MVP: immediate cutover (no grace window).
  return generateToken({ print: true });
}

export function readToken() {
  const p = endpointTokenPath();
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8').trim();
}

export function tokenExists() {
  return fs.existsSync(endpointTokenPath());
}
