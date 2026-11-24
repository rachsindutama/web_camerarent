import { txStatic } from '@/lib/i18n';
import type { MembershipTier } from '@/types/schema';

export interface MembershipBenefitConfig {
  tier: MembershipTier;
  label: string;
  rentalDiscountPercent: number;      // e.g., 0% vs 10%
  depositDiscountPercent: number;     // e.g., 0% vs 50%
  extraOverdueGraceMinutes: number;   // e.g., 0m vs +60m
  freeDeliveryKm: number;             // e.g., 0km vs 5km
  maxUnitsPerBooking: number | null;  // e.g., 3 vs unlimited (null)
  prioritySupport: boolean;           // Priority badge & ops handling
}

export type RobotsDirective =
  | 'index,follow'
  | 'noindex,nofollow'
  | 'index,nofollow'
  | 'noindex,follow';

export interface SiteSeoConfig {
  siteName: string;
  siteTitle: string;
  catalogHeading: string;
  catalogSubtitle: string;
  footerText: string;
  logoUrl: string;
  faviconUrl: string;
  metaDescription: string;
  metaKeywords: string;
  canonicalUrl: string;
  robots: RobotsDirective;
  themeColor: string;
  ogImageUrl: string;
  twitterCard: 'summary_large_image' | 'summary';
  twitterHandle: string;
  locale: string;
}

export interface PlatformSettings {
  tiers: Record<MembershipTier, MembershipBenefitConfig>;
  defaultDeliveryRatePerKm: number;
  defaultBufferHours: number;
  defaultOverdueGraceMinutes: number;
  defaultOverdueHourlyRatePercent: number;
  paymentExpiryHours: number;
  seo: SiteSeoConfig;
}

export const DEFAULT_SITE_SEO: SiteSeoConfig = {
  siteName: 'CameraRent',
  siteTitle: 'CameraRent — Production Gear & Camera Rental Operations',
  catalogHeading: 'Camera & Production Gear Catalog',
  catalogSubtitle:
    'Browse cinema cameras, lenses, lighting, and production kits available at official branches.',
  footerText: `Copyright © ${new Date().getFullYear()} PT Pratamavisual Media Kreatif`,
  logoUrl: '',
  faviconUrl: '/favicon.svg',
  metaDescription:
    'Rent cinema cameras, professional lenses, lighting, and production kits with real-time serial-number availability at CameraRent.',
  metaKeywords: 'camera rental, cinema lens rental, lighting rental, production gear, CameraRent',
  canonicalUrl: 'https://project-camerarent.web.app',
  robots: 'index,follow',
  themeColor: '#18181b',
  ogImageUrl: '',
  twitterCard: 'summary_large_image',
  twitterHandle: '',
  locale: 'en_US',
};

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
  paymentExpiryHours: 2,
  seo: DEFAULT_SITE_SEO,
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

