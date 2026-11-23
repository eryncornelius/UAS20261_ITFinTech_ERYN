import mongoose from 'mongoose';
import { Voucher, VoucherUsage } from '@/lib/models';

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
  if (now < voucher.startsAt || now > voucher.endsAt) {
    return { valid: false, error: 'Voucher belum berlaku atau sudah kedaluwarsa.' };
  }
  if (voucher.usedCount >= voucher.quota) {
    return { valid: false, error: 'Kuota voucher sudah habis.' };
  }
  if (subtotal < voucher.minimumSpend) {
    return { valid: false, error: `Minimum belanja voucher ini ${voucher.minimumSpend} rupiah.` };
  }
  const usage = await VoucherUsage.findOne({ voucherId: voucher._id, userId }).lean();
  if ((usage?.usedCount ?? 0) >= voucher.perUserLimit) {
    return { valid: false, error: 'Batas pemakaian voucher untuk akun ini sudah tercapai.' };
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
  if (subtotal < candidate.minimumSpend) {
    throw new VoucherReservationError('Subtotal tidak lagi memenuhi minimum voucher.');
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
