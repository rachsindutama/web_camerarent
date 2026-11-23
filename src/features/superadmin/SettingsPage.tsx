import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Save, SlidersHorizontal, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULT_PLATFORM_SETTINGS,
  formatTierSummaryParts,
  type MembershipBenefitConfig,
  type PlatformSettings,
} from '@/lib/membership';
import {
  applyOperationalDefaultsToAllTenants,
  PLATFORM_SETTINGS_QUERY_KEY,
  savePlatformSettings,
  usePlatformSettings,
} from '@/hooks/usePlatformSettings';
import { MembershipBadge } from '@/components/shared/MembershipBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import type { MembershipTier } from '@/types/schema';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { settings } = usePlatformSettings();

  const [draft, setDraft] = useState<PlatformSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [applyingAll, setApplyingAll] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const updateTierField = <K extends keyof MembershipBenefitConfig>(
    tier: MembershipTier,
    field: K,
    value: MembershipBenefitConfig[K]
  ) => {
    setDraft((prev) => ({
      ...prev,
      tiers: {
        ...prev.tiers,
        [tier]: {
          ...prev.tiers[tier],
          [field]: value,
        },
      },
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await savePlatformSettings(draft);
      queryClient.setQueryData(PLATFORM_SETTINGS_QUERY_KEY, saved);
      toast.success('Pengaturan global berhasil disimpan dan langsung aktif.');
    } catch (error) {
      console.error('Save platform settings error:', error);
      toast.error('Gagal menyimpan pengaturan. Pastikan login sebagai Superadmin.');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyToAllBranches = async () => {
    setApplyingAll(true);
    try {
      const saved = await savePlatformSettings(draft);
      queryClient.setQueryData(PLATFORM_SETTINGS_QUERY_KEY, saved);
      const count = await applyOperationalDefaultsToAllTenants({
        deliveryRatePerKm: saved.defaultDeliveryRatePerKm,
        bufferHours: saved.defaultBufferHours,
        overdueGraceMinutes: saved.defaultOverdueGraceMinutes,
        overdueHourlyRatePercent: saved.defaultOverdueHourlyRatePercent,
      });
      await queryClient.invalidateQueries({ queryKey: ['tenants'] });
      toast.success(
        `Pengaturan disimpan & tarif ongkir/aturan diterapkan ke ${count} cabang aktif.`
      );
    } catch (error) {
      console.error('Apply settings to all tenants error:', error);
      toast.error('Gagal menerapkan aturan ke semua cabang.');
    } finally {
      setApplyingAll(false);
    }
  };

  const handleResetDefaults = () => {
    setDraft(DEFAULT_PLATFORM_SETTINGS);
    toast.info('Form dikembalikan ke nilai default. Klik Simpan untuk menerapkan.');
  };

  const renderTierCard = (tier: MembershipTier) => {
    const config = draft.tiers[tier];
    const isUnlimited = config.maxUnitsPerBooking === null;
    const depositPayablePercent = Math.max(0, 100 - config.depositDiscountPercent);

    return (
      <Card key={tier}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="space-y-1">
            <CardTitle className="text-base">
              {tier === 'premium' ? 'Tier Premium' : 'Tier Basic'}
            </CardTitle>
            <CardDescription>
              {tier === 'premium'
                ? 'Benefit khusus untuk member prioritas.'
                : 'Aturan standar untuk member reguler.'}
            </CardDescription>
          </div>
          <MembershipBadge tier={tier} />
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${tier}-discount`}>Diskon Sewa (%)</Label>
              <Input
                id={`${tier}-discount`}
                type="number"
                min={0}
                max={100}
                className="tabular-nums"
                value={config.rentalDiscountPercent}
                onChange={(e) =>
                  updateTierField(
                    tier,
                    'rentalDiscountPercent',
                    Math.min(100, Math.max(0, Number(e.target.value) || 0))
                  )
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${tier}-deposit`}>Potongan Deposit (%)</Label>
              <Input
                id={`${tier}-deposit`}
                type="number"
                min={0}
                max={100}
                className="tabular-nums"
                value={config.depositDiscountPercent}
                onChange={(e) =>
                  updateTierField(
                    tier,
                    'depositDiscountPercent',
                    Math.min(100, Math.max(0, Number(e.target.value) || 0))
                  )
                }
              />
              <p className="text-[11px] text-muted-foreground">
                Deposit dibayar: {depositPayablePercent}%
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${tier}-grace`}>Tambahan Grace Period (menit)</Label>
              <Input
                id={`${tier}-grace`}
                type="number"
                min={0}
                max={1440}
                className="tabular-nums"
                value={config.extraOverdueGraceMinutes}
                onChange={(e) =>
                  updateTierField(
                    tier,
                    'extraOverdueGraceMinutes',
                    Math.min(1440, Math.max(0, Number(e.target.value) || 0))
                  )
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${tier}-delivery`}>Gratis Ongkir (km pertama)</Label>
              <Input
                id={`${tier}-delivery`}
                type="number"
                min={0}
                max={200}
                className="tabular-nums"
                value={config.freeDeliveryKm}
                onChange={(e) =>
                  updateTierField(
                    tier,
                    'freeDeliveryKm',
                    Math.min(200, Math.max(0, Number(e.target.value) || 0))
                  )
                }
              />
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor={`${tier}-max-units`}>Maks. Unit / Booking</Label>
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="rounded border-input"
                    checked={isUnlimited}
                    onChange={(e) =>
                      updateTierField(tier, 'maxUnitsPerBooking', e.target.checked ? null : 3)
                    }
                  />
                  Unlimited
                </label>
              </div>
              <Input
                id={`${tier}-max-units`}
                type="number"
                min={1}
                max={100}
                disabled={isUnlimited}
                placeholder="Unlimited"
                className="tabular-nums"
                value={isUnlimited ? '' : config.maxUnitsPerBooking ?? ''}
                onChange={(e) =>
                  updateTierField(
                    tier,
                    'maxUnitsPerBooking',
                    Math.max(1, Math.floor(Number(e.target.value) || 1))
                  )
                }
              />
            </div>

            <label className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md border px-3 text-xs font-medium text-foreground">
              <input
                type="checkbox"
                className="rounded border-input"
                checked={config.prioritySupport}
                onChange={(e) => updateTierField(tier, 'prioritySupport', e.target.checked)}
              />
              Aktifkan Priority Badge &amp; Layanan
            </label>
          </div>

          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {formatTierSummaryParts(config).join(' · ')}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Settings</h2>
          <p className="text-sm text-muted-foreground">
            Atur benefit tier Basic &amp; Premium, ongkir antar-jemput, buffer, grace period, dan
            denda keterlambatan secara menyeluruh.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleResetDefaults}>
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
            Reset Default
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            <Save className="h-3.5 w-3.5" strokeWidth={1.5} />
            {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </Button>
        </div>
      </div>

      {/* Section 1: Membership Tier Benefits */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <h3 className="text-sm font-semibold text-foreground">Benefit Tier Member</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {renderTierCard('basic')}
          {renderTierCard('premium')}
        </div>
      </section>

      {/* Section 2: Global Delivery & Operational Defaults */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <h3 className="text-sm font-semibold text-foreground">
            Ongkir &amp; Aturan Operasional Global
          </h3>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Standar Ongkir, Buffer &amp; Denda</CardTitle>
            <CardDescription>
              Nilai ini menjadi standar saat membuat cabang baru, atau bisa langsung diterapkan ke
              seluruh cabang sekaligus.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="global-delivery-rate">Tarif Ongkir (Rp / km)</Label>
                <Input
                  id="global-delivery-rate"
                  type="number"
                  min={0}
                  step={500}
                  className="tabular-nums"
                  value={draft.defaultDeliveryRatePerKm}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      defaultDeliveryRatePerKm: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="global-buffer">Turnaround Buffer (jam)</Label>
                <Input
                  id="global-buffer"
                  type="number"
                  min={0}
                  max={72}
                  className="tabular-nums"
                  value={draft.defaultBufferHours}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      defaultBufferHours: Math.min(72, Math.max(0, Number(e.target.value) || 0)),
                    }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="global-grace">Grace Period Standar (menit)</Label>
                <Input
                  id="global-grace"
                  type="number"
                  min={0}
                  max={1440}
                  className="tabular-nums"
                  value={draft.defaultOverdueGraceMinutes}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      defaultOverdueGraceMinutes: Math.min(
                        1440,
                        Math.max(0, Number(e.target.value) || 0)
                      ),
                    }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="global-overdue-rate">Denda Overdue (% / jam)</Label>
                <Input
                  id="global-overdue-rate"
                  type="number"
                  min={1}
                  max={100}
                  className="tabular-nums"
                  value={draft.defaultOverdueHourlyRatePercent}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      defaultOverdueHourlyRatePercent: Math.min(
                        100,
                        Math.max(1, Number(e.target.value) || 1)
                      ),
                    }))
                  }
                />
              </div>
            </div>

            <Separator />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Klik tombol di samping untuk menyamakan tarif ongkir, buffer, grace period, dan
                persentase denda di semua cabang sekaligus.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={applyingAll}
                onClick={() => void handleApplyToAllBranches()}
              >
                {applyingAll ? 'Menerapkan...' : 'Terapkan ke Semua Cabang'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </form>
  );
}

