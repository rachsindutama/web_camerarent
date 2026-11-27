import { doc, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { syncAvailabilitySlotStatus } from '@/lib/availability';
import type { Booking } from '@/types/schema';

export interface PaymentExpiryInfo {
  applies: boolean;
  deadlineMs: number;
  remainingMs: number;
  isExpired: boolean;
  isUrgent: boolean;
  labelEn: string;
  labelId: string;
}

export function getPaymentExpiryInfo(
  booking: Booking,
  expiryHours: number,
  nowMs: number = Date.now()
): PaymentExpiryInfo {
  const hasAnyValidPayment = (booking.payments ?? []).some((p) => p.status !== 'rejected');
  const applies =
    booking.bookingStatus === 'pending_payment' &&
    booking.paymentStatus === 'unpaid' &&
    !hasAnyValidPayment;

  if (!applies) {
    return {
      applies: false,
      deadlineMs: 0,
      remainingMs: 0,
      isExpired: false,
      isUrgent: false,
      labelEn: '',
      labelId: '',
    };
  }

  const safeHours = Math.max(1, expiryHours || 2);
  const createdMs = booking.createdAt?.toMillis ? booking.createdAt.toMillis() : nowMs;
  const deadlineMs = createdMs + safeHours * 60 * 60 * 1000;
  const remainingMs = Math.max(0, deadlineMs - nowMs);
  const isExpired = remainingMs === 0;
  const isUrgent = !isExpired && remainingMs <= 30 * 60 * 1000;

  if (isExpired) {
    return {
      applies: true,
      deadlineMs,
      remainingMs: 0,
      isExpired: true,
      isUrgent: true,
      labelEn: 'Payment expired',
      labelId: 'Batas bayar habis',
    };
  }

  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  const durationEn = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  const durationId = hours > 0 ? `${hours}j ${mins}m` : `${mins}m`;

  return {
    applies: true,
    deadlineMs,
    remainingMs,
    isExpired: false,
    isUrgent,
    labelEn: `Pay within ${durationEn}`,
    labelId: `Bayar dlm ${durationId}`,
  };
}

/**
 * Auto-cancels unpaid `pending_payment` bookings whose payment window has elapsed,
 * releasing their reserved `availability_slots` so serial units become bookable again.
 */
export async function expireStalePendingBookings(
  bookings: Booking[],
  expiryHours: number,
  nowMs: number = Date.now()
): Promise<string[]> {
  if (!db) return [];

  const stale = bookings.filter((b) => getPaymentExpiryInfo(b, expiryHours, nowMs).isExpired);
  if (stale.length === 0) return [];

  const expiredInvoices: string[] = [];

  for (const booking of stale) {
    try {
      await updateDoc(doc(db, 'bookings', booking.id), {
        bookingStatus: 'cancelled',
        cancelledAt: Timestamp.now(),
        returnNotes: `Auto-cancelled: unpaid payment window (${Math.max(1, expiryHours)}h) expired.`,
      });
      await syncAvailabilitySlotStatus(booking.id, 'cancelled');
      expiredInvoices.push(booking.invoiceNumber);
    } catch (error) {
      console.error(`Auto-expiry failed for ${booking.invoiceNumber}:`, error);
    }
  }

  return expiredInvoices;
}

