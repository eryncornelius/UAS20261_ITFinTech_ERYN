export type PaymentMethod = 'QRIS' | 'Transfer bank' | 'Kartu debit / kredit';

export type PaymentFeeConfig = {
  qrisRate: number;
  bankTransferFixed: number;
  cardRate: number;
  cardFixed: number;
};

const defaultFeeConfig: PaymentFeeConfig = {
  qrisRate: 0.007,
  bankTransferFixed: 4000,
  cardRate: 0.029,
  cardFixed: 2000,
};

export class PaymentFeeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentFeeConfigurationError';
  }
}

function readRate(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') return fallback;
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new PaymentFeeConfigurationError(`${name} harus berupa angka antara 0 dan 1.`);
  }
  return rate;
}

function readFixedFee(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') return fallback;
  const fee = Number(value);
  if (!Number.isSafeInteger(fee) || fee < 0) {
    throw new PaymentFeeConfigurationError(`${name} harus berupa bilangan bulat rupiah non-negatif.`);
  }
  return fee;
}

export function getPaymentFeeConfig(env: Record<string, string | undefined> = process.env): PaymentFeeConfig {
  return {
    qrisRate: readRate(env.PAYMENT_FEE_QRIS_RATE, defaultFeeConfig.qrisRate, 'PAYMENT_FEE_QRIS_RATE'),
    bankTransferFixed: readFixedFee(
      env.PAYMENT_FEE_TRANSFER_FIXED,
      defaultFeeConfig.bankTransferFixed,
      'PAYMENT_FEE_TRANSFER_FIXED',
    ),
    cardRate: readRate(env.PAYMENT_FEE_CARD_RATE, defaultFeeConfig.cardRate, 'PAYMENT_FEE_CARD_RATE'),
    cardFixed: readFixedFee(
      env.PAYMENT_FEE_CARD_FIXED,
      defaultFeeConfig.cardFixed,
      'PAYMENT_FEE_CARD_FIXED',
    ),
  };
}

export function calculateEstimatedServiceFee(
  method: PaymentMethod,
  amount: number,
  config: PaymentFeeConfig = defaultFeeConfig,
): number {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError('Nominal pembayaran harus berupa bilangan bulat rupiah non-negatif.');
  }

  const estimatedFee =
    method === 'QRIS'
      ? Math.round(amount * config.qrisRate)
      : method === 'Transfer bank'
        ? config.bankTransferFixed
        : Math.round(amount * config.cardRate) + config.cardFixed;
  return Math.min(amount, estimatedFee);
}

export function calculateMerchantNet(
  amount: number,
  serviceFee: number,
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'refunded',
): number {
  if (status === 'paid') return amount - serviceFee;
  if (status === 'refunded') return -serviceFee;
  return 0;
}
