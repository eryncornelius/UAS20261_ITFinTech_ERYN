export type MerchantFinancialRecord = {
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';
  total: number;
  subtotal: number;
  discountAmount: number;
  serviceFee: number;
};

export type MerchantFinancialSummary = {
  grossRevenue: number;
  voucherDiscount: number;
  serviceFee: number;
  refundAmount: number;
  netReceipts: number;
};

export function finalizeMerchantFinancialSummary(input: {
  grossRevenue: number;
  voucherDiscount: number;
  serviceFee: number;
  refundAmount: number;
  capturedAmount: number;
}): MerchantFinancialSummary {
  return {
    grossRevenue: input.grossRevenue,
    voucherDiscount: input.voucherDiscount,
    serviceFee: input.serviceFee,
    refundAmount: input.refundAmount,
    netReceipts: input.capturedAmount - input.refundAmount - input.serviceFee,
  };
}

export function summarizeMerchantFinances(
  records: MerchantFinancialRecord[],
): MerchantFinancialSummary {
  const capturedRecords = records.filter(
    (record) => record.status === 'paid' || record.status === 'refunded',
  );
  const capturedAmount = capturedRecords.reduce((sum, record) => sum + record.total, 0);
  const refundAmount = capturedRecords.reduce(
    (sum, record) => sum + (record.status === 'refunded' ? record.total : 0),
    0,
  );
  const serviceFee = capturedRecords.reduce((sum, record) => sum + record.serviceFee, 0);

  return finalizeMerchantFinancialSummary({
    grossRevenue: capturedRecords.reduce((sum, record) => sum + record.subtotal, 0),
    voucherDiscount: capturedRecords.reduce((sum, record) => sum + record.discountAmount, 0),
    serviceFee,
    refundAmount,
    capturedAmount,
  });
}
