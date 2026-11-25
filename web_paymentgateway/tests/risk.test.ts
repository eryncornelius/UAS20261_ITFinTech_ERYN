import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateOrderRisk } from '../lib/risk';

test('marks ordinary discounted orders clear with no risk reasons', () => {
  assert.deepEqual(
    calculateOrderRisk({
      accountAgeMs: 48 * 60 * 60 * 1000,
      recentOrders: 0,
      subtotal: 100_000,
      discountAmount: 10_000,
    }),
    { score: 0, reasons: [], reviewStatus: 'clear' },
  );
});

test('explains high risk using readable reasons and places the order in review', () => {
  const risk = calculateOrderRisk({
    accountAgeMs: 60 * 60 * 1000,
    recentOrders: 2,
    subtotal: 100_000,
    discountAmount: 50_000,
  });

  assert.equal(risk.score, 95);
  assert.equal(risk.reviewStatus, 'pending');
  assert.equal(risk.reasons.length, 4);
  assert.ok(risk.reasons.some((reason) => reason.includes('kurang dari 24 jam')));
  assert.ok(risk.reasons.some((reason) => reason.includes('10 menit terakhir')));
  assert.ok(risk.reasons.some((reason) => reason.includes('30%')));
  assert.ok(risk.reasons.some((reason) => reason.includes('Rp50.000')));
});

test('requires review at the score threshold', () => {
  const risk = calculateOrderRisk({
    accountAgeMs: 48 * 60 * 60 * 1000,
    recentOrders: 0,
    subtotal: 100_000,
    discountAmount: 50_000,
  });

  assert.equal(risk.score, 40);
  assert.equal(risk.reviewStatus, 'pending');
});
