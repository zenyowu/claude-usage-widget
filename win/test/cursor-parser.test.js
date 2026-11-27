import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapCursorUsage } from '../src/collectors/cursor.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixture = JSON.parse(
  fs.readFileSync(path.join(root, 'docs/fixtures/cursor-GetCurrentPeriodUsage.sample.json'), 'utf8'),
);

test('mapCursorUsage reads plan percent as used', () => {
  const { _fixture_note, ...data } = fixture;
  void _fixture_note;
  const p = mapCursorUsage(data, { collectedAt: '2026-11-27T19:00:00+08:00' });
  assert.equal(p.status, 'ok');
  assert.equal(p.limits[0].id, 'cursor:plan');
  assert.equal(p.limits[0].percent, 42);
  assert.equal(p.limits[0].window, 'billing_cycle');
  assert.ok(p.limits[0].resets);
});

test('mapCursorUsage prefers spend-based percent when disagreement is large', () => {
  const data = {
    billingCycleEnd: '1735257600000',
    planUsage: {
      includedSpend: 9000,
      limit: 10000,
      totalPercentUsed: 10,
    },
    spendLimitUsage: {},
  };
  const p = mapCursorUsage(data);
  assert.equal(p.limits[0].percent, 90);
});
