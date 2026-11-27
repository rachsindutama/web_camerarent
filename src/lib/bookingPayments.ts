import type { Booking, BookingPayment, PaymentStatus } from '@/types/schema';

export interface BookingPaymentSummary {
  payments: BookingPayment[];
  verifiedAmount: number;
  pendingAmount: number;
  rejectedCount: number;
  remainingAmount: number;
  remainingUncommitted: number;
  hasPendingInstallments: boolean;
  isFullyPaid: boolean;
  canUploadMore: boolean;
}

export function getBookingPaymentSummary(booking: Booking): BookingPaymentSummary {
  const payments = booking.payments ?? [];

  let verifiedAmount = 0;
  let pendingAmount = 0;
  let rejectedCount = 0;

  if (payments.length > 0) {
    for (const p of payments) {
      if (p.status === 'verified') {
        verifiedAmount += Math.max(0, Number(p.amount) || 0);
      } else if (p.status === 'waiting_verification') {
        pendingAmount += Math.max(0, Number(p.amount) || 0);
      } else if (p.status === 'rejected') {
        rejectedCount += 1;
      }
    }
  } else if (booking.paymentStatus === 'paid' || booking.paymentStatus === 'refunded') {
    verifiedAmount = booking.totalAmount;
  } else {
    verifiedAmount = Math.max(0, Number(booking.amountPaid) || 0);
  }

  const remainingAmount = Math.max(0, booking.totalAmount - verifiedAmount);
  const remainingUncommitted = Math.max(0, booking.totalAmount - verifiedAmount - pendingAmount);
  const isFullyPaid =
    booking.paymentStatus === 'paid' ||
    booking.paymentStatus === 'refunded' ||
    (booking.totalAmount > 0 && verifiedAmount >= booking.totalAmount);

  const hasPendingInstallments =
    payments.some((p) => p.status === 'waiting_verification') ||
    (payments.length === 0 && booking.paymentStatus === 'waiting_verification');

  const canUploadMore =
    booking.bookingStatus !== 'cancelled' &&
    booking.bookingStatus !== 'completed' &&
    !isFullyPaid &&
    remainingUncommitted > 0;

  return {
    payments,
    verifiedAmount,
    pendingAmount,
    rejectedCount,
    remainingAmount,
    remainingUncommitted,
    hasPendingInstallments,
    isFullyPaid,
    canUploadMore,
  };
}

export function computeNextPaymentStatus(
  totalAmount: number,
  payments: BookingPayment[]
): PaymentStatus {
  const verifiedSum = payments
    .filter((p) => p.status === 'verified')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const hasPending = payments.some((p) => p.status === 'waiting_verification');

  if (totalAmount > 0 && verifiedSum >= totalAmount) return 'paid';
  if (hasPending) return 'waiting_verification';
  if (verifiedSum > 0) return 'partial_paid';
  return 'unpaid';
}

export function suggestPaymentStageName(
  booking: Booking,
  amount: number,
  remainingUncommitted: number,
  tx: (en: string, id: string) => string
): string {
  const validCount = (booking.payments ?? []).filter((p) => p.status !== 'rejected').length;
  const coversAllRemaining = amount >= remainingUncommitted && remainingUncommitted > 0;

  if (coversAllRemaining) {
    return validCount === 0
      ? tx('Full Payment', 'Pelunasan')
      : tx('Final Settlement', 'Pelunasan');
  }
  if (validCount === 0) {
    return tx('Payment 1 (DP)', 'Pembayaran 1 (DP)');
  }
  return tx(`Payment ${validCount + 1}`, `Pembayaran ${validCount + 1}`);
}

