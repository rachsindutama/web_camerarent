import { useMemo } from 'react';
import { getMembershipBenefits, resolveTenantMembershipTiers } from '@/lib/membership';
import type { Booking, Tenant } from '@/types/schema';

export interface OverdueCalculation {
  isOverdue: boolean;
  lateMinutes: number;
  billableLateHours: number;
  estimatedFine: number;
  graceDeadline: Date;
  effectiveGraceMinutes: number;
}

export function calculateOverdueFine(
  booking: Pick<Booking, 'endDate' | 'items' | 'bookingStatus' | 'membershipTier'>,
  tenant: Pick<Tenant, 'overdueGraceMinutes' | 'overdueHourlyRatePercent' | 'membershipTiers'> | null,
  now = new Date()
): OverdueCalculation {
  const endDate = booking.endDate.toDate();
  const baseGraceMinutes = tenant?.overdueGraceMinutes ?? 60;
  const resolvedTiers = resolveTenantMembershipTiers(tenant);
  const tierBenefits = getMembershipBenefits(booking.membershipTier, resolvedTiers);
  const effectiveGraceMinutes = baseGraceMinutes + tierBenefits.extraOverdueGraceMinutes;
  const hourlyRatePercent = tenant?.overdueHourlyRatePercent ?? 10;
  const graceDeadline = new Date(endDate.getTime() + effectiveGraceMinutes * 60 * 1000);

  if (
    booking.bookingStatus === 'completed' ||
    booking.bookingStatus === 'cancelled' ||
    now <= graceDeadline
  ) {
    return {
      isOverdue: false,
      lateMinutes: 0,
      billableLateHours: 0,
      estimatedFine: 0,
      graceDeadline,
      effectiveGraceMinutes,
    };
  }

  const lateMinutes = Math.floor((now.getTime() - graceDeadline.getTime()) / (1000 * 60));
  const billableLateHours = Math.max(1, Math.ceil(lateMinutes / 60));
  const totalDailyRate = booking.items.reduce((sum, item) => sum + item.dailyRate, 0);
  const hourlyFine = Math.round((totalDailyRate * hourlyRatePercent) / 100);
  const estimatedFine = hourlyFine * billableLateHours;

  return {
    isOverdue: true,
    lateMinutes,
    billableLateHours,
    estimatedFine,
    graceDeadline,
    effectiveGraceMinutes,
  };
}

export function useOverdueCalc(
  booking: Pick<Booking, 'endDate' | 'items' | 'bookingStatus' | 'membershipTier'> | null,
  tenant: Pick<Tenant, 'overdueGraceMinutes' | 'overdueHourlyRatePercent'> | null
): OverdueCalculation {
  return useMemo(() => {
    if (!booking) {
      return {
        isOverdue: false,
        lateMinutes: 0,
        billableLateHours: 0,
        estimatedFine: 0,
        graceDeadline: new Date(),
        effectiveGraceMinutes: tenant?.overdueGraceMinutes ?? 60,
      };
    }
    return calculateOverdueFine(booking, tenant);
  }, [booking, tenant]);
}
