import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, query, Timestamp, where } from 'firebase/firestore';
import {
  AlertTriangle,
  CalendarClock,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Crosshair,
  Lock,
  MapPin,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  Truck,
  UserCheck,
  ZoomIn,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import {
  allocateAndCreateBooking,
  calculateRentalDays,
  generateInvoiceNumber,
} from '@/lib/availability';
import { estimateRoadDistanceKm, reverseGeocode } from '@/lib/geo';
import { calculateTierPricing, formatTierSummaryParts, getMembershipBenefits } from '@/lib/membership';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';
import { useTenant } from '@/hooks/useTenant';
import { useAvailability } from '@/hooks/useAvailability';
import { useBookingDraftStore } from '@/store/useBookingDraftStore';
import { CurrencyText } from '@/components/shared/CurrencyText';
import type { CheckoutAuthSummary } from '@/components/shared/AuthDialog';
import { ImagePreviewModal, type PreviewImageItem } from '@/components/shared/ImagePreviewModal';
import { LocationPickerModal } from '@/components/shared/LocationPickerModal';
import { MembershipBadge } from '@/components/shared/MembershipBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { ProductDetailModal } from '@/features/inventory/ProductDetailModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { BookingItem, Bundle, Equipment, UserProfile } from '@/types/schema';

const CATALOG_CATEGORIES: { value: string; labelEn: string; labelId: string }[] = [
  { value: 'all', labelEn: 'All', labelId: 'Semua' },
  { value: 'camera', labelEn: 'Camera', labelId: 'Kamera' },
  { value: 'lens', labelEn: 'Lens', labelId: 'Lensa' },
  { value: 'lighting', labelEn: 'Lighting', labelId: 'Lighting' },
  { value: 'audio', labelEn: 'Audio', labelId: 'Audio' },
  { value: 'stabilizer', labelEn: 'Stabilizer', labelId: 'Stabilizer' },
  { value: 'accessory', labelEn: 'Accessory', labelId: 'Aksesori' },
];

interface CatalogPageProps {
  onRequireAuth?: (summary: CheckoutAuthSummary) => void;
}

export function CatalogPage({ onRequireAuth }: CatalogPageProps = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const { tx } = useI18n();
  const { settings } = usePlatformSettings();
  const {
    activeTenant: scopedTenant,
    defaultTenant,
    isAllTenants,
    isLoading: loadingTenants,
    tenants,
    setSelectedTenantId,
  } = useTenant();
  const activeTenant = scopedTenant ?? defaultTenant;
  const activeTenantId = activeTenant?.id ?? null;
  const isGuest = !userProfile;
  const isOperator = userProfile?.role === 'superadmin' || userProfile?.role === 'admin';

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [catalogTab, setCatalogTab] = useState<'gear' | 'bundles'>('gear');
  const [submitting, setSubmitting] = useState(false);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [locatingShareloc, setLocatingShareloc] = useState(false);
  const [previewImages, setPreviewImages] = useState<PreviewImageItem[]>([]);
  const [previewTitle, setPreviewTitle] = useState('Foto Alat');
  const [detailEquipmentId, setDetailEquipmentId] = useState<string | null>(null);
  const [brokenImageIds, setBrokenImageIds] = useState<Record<string, boolean>>({});

  // Assisted / Walk-in Booking: Admin & Superadmin pick target Member
  const [selectedRenterUid, setSelectedRenterUid] = useState('');
  const [renterPickerOpen, setRenterPickerOpen] = useState(false);
  const [renterSearch, setRenterSearch] = useState('');
  const [renterPage, setRenterPage] = useState(1);
  const RENTER_PAGE_SIZE = 5;

  const {
    startDateIso,
    endDateIso,
    items,
    bundles: cartBundles,
    logisticsType,
    deliveryAddress,
    deliveryCoordinates,
    setTenantId,
    setDateRange,
    addEquipment,
    decrementEquipment,
    removeEquipment,
    addBundle,
    removeBundle,
    setLogisticsType,
    setDeliveryAddress,
    setDeliveryLocation,
    clearCart,
  } = useBookingDraftStore();

  useEffect(() => {
    setTenantId(activeTenantId);
  }, [activeTenantId, setTenantId]);

  const { data: equipmentList = [], isLoading: loadingEq } = useQuery<Equipment[]>({
    queryKey: ['equipment', activeTenantId],
    enabled: Boolean(db && activeTenantId),
    queryFn: async () => {
      if (!db || !activeTenantId) return [];
      const snap = await getDocs(
        query(collection(db, 'equipment'), where('tenantId', '==', activeTenantId))
      );
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Equipment)
        .filter((e) => e.isActive !== false);
    },
  });

  const { data: bundleList = [] } = useQuery<Bundle[]>({
    queryKey: ['bundles', activeTenantId],
    enabled: Boolean(db && activeTenantId),
    queryFn: async () => {
      if (!db || !activeTenantId) return [];
      const snap = await getDocs(
        query(collection(db, 'bundles'), where('tenantId', '==', activeTenantId))
      );
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Bundle)
        .filter((b) => b.isActive !== false);
    },
  });

  const { data: memberList = [] } = useQuery<UserProfile[]>({
    queryKey: ['catalog-members'],
    enabled: Boolean(db && isOperator),
    queryFn: async () => {
      if (!db) return [];
      const snap = await getDocs(collection(db, 'users'));
      return snap.docs
        .map((d) => {
          const data = d.data();
          return {
            uid: d.id,
            email: data.email ?? '',
            displayName: data.displayName ?? 'Member',
            role: data.role ?? 'user',
            membershipTier: data.membershipTier === 'premium' ? 'premium' : 'basic',
            tenantId: data.tenantId ?? null,
            phone: data.phone ?? '',
            nik: data.nik,
            kycStatus: data.kycStatus ?? 'unverified',
            isBlacklisted: Boolean(data.isBlacklisted),
            blacklistReason: data.blacklistReason,
            createdAt: (data.createdAt as Timestamp) ?? Timestamp.now(),
          } as UserProfile;
        })
        .filter((u) => u.role === 'user')
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    },
  });

  const selectedRenter = useMemo(
    () => memberList.find((m) => m.uid === selectedRenterUid) ?? null,
    [memberList, selectedRenterUid]
  );

  const filteredMembers = useMemo(() => {
    const q = renterSearch.trim().toLowerCase();
    if (!q) return memberList;
    return memberList.filter(
      (m) =>
        m.displayName.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.nik ?? '').includes(q) ||
        (m.phone ?? '').includes(q)
    );
  }, [memberList, renterSearch]);

  const totalRenterPages = Math.max(1, Math.ceil(filteredMembers.length / RENTER_PAGE_SIZE));
  const safeRenterPage = Math.min(renterPage, totalRenterPages);
  const paginatedMembers = filteredMembers.slice(
    (safeRenterPage - 1) * RENTER_PAGE_SIZE,
    safeRenterPage * RENTER_PAGE_SIZE
  );

  const startDate = useMemo(() => (startDateIso ? new Date(startDateIso) : null), [startDateIso]);
  const endDate = useMemo(() => (endDateIso ? new Date(endDateIso) : null), [endDateIso]);
  const isValidRange =
    Boolean(startDate && endDate) && (endDate?.getTime() ?? 0) > (startDate?.getTime() ?? 0);

  const allEquipmentIds = useMemo(() => equipmentList.map((e) => e.id), [equipmentList]);
  const equipmentById = useMemo(
    () =>
      equipmentList.reduce<Record<string, Equipment>>((acc, eq) => {
        acc[eq.id] = eq;
        return acc;
      }, {}),
    [equipmentList]
  );

  const {
    data: availabilityMap = {},
    isFetching: checkingAvail,
    error: availabilityError,
  } = useAvailability({
    tenantId: activeTenantId,
    equipmentIds: allEquipmentIds,
    startDate,
    endDate,
    bufferHours: activeTenant?.bufferHours ?? 3,
  });

  if (loadingTenants) {
    return (
      <div className="rounded-md border border-zinc-200 bg-white p-10 text-center text-xs text-muted-foreground">
        {tx('Loading branch & equipment catalog...', 'Memuat cabang & katalog alat...')}
      </div>
    );
  }

  if (!activeTenantId || !activeTenant) {
    return (
      <EmptyState
        icon={Camera}
        title={tx('No active rental house available', 'Belum ada cabang aktif')}
        description={tx(
          'Select a rental branch from the topbar switcher or provision one in Superadmin → Tenants.',
          'Pilih cabang rental di topbar atau tambahkan cabang di menu Superadmin → Cabang.'
        )}
      />
    );
  }

  const effectiveRenter = isOperator ? selectedRenter : userProfile;
  const memberTier = effectiveRenter?.membershipTier ?? 'basic';
  const tierBenefits = getMembershipBenefits(memberTier, settings.tiers);
  const totalDraftUnits =
    items.reduce((sum, i) => sum + i.quantity, 0) +
    cartBundles.reduce((sum, b) => sum + b.equipmentIds.length, 0);
  const exceedsUnitLimit =
    tierBenefits.maxUnitsPerBooking !== null &&
    totalDraftUnits > tierBenefits.maxUnitsPerBooking;

  const rentalDays = isValidRange && startDate && endDate ? calculateRentalDays(startDate, endDate) : 1;
  const itemSubtotal = items.reduce((s, i) => s + i.dailyRate * i.quantity * rentalDays, 0);
  const bundleSubtotal = cartBundles.reduce((s, b) => s + b.bundleDailyRate * rentalDays, 0);
  const grossSubtotal = itemSubtotal + bundleSubtotal;
  const baseDeposit =
    items.reduce((s, i) => s + i.depositAmount * i.quantity, 0) +
    cartBundles.reduce((s, b) => s + b.bundleDeposit, 0);

  const lockedDistanceKm = deliveryCoordinates
    ? estimateRoadDistanceKm(activeTenant.coordinates, deliveryCoordinates)
    : 0;

  const pricing = calculateTierPricing({
    tier: memberTier,
    grossSubtotal,
    baseDeposit,
    isDelivery: logisticsType === 'delivery' && Boolean(deliveryCoordinates),
    distanceKm: lockedDistanceKm,
    deliveryRatePerKm: activeTenant.deliveryRatePerKm,
    customTiers: settings.tiers,
  });

  const subtotal = pricing.netSubtotal;
  const deposit = pricing.finalDeposit;
  const deliveryFee = pricing.deliveryFee;
  const totalAmount = pricing.totalAmount;

  const isKycVerified = isOperator
    ? Boolean(selectedRenter && !selectedRenter.isBlacklisted)
    : userProfile?.kycStatus === 'verified' && !userProfile?.isBlacklisted;
  const cartHasItems = items.length > 0 || cartBundles.length > 0;

  const handleQuickShareloc = () => {
    if (!navigator.geolocation) {
      toast.error(
        tx(
          'Browser does not support GPS / Shareloc. Use Pin on Map instead.',
          'Browser tidak mendukung GPS / Shareloc. Gunakan Pin di Peta.'
        )
      );
      setMapPickerOpen(true);
      return;
    }
    setLocatingShareloc(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const dist = estimateRoadDistanceKm(activeTenant.coordinates, coords);
        const resolvedAddress = await reverseGeocode(coords.lat, coords.lng);
        setDeliveryLocation({
          coordinates: coords,
          address: resolvedAddress,
          distanceKm: dist,
        });
        setLocatingShareloc(false);
        toast.success(
          tx(
            `GPS location locked (${dist} km from ${activeTenant.name}).`,
            `Shareloc GPS dikunci (${dist} km dari ${activeTenant.name}).`
          )
        );
      },
      (err) => {
        setLocatingShareloc(false);
        toast.error(
          tx(
            `GPS failed (${err.message}). Pin your location manually on the map.`,
            `GPS gagal (${err.message}). Pilih titik secara manual di peta.`
          )
        );
        setMapPickerOpen(true);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleCheckout = async () => {
    if (!startDate || !endDate || !isValidRange) {
      toast.error(
        tx('Select a valid start and return date range.', 'Pilih rentang tanggal mulai dan kembali yang valid.')
      );
      return;
    }
    if (!userProfile) {
      onRequireAuth?.({
        itemCount: totalDraftUnits,
        totalAmount,
        branchName: activeTenant.name,
        rentalDays,
      });
      return;
    }
    if (isOperator) {
      if (!selectedRenter) {
        toast.error(
          tx(
            'Select a renter (member) first in the Booking Draft panel.',
            'Pilih penyewa (member) terlebih dahulu di kolom Booking Draft.'
          )
        );
        return;
      }
      if (selectedRenter.isBlacklisted) {
        toast.error(
          tx(
            'This member is on the Global Blacklist and cannot place bookings.',
            'Member ini masuk Global Blacklist dan tidak dapat melakukan booking.'
          )
        );
        return;
      }
    } else if (!isKycVerified) {
      toast.error(
        tx(
          'Verified KYC is required before booking checkout.',
          'Verifikasi KYC wajib diselesaikan sebelum checkout booking.'
        )
      );
      return;
    }
    if (exceedsUnitLimit) {
      toast.error(
        tx(
          `Basic members are limited to ${tierBenefits.maxUnitsPerBooking} units per booking. Upgrade to Premium for unlimited units.`,
          `Member Basic dibatasi maksimal ${tierBenefits.maxUnitsPerBooking} unit per booking. Upgrade ke Premium untuk unit tak terbatas.`
        )
      );
      return;
    }
    if (logisticsType === 'delivery' && !deliveryCoordinates) {
      toast.error(
        tx(
          'Pin a delivery location on the map or use GPS Shareloc first.',
          'Tentukan titik lokasi via Pin di Peta atau Shareloc GPS terlebih dahulu.'
        )
      );
      return;
    }
    if (logisticsType === 'delivery' && deliveryAddress.trim().length < 8) {
      toast.error(
        tx('Enter the full delivery address.', 'Masukkan alamat pengiriman lengkap.')
      );
      return;
    }

    // Flatten requested equipment IDs for atomic serial-unit allocation
    const expandedDescriptors: {
      equipmentId: string;
      equipmentName: string;
      dailyRate: number;
      bundleId?: string;
    }[] = [];

    for (const entry of items) {
      for (let i = 0; i < entry.quantity; i++) {
        expandedDescriptors.push({
          equipmentId: entry.equipmentId,
          equipmentName: entry.name,
          dailyRate: entry.dailyRate,
        });
      }
    }

    for (const bundle of cartBundles) {
      const perItemRate = Math.round(bundle.bundleDailyRate / Math.max(1, bundle.equipmentIds.length));
      for (const eqId of bundle.equipmentIds) {
        const eq = equipmentList.find((e) => e.id === eqId);
        expandedDescriptors.push({
          equipmentId: eqId,
          equipmentName: eq?.name ?? eqId,
          dailyRate: perItemRate,
          bundleId: bundle.bundleId,
        });
      }
    }

    setSubmitting(true);
    try {
      const bufferEndDate = new Date(
        endDate.getTime() + activeTenant.bufferHours * 60 * 60 * 1000
      );

      await allocateAndCreateBooking(
        activeTenant.id,
        expandedDescriptors.map((d) => d.equipmentId),
        startDate,
        endDate,
        activeTenant.bufferHours,
        (allocatedUnits) => {
          const bookingItems: BookingItem[] = allocatedUnits.map((unit, idx) => {
            const desc = expandedDescriptors[idx];
            return {
              unitId: unit.id,
              equipmentId: unit.equipmentId,
              equipmentName: desc.equipmentName,
              serialNumber: unit.serialNumber,
              dailyRate: desc.dailyRate,
              ...(desc.bundleId ? { bundleId: desc.bundleId } : {}),
            };
          });

          return {
            invoiceNumber: generateInvoiceNumber(),
            tenantId: activeTenant.id,
            userId: isOperator && selectedRenter ? selectedRenter.uid : userProfile.uid,
            items: bookingItems,
            startDate: Timestamp.fromDate(startDate),
            endDate: Timestamp.fromDate(endDate),
            bufferEndDate: Timestamp.fromDate(bufferEndDate),
            logisticsType,
            ...(logisticsType === 'delivery'
              ? {
                  deliveryAddress: deliveryAddress.trim(),
                  ...(deliveryCoordinates ? { deliveryCoordinates } : {}),
                  deliveryDistanceKm: lockedDistanceKm,
                  courierStatus: 'pending_dispatch' as const,
                }
              : {}),
            deliveryFee,
            subtotal,
            discountAmount: pricing.discountAmount,
            membershipTier: memberTier,
            deposit,
            overdueFine: 0,
            damageFine: 0,
            totalAmount,
            paymentStatus: 'unpaid',
            bookingStatus: 'pending_payment',
            createdAt: Timestamp.now(),
          };
        }
      );

      clearCart();
      await queryClient.invalidateQueries({ queryKey: ['availability'] });
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      if (isOperator && selectedRenter) {
        toast.success(
          tx(
            `Booking created for ${selectedRenter.displayName}. Proceed to verification in Bookings.`,
            `Booking berhasil dibuat atas nama ${selectedRenter.displayName}. Lanjutkan verifikasi di menu Booking.`
          )
        );
        setSelectedRenterUid('');
        navigate('/admin/bookings');
      } else {
        toast.success(
          tx(
            'Booking locked with serial numbers allocated. Upload transfer proof to confirm.',
            'Booking terkunci dengan nomor seri teralokasi. Unggah bukti transfer untuk konfirmasi.'
          )
        );
        navigate('/bookings');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error(
        (error as Error).message ||
          tx(
            'Unable to allocate equipment for selected dates.',
            'Gagal mengalokasikan alat untuk tanggal yang dipilih.'
          )
      );
    } finally {
      setSubmitting(false);
    }
  };

  const filteredEquipment = equipmentList.filter((eq) => {
    if (category !== 'all' && eq.category !== category) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      eq.name.toLowerCase().includes(q) ||
      eq.brand.toLowerCase().includes(q) ||
      eq.category.toLowerCase().includes(q)
    );
  });

  const filteredBundles = bundleList.filter((bundle) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      bundle.name.toLowerCase().includes(q) ||
      bundle.description.toLowerCase().includes(q)
    );
  });

  const isDefaultHeading =
    settings.seo.catalogHeading === 'Camera & Production Gear Catalog' ||
    settings.seo.catalogHeading === 'Katalog Kamera & Gear Produksi';
  const isDefaultSubtitle =
    settings.seo.catalogSubtitle.startsWith('Browse cinema cameras') ||
    settings.seo.catalogSubtitle.startsWith('Jelajahi kamera');

  const displayHeading = isDefaultHeading
    ? tx('Camera & Production Gear Catalog', 'Katalog Kamera & Gear Produksi')
    : settings.seo.catalogHeading;
  const displaySubtitle = isDefaultSubtitle
    ? tx(
        'Browse cinema cameras, lenses, lighting, and production kits available at',
        'Jelajahi kamera, lensa, lighting, dan paket produksi yang tersedia di'
      )
    : settings.seo.catalogSubtitle;

  return (
    <div className="space-y-5">
      {/* Storefront Hero & Search Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {displayHeading}
          </h1>
          <p className="text-sm text-muted-foreground">
            {displaySubtitle}{' '}
            <span className="font-medium text-foreground">({activeTenant.name})</span>
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
            strokeWidth={1.5}
          />
          <Input
            placeholder={tx('Search camera, lens, brand...', 'Cari kamera, lensa, brand...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-background pl-9"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 8 cols: DateRange availability bar + Storefront Catalog */}
        <div className="space-y-4 lg:col-span-8">
          <Card className="shadow-none">
            <CardContent className="grid grid-cols-1 gap-3 p-3.5 sm:grid-cols-12 sm:items-end">
              <div className="space-y-1 sm:col-span-4">
                <Label className="font-mono text-[10px] uppercase text-zinc-500">
                  {tx('Pickup / Start', 'Ambil / Mulai')}
                </Label>
                <Input
                  type="datetime-local"
                  className="font-mono text-xs"
                  value={startDateIso}
                  onChange={(e) => setDateRange(e.target.value, endDateIso)}
                />
              </div>
              <div className="space-y-1 sm:col-span-4">
                <Label className="font-mono text-[10px] uppercase text-zinc-500">
                  {tx('Return / End', 'Kembali / Selesai')}
                </Label>
                <Input
                  type="datetime-local"
                  className="font-mono text-xs"
                  value={endDateIso}
                  onChange={(e) => setDateRange(startDateIso, e.target.value)}
                />
              </div>
              <div className="flex flex-col justify-between rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 sm:col-span-4">
                <div className="flex items-center justify-between text-[11px] text-zinc-600">
                  <span className="flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" strokeWidth={1.5} />
                    {tx('Duration', 'Durasi')}
                  </span>
                  <span className="font-mono font-semibold text-zinc-950">
                    {isValidRange
                      ? tx(`${rentalDays} day(s)`, `${rentalDays} hari`)
                      : tx('Invalid range', 'Rentang tidak valid')}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between font-mono text-[10px] text-zinc-400">
                  <span>
                    {tx(`+${activeTenant.bufferHours}h buffer`, `+${activeTenant.bufferHours}j buffer`)}
                  </span>
                  <span>{checkingAvail ? tx('SYNCING', 'MEMERIKSA') : 'LIVE'}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {availabilityError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                <span>{tx('Availability Check Error', 'Gagal Memeriksa Ketersediaan')}</span>
              </div>
              <p className="mt-1 break-all font-mono text-[11px] text-red-800">
                {(availabilityError as Error).message}
              </p>
            </div>
          ) : null}

          <Tabs
            value={catalogTab}
            onValueChange={(v) => setCatalogTab(v as 'gear' | 'bundles')}
            className="space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="gear">
                  {tx('Individual Gear', 'Gear Satuan')} ({filteredEquipment.length})
                </TabsTrigger>
                <TabsTrigger value="bundles">
                  {tx('Production Kits', 'Paket Kit')} ({filteredBundles.length})
                </TabsTrigger>
              </TabsList>

              {catalogTab === 'gear' ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {CATALOG_CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setCategory(cat.value)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        category === cat.value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {tx(cat.labelEn, cat.labelId)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <TabsContent value="gear" className="mt-0">
              {loadingEq ? (
                <div className="rounded-md border border-zinc-200 bg-white p-10 text-center text-xs text-muted-foreground">
                  {tx(
                    'Checking real-time unit availability...',
                    'Memeriksa ketersediaan stok real-time...'
                  )}
                </div>
              ) : filteredEquipment.length === 0 ? (
                <EmptyState
                  icon={Camera}
                  title={tx('No matching gear found', 'Belum ada gear yang sesuai')}
                  description={tx(
                    'Try changing the category filter, rental branch, or search keyword.',
                    'Coba ubah filter kategori, cabang, atau kata kunci pencarian.'
                  )}
                />
              ) : (
                <div
                  className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${
                    isGuest ? 'xl:grid-cols-3' : '2xl:grid-cols-3'
                  }`}
                >
                  {filteredEquipment.map((eq) => {
                    const availUnits = availabilityMap[eq.id] ?? [];
                    const inCartQty = items.find((i) => i.equipmentId === eq.id)?.quantity ?? 0;
                    const canAdd = isValidRange && availUnits.length > inCartQty;
                    const coverImage =
                      eq.images?.[0] && !brokenImageIds[eq.id] ? eq.images[0] : null;
                    const specEntries = Object.entries(eq.specs ?? {}).slice(0, 3);

                    return (
                      <Card
                        key={eq.id}
                        className="flex flex-col overflow-hidden shadow-none transition-colors hover:border-foreground/20"
                      >
                        <div className="relative aspect-[4/3] w-full overflow-hidden border-b bg-white">
                          {coverImage ? (
                            <button
                              type="button"
                              onClick={() => setDetailEquipmentId(eq.id)}
                              className="group relative block h-full w-full focus:outline-none"
                              title={tx('View specifications & gallery', 'Lihat spesifikasi & galeri')}
                            >
                              <img
                                src={coverImage}
                                alt={eq.name}
                                loading="lazy"
                                onError={() =>
                                  setBrokenImageIds((prev) => ({ ...prev, [eq.id]: true }))
                                }
                                className="h-full w-full object-contain p-3 transition-transform duration-200 group-hover:scale-[1.03]"
                              />
                              <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md border bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                                <ZoomIn className="h-3 w-3" strokeWidth={1.5} />
                                {tx('Details & Gallery', 'Detail & Galeri')}
                              </span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDetailEquipmentId(eq.id)}
                              className="flex h-full w-full items-center justify-center bg-muted/40 text-muted-foreground/40 transition-colors hover:bg-muted/60"
                            >
                              <Camera className="h-10 w-10" strokeWidth={1.25} />
                            </button>
                          )}

                          <span className="pointer-events-none absolute left-2.5 top-2.5 rounded-md border bg-background/95 px-2 py-0.5 text-[11px] font-medium capitalize text-foreground shadow-sm">
                            {eq.category}
                          </span>
                          <div className="absolute right-2.5 top-2.5">
                            <StatusBadge
                              status={
                                availUnits.length > 0
                                  ? 'available'
                                  : eq.totalUnits === 0
                                    ? 'maintenance'
                                    : 'rented'
                              }
                              label={
                                availUnits.length > 0
                                  ? tx(`${availUnits.length} free`, `${availUnits.length} tersedia`)
                                  : eq.totalUnits === 0
                                    ? tx('No SN', 'Tanpa SN')
                                    : tx('0 free', '0 tersedia')
                              }
                            />
                          </div>
                        </div>

                        <CardContent className="flex flex-1 flex-col justify-between gap-4 p-4">
                          <div className="space-y-2">
                            <div>
                              <p className="text-xs text-muted-foreground">
                                {eq.brand} · {activeTenant.name}
                              </p>
                              <button
                                type="button"
                                onClick={() => setDetailEquipmentId(eq.id)}
                                className="mt-0.5 block text-left"
                              >
                                <h2 className="line-clamp-2 text-sm font-semibold text-foreground transition-colors hover:underline">
                                  {eq.name}
                                </h2>
                              </button>
                            </div>

                            {specEntries.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {specEntries.map(([k, v]) => (
                                  <span
                                    key={k}
                                    className="rounded bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground"
                                  >
                                    {v}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>

                          <div className="space-y-3 border-t pt-3">
                            <div className="flex flex-wrap items-baseline justify-between gap-1.5">
                              <div>
                                <CurrencyText
                                  amount={eq.dailyRate}
                                  className="text-sm font-semibold text-foreground"
                                />
                                <span className="text-xs text-muted-foreground">
                                  {' '}
                                  {tx('/ day', '/ hari')}
                                </span>
                              </div>
                              <span className="text-[11px] text-muted-foreground">
                                {tx('Deposit', 'Deposit')}{' '}
                                <CurrencyText amount={eq.depositAmount} />
                              </span>
                            </div>

                            {inCartQty > 0 ? (
                              <div className="flex h-8 w-full items-center justify-between rounded-md border bg-muted/30 px-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => decrementEquipment(eq.id)}
                                >
                                  <Minus className="h-3.5 w-3.5" strokeWidth={1.5} />
                                </Button>
                                <span className="font-mono text-xs font-semibold text-foreground">
                                  {tx(
                                    `${inCartQty} in Booking Draft`,
                                    `${inCartQty} di Booking Draft`
                                  )}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  disabled={!canAdd}
                                  onClick={() =>
                                    addEquipment({
                                      equipmentId: eq.id,
                                      name: eq.name,
                                      brand: eq.brand,
                                      dailyRate: eq.dailyRate,
                                      depositAmount: eq.depositAmount,
                                    })
                                  }
                                >
                                  <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                className="w-full"
                                disabled={!canAdd}
                                onClick={() =>
                                  addEquipment({
                                    equipmentId: eq.id,
                                    name: eq.name,
                                    brand: eq.brand,
                                    dailyRate: eq.dailyRate,
                                    depositAmount: eq.depositAmount,
                                  })
                                }
                              >
                                <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                                {tx('Add to Booking', 'Tambah ke Booking')}
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="bundles" className="mt-0">
              {filteredBundles.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title={tx('No production kits available', 'Belum ada paket kit tersedia')}
                  description={tx(
                    'Production kits for the selected branch are not available yet.',
                    'Paket produksi untuk cabang terpilih belum tersedia saat ini.'
                  )}
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {filteredBundles.map((bundle) => {
                    const minAvailable = bundle.equipmentIds.reduce(
                      (min, id) => Math.min(min, (availabilityMap[id] ?? []).length),
                      Infinity
                    );
                    const kitReady = isValidRange && minAvailable > 0 && minAvailable !== Infinity;
                    const alreadyInCart = cartBundles.some((b) => b.bundleId === bundle.id);
                    const includedGear = bundle.equipmentIds
                      .map((id) => equipmentById[id])
                      .filter((eq): eq is Equipment => Boolean(eq));
                    const bundleThumbnails = includedGear.filter(
                      (eq) => Boolean(eq.images?.[0] && !brokenImageIds[eq.id])
                    );

                    return (
                      <Card
                        key={bundle.id}
                        className="flex flex-col justify-between shadow-none transition-colors hover:border-foreground/20"
                      >
                        <CardContent className="flex flex-1 flex-col justify-between gap-4 p-5">
                          <div className="space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  {activeTenant.name} ·{' '}
                                  {tx(
                                    `${bundle.equipmentIds.length} items`,
                                    `${bundle.equipmentIds.length} item`
                                  )}
                                </p>
                                <h2 className="mt-0.5 text-base font-semibold text-foreground">
                                  {bundle.name}
                                </h2>
                              </div>
                              <StatusBadge
                                status={kitReady ? 'available' : 'rented'}
                                label={
                                  kitReady
                                    ? tx(`${minAvailable} kit free`, `${minAvailable} kit tersedia`)
                                    : tx('Unavailable', 'Tidak Tersedia')
                                }
                              />
                            </div>

                            {bundle.description ? (
                              <p className="text-xs leading-relaxed text-muted-foreground">
                                {bundle.description}
                              </p>
                            ) : null}

                            {bundleThumbnails.length > 0 ? (
                              <div className="flex items-center gap-2 overflow-x-auto pt-0.5">
                                {bundleThumbnails.map((eq) => (
                                  <button
                                    key={eq.id}
                                    type="button"
                                    onClick={() => {
                                      setPreviewTitle(bundle.name);
                                      setPreviewImages(
                                        bundleThumbnails.map((item) => ({
                                          url: item.images[0],
                                          label: `${item.brand} ${item.name}`,
                                        }))
                                      );
                                    }}
                                    className="h-10 w-10 shrink-0 overflow-hidden rounded border bg-white p-0.5 transition-opacity hover:opacity-85"
                                    title={eq.name}
                                  >
                                    <img
                                      src={eq.images[0]}
                                      alt={eq.name}
                                      className="h-full w-full object-contain"
                                    />
                                  </button>
                                ))}
                              </div>
                            ) : null}

                            {includedGear.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {includedGear.map((eq) => (
                                  <span
                                    key={eq.id}
                                    className="rounded border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground"
                                  >
                                    {eq.name}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>

                          <div className="space-y-3 border-t pt-3">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <div>
                                <CurrencyText
                                  amount={bundle.bundleDailyRate}
                                  className="text-sm font-semibold text-foreground"
                                />
                                <span className="text-xs text-muted-foreground">
                                  {' '}
                                  {tx('/ day', '/ hari')}
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                Deposit <CurrencyText amount={bundle.bundleDeposit} />
                              </span>
                            </div>

                            <Button
                              size="sm"
                              variant={alreadyInCart ? 'secondary' : 'default'}
                              className="w-full"
                              disabled={!kitReady || alreadyInCart}
                              onClick={() =>
                                addBundle({
                                  bundleId: bundle.id,
                                  name: bundle.name,
                                  equipmentIds: bundle.equipmentIds,
                                  bundleDailyRate: bundle.bundleDailyRate,
                                  bundleDeposit: bundle.bundleDeposit,
                                })
                              }
                            >
                              {alreadyInCart ? (
                                tx('Already in Booking Draft', 'Sudah di Booking Draft')
                              ) : (
                                <>
                                  <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                                  {tx('Book This Kit', 'Book Paket Ini')}
                                </>
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Right 4 cols: Booking Draft & Checkout */}
        <div className="lg:col-span-4">
          <Card className="sticky top-16 shadow-none">
          <CardHeader className="border-b border-zinc-100 pb-3">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-zinc-500" strokeWidth={1.5} />
                Booking Draft
              </span>
              <div className="flex items-center gap-1.5">
                {!isGuest ? <MembershipBadge tier={memberTier} /> : null}
                <span className="font-mono text-[11px] font-normal text-zinc-400">
                  {rentalDays}d
                </span>
              </div>
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4 pt-4">
            {/* Admin / Superadmin Assisted Booking: Branch & Renter Picker */}
            {isOperator ? (
              <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                {isAllTenants && tenants.length > 1 ? (
                  <div className="space-y-1">
                    <Label className="text-xs">{tx('Catalog Branch', 'Cabang Katalog')}</Label>
                    <Select
                      value={activeTenant.id}
                      onValueChange={(tid) => {
                        setSelectedTenantId(tid);
                        clearCart();
                      }}
                    >
                      <SelectTrigger className="h-8 bg-background text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {tenants.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs">
                    <UserCheck className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
                    {tx('Assisted Booking for Renter (Member)', 'Bantu Booking untuk Penyewa (Member)')}
                  </Label>
                  <button
                    type="button"
                    onClick={() => setRenterPickerOpen((prev) => !prev)}
                    className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-xs shadow-sm transition-colors hover:bg-muted/40"
                  >
                    <span
                      className={
                        selectedRenter
                          ? 'truncate font-medium text-foreground'
                          : 'truncate text-muted-foreground'
                      }
                    >
                      {selectedRenter
                        ? `${selectedRenter.displayName} (${selectedRenter.email})`
                        : tx('Select member renter...', 'Pilih member penyewa...')}
                    </span>
                    <ChevronsUpDown
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      strokeWidth={1.5}
                    />
                  </button>

                  {renterPickerOpen ? (
                    <div className="space-y-2 rounded-md border bg-popover p-2 shadow-md">
                      <div className="relative">
                        <Search
                          className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground"
                          strokeWidth={1.5}
                        />
                        <Input
                          placeholder={tx('Search name, email, or NIK...', 'Cari nama, email, atau NIK...')}
                          value={renterSearch}
                          onChange={(e) => {
                            setRenterSearch(e.target.value);
                            setRenterPage(1);
                          }}
                          className="h-8 pl-8 text-xs"
                        />
                      </div>

                      {paginatedMembers.length === 0 ? (
                        <p className="py-3 text-center text-xs text-muted-foreground">
                          {tx('No members found.', 'Tidak ada member ditemukan.')}
                        </p>
                      ) : (
                        <div className="divide-y divide-border rounded-md border">
                          {paginatedMembers.map((m) => {
                            const isSelected = m.uid === selectedRenterUid;
                            return (
                              <button
                                key={m.uid}
                                type="button"
                                onClick={() => {
                                  setSelectedRenterUid(m.uid);
                                  setRenterPickerOpen(false);
                                }}
                                className={`flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted/60 ${
                                  isSelected ? 'bg-muted/50' : ''
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-medium text-foreground">
                                    {m.displayName}
                                  </p>
                                  <p className="truncate text-[11px] text-muted-foreground">
                                    {m.email}
                                    {m.nik ? ` · ${m.nik}` : ''}
                                  </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  <MembershipBadge tier={m.membershipTier} />
                                  {isSelected ? (
                                    <Check className="h-3.5 w-3.5 text-foreground" strokeWidth={2} />
                                  ) : null}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="tabular-nums">
                          {filteredMembers.length === 0
                            ? tx('0 members', '0 member')
                            : `${(safeRenterPage - 1) * RENTER_PAGE_SIZE + 1}–${Math.min(
                                safeRenterPage * RENTER_PAGE_SIZE,
                                filteredMembers.length
                              )} ${tx('of', 'dari')} ${filteredMembers.length}`}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="mr-1 tabular-nums">
                            {safeRenterPage}/{totalRenterPages}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 px-1.5"
                            disabled={safeRenterPage <= 1}
                            onClick={() => setRenterPage((p) => Math.max(1, p - 1))}
                          >
                            <ChevronLeft className="h-3 w-3" strokeWidth={1.5} />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 px-1.5"
                            disabled={safeRenterPage >= totalRenterPages}
                            onClick={() => setRenterPage((p) => Math.min(totalRenterPages, p + 1))}
                          >
                            <ChevronRight className="h-3 w-3" strokeWidth={1.5} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {selectedRenter ? (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <MembershipBadge tier={selectedRenter.membershipTier} />
                      <StatusBadge status={selectedRenter.kycStatus} />
                      {selectedRenter.isBlacklisted ? <StatusBadge status="blacklisted" /> : null}
                    </div>
                  ) : null}

                  {selectedRenter?.isBlacklisted ? (
                    <p className="text-xs font-medium text-destructive">
                      {tx(
                        'Member is blocked (Global Blacklist) — cannot create booking.',
                        'Member diblokir (Global Blacklist) — tidak dapat dibooking.'
                      )}
                    </p>
                  ) : selectedRenter && selectedRenter.kycStatus !== 'verified' ? (
                    <p className="text-[11px] text-amber-700">
                      {tx(
                        'Member KYC is not verified — verify physical ID card during handover.',
                        'KYC member belum verified — pastikan KTP fisik dicek saat serah terima.'
                      )}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {!isGuest && memberTier === 'premium' ? (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2.5 text-[11px] text-zinc-700">
                <p className="font-mono text-[10px] font-semibold uppercase text-zinc-900">
                  Active Premium Perks
                </p>
                <p className="mt-0.5 leading-relaxed text-zinc-600">
                  {formatTierSummaryParts(tierBenefits).join(' · ')}.
                </p>
              </div>
            ) : !isGuest && tierBenefits.maxUnitsPerBooking !== null ? (
              <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-[11px] text-zinc-600">
                <span>Basic Limit</span>
                <span className="font-mono font-medium text-zinc-900">
                  {totalDraftUnits} / {tierBenefits.maxUnitsPerBooking} units
                </span>
              </div>
            ) : null}

            {!isGuest && exceedsUnitLimit ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-900">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                  <span>Unit Limit Exceeded ({totalDraftUnits}/{tierBenefits.maxUnitsPerBooking})</span>
                </div>
                <p className="mt-1 text-[11px] text-red-800">
                  Basic members may book up to {tierBenefits.maxUnitsPerBooking} physical units per
                  reservation. Remove extra items or request Premium Member upgrade from Admin.
                </p>
              </div>
            ) : null}
            {!isGuest && !isOperator && !isKycVerified ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                  <span>KYC Verification Required</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                  Firestore Security Rules block booking creation until your account has{' '}
                  <span className="font-mono">kycStatus: verified</span>.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline" className="h-7 bg-white">
                    <Link to="/kyc">Submit KYC</Link>
                  </Button>
                  {userProfile?.role === 'superadmin' ? (
                    <Button asChild size="sm" variant="outline" className="h-7 bg-white">
                      <Link to="/admin/members">Approve in Members</Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {!cartHasItems ? (
              <p className="py-6 text-center text-xs text-zinc-400">
                Add camera gear or a production kit from the catalog to build a booking.
              </p>
            ) : (
              <div className="space-y-2">
                {items.map((item) => {
                  const thumb =
                    equipmentById[item.equipmentId]?.images?.[0] &&
                    !brokenImageIds[item.equipmentId]
                      ? equipmentById[item.equipmentId].images[0]
                      : null;
                  return (
                    <div
                      key={item.equipmentId}
                      className="flex items-center justify-between gap-2.5 rounded border border-zinc-200 px-2.5 py-2 text-xs"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/40">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt={item.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Camera className="h-3.5 w-3.5 text-muted-foreground/50" strokeWidth={1.5} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-zinc-900">
                            {item.quantity}x {item.name}
                          </p>
                          <p className="font-mono text-[10px] text-zinc-500">
                            <CurrencyText amount={item.dailyRate * item.quantity * rentalDays} />
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => removeEquipment(item.equipmentId)}
                      >
                        <Trash2 className="h-3 w-3 text-zinc-400" strokeWidth={1.5} />
                      </Button>
                    </div>
                  );
                })}

                {cartBundles.map((bundle) => (
                  <div
                    key={bundle.bundleId}
                    className="flex items-center justify-between gap-2 rounded border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-900">[KIT] {bundle.name}</p>
                      <p className="font-mono text-[10px] text-zinc-500">
                        <CurrencyText amount={bundle.bundleDailyRate * rentalDays} />
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => removeBundle(bundle.bundleId)}
                    >
                      <Trash2 className="h-3 w-3 text-zinc-400" strokeWidth={1.5} />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Separator />

            {/* Logistics Selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-500">
                <Truck className="h-3.5 w-3.5" strokeWidth={1.5} />
                Logistics Mode
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLogisticsType('self_pickup')}
                  className={`rounded-md border px-2.5 py-2 text-left text-xs transition-colors ${
                    logisticsType === 'self_pickup'
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <p className="font-medium">Self-Pickup</p>
                  <p className="font-mono text-[10px] opacity-75">Rp 0</p>
                </button>
                <button
                  type="button"
                  onClick={() => setLogisticsType('delivery')}
                  className={`rounded-md border px-2.5 py-2 text-left text-xs transition-colors ${
                    logisticsType === 'delivery'
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <p className="font-medium">{tx('Delivery & Pickup', 'Antar-Jemput')}</p>
                  <p className="font-mono text-[10px] opacity-75">
                    <CurrencyText amount={activeTenant.deliveryRatePerKm} suffix="/km" />
                  </p>
                </button>
              </div>

              {logisticsType === 'delivery' ? (
                <div className="space-y-2.5 rounded-md border border-zinc-200 bg-zinc-50 p-2.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 bg-white text-[11px]"
                      onClick={() => setMapPickerOpen(true)}
                    >
                      <MapPin className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
                      {deliveryCoordinates
                        ? tx('Change Map Pin', 'Ubah Pin Map')
                        : tx('Pin on Map', 'Pin di Peta')}
                    </Button>
                    <Button
                      type="button"
                      variant="mono"
                      size="sm"
                      className="h-7 text-[11px]"
                      disabled={locatingShareloc}
                      onClick={handleQuickShareloc}
                    >
                      <Crosshair className="h-3.5 w-3.5" strokeWidth={1.5} />
                      {locatingShareloc
                        ? tx('Locating GPS...', 'Mencari GPS...')
                        : tx('GPS Shareloc', 'Shareloc GPS')}
                    </Button>
                  </div>

                  {deliveryCoordinates ? (
                    <div className="flex items-center justify-between rounded border border-emerald-200 bg-emerald-50/70 px-2 py-1 font-mono text-[10px] text-emerald-900">
                      <span>
                        PIN: {deliveryCoordinates.lat.toFixed(5)},{' '}
                        {deliveryCoordinates.lng.toFixed(5)}
                      </span>
                      <span className="font-semibold">{lockedDistanceKm} km</span>
                    </div>
                  ) : (
                    <p className="text-[10px] text-amber-700">
                      {tx(
                        'Pin a map location or tap GPS Shareloc to automatically lock road distance & delivery fee.',
                        'Wajib pin lokasi di peta atau tekan Shareloc GPS agar jarak & ongkir dikunci otomatis oleh sistem.'
                      )}
                    </p>
                  )}

                  <div className="space-y-1">
                    <Label className="text-[11px]">
                      {tx('Delivery / Set Address', 'Alamat Pengiriman / Lokasi Syuting')}
                    </Label>
                    <Input
                      placeholder={tx(
                        'Studio / shooting location address...',
                        'Alamat studio / lokasi syuting...'
                      )}
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-1 text-[11px]">
                        <Lock className="h-3 w-3 text-zinc-400" strokeWidth={1.5} />
                        {tx('Distance from Branch (km)', 'Jarak dari Cabang (km)')}
                      </Label>
                      <span className="font-mono text-[10px] text-zinc-500">
                        {deliveryCoordinates
                          ? tx('LOCKED BY GPS/PIN', 'TERKUNCI GPS/PIN')
                          : tx('PIN REQUIRED', 'WAJIB PIN')}
                      </span>
                    </div>
                    <Input
                      type="text"
                      readOnly
                      disabled
                      className="cursor-not-allowed bg-zinc-100 font-mono text-zinc-700"
                      value={
                        deliveryCoordinates
                          ? `${lockedDistanceKm} km`
                          : tx(
                              'No location pinned yet (Pin / Shareloc)',
                              'Belum ada titik lokasi (Pin / Shareloc)'
                            )
                      }
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <Separator />

            {/* Price Breakdown */}
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-zinc-600">
                <span>{tx('Rental Subtotal', 'Subtotal Sewa')}</span>
                <CurrencyText amount={pricing.grossSubtotal} />
              </div>
              {pricing.discountAmount > 0 ? (
                <div className="flex justify-between text-emerald-700">
                  <span>
                    {tx(
                      `Member Discount (${tierBenefits.rentalDiscountPercent}%)`,
                      `Diskon Member (${tierBenefits.rentalDiscountPercent}%)`
                    )}
                  </span>
                  <span className="font-mono tabular-nums">
                    - <CurrencyText amount={pricing.discountAmount} />
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between text-zinc-600">
                <span>
                  {tx('Delivery Fee', 'Biaya Antar-Jemput')}
                  {logisticsType === 'delivery' && tierBenefits.freeDeliveryKm > 0 ? (
                    <span className="ml-1 font-mono text-[10px] text-emerald-700">
                      ({tierBenefits.freeDeliveryKm}km {tx('free', 'gratis')})
                    </span>
                  ) : null}
                </span>
                <CurrencyText amount={deliveryFee} />
              </div>
              <div className="flex justify-between text-zinc-600">
                <span>
                  {tx('Refundable Deposit', 'Deposit Jaminan')}
                  {tierBenefits.depositDiscountPercent > 0 ? (
                    <span className="ml-1 font-mono text-[10px] text-emerald-700">
                      (-{tierBenefits.depositDiscountPercent}%)
                    </span>
                  ) : null}
                </span>
                <CurrencyText amount={deposit} />
              </div>
              <Separator />
              <div className="flex justify-between pt-1 text-sm font-semibold text-zinc-950">
                <span>{tx('Total Payable', 'Total Tagihan')}</span>
                <CurrencyText amount={totalAmount} />
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
              disabled={
                !cartHasItems ||
                !isValidRange ||
                (!isGuest &&
                  (!isKycVerified ||
                    exceedsUnitLimit ||
                    (logisticsType === 'delivery' && !deliveryCoordinates))) ||
                submitting
              }
              onClick={() => void handleCheckout()}
            >
              {submitting
                ? tx('Allocating Serial Units...', 'Mengalokasikan Unit SN...')
                : isGuest
                  ? tx('Sign In to Checkout', 'Masuk untuk Checkout')
                  : isOperator
                    ? selectedRenter
                      ? tx(
                          `Create Booking — ${selectedRenter.displayName}`,
                          `Buat Booking — ${selectedRenter.displayName}`
                        )
                      : tx('Select Renter First', 'Pilih Penyewa Terlebih Dahulu')
                    : tx('Confirm & Lock Booking', 'Konfirmasi & Kunci Booking')}
            </Button>
          </CardContent>
        </Card>
      </div>

      <LocationPickerModal
        open={mapPickerOpen}
        onOpenChange={setMapPickerOpen}
        branchName={activeTenant.name}
        branchCoordinates={activeTenant.coordinates}
        initialCoordinates={deliveryCoordinates}
        initialAddress={deliveryAddress}
        onConfirm={({ coordinates, address, distanceKm }) => {
          setDeliveryLocation({ coordinates, address, distanceKm });
          toast.success(
            tx(
              `Delivery location locked (${distanceKm} km from branch).`,
              `Lokasi pengiriman dikunci (${distanceKm} km dari cabang).`
            )
          );
        }}
      />

      <ImagePreviewModal
        open={previewImages.length > 0}
        onOpenChange={(open) => {
          if (!open) setPreviewImages([]);
        }}
        images={previewImages}
        title={previewTitle}
      />

      {(() => {
        const detailEq = detailEquipmentId ? equipmentById[detailEquipmentId] ?? null : null;
        const availCount = detailEq ? (availabilityMap[detailEq.id] ?? []).length : 0;
        const inCart = detailEq ? items.find((i) => i.equipmentId === detailEq.id)?.quantity ?? 0 : 0;
        const canAddDetail = Boolean(detailEq && isValidRange && availCount > inCart);
        return (
          <ProductDetailModal
            equipment={detailEq}
            tenant={activeTenant}
            availableUnitCount={availCount}
            inCartQty={inCart}
            canAdd={canAddDetail}
            rentalDays={rentalDays}
            memberTier={memberTier}
            open={Boolean(detailEq)}
            onOpenChange={(open) => {
              if (!open) setDetailEquipmentId(null);
            }}
            onAdd={() => {
              if (!detailEq) return;
              addEquipment({
                equipmentId: detailEq.id,
                name: detailEq.name,
                brand: detailEq.brand,
                dailyRate: detailEq.dailyRate,
                depositAmount: detailEq.depositAmount,
              });
            }}
            onDecrement={() => {
              if (!detailEq) return;
              decrementEquipment(detailEq.id);
            }}
          />
        );
      })()}
      </div>
    </div>
  );
}

