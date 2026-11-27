import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapAgyUsage } from '../src/collectors/antigravity.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixture = JSON.parse(
  fs.readFileSync(path.join(root, 'docs/fixtures/agy-usage.redacted.json'), 'utf8'),
);

test('mapAgyUsage parses groups/buckets and maps 1970 reset to null', () => {
  const p = mapAgyUsage(fixture, { collectedAt: '2026-11-27T19:00:00+08:00' });
  assert.equal(p.status, 'ok');
  assert.ok(p.limits.length >= 4);
  const weekly = p.limits.find((l) => l.id === 'antigravity:gemini-weekly');
  assert.ok(weekly);
  assert.equal(typeof weekly.percent, 'number');
  assert.ok(weekly.percent >= 0 && weekly.percent <= 100);
  const third = p.limits.find((l) => l.id === 'antigravity:3p-weekly');
  assert.equal(third.resets, null);
  assert.equal(third.percent, 0);
});

test('mapAgyUsage rejects non-zero turn payloads', () => {
  assert.throws(() => mapAgyUsage({ ...fixture, num_turns: 1 }), /rejected/);
});
