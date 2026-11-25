import mongoose from 'mongoose';
import { Voucher, VoucherUsage } from '@/lib/models';
import { getVoucherEligibilityError } from '@/lib/voucher-rules';

export class VoucherReservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VoucherReservationError';
  }
}

export type VoucherValidation =
  | { valid: true; voucher: NonNullable<Awaited<ReturnType<typeof Voucher.findOne>>>; discountAmount: number }
  | { valid: false; error: string };

export function calculateVoucherDiscount(
  voucher: { discountType: 'percent' | 'fixed'; discountValue: number; maxDiscount?: number | null },
  subtotal: number,
): number {
  const rawDiscount =
    voucher.discountType === 'percent'
      ? Math.round((subtotal * voucher.discountValue) / 100)
      : voucher.discountValue;
  const cappedDiscount =
    voucher.maxDiscount == null ? rawDiscount : Math.min(rawDiscount, voucher.maxDiscount);
  return Math.min(subtotal, cappedDiscount);
}

export async function validateVoucher(
  code: string,
  subtotal: number,
  userId: string,
): Promise<VoucherValidation> {
  const voucher = await Voucher.findOne({ code: code.trim().toUpperCase(), isActive: true });
  if (!voucher) return { valid: false, error: 'Kode voucher tidak ditemukan atau tidak aktif.' };

  const now = new Date();
  const usage = await VoucherUsage.findOne({ voucherId: voucher._id, userId }).lean();
  const eligibilityError = getVoucherEligibilityError(
    {
      isActive: voucher.isActive,
      startsAt: voucher.startsAt,
      endsAt: voucher.endsAt,
      usedCount: voucher.usedCount,
      quota: voucher.quota,
      minimumSpend: voucher.minimumSpend,
      perUserLimit: voucher.perUserLimit,
      userUsedCount: usage?.usedCount ?? 0,
    },
    subtotal,
    now,
  );
  if (eligibilityError) {
    return { valid: false, error: eligibilityError };
  }

  return {
    valid: true,
    voucher,
    discountAmount: calculateVoucherDiscount(voucher, subtotal),
  };
}

export async function reserveVoucherUsage(
  code: string,
  userId: mongoose.Types.ObjectId,
  subtotal: number,
  session: mongoose.ClientSession,
): Promise<{ voucher: NonNullable<Awaited<ReturnType<typeof Voucher.findOne>>>; discountAmount: number }> {
  const now = new Date();
  const candidate = await Voucher.findOne({
    code: code.trim().toUpperCase(),
    isActive: true,
    startsAt: { $lte: now },
    endsAt: { $gte: now },
  })
    .session(session)
    .lean();
  if (!candidate) throw new VoucherReservationError('Voucher tidak aktif atau sudah kedaluwarsa.');
  const existingUsage = await VoucherUsage.findOne({
    voucherId: candidate._id,
    userId,
  }).session(session).lean();
  const eligibilityError = getVoucherEligibilityError(
    {
      isActive: candidate.isActive,
      startsAt: candidate.startsAt,
      endsAt: candidate.endsAt,
      usedCount: candidate.usedCount,
      quota: candidate.quota,
      minimumSpend: candidate.minimumSpend,
      perUserLimit: candidate.perUserLimit,
      userUsedCount: existingUsage?.usedCount ?? 0,
    },
    subtotal,
    now,
  );
  if (eligibilityError) {
    throw new VoucherReservationError(eligibilityError);
  }

  const usage = await VoucherUsage.findOneAndUpdate(
    { voucherId: candidate._id, userId },
    { $inc: { usedCount: 1 } },
    { upsert: true, new: true, session },
  );
  const voucher = await Voucher.findOneAndUpdate(
    {
      _id: candidate._id,
      isActive: true,
      startsAt: { $lte: now },
      endsAt: { $gte: now },
      $expr: { $lt: ['$usedCount', '$quota'] },
    },
    { $inc: { usedCount: 1 } },
    { new: true, session },
  );
  if (!usage || !voucher || usage.usedCount > voucher.perUserLimit) {
    throw new VoucherReservationError('Kuota voucher atau batas penggunaan akun sudah tercapai.');
  }
  return { voucher, discountAmount: calculateVoucherDiscount(candidate, subtotal) };
}

export async function releaseVoucherUsage(
  voucherId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  activeSession?: mongoose.ClientSession,
): Promise<void> {
  const release = async (session: mongoose.ClientSession) => {
    await Voucher.updateOne(
      { _id: voucherId, usedCount: { $gt: 0 } },
      { $inc: { usedCount: -1 } },
      { session },
    );
    await VoucherUsage.updateOne(
      { voucherId, userId, usedCount: { $gt: 0 } },
      { $inc: { usedCount: -1 } },
      { session },
    );
  };
  if (activeSession) {
    await release(activeSession);
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await release(session);
    });
  } finally {
    await session.endSession();
  }
}
