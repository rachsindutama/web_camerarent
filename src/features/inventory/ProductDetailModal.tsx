import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  Building2,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Minus,
  PackageCheck,
  Plus,
  Sparkles,
  ZoomIn,
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { getMembershipBenefits } from '@/lib/membership';
import { useI18n } from '@/hooks/useI18n';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { ImagePreviewModal } from '@/components/shared/ImagePreviewModal';
import { MembershipBadge } from '@/components/shared/MembershipBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import type { Equipment, EquipmentUnit, MembershipTier, Tenant } from '@/types/schema';

interface ProductDetailModalProps {
  equipment: Equipment | null;
  tenant: Tenant;
  availableUnitCount: number;
  inCartQty: number;
  canAdd: boolean;
  rentalDays: number;
  memberTier: MembershipTier;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: () => void;
  onDecrement: () => void;
}

export function ProductDetailModal({
  equipment,
  tenant,
  availableUnitCount,
  inCartQty,
  canAdd,
  rentalDays,
  memberTier,
  open,
  onOpenChange,
  onAdd,
  onDecrement,
}: ProductDetailModalProps) {
  const { tx } = useI18n();
  const { settings } = usePlatformSettings();
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    setActiveImageIdx(0);
  }, [equipment?.id, open]);

  const { data: units = [] } = useQuery<EquipmentUnit[]>({
    queryKey: ['equipment_units', 'detail', equipment?.id ?? 'none'],
    enabled: Boolean(db && open && equipment?.id),
    staleTime: 60_000,
    queryFn: async () => {
      if (!db || !equipment) return [];
      const snap = await getDocs(
        query(collection(db, 'equipment_units'), where('equipmentId', '==', equipment.id))
      );
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EquipmentUnit);
    },
  });

  const includedAccessories = useMemo(() => {
    const set = new Set<string>();
    units.forEach((u) => {
      (u.accessoriesIncluded ?? []).forEach((acc) => {
        if (acc.trim()) set.add(acc.trim());
      });
    });
    return Array.from(set);
  }, [units]);

  if (!equipment) return null;

  const images = (equipment.images ?? []).filter(Boolean);
  const safeIdx = Math.min(activeImageIdx, Math.max(0, images.length - 1));
  const currentImage = images[safeIdx] ?? null;
  const specEntries = Object.entries(equipment.specs ?? {});

  const tierBenefits = getMembershipBenefits(memberTier, settings.tiers);
  const effectiveDailyRate = Math.round(
    equipment.dailyRate * (1 - tierBenefits.rentalDiscountPercent / 100)
  );
  const effectiveDeposit = Math.round(
    equipment.depositAmount * (1 - tierBenefits.depositDiscountPercent / 100)
  );
  const hasDiscount =
    tierBenefits.rentalDiscountPercent > 0 || tierBenefits.depositDiscountPercent > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          {/* Header */}
          <DialogHeader className="shrink-0 border-b border-zinc-200 bg-zinc-50/80 px-6 py-4 pr-12">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium capitalize text-zinc-700">
                {equipment.category}
              </span>
              <span className="text-xs font-medium text-zinc-500">{equipment.brand}</span>
              <StatusBadge
                status={
                  availableUnitCount > 0
                    ? 'available'
                    : equipment.totalUnits === 0
                      ? 'maintenance'
                      : 'rented'
                }
                label={
                  availableUnitCount > 0
                    ? tx(`${availableUnitCount} Available`, `${availableUnitCount} Tersedia`)
                    : equipment.totalUnits === 0
                      ? tx('No Units', 'Belum Ada Unit')
                      : tx('Unavailable', 'Stok Habis')
                }
              />
            </div>
            <DialogTitle className="mt-1 text-lg font-semibold tracking-tight text-zinc-950">
              {equipment.name}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Building2 className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.5} />
              <span>{tenant.name}</span>
              <span>·</span>
              <span className="font-mono text-[11px]">
                {tx(`${equipment.totalUnits} total fleet units`, `${equipment.totalUnits} total unit armada`)}
              </span>
            </DialogDescription>
          </DialogHeader>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
              {/* Left 6 cols: Photo Gallery */}
              <div className="space-y-3 md:col-span-6">
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-zinc-200 bg-white">
                  {currentImage ? (
                    <>
                      <img
                        src={currentImage}
                        alt={equipment.name}
                        className="h-full w-full cursor-zoom-in object-contain p-4"
                        onClick={() => setLightboxOpen(true)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="absolute bottom-2.5 right-2.5 h-7 bg-white/95 px-2 text-[11px] shadow-sm"
                        onClick={() => setLightboxOpen(true)}
                      >
                        <ZoomIn className="h-3.5 w-3.5" strokeWidth={1.5} />
                        {tx('Zoom', 'Perbesar')}
                      </Button>
                      {images.length > 1 ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="absolute left-2 top-1/2 h-7 w-7 -translate-y-1/2 bg-white/90"
                            onClick={() =>
                              setActiveImageIdx((prev) => (prev - 1 + images.length) % images.length)
                            }
                          >
                            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2 bg-white/90"
                            onClick={() => setActiveImageIdx((prev) => (prev + 1) % images.length)}
                          >
                            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
                          </Button>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-50 text-zinc-300">
                      <Camera className="h-12 w-12" strokeWidth={1.25} />
                    </div>
                  )}
                </div>

                {/* Thumbnail Strip */}
                {images.length > 1 ? (
                  <div className="flex flex-wrap gap-2">
                    {images.map((url, idx) => (
                      <button
                        key={`${url}-${idx}`}
                        type="button"
                        onClick={() => setActiveImageIdx(idx)}
                        className={`h-14 w-16 overflow-hidden rounded-md border bg-white p-1 transition-all ${
                          idx === safeIdx
                            ? 'border-zinc-900 ring-1 ring-zinc-900'
                            : 'border-zinc-200 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={url}
                          alt={`${equipment.name} #${idx + 1}`}
                          className="h-full w-full object-contain"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}

                {/* Serialized Fleet Status */}
                <div className="rounded-md border border-zinc-200 bg-zinc-50/70 p-3 text-xs">
                  <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    <Layers className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {tx('Serialized Fleet Condition', 'Kondisi Armada Bernomor Seri')}
                  </p>
                  {units.length === 0 ? (
                    <p className="mt-1.5 text-[11px] text-zinc-500">
                      {tx(
                        'Serialized units are tracked individually at handover.',
                        'Unit bernomor seri dilacak satu per satu saat serah terima.'
                      )}
                    </p>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      {units.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center justify-between rounded border border-zinc-200/80 bg-white px-2.5 py-1.5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-medium text-zinc-800">
                              {u.serialNumber}
                            </span>
                            <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-600">
                              {u.condition}
                            </span>
                          </div>
                          <StatusBadge status={u.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right 6 cols: Pricing, Specs, Accessories */}
              <div className="space-y-4 md:col-span-6">
                {/* Pricing Summary Box */}
                <div className="space-y-2.5 rounded-lg border border-zinc-200 bg-white p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                        {tx('Daily Rental Rate', 'Tarif Sewa Harian')}
                      </p>
                      <div className="mt-0.5 flex items-baseline gap-2">
                        <CurrencyText
                          amount={hasDiscount ? effectiveDailyRate : equipment.dailyRate}
                          className="text-xl font-semibold text-zinc-950"
                        />
                        <span className="text-xs text-zinc-500">{tx('/ day', '/ hari')}</span>
                        {tierBenefits.rentalDiscountPercent > 0 ? (
                          <span className="font-mono text-xs text-zinc-400 line-through">
                            <CurrencyText amount={equipment.dailyRate} />
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {memberTier === 'premium' ? <MembershipBadge tier="premium" /> : null}
                  </div>

                  <Separator />

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-zinc-600">
                      <span>
                        {tx(`Est. ${rentalDays} day(s) rental`, `Est. sewa ${rentalDays} hari`)}
                      </span>
                      <CurrencyText
                        amount={(hasDiscount ? effectiveDailyRate : equipment.dailyRate) * rentalDays}
                        className="font-medium text-zinc-950"
                      />
                    </div>
                    <div className="flex items-center justify-between text-zinc-600">
                      <span>{tx('Refundable Deposit', 'Deposit Jaminan')}</span>
                      <span className="flex items-center gap-1.5">
                        <CurrencyText
                          amount={hasDiscount ? effectiveDeposit : equipment.depositAmount}
                          className="font-medium text-zinc-950"
                        />
                        {tierBenefits.depositDiscountPercent > 0 ? (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-emerald-700">
                            -{tierBenefits.depositDiscountPercent}%
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>

                  {memberTier === 'basic' && settings.tiers.premium.rentalDiscountPercent > 0 ? (
                    <div className="flex items-center gap-1.5 rounded border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[11px] text-zinc-600">
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-zinc-500" strokeWidth={1.5} />
                      <span>
                        {tx(
                          `Premium members get ${settings.tiers.premium.rentalDiscountPercent}% off rent & -${settings.tiers.premium.depositDiscountPercent}% deposit.`,
                          `Member Premium hemat ${settings.tiers.premium.rentalDiscountPercent}% sewa & diskon deposit ${settings.tiers.premium.depositDiscountPercent}%.`
                        )}
                      </span>
                    </div>
                  ) : null}
                </div>

                {/* Technical Specifications */}
                <div className="space-y-2">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    {tx('Technical Specifications', 'Spesifikasi Teknis')}
                  </p>
                  {specEntries.length === 0 ? (
                    <p className="text-xs text-zinc-500">
                      {tx('No technical specifications listed.', 'Belum ada spesifikasi teknis.')}
                    </p>
                  ) : (
                    <dl className="divide-y divide-zinc-100 rounded-md border border-zinc-200 bg-white text-xs">
                      {specEntries.map(([key, value]) => (
                        <div
                          key={key}
                          className="flex items-start justify-between gap-3 px-3 py-2"
                        >
                          <dt className="shrink-0 capitalize text-zinc-500">
                            {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}
                          </dt>
                          <dd className="text-right font-medium text-zinc-900">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>

                {/* Included Accessories */}
                {includedAccessories.length > 0 ? (
                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      <PackageCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
                      {tx('Included Accessories', 'Kelengkapan Aksesoris')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {includedAccessories.map((acc) => (
                        <span
                          key={acc}
                          className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-700"
                        >
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" strokeWidth={1.5} />
                          {acc}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Sticky Footer */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50/80 px-6 py-3.5">
            <div className="text-xs text-zinc-500">
              {tx(
                `Turnaround buffer: +${tenant.bufferHours}h · Grace: ${tenant.overdueGraceMinutes}m`,
                `Buffer antar-sewa: +${tenant.bufferHours}j · Grace: ${tenant.overdueGraceMinutes}m`
              )}
            </div>

            <div className="flex items-center gap-2">
              {inCartQty > 0 ? (
                <div className="flex h-9 items-center gap-2 rounded-md border border-zinc-300 bg-white px-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={onDecrement}
                  >
                    <Minus className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </Button>
                  <span className="px-1 font-mono text-xs font-semibold text-zinc-950">
                    {tx(`${inCartQty} in Draft`, `${inCartQty} di Draft`)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={!canAdd}
                    onClick={onAdd}
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </Button>
                </div>
              ) : (
                <Button type="button" size="sm" disabled={!canAdd} onClick={onAdd}>
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                  {tx('Add to Booking', 'Tambah ke Booking')}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-white"
                onClick={() => onOpenChange(false)}
              >
                {tx('Close', 'Tutup')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ImagePreviewModal
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        images={images.map((url, idx) => ({
          url,
          label: `${equipment.brand} ${equipment.name}${images.length > 1 ? ` #${idx + 1}` : ''}`,
        }))}
        initialIndex={safeIdx}
        title={equipment.name}
      />
    </>
  );
}

