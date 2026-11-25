import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calculateEstimatedServiceFee,
  calculateMerchantNet,
  getPaymentFeeConfig,
  PaymentFeeConfigurationError,
} from '../lib/payment-financials';
import { canTransitionSimulatedPayment } from '../lib/payment-simulator';

test('estimates QRIS, bank transfer, and card service fees', () => {
  assert.equal(calculateEstimatedServiceFee('QRIS', 100_000), 700);
  assert.equal(calculateEstimatedServiceFee('Transfer bank', 100_000), 4_000);
  assert.equal(calculateEstimatedServiceFee('Kartu debit / kredit', 100_000), 4_900);
});

test('caps the estimated service fee at the payment amount', () => {
  assert.equal(calculateEstimatedServiceFee('Transfer bank', 1_000), 1_000);
});

test('calculates merchant net for paid and internally refunded payments', () => {
  assert.equal(calculateMerchantNet(100_000, 700, 'paid'), 99_300);
  assert.equal(calculateMerchantNet(100_000, 700, 'refunded'), -700);
  assert.equal(calculateMerchantNet(100_000, 700, 'failed'), 0);
});

test('accepts explicit non-negative fee configuration', () => {
  const config = getPaymentFeeConfig({
    PAYMENT_FEE_QRIS_RATE: '0.01',
    PAYMENT_FEE_TRANSFER_FIXED: '2500',
    PAYMENT_FEE_CARD_RATE: '0.02',
    PAYMENT_FEE_CARD_FIXED: '1000',
  });
  assert.equal(calculateEstimatedServiceFee('QRIS', 100_000, config), 1_000);
  assert.equal(calculateEstimatedServiceFee('Transfer bank', 100_000, config), 2_500);
  assert.equal(calculateEstimatedServiceFee('Kartu debit / kredit', 100_000, config), 3_000);
});

test('rejects invalid fee configuration', () => {
  assert.throws(
    () => getPaymentFeeConfig({ PAYMENT_FEE_QRIS_RATE: '1.1' }),
    PaymentFeeConfigurationError,
  );
});

test('allows only pending-to-result and paid-to-refunded simulator transitions', () => {
  assert.equal(canTransitionSimulatedPayment('pending', 'paid'), true);
  assert.equal(canTransitionSimulatedPayment('pending', 'failed'), true);
  assert.equal(canTransitionSimulatedPayment('paid', 'refunded'), true);
  assert.equal(canTransitionSimulatedPayment('failed', 'paid'), false);
  assert.equal(canTransitionSimulatedPayment('refunded', 'paid'), false);
  assert.equal(canTransitionSimulatedPayment('pending', 'refunded'), false);
  assert.equal(canTransitionSimulatedPayment('paid', 'failed'), false);
});
