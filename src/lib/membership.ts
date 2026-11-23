import type { MembershipBenefitConfig, MembershipTier, Tenant } from '@/types/schema';

export type { MembershipBenefitConfig };

export interface PlatformSettings {
  tiers: Record<MembershipTier, MembershipBenefitConfig>;
  defaultDeliveryRatePerKm: number;
  defaultBufferHours: number;
  defaultOverdueGraceMinutes: number;
  defaultOverdueHourlyRatePercent: number;
}

export const DEFAULT_MEMBERSHIP_BENEFITS: Record<MembershipTier, MembershipBenefitConfig> = {
  basic: {
    tier: 'basic',
    label: 'Basic',
    rentalDiscountPercent: 0,
    depositDiscountPercent: 0,
    extraOverdueGraceMinutes: 0,
    freeDeliveryKm: 0,
    maxUnitsPerBooking: 3,
    prioritySupport: false,
  },
  premium: {
    tier: 'premium',
    label: 'Premium',
    rentalDiscountPercent: 10,
    depositDiscountPercent: 50,
    extraOverdueGraceMinutes: 60,
    freeDeliveryKm: 5,
    maxUnitsPerBooking: null,
    prioritySupport: true,
  },
};

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  tiers: DEFAULT_MEMBERSHIP_BENEFITS,
  defaultDeliveryRatePerKm: 12000,
  defaultBufferHours: 3,
  defaultOverdueGraceMinutes: 60,
  defaultOverdueHourlyRatePercent: 10,
};

// Backwards-compatible constant reference
export const MEMBERSHIP_BENEFITS = DEFAULT_MEMBERSHIP_BENEFITS;

// Live settings synced from Firestore platform_settings/global
let livePlatformSettings: PlatformSettings = DEFAULT_PLATFORM_SETTINGS;

export function setLivePlatformSettings(settings: PlatformSettings): void {
  livePlatformSettings = settings;
}

export function getLivePlatformSettings(): PlatformSettings {
  return livePlatformSettings;
}

function clampNum(val: unknown, min: number, max: number, fallback: number): number {
  const num = Number(val);
  if (val === undefined || val === null || Number.isNaN(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export function normalizeTierMap(
  rawTiers?: Record<string, Partial<MembershipBenefitConfig> | undefined> | null
): Record<MembershipTier, MembershipBenefitConfig> {
  const parseTier = (tier: MembershipTier): MembershipBenefitConfig => {
    const def = DEFAULT_MEMBERSHIP_BENEFITS[tier];
    const t = rawTiers?.[tier];
    if (!t) return { ...def };
    const rawMax = t.maxUnitsPerBooking;
    const maxUnitsPerBooking =
      rawMax === null
        ? null
        : rawMax === undefined || Number(rawMax) <= 0
          ? def.maxUnitsPerBooking
          : Math.max(1, Math.floor(Number(rawMax)));

    return {
      tier,
      label: typeof t.label === 'string' && t.label.trim() ? t.label.trim() : def.label,
      rentalDiscountPercent: clampNum(t.rentalDiscountPercent, 0, 100, def.rentalDiscountPercent),
      depositDiscountPercent: clampNum(
        t.depositDiscountPercent,
        0,
        100,
        def.depositDiscountPercent
      ),
      extraOverdueGraceMinutes: clampNum(
        t.extraOverdueGraceMinutes,
        0,
        1440,
        def.extraOverdueGraceMinutes
      ),
      freeDeliveryKm: clampNum(t.freeDeliveryKm, 0, 200, def.freeDeliveryKm),
      maxUnitsPerBooking,
      prioritySupport:
        typeof t.prioritySupport === 'boolean' ? t.prioritySupport : def.prioritySupport,
    };
  };

  return {
    basic: parseTier('basic'),
    premium: parseTier('premium'),
  };
}

export function normalizePlatformSettings(
  raw?: Partial<PlatformSettings> | Record<string, unknown> | null
): PlatformSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_PLATFORM_SETTINGS;
  const r = raw as Record<string, unknown>;
  const rawTiers = (r.tiers ?? {}) as Record<string, Partial<MembershipBenefitConfig> | undefined>;

  return {
    tiers: normalizeTierMap(rawTiers),
    defaultDeliveryRatePerKm: clampNum(
      r.defaultDeliveryRatePerKm,
      0,
      1000000,
      DEFAULT_PLATFORM_SETTINGS.defaultDeliveryRatePerKm
    ),
    defaultBufferHours: clampNum(
      r.defaultBufferHours,
      0,
      72,
      DEFAULT_PLATFORM_SETTINGS.defaultBufferHours
    ),
    defaultOverdueGraceMinutes: clampNum(
      r.defaultOverdueGraceMinutes,
      0,
      1440,
      DEFAULT_PLATFORM_SETTINGS.defaultOverdueGraceMinutes
    ),
    defaultOverdueHourlyRatePercent: clampNum(
      r.defaultOverdueHourlyRatePercent,
      1,
      100,
      DEFAULT_PLATFORM_SETTINGS.defaultOverdueHourlyRatePercent
    ),
  };
}

export function resolveTenantMembershipTiers(
  tenant?: Pick<Tenant, 'membershipTiers'> | null,
  fallbackTiers?: Record<MembershipTier, MembershipBenefitConfig>
): Record<MembershipTier, MembershipBenefitConfig> {
  if (tenant?.membershipTiers) {
    return normalizeTierMap(tenant.membershipTiers);
  }
  return fallbackTiers ?? livePlatformSettings.tiers;
}

export function getMembershipBenefits(
  tier?: string | null,
  customTiers?: Record<MembershipTier, MembershipBenefitConfig>
): MembershipBenefitConfig {
  const source = customTiers ?? livePlatformSettings.tiers;
  return source[tier === 'premium' ? 'premium' : 'basic'];
}

export function formatTierSummaryParts(config: MembershipBenefitConfig): string[] {
  const parts: string[] = [];
  parts.push(
    config.rentalDiscountPercent > 0 ? `Diskon ${config.rentalDiscountPercent}%` : 'Tarif standar'
  );
  parts.push(
    config.depositDiscountPercent > 0
      ? `Deposit -${config.depositDiscountPercent}%`
      : 'Deposit 100%'
  );
  parts.push(
    config.extraOverdueGraceMinutes > 0
      ? `Grace +${config.extraOverdueGraceMinutes} menit`
      : 'Grace standar cabang'
  );
  parts.push(
    config.freeDeliveryKm > 0 ? `Gratis ongkir ${config.freeDeliveryKm} km` : 'Ongkir penuh'
  );
  parts.push(
    config.maxUnitsPerBooking === null
      ? 'Unlimited unit'
      : `Maks. ${config.maxUnitsPerBooking} unit/booking`
  );
  if (config.prioritySupport) {
    parts.push('Priority');
  }
  return parts;
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
  customTiers?: Record<MembershipTier, MembershipBenefitConfig>;
}): TierPricingResult {
  const benefits = getMembershipBenefits(params.tier, params.customTiers);

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
