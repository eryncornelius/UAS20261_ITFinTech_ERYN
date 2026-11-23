export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateVoucherInput(body: Record<string, unknown>) {
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  const discountType = body.discountType;
  const discountValue = body.discountValue;
  const maxDiscount = body.maxDiscount;
  const minimumSpend = body.minimumSpend;
  const quota = body.quota;
  const perUserLimit = body.perUserLimit;
  const startsAt = typeof body.startsAt === 'string' ? new Date(body.startsAt) : new Date(NaN);
  const endsAt = typeof body.endsAt === 'string' ? new Date(body.endsAt) : new Date(NaN);
  if (
    !/^[A-Z0-9_-]{3,30}$/.test(code) ||
    (discountType !== 'percent' && discountType !== 'fixed') ||
    typeof discountValue !== 'number' ||
    !Number.isSafeInteger(discountValue) ||
    discountValue < 1 ||
    (discountType === 'percent' && discountValue > 100) ||
    (maxDiscount !== undefined &&
      maxDiscount !== null &&
      (typeof maxDiscount !== 'number' || !Number.isSafeInteger(maxDiscount) || maxDiscount < 1)) ||
    typeof minimumSpend !== 'number' ||
    !Number.isSafeInteger(minimumSpend) ||
    minimumSpend < 0 ||
    typeof quota !== 'number' ||
    !Number.isSafeInteger(quota) ||
    quota < 1 ||
    quota > 1_000_000 ||
    typeof perUserLimit !== 'number' ||
    !Number.isSafeInteger(perUserLimit) ||
    perUserLimit < 1 ||
    perUserLimit > quota ||
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    endsAt <= startsAt
  ) {
    return null;
  }
  return {
    code,
    discountType,
    discountValue,
    ...(maxDiscount === undefined || maxDiscount === null ? {} : { maxDiscount }),
    minimumSpend,
    quota,
    perUserLimit,
    startsAt,
    endsAt,
  };
}
