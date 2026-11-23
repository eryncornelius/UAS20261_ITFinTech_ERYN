import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateVoucherInput } from '../lib/admin-vouchers';
import { calculateVoucherDiscount } from '../lib/vouchers';

test('calculates percentage voucher discount in rupiah', () => {
  assert.equal(calculateVoucherDiscount({ discountType: 'percent', discountValue: 15 }, 100_000), 15_000);
});

test('applies the maximum discount limit', () => {
  assert.equal(
    calculateVoucherDiscount({ discountType: 'percent', discountValue: 50, maxDiscount: 20_000 }, 100_000),
    20_000,
  );
});

test('does not discount more than the subtotal', () => {
  assert.equal(calculateVoucherDiscount({ discountType: 'fixed', discountValue: 25_000 }, 10_000), 10_000);
});

test('rejects percentage values over one hundred', () => {
  assert.equal(
    validateVoucherInput({
      code: 'HEMAT',
      discountType: 'percent',
      discountValue: 101,
      minimumSpend: 0,
      quota: 10,
      perUserLimit: 1,
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2027-01-01T00:00:00.000Z',
    }),
    null,
  );
});

test('rejects a per-customer limit larger than the global quota', () => {
  assert.equal(
    validateVoucherInput({
      code: 'HEMAT',
      discountType: 'fixed',
      discountValue: 5000,
      minimumSpend: 0,
      quota: 2,
      perUserLimit: 3,
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2027-01-01T00:00:00.000Z',
    }),
    null,
  );
});

test('normalizes valid voucher codes before saving', () => {
  const voucher = validateVoucherInput({
    code: 'hemat-10',
    discountType: 'percent',
    discountValue: 10,
    maxDiscount: 20_000,
    minimumSpend: 50_000,
    quota: 50,
    perUserLimit: 1,
    startsAt: '2026-01-01T00:00:00.000Z',
    endsAt: '2027-01-01T00:00:00.000Z',
  });
  assert.equal(voucher?.code, 'HEMAT-10');
});
