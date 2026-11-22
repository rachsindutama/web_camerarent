import type { MembershipTier } from '@/types/schema';

export interface MembershipBenefitConfig {
  tier: MembershipTier;
  label: string;
  rentalDiscountPercent: number;   // #1: 0% vs 10%
  depositDiscountPercent: number;  // #2: 0% vs 50%
  extraOverdueGraceMinutes: number; // #3: 0m vs +60m
  freeDeliveryKm: number;          // #4: 0km vs 5km
  maxUnitsPerBooking: number | null; // #6: 3 vs unlimited (null)
  prioritySupport: boolean;        // #7: Priority badge in ops & chat
}

export const MEMBERSHIP_BENEFITS: Record<MembershipTier, MembershipBenefitConfig> = {
  general: {
    tier: 'general',
    label: 'General Member',
    rentalDiscountPercent: 0,
    depositDiscountPercent: 0,
    extraOverdueGraceMinutes: 0,
    freeDeliveryKm: 0,
    maxUnitsPerBooking: 3,
    prioritySupport: false,
  },
  premium: {
    tier: 'premium',
    label: 'Premium Member',
    rentalDiscountPercent: 10,
    depositDiscountPercent: 50,
    extraOverdueGraceMinutes: 60,
    freeDeliveryKm: 5,
    maxUnitsPerBooking: null,
    prioritySupport: true,
  },
};

export function getMembershipBenefits(tier?: MembershipTier | null): MembershipBenefitConfig {
  return MEMBERSHIP_BENEFITS[tier === 'premium' ? 'premium' : 'general'];
}

export interface TierPricingResult {
  grossSubtotal: number;
  discountAmount: number;
  netSubtotal: number;
  baseDeposit: number;
  finalDeposit: number;
  billableDeliveryKm: number;
  deliveryFee: number;
  totalAmount: number;
}

export function calculateTierPricing(params: {
  tier?: MembershipTier | null;
  grossSubtotal: number;
  baseDeposit: number;
  isDelivery: boolean;
  distanceKm: number;
  deliveryRatePerKm: number;
}): TierPricingResult {
  const benefits = getMembershipBenefits(params.tier);

  const discountAmount = Math.round(
    (params.grossSubtotal * benefits.rentalDiscountPercent) / 100
  );
  const netSubtotal = Math.max(0, params.grossSubtotal - discountAmount);

  const depositReduction = Math.round(
    (params.baseDeposit * benefits.depositDiscountPercent) / 100
  );
  const finalDeposit = Math.max(0, params.baseDeposit - depositReduction);

  const billableDeliveryKm = params.isDelivery
    ? Math.max(0, Math.max(0, params.distanceKm) - benefits.freeDeliveryKm)
    : 0;
  const deliveryFee = billableDeliveryKm * params.deliveryRatePerKm;

  const totalAmount = netSubtotal + deliveryFee + finalDeposit;

  return {
    grossSubtotal: params.grossSubtotal,
    discountAmount,
    netSubtotal,
    baseDeposit: params.baseDeposit,
    finalDeposit,
    billableDeliveryKm,
    deliveryFee,
    totalAmount,
  };
}

