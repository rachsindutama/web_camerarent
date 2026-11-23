import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Check, RotateCcw, Save, SlidersHorizontal, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULT_PLATFORM_SETTINGS,
  formatTierSummaryParts,
  type MembershipBenefitConfig,
  type PlatformSettings,
} from '@/lib/membership';
import {
  applyOperationalDefaultsToTenants,
  PLATFORM_SETTINGS_QUERY_KEY,
  savePlatformSettings,
  usePlatformSettings,
} from '@/hooks/usePlatformSettings';
import { useTenant } from '@/hooks/useTenant';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { MembershipBadge } from '@/components/shared/MembershipBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import type { MembershipTier } from '@/types/schema';

type ApplyScope = 'all' | 'selected';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { settings } = usePlatformSettings();
  const { allTenants } = useTenant();

  const [draft, setDraft] = useState<PlatformSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [applyingBranches, setApplyingBranches] = useState(false);

  // Branch target scope for Ongkir, Buffer, Grace & Denda
  const [applyScope, setApplyScope] = useState<ApplyScope>('all');
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([]);

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

  const toggleTenantSelection = (tenantId: string) => {
    setSelectedTenantIds((prev) =>
      prev.includes(tenantId) ? prev.filter((id) => id !== tenantId) : [...prev, tenantId]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (applyScope === 'selected' && selectedTenantIds.length === 0) {
      toast.error('Pilih minimal 1 cabang tujuan, atau pilih "Semua Cabang".');
      return;
    }

    setSaving(true);
    try {
      const saved = await savePlatformSettings(draft);
      queryClient.setQueryData(PLATFORM_SETTINGS_QUERY_KEY, saved);

      const targetIds = applyScope === 'all' ? undefined : selectedTenantIds;
      const updatedCount = await applyOperationalDefaultsToTenants(
        {
          deliveryRatePerKm: saved.defaultDeliveryRatePerKm,
          bufferHours: saved.defaultBufferHours,
          overdueGraceMinutes: saved.defaultOverdueGraceMinutes,
          overdueHourlyRatePercent: saved.defaultOverdueHourlyRatePercent,
        },
        targetIds
      );

      await queryClient.invalidateQueries({ queryKey: ['tenants'] });
      toast.success(
        applyScope === 'all'
          ? `Pengaturan disimpan & diterapkan ke semua (${updatedCount}) cabang.`
          : `Pengaturan disimpan & diterapkan ke ${updatedCount} cabang terpilih.`
      );
    } catch (error) {
      console.error('Save platform settings error:', error);
      toast.error('Gagal menyimpan pengaturan. Pastikan login sebagai Superadmin.');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyOperationalOnly = async () => {
    if (applyScope === 'selected' && selectedTenantIds.length === 0) {
      toast.error('Pilih minimal 1 cabang yang akan diperbarui.');
      return;
    }
    setApplyingBranches(true);
    try {
      const saved = await savePlatformSettings(draft);
      queryClient.setQueryData(PLATFORM_SETTINGS_QUERY_KEY, saved);
      const targetIds = applyScope === 'all' ? undefined : selectedTenantIds;
      const count = await applyOperationalDefaultsToTenants(
        {
          deliveryRatePerKm: saved.defaultDeliveryRatePerKm,
          bufferHours: saved.defaultBufferHours,
          overdueGraceMinutes: saved.defaultOverdueGraceMinutes,
          overdueHourlyRatePercent: saved.defaultOverdueHourlyRatePercent,
        },
        targetIds
      );
      await queryClient.invalidateQueries({ queryKey: ['tenants'] });
      toast.success(
        applyScope === 'all'
          ? `Tarif ongkir & aturan diterapkan ke semua (${count}) cabang.`
          : `Tarif ongkir & aturan diterapkan ke ${count} cabang terpilih.`
      );
    } catch (error) {
      console.error('Apply settings to tenants error:', error);
      toast.error('Gagal menerapkan aturan ke cabang.');
    } finally {
      setApplyingBranches(false);
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
            Pusat pengaturan benefit tier Basic &amp; Premium, tarif ongkir, buffer, grace period,
            dan denda keterlambatan untuk semua cabang maupun cabang tertentu.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleResetDefaults}>
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
            Reset Default
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            <Save className="h-3.5 w-3.5" strokeWidth={1.5} />
            {saving ? 'Menyimpan...' : 'Simpan & Terapkan'}
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

      {/* Section 2: Global / Branch-Scoped Delivery & Operational Rules */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <h3 className="text-sm font-semibold text-foreground">
            Ongkir &amp; Aturan Operasional Cabang
          </h3>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tarif Ongkir, Buffer, Grace &amp; Denda</CardTitle>
            <CardDescription>
              Diatur terpusat di sini — pilih apakah ingin menerapkan ke semua cabang sekaligus atau
              hanya cabang tertentu.
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

            {/* Target Branch Scope Selector */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Target Penerapan Cabang</p>
                  <p className="text-xs text-muted-foreground">
                    Pilih cabang mana yang akan menerima tarif &amp; aturan operasional di atas.
                  </p>
                </div>

                <div className="inline-flex rounded-md border bg-muted p-0.5">
                  <button
                    type="button"
                    onClick={() => setApplyScope('all')}
                    className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                      applyScope === 'all'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Semua Cabang ({allTenants.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setApplyScope('selected')}
                    className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                      applyScope === 'selected'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Cabang Tertentu ({selectedTenantIds.length})
                  </button>
                </div>
              </div>

              {/* Branch status overview & selectable checkboxes when scope === 'selected' */}
              {allTenants.length > 0 ? (
                <div className="divide-y divide-border rounded-md border">
                  {allTenants.map((tenant) => {
                    const checked =
                      applyScope === 'all' || selectedTenantIds.includes(tenant.id);
                    const isSelectable = applyScope === 'selected';

                    return (
                      <div
                        key={tenant.id}
                        onClick={() => isSelectable && toggleTenantSelection(tenant.id)}
                        className={`flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 text-xs transition-colors ${
                          isSelectable ? 'cursor-pointer hover:bg-muted/50' : 'bg-muted/20'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              checked
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-input bg-background'
                            }`}
                          >
                            {checked ? <Check className="h-3 w-3" strokeWidth={2} /> : null}
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{tenant.name}</p>
                            <p className="text-[11px] text-muted-foreground">{tenant.slug}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 tabular-nums text-[11px] text-muted-foreground">
                          <span className="font-medium text-foreground">
                            <CurrencyText amount={tenant.deliveryRatePerKm} suffix="/km" />
                          </span>
                          <span>· {tenant.bufferHours}h buffer</span>
                          <span>· {tenant.overdueGraceMinutes}m grace</span>
                          <span>· {tenant.overdueHourlyRatePercent}%/jam</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-md border border-dashed px-3.5 py-3 text-xs text-muted-foreground">
                  <Building2 className="h-4 w-4" strokeWidth={1.5} />
                  Belum ada cabang terdaftar.
                </div>
              )}

              <div className="flex justify-end pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    applyingBranches ||
                    (applyScope === 'selected' && selectedTenantIds.length === 0)
                  }
                  onClick={() => void handleApplyOperationalOnly()}
                >
                  {applyingBranches
                    ? 'Menerapkan...'
                    : applyScope === 'all'
                      ? `Terapkan ke Semua Cabang (${allTenants.length})`
                      : `Terapkan ke ${selectedTenantIds.length} Cabang Terpilih`}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </form>
  );
}
