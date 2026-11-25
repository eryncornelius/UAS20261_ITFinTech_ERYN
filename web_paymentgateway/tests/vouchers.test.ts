import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateVoucherInput } from '../lib/admin-vouchers';
import { calculateVoucherDiscount } from '../lib/vouchers';
import { getVoucherEligibilityError, type VoucherEligibilityInput } from '../lib/voucher-rules';

const now = new Date('2026-11-25T10:00:00.000Z');
const eligibleVoucher: VoucherEligibilityInput = {
  isActive: true,
  startsAt: new Date('2026-11-01T00:00:00.000Z'),
  endsAt: new Date('2026-12-01T00:00:00.000Z'),
  usedCount: 0,
  quota: 10,
  minimumSpend: 20_000,
  perUserLimit: 1,
  userUsedCount: 0,
};

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

test('accepts a valid voucher within its validity period and limits', () => {
  assert.equal(getVoucherEligibilityError(eligibleVoucher, 50_000, now), null);
});

test('rejects an expired voucher', () => {
  assert.equal(
    getVoucherEligibilityError(
      { ...eligibleVoucher, endsAt: new Date('2026-11-24T23:59:59.000Z') },
      50_000,
      now,
    ),
    'Voucher belum berlaku atau sudah kedaluwarsa.',
  );
});

test('rejects a voucher whose global quota is exhausted', () => {
  assert.equal(
    getVoucherEligibilityError({ ...eligibleVoucher, usedCount: 10 }, 50_000, now),
    'Kuota voucher sudah habis.',
  );
});

test('prevents a customer from claiming a single-use voucher twice', () => {
  assert.equal(
    getVoucherEligibilityError({ ...eligibleVoucher, userUsedCount: 1 }, 50_000, now),
    'Batas pemakaian voucher untuk akun ini sudah tercapai.',
  );
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