export function normalizePlatformSettings(
  raw?: Partial<PlatformSettings> | Record<string, unknown> | null
): PlatformSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_PLATFORM_SETTINGS;
  const r = raw as Record<string, unknown>;
  const rawTiers = (r.tiers ?? {}) as Record<string, Partial<MembershipBenefitConfig> | undefined>;

  const parseTier = (tier: MembershipTier): MembershipBenefitConfig => {
    const def = DEFAULT_MEMBERSHIP_BENEFITS[tier];
    const t = rawTiers[tier];
    if (!t) return { ...def };
    const rawMax = t.maxUnitsPerBooking;
    const maxUnitsPerBooking =
      rawMax === null || rawMax === undefined || Number(rawMax) <= 0
        ? rawMax === null
          ? null
          : def.maxUnitsPerBooking
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

  const rawSeo = (r.seo ?? {}) as Partial<SiteSeoConfig>;
  const validRobots: RobotsDirective[] = [
    'index,follow',
    'noindex,nofollow',
    'index,nofollow',
    'noindex,follow',
  ];
  const pickStr = (val: unknown, fallback: string, allowEmpty = false): string => {
    if (typeof val !== 'string') return fallback;
    const trimmed = val.trim();
    if (!trimmed && !allowEmpty) return fallback;
    return trimmed;
  };

  return {
    tiers: {
      basic: parseTier('basic'),
      premium: parseTier('premium'),
    },
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
    paymentExpiryHours: clampNum(
      r.paymentExpiryHours,
      1,
      72,
      DEFAULT_PLATFORM_SETTINGS.paymentExpiryHours
    ),
    seo: {
      siteName: pickStr(rawSeo.siteName, DEFAULT_SITE_SEO.siteName),
      siteTitle: pickStr(rawSeo.siteTitle, DEFAULT_SITE_SEO.siteTitle),
      catalogHeading: pickStr(rawSeo.catalogHeading, DEFAULT_SITE_SEO.catalogHeading),
      catalogSubtitle: pickStr(rawSeo.catalogSubtitle, DEFAULT_SITE_SEO.catalogSubtitle),
      footerText: pickStr(rawSeo.footerText, DEFAULT_SITE_SEO.footerText),
      logoUrl: pickStr(rawSeo.logoUrl, DEFAULT_SITE_SEO.logoUrl, true),
      faviconUrl: pickStr(rawSeo.faviconUrl, DEFAULT_SITE_SEO.faviconUrl),
      metaDescription: pickStr(rawSeo.metaDescription, DEFAULT_SITE_SEO.metaDescription, true),
      metaKeywords: pickStr(rawSeo.metaKeywords, DEFAULT_SITE_SEO.metaKeywords, true),
      canonicalUrl: pickStr(rawSeo.canonicalUrl, DEFAULT_SITE_SEO.canonicalUrl, true),
      robots: validRobots.includes(rawSeo.robots as RobotsDirective)
        ? (rawSeo.robots as RobotsDirective)
        : DEFAULT_SITE_SEO.robots,
      themeColor: pickStr(rawSeo.themeColor, DEFAULT_SITE_SEO.themeColor),
      ogImageUrl: pickStr(rawSeo.ogImageUrl, DEFAULT_SITE_SEO.ogImageUrl, true),
      twitterCard:
        rawSeo.twitterCard === 'summary' || rawSeo.twitterCard === 'summary_large_image'
          ? rawSeo.twitterCard
          : DEFAULT_SITE_SEO.twitterCard,
      twitterHandle: pickStr(rawSeo.twitterHandle, DEFAULT_SITE_SEO.twitterHandle, true),
      locale: pickStr(rawSeo.locale, DEFAULT_SITE_SEO.locale),
    },
  };
}

function clampNum(val: unknown, min: number, max: number, fallback: number): number {
  const num = Number(val);
  if (val === undefined || val === null || Number.isNaN(num)) return fallback;
  return Math.min(max, Math.max(min, num));
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
    config.rentalDiscountPercent > 0
      ? txStatic(`${config.rentalDiscountPercent}% discount`, `Diskon ${config.rentalDiscountPercent}%`)
      : txStatic('Standard rate', 'Tarif standar')
  );
  parts.push(
    config.depositDiscountPercent > 0
      ? txStatic(`Deposit -${config.depositDiscountPercent}%`, `Deposit -${config.depositDiscountPercent}%`)
      : txStatic('100% deposit', 'Deposit 100%')
  );
  parts.push(
    config.extraOverdueGraceMinutes > 0
      ? txStatic(
          `Grace +${config.extraOverdueGraceMinutes} mins`,
          `Grace +${config.extraOverdueGraceMinutes} menit`
        )
      : txStatic('Standard branch grace', 'Grace standar cabang')
  );
  parts.push(
    config.freeDeliveryKm > 0
      ? txStatic(`Free delivery ${config.freeDeliveryKm} km`, `Gratis ongkir ${config.freeDeliveryKm} km`)
      : txStatic('Standard delivery', 'Ongkir penuh')
  );
  parts.push(
    config.maxUnitsPerBooking === null
      ? txStatic('Unlimited units', 'Unlimited unit')
      : txStatic(
          `Max ${config.maxUnitsPerBooking} units/booking`,
          `Maks. ${config.maxUnitsPerBooking} unit/booking`
        )
  );
  if (config.prioritySupport) {
    parts.push(txStatic('Priority', 'Prioritas'));
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
