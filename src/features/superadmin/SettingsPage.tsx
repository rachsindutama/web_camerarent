import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Globe,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { storage } from '@/lib/firebase';
import {
  DEFAULT_PLATFORM_SETTINGS,
  DEFAULT_SITE_SEO,
  formatTierSummaryParts,
  type MembershipBenefitConfig,
  type PlatformSettings,
  type RobotsDirective,
  type SiteSeoConfig,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { MembershipTier } from '@/types/schema';

type ApplyScope = 'all' | 'selected';
type SettingsSectionTab = 'seo' | 'tiers' | 'operations';
type BrandingAssetField = 'faviconUrl' | 'logoUrl' | 'ogImageUrl';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { settings } = usePlatformSettings();
  const { allTenants } = useTenant();

  const [activeTab, setActiveTab] = useState<SettingsSectionTab>('seo');
  const [draft, setDraft] = useState<PlatformSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [applyingBranches, setApplyingBranches] = useState(false);
  const [uploadingField, setUploadingField] = useState<BrandingAssetField | null>(null);

  // Branch target scope, search & pagination for Ongkir, Buffer, Grace & Denda
  const [applyScope, setApplyScope] = useState<ApplyScope>('all');
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([]);
  const [branchSearch, setBranchSearch] = useState('');
  const [branchPage, setBranchPage] = useState(1);
  const [branchPageSize, setBranchPageSize] = useState(5);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const filteredTenants = useMemo(() => {
    const q = branchSearch.trim().toLowerCase();
    if (!q) return allTenants;
    return allTenants.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q)
    );
  }, [allTenants, branchSearch]);

  const totalBranchPages = Math.max(1, Math.ceil(filteredTenants.length / branchPageSize));
  const safeBranchPage = Math.min(branchPage, totalBranchPages);
  const paginatedTenants = useMemo(() => {
    const start = (safeBranchPage - 1) * branchPageSize;
    return filteredTenants.slice(start, start + branchPageSize);
  }, [filteredTenants, safeBranchPage, branchPageSize]);

  useEffect(() => {
    if (branchPage > totalBranchPages) {
      setBranchPage(totalBranchPages);
    }
  }, [branchPage, totalBranchPages]);

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

  const updateSeoField = <K extends keyof SiteSeoConfig>(field: K, value: SiteSeoConfig[K]) => {
    setDraft((prev) => ({
      ...prev,
      seo: {
        ...prev.seo,
        [field]: value,
      },
    }));
  };

  const handleUploadBrandingAsset = async (
    field: BrandingAssetField,
    file: File | undefined
  ) => {
    if (!file) return;
    if (!storage) {
      toast.error('Firebase Storage belum terkonfigurasi.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('File harus berupa gambar (PNG, JPG, WebP, SVG, atau ICO).');
      return;
    }
    if (file.size >= 5 * 1024 * 1024) {
      toast.error('Ukuran file maksimal 5 MB.');
      return;
    }

    setUploadingField(field);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const folder =
        field === 'faviconUrl' ? 'favicon' : field === 'logoUrl' ? 'logo' : 'og-image';
      const storageRef = ref(storage, `branding/${folder}_${Date.now()}_${safeName}`);
      await uploadBytes(storageRef, file, { contentType: file.type });
      const url = await getDownloadURL(storageRef);
      updateSeoField(field, url);
      toast.success('Gambar berhasil diunggah. Klik Simpan untuk menerapkan ke seluruh situs.');
    } catch (error) {
      console.error('Upload branding asset error:', error);
      toast.error('Gagal mengunggah gambar ke Firebase Storage.');
    } finally {
      setUploadingField(null);
    }
  };

  const toggleTenantSelection = (tenantId: string) => {
    setSelectedTenantIds((prev) =>
      prev.includes(tenantId) ? prev.filter((id) => id !== tenantId) : [...prev, tenantId]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === 'operations' && applyScope === 'selected' && selectedTenantIds.length === 0) {
      toast.error('Pilih minimal 1 cabang tujuan, atau pilih "Semua Cabang".');
      return;
    }

    setSaving(true);
    try {
      const saved = await savePlatformSettings(draft);
      queryClient.setQueryData(PLATFORM_SETTINGS_QUERY_KEY, saved);

      if (activeTab === 'operations') {
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
      } else if (activeTab === 'seo') {
        toast.success(
          'Pengaturan SEO, judul, favicon & branding berhasil disimpan dan langsung aktif.'
        );
      } else {
        toast.success('Pengaturan Benefit Tier Member berhasil disimpan dan langsung aktif.');
      }
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
    if (activeTab === 'seo') {
      setDraft((prev) => ({ ...prev, seo: DEFAULT_SITE_SEO }));
      toast.info('SEO & Branding dikembalikan ke default. Klik Simpan untuk menerapkan.');
      return;
    }
    if (activeTab === 'tiers') {
      setDraft((prev) => ({ ...prev, tiers: DEFAULT_PLATFORM_SETTINGS.tiers }));
      toast.info('Benefit Tier dikembalikan ke default. Klik Simpan untuk menerapkan.');
      return;
    }
    setDraft((prev) => ({
      ...prev,
      defaultDeliveryRatePerKm: DEFAULT_PLATFORM_SETTINGS.defaultDeliveryRatePerKm,
      defaultBufferHours: DEFAULT_PLATFORM_SETTINGS.defaultBufferHours,
      defaultOverdueGraceMinutes: DEFAULT_PLATFORM_SETTINGS.defaultOverdueGraceMinutes,
      defaultOverdueHourlyRatePercent: DEFAULT_PLATFORM_SETTINGS.defaultOverdueHourlyRatePercent,
    }));
    toast.info('Ongkir & aturan cabang dikembalikan ke default. Klik Simpan untuk menerapkan.');
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
            Pusat pengaturan SEO, judul, favicon &amp; branding website, benefit tier member, serta
            aturan operasional cabang.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleResetDefaults}>
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
            Reset Default
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            <Save className="h-3.5 w-3.5" strokeWidth={1.5} />
            {saving
              ? 'Menyimpan...'
              : activeTab === 'seo'
                ? 'Simpan SEO & Branding'
                : activeTab === 'tiers'
                  ? 'Simpan Benefit Tier'
                  : 'Simpan & Terapkan'}
          </Button>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as SettingsSectionTab)}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="seo" className="gap-1.5">
            <Globe className="h-3.5 w-3.5" strokeWidth={1.5} />
            SEO &amp; Branding
          </TabsTrigger>
          <TabsTrigger value="tiers" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
            Benefit Tier Member
          </TabsTrigger>
          <TabsTrigger value="operations" className="gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
            Ongkir &amp; Aturan Cabang
          </TabsTrigger>
        </TabsList>

        {/* Sub-tab 1: Global SEO, Title, Favicon & Branding */}
        <TabsContent value="seo" className="mt-0 space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Left 7 cols: Form Controls */}
            <div className="space-y-4 lg:col-span-7">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Identitas Website &amp; Branding</CardTitle>
                  <CardDescription>
                    Mengubah nama brand, judul tab browser, logo, favicon, judul katalog, dan footer
                    secara menyeluruh.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="seo-site-name">Nama Brand / Website</Label>
                      <Input
                        id="seo-site-name"
                        placeholder="CameraRent"
                        value={draft.seo.siteName}
                        onChange={(e) => updateSeoField('siteName', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="seo-theme-color">Warna Tema Browser</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          aria-label="Theme color picker"
                          value={
                            /^#[0-9a-fA-F]{6}$/.test(draft.seo.themeColor)
                              ? draft.seo.themeColor
                              : '#18181b'
                          }
                          onChange={(e) => updateSeoField('themeColor', e.target.value)}
                          className="h-9 w-11 cursor-pointer rounded-md border border-input bg-background p-1"
                        />
                        <Input
                          id="seo-theme-color"
                          className="font-mono text-xs"
                          value={draft.seo.themeColor}
                          onChange={(e) => updateSeoField('themeColor', e.target.value)}
                          placeholder="#18181b"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="seo-site-title">Judul Browser (&lt;title&gt;)</Label>
                      <span
                        className={`text-[11px] tabular-nums ${
                          draft.seo.siteTitle.length > 60
                            ? 'text-amber-600'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {draft.seo.siteTitle.length} / 60 karakter
                      </span>
                    </div>
                    <Input
                      id="seo-site-title"
                      placeholder="CameraRent — Sewa Kamera & Gear Produksi"
                      value={draft.seo.siteTitle}
                      onChange={(e) => updateSeoField('siteTitle', e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="seo-catalog-heading">Judul Utama Katalog (H1)</Label>
                      <Input
                        id="seo-catalog-heading"
                        placeholder="Katalog Kamera & Gear Produksi"
                        value={draft.seo.catalogHeading}
                        onChange={(e) => updateSeoField('catalogHeading', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="seo-footer-text">Teks Copyright Footer</Label>
                      <Input
                        id="seo-footer-text"
                        placeholder="Copyright © 2026 PT Pratamavisual Media Kreatif"
                        value={draft.seo.footerText}
                        onChange={(e) => updateSeoField('footerText', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="seo-catalog-subtitle">Subjudul Katalog</Label>
                    <Input
                      id="seo-catalog-subtitle"
                      placeholder="Jelajahi kamera, lensa, lighting, dan paket produksi..."
                      value={draft.seo.catalogSubtitle}
                      onChange={(e) => updateSeoField('catalogSubtitle', e.target.value)}
                    />
                  </div>

                  <Separator />

                  {/* Favicon & Brand Logo Uploads */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Favicon (Ikon Tab Browser)</Label>
                      <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
                            {draft.seo.faviconUrl ? (
                              <img
                                src={draft.seo.faviconUrl}
                                alt="Favicon"
                                className="h-7 w-7 object-contain"
                              />
                            ) : (
                              <Globe className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium shadow-sm transition-colors hover:bg-accent">
                              {uploadingField === 'faviconUrl' ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                              ) : (
                                <Upload className="h-3.5 w-3.5" strokeWidth={1.5} />
                              )}
                              <span>Upload</span>
                              <input
                                type="file"
                                accept="image/png,image/svg+xml,image/x-icon,image/webp,image/jpeg"
                                disabled={uploadingField !== null}
                                className="hidden"
                                onChange={(e) => {
                                  void handleUploadBrandingAsset('faviconUrl', e.target.files?.[0]);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                            {draft.seo.faviconUrl !== '/favicon.svg' ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-muted-foreground"
                                onClick={() => updateSeoField('faviconUrl', '/favicon.svg')}
                              >
                                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                                Default
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        <Input
                          placeholder="/favicon.svg atau https://..."
                          value={draft.seo.faviconUrl}
                          onChange={(e) => updateSeoField('faviconUrl', e.target.value)}
                          className="h-8 bg-background text-xs"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Logo Brand (Opsional)</Label>
                      <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
                            {draft.seo.logoUrl ? (
                              <img
                                src={draft.seo.logoUrl}
                                alt="Logo"
                                className="h-8 w-8 object-contain"
                              />
                            ) : (
                              <ImageIcon
                                className="h-4 w-4 text-muted-foreground/50"
                                strokeWidth={1.5}
                              />
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium shadow-sm transition-colors hover:bg-accent">
                              {uploadingField === 'logoUrl' ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                              ) : (
                                <Upload className="h-3.5 w-3.5" strokeWidth={1.5} />
                              )}
                              <span>Upload</span>
                              <input
                                type="file"
                                accept="image/*"
                                disabled={uploadingField !== null}
                                className="hidden"
                                onChange={(e) => {
                                  void handleUploadBrandingAsset('logoUrl', e.target.files?.[0]);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                            {draft.seo.logoUrl ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                                onClick={() => updateSeoField('logoUrl', '')}
                              >
                                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                                Hapus
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        <Input
                          placeholder="Kosongkan untuk ikon default atau tempel URL"
                          value={draft.seo.logoUrl}
                          onChange={(e) => updateSeoField('logoUrl', e.target.value)}
                          className="h-8 bg-background text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Meta SEO &amp; Mesin Pencari</CardTitle>
                  <CardDescription>
                    Mengatur deskripsi, kata kunci, canonical URL, dan aturan indeks Google.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="seo-description">Meta Description</Label>
                      <span
                        className={`text-[11px] tabular-nums ${
                          draft.seo.metaDescription.length > 160
                            ? 'text-amber-600'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {draft.seo.metaDescription.length} / 160 karakter
                      </span>
                    </div>
                    <textarea
                      id="seo-description"
                      rows={3}
                      placeholder="Ringkasan layanan sewa kamera untuk tampil di hasil pencarian Google..."
                      value={draft.seo.metaDescription}
                      onChange={(e) => updateSeoField('metaDescription', e.target.value)}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="seo-keywords">Meta Keywords (pisah koma)</Label>
                    <Input
                      id="seo-keywords"
                      placeholder="sewa kamera, rental kamera, sewa lensa, lighting..."
                      value={draft.seo.metaKeywords}
                      onChange={(e) => updateSeoField('metaKeywords', e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="seo-canonical">Canonical URL (Domain Utama)</Label>
                      <Input
                        id="seo-canonical"
                        placeholder="https://project-camerarent.web.app"
                        value={draft.seo.canonicalUrl}
                        onChange={(e) => updateSeoField('canonicalUrl', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Indexing Robots</Label>
                      <Select
                        value={draft.seo.robots}
                        onValueChange={(v) => updateSeoField('robots', v as RobotsDirective)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="index,follow">index, follow (Direkomendasikan)</SelectItem>
                          <SelectItem value="index,nofollow">index, nofollow</SelectItem>
                          <SelectItem value="noindex,follow">noindex, follow</SelectItem>
                          <SelectItem value="noindex,nofollow">
                            noindex, nofollow (Sembunyikan dari Google)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Open Graph &amp; Social Share</CardTitle>
                  <CardDescription>
                    Tampilan kartu pratinjau saat tautan website dibagikan ke WhatsApp, Facebook,
                    atau X / Twitter.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>OG Share Image (Rekomendasi 1200 × 630 px)</Label>
                    <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-center">
                      <div className="flex h-20 w-36 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
                        {draft.seo.ogImageUrl ? (
                          <img
                            src={draft.seo.ogImageUrl}
                            alt="OG Preview"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <ImageIcon
                            className="h-6 w-6 text-muted-foreground/40"
                            strokeWidth={1.5}
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-sm transition-colors hover:bg-accent">
                            {uploadingField === 'ogImageUrl' ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                            ) : (
                              <Upload className="h-3.5 w-3.5" strokeWidth={1.5} />
                            )}
                            <span>
                              {uploadingField === 'ogImageUrl' ? 'Mengunggah...' : 'Upload Banner'}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              disabled={uploadingField !== null}
                              className="hidden"
                              onChange={(e) => {
                                void handleUploadBrandingAsset('ogImageUrl', e.target.files?.[0]);
                                e.target.value = '';
                              }}
                            />
                          </label>
                          {draft.seo.ogImageUrl ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                              onClick={() => updateSeoField('ogImageUrl', '')}
                            >
                              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                              Hapus
                            </Button>
                          ) : null}
                        </div>
                        <Input
                          placeholder="Atau tempel URL banner (https://...)"
                          value={draft.seo.ogImageUrl}
                          onChange={(e) => updateSeoField('ogImageUrl', e.target.value)}
                          className="h-8 bg-background text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label>Tipe Kartu X / Twitter</Label>
                      <Select
                        value={draft.seo.twitterCard}
                        onValueChange={(v) =>
                          updateSeoField('twitterCard', v as 'summary_large_image' | 'summary')
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="summary_large_image">Large Image</SelectItem>
                          <SelectItem value="summary">Summary Kecil</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="seo-twitter-handle">Twitter / X Handle</Label>
                      <Input
                        id="seo-twitter-handle"
                        placeholder="@camerarent_id"
                        value={draft.seo.twitterHandle}
                        onChange={(e) => updateSeoField('twitterHandle', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="seo-locale">Locale</Label>
                      <Input
                        id="seo-locale"
                        placeholder="id_ID"
                        value={draft.seo.locale}
                        onChange={(e) => updateSeoField('locale', e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right 5 cols: Live Browser Tab, Google Search & Social Card Previews */}
            <div className="space-y-4 lg:col-span-5">
              <Card className="sticky top-4">
                <CardHeader>
                  <CardTitle className="text-base">Pratinjau Langsung</CardTitle>
                  <CardDescription>
                    Simulasi tampilan di tab browser, hasil pencarian Google, dan kartu share media
                    sosial.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Browser Tab Preview */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground">Tab Browser</p>
                    <div className="rounded-md border bg-muted/50 p-2 pb-0">
                      <div className="inline-flex max-w-[260px] items-center gap-2 rounded-t-md border border-b-0 bg-background px-3 py-1.5 text-xs">
                        {draft.seo.faviconUrl ? (
                          <img
                            src={draft.seo.faviconUrl}
                            alt="Favicon"
                            className="h-3.5 w-3.5 shrink-0 object-contain"
                          />
                        ) : (
                          <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate font-medium text-foreground">
                          {draft.seo.siteTitle || draft.seo.siteName}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Google Search Result Preview */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Hasil Pencarian Google
                    </p>
                    <div className="space-y-1 rounded-md border bg-background p-3.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted/30">
                          {draft.seo.faviconUrl ? (
                            <img
                              src={draft.seo.faviconUrl}
                              alt=""
                              className="h-4 w-4 object-contain"
                            />
                          ) : (
                            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 leading-tight">
                          <p className="truncate text-xs font-medium text-foreground">
                            {draft.seo.siteName || 'CameraRent'}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {draft.seo.canonicalUrl || 'https://project-camerarent.web.app'}
                          </p>
                        </div>
                      </div>
                      <p className="line-clamp-1 pt-0.5 text-sm font-medium text-blue-700">
                        {draft.seo.siteTitle || draft.seo.siteName}
                      </p>
                      <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                        {draft.seo.metaDescription || 'Belum ada meta description.'}
                      </p>
                    </div>
                  </div>

                  {/* Social / WhatsApp Share Card Preview */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Kartu Share (WhatsApp / Facebook / X)
                    </p>
                    <div className="overflow-hidden rounded-md border bg-background">
                      <div className="flex aspect-[1.91/1] w-full items-center justify-center border-b bg-muted/40">
                        {draft.seo.ogImageUrl ? (
                          <img
                            src={draft.seo.ogImageUrl}
                            alt="OG Share"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-muted-foreground/50">
                            <ImageIcon className="h-6 w-6" strokeWidth={1.5} />
                            <span className="text-[11px]">Belum ada OG Image (1200×630)</span>
                          </div>
                        )}
                      </div>
                      <div className="space-y-0.5 p-3">
                        <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                          {(draft.seo.canonicalUrl || 'project-camerarent.web.app').replace(
                            /^https?:\/\//,
                            ''
                          )}
                        </p>
                        <p className="line-clamp-1 text-xs font-semibold text-foreground">
                          {draft.seo.siteTitle || draft.seo.siteName}
                        </p>
                        <p className="line-clamp-2 text-[11px] text-muted-foreground">
                          {draft.seo.metaDescription || 'Tambahkan deskripsi singkat website.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Sub-tab 2: Membership Tier Benefits */}
        <TabsContent value="tiers" className="mt-0">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {renderTierCard('basic')}
            {renderTierCard('premium')}
          </div>
        </TabsContent>

        {/* Sub-tab 2: Global / Branch-Scoped Delivery & Operational Rules */}
        <TabsContent value="operations" className="mt-0">
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

                <div className="inline-flex rounded-lg border bg-muted/60 p-1">
                  <button
                    type="button"
                    onClick={() => setApplyScope('all')}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      applyScope === 'all'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Semua Cabang ({allTenants.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setApplyScope('selected')}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      applyScope === 'selected'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Cabang Tertentu ({selectedTenantIds.length})
                  </button>
                </div>
              </div>

              {/* Search & Per-Page Bar */}
              {allTenants.length > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="relative w-full max-w-xs">
                    <Search
                      className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground"
                      strokeWidth={1.5}
                    />
                    <Input
                      placeholder="Cari cabang..."
                      value={branchSearch}
                      onChange={(e) => {
                        setBranchSearch(e.target.value);
                        setBranchPage(1);
                      }}
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Tampilkan</span>
                    <Select
                      value={String(branchPageSize)}
                      onValueChange={(v) => {
                        setBranchPageSize(Number(v));
                        setBranchPage(1);
                      }}
                    >
                      <SelectTrigger className="h-8 w-16 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                      </SelectContent>
                    </Select>
                    <span>/ halaman</span>
                  </div>
                </div>
              ) : null}

              {/* Branch status overview & selectable checkboxes when scope === 'selected' */}
              {allTenants.length === 0 ? (
                <div className="flex items-center gap-2 rounded-md border border-dashed px-3.5 py-3 text-xs text-muted-foreground">
                  <Building2 className="h-4 w-4" strokeWidth={1.5} />
                  Belum ada cabang terdaftar.
                </div>
              ) : filteredTenants.length === 0 ? (
                <div className="rounded-md border border-dashed px-3.5 py-4 text-center text-xs text-muted-foreground">
                  Tidak ada cabang yang cocok dengan pencarian &ldquo;{branchSearch}&rdquo;.
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="divide-y divide-border rounded-md border">
                    {paginatedTenants.map((tenant) => {
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

                  {/* Pagination Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      Menampilkan {(safeBranchPage - 1) * branchPageSize + 1}–
                      {Math.min(safeBranchPage * branchPageSize, filteredTenants.length)} dari{' '}
                      {filteredTenants.length} cabang
                    </span>

                    <div className="flex items-center gap-1.5">
                      <span className="mr-1 tabular-nums">
                        Halaman {safeBranchPage} / {totalBranchPages}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        disabled={safeBranchPage <= 1}
                        onClick={() => setBranchPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
                        Prev
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        disabled={safeBranchPage >= totalBranchPages}
                        onClick={() => setBranchPage((p) => Math.min(totalBranchPages, p + 1))}
                      >
                        Next
                        <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </Button>
                    </div>
                  </div>
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
        </TabsContent>
      </Tabs>
    </form>
  );
}
