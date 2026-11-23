import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, Timestamp, where } from 'firebase/firestore';
import {
  AlertTriangle,
  Aperture,
  Building2,
  Camera,
  CheckCircle2,
  LogIn,
  Package,
  Plus,
  Search,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { db, isFirebaseConfigured, missingFirebaseKeys } from '@/lib/firebase';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Bundle, Equipment, Tenant } from '@/types/schema';

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: 'camera', label: 'Camera' },
  { value: 'lens', label: 'Lens' },
  { value: 'lighting', label: 'Lighting' },
  { value: 'audio', label: 'Audio' },
  { value: 'stabilizer', label: 'Stabilizer' },
  { value: 'accessory', label: 'Accessory' },
];

interface SelectedIntentItem {
  name: string;
  branchName: string;
  dailyRate: number;
  type: 'gear' | 'bundle';
}

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const justRegistered = searchParams.get('registered') === '1';

  const { authError, unregisteredEmail, isConfigured, signInWithGoogle } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  // Public catalog state
  const [selectedTenantId, setSelectedTenantId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [catalogTab, setCatalogTab] = useState<'gear' | 'bundles'>('gear');

  // Auth gate modal state
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [intentItem, setIntentItem] = useState<SelectedIntentItem | null>(null);

  useEffect(() => {
    if (justRegistered || unregisteredEmail || authError || !isConfigured) {
      setAuthDialogOpen(true);
    }
  }, [justRegistered, unregisteredEmail, authError, isConfigured]);

  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: ['public', 'tenants'],
    enabled: isFirebaseConfigured && Boolean(db),
    queryFn: async () => {
      if (!db) return [];
      const snap = await getDocs(collection(db, 'tenants'));
      return snap.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            name: d.name ?? 'CameraRent Branch',
            slug: d.slug ?? docSnap.id,
            address: d.address ?? '',
            coordinates: d.coordinates ?? { lat: -6.2088, lng: 106.8456 },
            deliveryRatePerKm: Number(d.deliveryRatePerKm ?? 15000),
            bufferHours: Number(d.bufferHours ?? 3),
            overdueGraceMinutes: Number(d.overdueGraceMinutes ?? 60),
            overdueHourlyRatePercent: Number(d.overdueHourlyRatePercent ?? 10),
            bankDetails: d.bankDetails ?? {
              bankName: 'BCA',
              accountNumber: '-',
              accountHolder: '-',
            },
            status: d.status ?? 'active',
            createdAt: (d.createdAt as Timestamp) ?? Timestamp.now(),
          } as Tenant;
        })
        .filter((t) => t.status === 'active');
    },
    staleTime: 1000 * 60,
  });

  const tenantMap = useMemo(
    () => new Map(tenants.map((t) => [t.id, t])),
    [tenants]
  );

  const { data: equipmentList = [], isLoading: loadingEquipment } = useQuery<Equipment[]>({
    queryKey: ['public', 'equipment', selectedTenantId],
    enabled: isFirebaseConfigured && Boolean(db),
    queryFn: async () => {
      if (!db) return [];
      const q =
        selectedTenantId === 'all'
          ? collection(db, 'equipment')
          : query(collection(db, 'equipment'), where('tenantId', '==', selectedTenantId));
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Equipment)
        .filter((e) => e.isActive !== false)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: 1000 * 30,
  });

  const { data: bundleList = [], isLoading: loadingBundles } = useQuery<Bundle[]>({
    queryKey: ['public', 'bundles', selectedTenantId],
    enabled: isFirebaseConfigured && Boolean(db),
    queryFn: async () => {
      if (!db) return [];
      const q =
        selectedTenantId === 'all'
          ? collection(db, 'bundles')
          : query(collection(db, 'bundles'), where('tenantId', '==', selectedTenantId));
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Bundle)
        .filter((b) => b.isActive !== false)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: 1000 * 30,
  });

  const equipmentById = useMemo(
    () => new Map(equipmentList.map((e) => [e.id, e])),
    [equipmentList]
  );

  const filteredEquipment = useMemo(() => {
    const q = search.trim().toLowerCase();
    return equipmentList.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [equipmentList, category, search]);

  const filteredBundles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bundleList.filter((bundle) => {
      if (!q) return true;
      return (
        bundle.name.toLowerCase().includes(q) ||
        bundle.description.toLowerCase().includes(q)
      );
    });
  }, [bundleList, search]);

  const openAuthPrompt = (item?: SelectedIntentItem) => {
    setIntentItem(item ?? null);
    setAuthDialogOpen(true);
  };

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Sticky Public Topbar */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Aperture className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <span className="text-sm font-semibold tracking-tight text-foreground">
                CameraRent
              </span>
            </div>

            {tenants.length > 0 ? (
              <div className="hidden items-center gap-2 border-l pl-3 sm:flex">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
                <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                  <SelectTrigger className="h-8 w-48 border-none bg-transparent px-2 text-xs shadow-none hover:bg-muted/60">
                    <SelectValue placeholder="Pilih cabang" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Cabang ({tenants.length})</SelectItem>
                    {tenants.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/register">
                <UserPlus className="h-3.5 w-3.5" strokeWidth={1.5} />
                Daftar
              </Link>
            </Button>
            <Button size="sm" onClick={() => openAuthPrompt()}>
              <LogIn className="h-3.5 w-3.5" strokeWidth={1.5} />
              Masuk
            </Button>
          </div>
        </div>
      </header>

      {/* Main Public Catalog Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8 sm:px-6">
        {/* Compact Hero & Filter Bar */}
        <section className="space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Katalog Kamera &amp; Gear Produksi
              </h1>
              <p className="text-sm text-muted-foreground">
                Jelajahi kamera, lensa, lighting, dan paket produksi yang tersedia di cabang resmi
                CameraRent. Masuk atau daftar akun untuk mulai booking.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {tenants.length > 0 ? (
                <div className="sm:hidden">
                  <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                    <SelectTrigger className="h-9 w-44">
                      <SelectValue placeholder="Pilih cabang" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Cabang</SelectItem>
                      {tenants.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="relative w-full sm:w-64">
                <Search
                  className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                  strokeWidth={1.5}
                />
                <Input
                  placeholder="Cari kamera, lensa, brand..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          <Tabs
            value={catalogTab}
            onValueChange={(v) => setCatalogTab(v as 'gear' | 'bundles')}
            className="space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="gear">Gear Satuan ({filteredEquipment.length})</TabsTrigger>
                <TabsTrigger value="bundles">Paket Kit ({filteredBundles.length})</TabsTrigger>
              </TabsList>

              {catalogTab === 'gear' ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {CATEGORIES.map((cat) => (
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
                      {cat.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Individual Gear Grid */}
            <TabsContent value="gear" className="mt-0">
              {loadingEquipment ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i} className="overflow-hidden">
                      <Skeleton className="aspect-[4/3] w-full rounded-none" />
                      <CardContent className="space-y-2.5 p-4">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-3 w-1/2" />
                        <Skeleton className="h-8 w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : filteredEquipment.length === 0 ? (
                <EmptyState
                  icon={Camera}
                  title="Belum ada gear yang sesuai"
                  description="Coba ubah filter kategori, cabang, atau kata kunci pencarian."
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredEquipment.map((item) => {
                    const branchName = tenantMap.get(item.tenantId)?.name ?? 'CameraRent';
                    const specEntries = Object.entries(item.specs ?? {}).slice(0, 3);
                    const coverImage = item.images?.[0];

                    return (
                      <Card
                        key={item.id}
                        className="flex flex-col overflow-hidden transition-colors hover:border-foreground/20"
                      >
                        <div className="relative aspect-[4/3] w-full overflow-hidden border-b bg-muted/40">
                          {coverImage ? (
                            <img
                              src={coverImage}
                              alt={item.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                              <Camera className="h-10 w-10" strokeWidth={1.25} />
                            </div>
                          )}
                          <div className="absolute left-3 top-3 flex items-center gap-1.5">
                            <span className="rounded-md border bg-background/95 px-2 py-0.5 text-[11px] font-medium capitalize text-foreground shadow-sm">
                              {item.category}
                            </span>
                          </div>
                        </div>

                        <CardContent className="flex flex-1 flex-col justify-between gap-4 p-4">
                          <div className="space-y-2">
                            <div>
                              <p className="text-xs text-muted-foreground">
                                {item.brand} · {branchName}
                              </p>
                              <h2 className="mt-0.5 line-clamp-2 text-sm font-semibold text-foreground">
                                {item.name}
                              </h2>
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
                            <div className="flex items-baseline justify-between gap-2">
                              <div>
                                <CurrencyText
                                  amount={item.dailyRate}
                                  className="text-sm font-semibold text-foreground"
                                />
                                <span className="text-xs text-muted-foreground"> / hari</span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                Deposit <CurrencyText amount={item.depositAmount} />
                              </span>
                            </div>

                            <Button
                              size="sm"
                              className="w-full"
                              onClick={() =>
                                openAuthPrompt({
                                  name: item.name,
                                  branchName,
                                  dailyRate: item.dailyRate,
                                  type: 'gear',
                                })
                              }
                            >
                              <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                              Tambah ke Booking
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Production Kit Bundles Grid */}
            <TabsContent value="bundles" className="mt-0">
              {loadingBundles ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i}>
                      <CardContent className="space-y-3 p-5">
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-8 w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : filteredBundles.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="Belum ada paket kit tersedia"
                  description="Paket produksi untuk cabang terpilih belum tersedia saat ini."
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {filteredBundles.map((bundle) => {
                    const branchName = tenantMap.get(bundle.tenantId)?.name ?? 'CameraRent';
                    const includedNames = bundle.equipmentIds
                      .map((id) => equipmentById.get(id)?.name)
                      .filter(Boolean) as string[];

                    return (
                      <Card
                        key={bundle.id}
                        className="flex flex-col justify-between transition-colors hover:border-foreground/20"
                      >
                        <CardContent className="flex flex-1 flex-col justify-between gap-4 p-5">
                          <div className="space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-xs text-muted-foreground">{branchName}</p>
                                <h2 className="mt-0.5 text-base font-semibold text-foreground">
                                  {bundle.name}
                                </h2>
                              </div>
                              <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                                {bundle.equipmentIds.length} item
                              </span>
                            </div>

                            {bundle.description ? (
                              <p className="text-xs leading-relaxed text-muted-foreground">
                                {bundle.description}
                              </p>
                            ) : null}

                            {includedNames.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {includedNames.map((name) => (
                                  <span
                                    key={name}
                                    className="rounded border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground"
                                  >
                                    {name}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>

                          <div className="space-y-3 border-t pt-3">
                            <div className="flex items-baseline justify-between gap-2">
                              <div>
                                <CurrencyText
                                  amount={bundle.bundleDailyRate}
                                  className="text-sm font-semibold text-foreground"
                                />
                                <span className="text-xs text-muted-foreground"> / hari</span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                Deposit <CurrencyText amount={bundle.bundleDeposit} />
                              </span>
                            </div>

                            <Button
                              size="sm"
                              className="w-full"
                              onClick={() =>
                                openAuthPrompt({
                                  name: bundle.name,
                                  branchName,
                                  dailyRate: bundle.bundleDailyRate,
                                  type: 'bundle',
                                })
                              }
                            >
                              <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                              Book Paket Ini
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
        </section>
      </main>

      {/* Clean Footer */}
      <footer className="border-t bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-muted-foreground sm:px-6">
          <span>Copyright © {new Date().getFullYear()} PT Pratamavisual Media Kreatif</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => openAuthPrompt()}
              className="hover:text-foreground hover:underline"
            >
              Masuk
            </button>
            <Link to="/register" className="hover:text-foreground hover:underline">
              Daftar Akun
            </Link>
          </div>
        </div>
      </footer>

      {/* Sign In / Registration Gate Dialog */}
      <Dialog open={authDialogOpen} onOpenChange={setAuthDialogOpen}>
        <DialogContent className="max-w-sm gap-4">
          <DialogHeader>
            <DialogTitle>
              {intentItem ? 'Masuk untuk Melanjutkan Booking' : 'Masuk ke CameraRent'}
            </DialogTitle>
            <DialogDescription>
              {intentItem
                ? 'Silakan masuk atau daftar akun penyewa terlebih dahulu untuk menambahkan item ke booking.'
                : 'Khusus akun terdaftar. Hak akses dan cabang diselesaikan otomatis dari Firestore.'}
            </DialogDescription>
          </DialogHeader>

          {intentItem ? (
            <div className="rounded-md border bg-muted/40 px-3 py-2.5 text-xs">
              <p className="text-muted-foreground">
                {intentItem.type === 'bundle' ? 'Paket Dipilih' : 'Item Dipilih'} ·{' '}
                {intentItem.branchName}
              </p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="truncate font-medium text-foreground">{intentItem.name}</span>
                <CurrencyText
                  amount={intentItem.dailyRate}
                  className="shrink-0 font-medium text-foreground"
                />
              </div>
            </div>
          ) : null}

          {justRegistered ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={1.5} />
                <span>Pendaftaran berhasil</span>
              </div>
              <p className="mt-1 text-emerald-800">
                Akun kamu sudah aktif. Silakan masuk menggunakan akun Google yang telah didaftarkan.
              </p>
            </div>
          ) : null}

          {!isConfigured ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                <span>Konfigurasi Firebase belum lengkap</span>
              </div>
              <p className="mt-1 leading-relaxed text-amber-800">
                Lengkapi <code className="font-mono font-semibold">.env.local</code>:
              </p>
              <ul className="mt-1 list-disc pl-4 font-mono text-[10px] text-amber-800">
                {missingFirebaseKeys.map((key) => (
                  <li key={key}>{key}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {unregisteredEmail ? (
            <div className="space-y-2.5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                <span>Akun Belum Terdaftar</span>
              </div>
              <p className="leading-relaxed">
                <span className="font-mono font-medium">{unregisteredEmail}</span> belum terdaftar.
                Silakan daftar dengan NIK &amp; nomor WhatsApp terlebih dahulu.
              </p>
              <Button asChild size="sm" className="w-full">
                <Link to="/register">
                  <UserPlus className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Lanjut ke Pendaftaran
                </Link>
              </Button>
            </div>
          ) : null}

          {authError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                <span>Gagal Masuk</span>
              </div>
              <p className="mt-1 break-all font-mono text-[10px]">{authError}</p>
            </div>
          ) : null}

          <div className="space-y-2.5">
            <Button
              type="button"
              className="w-full"
              size="lg"
              disabled={!isConfigured || submitting}
              onClick={handleGoogleSignIn}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M21.35 11.1h-9.18v2.92h5.27c-.23 1.48-1.74 4.35-5.27 4.35-3.17 0-5.76-2.62-5.76-5.87s2.59-5.87 5.76-5.87c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.78 4.1 14.68 3.2 12.17 3.2 7.21 3.2 3.2 7.21 3.2 12.5s4.01 9.3 8.97 9.3c5.18 0 8.62-3.64 8.62-8.77 0-.59-.07-1.04-.14-1.93z"
                />
              </svg>
              {submitting ? 'Memverifikasi Akun...' : 'Masuk dengan Google'}
            </Button>

            <Button asChild variant="outline" size="lg" className="w-full">
              <Link to="/register">
                <UserPlus className="h-4 w-4" strokeWidth={1.5} />
                Daftar Akun Baru
              </Link>
            </Button>
          </div>

          <Separator />

          <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
            <p className="leading-relaxed">
              Penyewa baru wajib mendaftar dengan NIK 16 digit &amp; WhatsApp aktif sebelum dapat
              melakukan booking.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
