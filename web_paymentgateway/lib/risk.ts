import mongoose from 'mongoose';
import { Checkout, User } from '@/lib/models';

export type OrderRisk = {
  score: number;
  reasons: string[];
  reviewStatus: 'clear' | 'pending';
};

export async function scoreOrderRisk(
  userId: string,
  subtotal: number,
  discountAmount: number,
  session: mongoose.ClientSession,
): Promise<OrderRisk> {
  const now = new Date();
  const user = await User.findById(userId).select('createdAt').session(session).lean();
  const recentOrders = await Checkout.countDocuments({
    customerUserId: userId,
    createdAt: { $gte: new Date(now.getTime() - 10 * 60 * 1000) },
  })
    .session(session)
    .exec();

  let score = 0;
  const reasons: string[] = [];
  const accountAgeMs = user?.createdAt ? now.getTime() - user.createdAt.getTime() : 0;
  if (accountAgeMs < 24 * 60 * 60 * 1000 && discountAmount >= 20_000) {
    score += 30;
    reasons.push('Akun berusia kurang dari 24 jam menggunakan diskon bernilai besar.');
  }
  if (recentOrders >= 2) {
    score += 25;
    reasons.push('Ada beberapa pesanan dari akun ini dalam 10 menit terakhir.');
  }
  if (subtotal > 0 && discountAmount / subtotal >= 0.3) {
    score += 20;
    reasons.push('Rasio diskon terhadap subtotal mencapai 30% atau lebih.');
  }
  if (discountAmount >= 50_000) {
    score += 20;
    reasons.push('Nilai diskon mencapai Rp50.000 atau lebih.');
  }

  const cappedScore = Math.min(score, 100);
  return {
    score: cappedScore,
    reasons,
    reviewStatus: cappedScore >= 40 ? 'pending' : 'clear',
  };
}
