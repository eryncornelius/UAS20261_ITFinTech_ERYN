export type SimulatedPaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export function canTransitionSimulatedPayment(
  current: SimulatedPaymentStatus,
  next: SimulatedPaymentStatus,
): boolean {
  if (current === next) return true;
  if (current === 'pending') return next === 'paid' || next === 'failed';
  return current === 'paid' && next === 'refunded';
}
