import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeMerchantFinances } from '../lib/merchant-financials';

test('summarizes paid and refunded sales while excluding unsettled payments', () => {
  const summary = summarizeMerchantFinances([
    {
      status: 'paid',
      total: 100_000,
      subtotal: 90_000,
      discountAmount: 10_000,
      serviceFee: 700,
    },
    {
      status: 'refunded',
      total: 50_000,
      subtotal: 45_000,
      discountAmount: 5_000,
      serviceFee: 350,
    },
    {
      status: 'pending',
      total: 80_000,
      subtotal: 80_000,
      discountAmount: 0,
      serviceFee: 560,
    },
    {
      status: 'failed',
      total: 30_000,
      subtotal: 30_000,
      discountAmount: 0,
      serviceFee: 0,
    },
  ]);

  assert.deepEqual(summary, {
    grossRevenue: 135_000,
    voucherDiscount: 15_000,
    serviceFee: 1_050,
    refundAmount: 50_000,
    netReceipts: 98_950,
  });
});

test('returns zeroed financials when no payments have settled', () => {
  assert.deepEqual(
    summarizeMerchantFinances([
      {
        status: 'pending',
        total: 100_000,
        subtotal: 100_000,
        discountAmount: 0,
        serviceFee: 700,
      },
    ]),
    { grossRevenue: 0, voucherDiscount: 0, serviceFee: 0, refundAmount: 0, netReceipts: 0 },
  );
});
