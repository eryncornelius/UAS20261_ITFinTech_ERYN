export type VoucherEligibilityInput = {
  isActive: boolean;
  startsAt: Date;
  endsAt: Date;
  usedCount: number;
  quota: number;
  minimumSpend: number;
  perUserLimit: number;
  userUsedCount: number;
};

export function getVoucherEligibilityError(
  voucher: VoucherEligibilityInput,
  subtotal: number,
  now: Date,
): string | null {
  if (!voucher.isActive) return 'Kode voucher tidak ditemukan atau tidak aktif.';
  if (now < voucher.startsAt || now > voucher.endsAt) {
    return 'Voucher belum berlaku atau sudah kedaluwarsa.';
  }
  if (voucher.usedCount >= voucher.quota) return 'Kuota voucher sudah habis.';
  if (subtotal < voucher.minimumSpend) {
    return `Minimum belanja voucher ini ${voucher.minimumSpend} rupiah.`;
  }
  if (voucher.userUsedCount >= voucher.perUserLimit) {
    return 'Batas pemakaian voucher untuk akun ini sudah tercapai.';
  }
  return null;
}
