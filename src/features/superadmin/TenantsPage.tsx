import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import {
  ArrowUpRight,
  BarChart3,
  Building2,
  ChevronRight,
  Database,
  Landmark,
  Lock,
  MapPin,
  Plus,
  Search,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { txStatic } from '@/lib/i18n';
import { useI18n } from '@/hooks/useI18n';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';
import { useTenant } from '@/hooks/useTenant';
import { seedSampleRentalHouse } from '@/features/superadmin/seedDemoData';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { EmptyState } from '@/components/shared/EmptyState';
import { LocationPickerModal } from '@/components/shared/LocationPickerModal';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Booking, Tenant, Transaction } from '@/types/schema';

const tenantSchema = z.object({
  name: z.string().min(2, txStatic('Branch name is required', 'Nama cabang wajib diisi')),
  slug: z
    .string()
    .min(2, txStatic('Slug is required', 'Slug wajib diisi'))
    .regex(
      /^[a-z0-9-]+$/,
      txStatic(
        'Use lowercase letters, numbers, and hyphens (-) only',
        'Gunakan huruf kecil, angka, dan tanda hubung (-) saja'
      )
    ),
  address: z.string().min(5, txStatic('Full address is required', 'Alamat lengkap wajib diisi')),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  bankName: z.string().min(2, txStatic('Bank name is required', 'Nama bank wajib diisi')),
  accountNumber: z
    .string()
    .min(4, txStatic('Account number is required', 'Nomor rekening wajib diisi')),
  accountHolder: z
    .string()
    .min(2, txStatic('Account holder name is required', 'Nama pemilik rekening wajib diisi')),
});

type TenantFormValues = z.infer<typeof tenantSchema>;

export function TenantsPage() {
  const { tx } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { allTenants, isLoading: loadingTenants, setSelectedTenantId } = useTenant();
  const { settings } = usePlatformSettings();

  const [search, setSearch] = useState('');
  const [seeding, setSeeding] = useState(false);

  // Create vs Detail/Edit dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailTenantId, setDetailTenantId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'edit'>('overview');
  const [branchMapOpen, setBranchMapOpen] = useState(false);

  // Cross-tenant GMV & Telemetry queries
  const { data: bookings = [], isLoading: loadingBookings } = useQuery<Booking[]>({
    queryKey: ['superadmin', 'all-bookings'],
    enabled: Boolean(db),
    queryFn: async () => {
      if (!db) return [];
      const snap = await getDocs(collection(db, 'bookings'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Booking);
    },
  });

  const { data: transactions = [], isLoading: loadingTx } = useQuery<Transaction[]>({
    queryKey: ['superadmin', 'all-transactions'],
    enabled: Boolean(db),
    queryFn: async () => {
      if (!db) return [];
      const snap = await getDocs(collection(db, 'transactions'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Transaction);
    },
  });

  const detailTenant = allTenants.find((t) => t.id === detailTenantId) ?? null;

  const form = useForm<TenantFormValues>({
    resolver: zodResolver(tenantSchema),
    defaultValues: {
      name: '',
      slug: '',
      address: '',
      lat: -6.2088,
      lng: 106.8456,
      bankName: 'BCA',
      accountNumber: '',
      accountHolder: '',
    },
  });

  const openCreate = () => {
    setDetailTenantId(null);
    form.reset({
      name: '',
      slug: '',
      address: '',
      lat: -6.2088,
      lng: 106.8456,
      bankName: 'BCA',
      accountNumber: '',
      accountHolder: '',
    });
    setCreateDialogOpen(true);
  };

  const openTenantDetail = (tenant: Tenant) => {
    setCreateDialogOpen(false);
    setDetailTenantId(tenant.id);
    setDetailTab('overview');
    form.reset({
      name: tenant.name,
      slug: tenant.slug,
      address: tenant.address,
      lat: tenant.coordinates.lat,
      lng: tenant.coordinates.lng,
      bankName: tenant.bankDetails.bankName,
      accountNumber: tenant.bankDetails.accountNumber,
      accountHolder: tenant.bankDetails.accountHolder,
    });
  };

  const onSubmit = async (values: TenantFormValues) => {
    if (!db) return;
    try {
      const basePayload = {
        name: values.name.trim(),
        slug: values.slug.trim().toLowerCase(),
        address: values.address.trim(),
        coordinates: { lat: values.lat, lng: values.lng },
        bankDetails: {
          bankName: values.bankName.trim(),
          accountNumber: values.accountNumber.trim(),
          accountHolder: values.accountHolder.trim(),
        },
      };

      if (detailTenant) {
        await updateDoc(doc(db, 'tenants', detailTenant.id), basePayload);
        toast.success(
          tx(`Branch ${values.name} updated.`, `Data cabang ${values.name} diperbarui.`)
        );
        setDetailTab('overview');
      } else {
        const ref = await addDoc(collection(db, 'tenants'), {
          ...basePayload,
          deliveryRatePerKm: settings.defaultDeliveryRatePerKm,
          bufferHours: settings.defaultBufferHours,
          overdueGraceMinutes: settings.defaultOverdueGraceMinutes,
          overdueHourlyRatePercent: settings.defaultOverdueHourlyRatePercent,
          status: 'active',
          createdAt: serverTimestamp(),
        });
        setSelectedTenantId(ref.id);
        toast.success(
          tx(`Branch ${values.name} created successfully.`, `Cabang ${values.name} berhasil ditambahkan.`)
        );
        setCreateDialogOpen(false);
      }

      await queryClient.invalidateQueries({ queryKey: ['tenants'] });
    } catch (error) {
      console.error('Failed to save tenant:', error);
      toast.error(tx('Failed to save branch configuration.', 'Gagal menyimpan konfigurasi cabang.'));
    }
  };

  const toggleStatus = async (tenant: Tenant) => {
    if (!db) return;
    const nextStatus = tenant.status === 'active' ? 'suspended' : 'active';
    try {
      await updateDoc(doc(db, 'tenants', tenant.id), { status: nextStatus });
      await queryClient.invalidateQueries({ queryKey: ['tenants'] });
      toast.success(
        nextStatus === 'active'
          ? tx(`${tenant.name} marked as active.`, `${tenant.name} ditandai aktif.`)
          : tx(`${tenant.name} suspended.`, `${tenant.name} ditandai suspended.`)
      );
    } catch (error) {
      console.error('Failed to toggle tenant status:', error);
      toast.error(tx('Failed to update branch status.', 'Gagal mengubah status cabang.'));
    }
  };

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      const newTenantId = await seedSampleRentalHouse();
      setSelectedTenantId(newTenantId);
      await queryClient.invalidateQueries({ queryKey: ['tenants'] });
      await queryClient.invalidateQueries({ queryKey: ['equipment'] });
      await queryClient.invalidateQueries({ queryKey: ['bundles'] });
      toast.success(
        tx(
          'Sample branch and inventory seeded successfully.',
          'Berhasil menambahkan contoh cabang & inventaris.'
        )
      );
    } catch (error) {
      console.error('Seed error:', error);
      toast.error(
        tx(
          'Failed to seed sample branch. Ensure you are signed in as Superadmin.',
          'Gagal seed cabang contoh. Pastikan login sebagai Superadmin.'
        )
      );
    } finally {
      setSeeding(false);
    }
  };

  // Global GMV aggregations
  const totalRevenue = transactions
    .filter((t) => t.category === 'revenue')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalDepositIn = transactions
    .filter((t) => t.type === 'deposit_in')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalDepositRefund = transactions
    .filter((t) => t.type === 'deposit_refund')
    .reduce((sum, t) => sum + t.amount, 0);

  const depositLiabilityHeld = Math.max(0, totalDepositIn - totalDepositRefund);
  const activeRentals = bookings.filter((b) => b.bookingStatus === 'active_rent').length;
  const overdueBookings = bookings.filter((b) => b.bookingStatus === 'overdue').length;

  const getTenantMetrics = (tenantId: string) => {
    const tBookings = bookings.filter((b) => b.tenantId === tenantId);
    const tTx = transactions.filter((t) => t.tenantId === tenantId);
    const revenue = tTx
      .filter((t) => t.category === 'revenue')
      .reduce((s, t) => s + t.amount, 0);
    const depositHeld = Math.max(
      0,
      tTx.filter((t) => t.type === 'deposit_in').reduce((s, t) => s + t.amount, 0) -
        tTx.filter((t) => t.type === 'deposit_refund').reduce((s, t) => s + t.amount, 0)
    );
    const active = tBookings.filter((b) => b.bookingStatus === 'active_rent').length;
    const overdue = tBookings.filter((b) => b.bookingStatus === 'overdue').length;
    return {
      totalBookings: tBookings.length,
      revenue,
      depositHeld,
      active,
      overdue,
    };
  };

  const filtered = allTenants.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase()) ||
      t.address.toLowerCase().includes(search.toLowerCase())
  );

  const isLoading = loadingTenants || loadingBookings || loadingTx;
  const detailMetrics = detailTenant ? getTenantMetrics(detailTenant.id) : null;

  const renderTenantFormFields = (isEdit: boolean) => (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="t-name">{tx('Branch Name', 'Nama Cabang')}</Label>
          <Input id="t-name" placeholder="CameraRent Jakarta Selatan" {...form.register('name')} />
          {form.formState.errors.name ? (
            <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-slug">{tx('Slug Identifier', 'Slug Identifier')}</Label>
          <Input
            id="t-slug"
            placeholder="camerarent-jaksel"
            className="font-mono text-xs"
            {...form.register('slug')}
          />
          {form.formState.errors.slug ? (
            <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="t-address">{tx('Full Branch Address', 'Alamat Lengkap Cabang')}</Label>
        <Input
          id="t-address"
          placeholder="Jl. Kemang Raya No. 48, Jakarta Selatan"
          {...form.register('address')}
        />
      </div>

      <div className="space-y-1.5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="t-lat" className="inline-flex items-center gap-1">
              Latitude
              <Lock className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />
            </Label>
            <Input
              id="t-lat"
              readOnly
              value={Number(form.watch('lat')).toFixed(6)}
              onClick={() => setBranchMapOpen(true)}
              title={tx('Click to change via Branch Map Pin', 'Klik untuk ubah melalui Pin Cabang di Peta')}
              className="cursor-pointer bg-muted/50 font-mono text-xs text-muted-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-lng" className="inline-flex items-center gap-1">
              Longitude
              <Lock className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />
            </Label>
            <Input
              id="t-lng"
              readOnly
              value={Number(form.watch('lng')).toFixed(6)}
              onClick={() => setBranchMapOpen(true)}
              title={tx('Click to change via Branch Map Pin', 'Klik untuk ubah melalui Pin Cabang di Peta')}
              className="cursor-pointer bg-muted/50 font-mono text-xs text-muted-foreground"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-9"
            onClick={() => setBranchMapOpen(true)}
          >
            <MapPin className="h-3.5 w-3.5" strokeWidth={1.5} />
            {tx('Pin Branch on Map', 'Pin Cabang di Peta')}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {tx(
            'Coordinates are automatically locked to the pinned branch map location.',
            'Koordinat terkunci otomatis mengikuti titik pin peta cabang.'
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="t-bank">{tx('Bank Name', 'Nama Bank')}</Label>
          <Input id="t-bank" placeholder="BCA" {...form.register('bankName')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-acc">{tx('Account Number', 'No. Rekening')}</Label>
          <Input id="t-acc" className="font-mono text-xs" {...form.register('accountNumber')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-holder">{tx('Account Holder', 'Atas Nama')}</Label>
          <Input id="t-holder" {...form.register('accountHolder')} />
        </div>
      </div>

      <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        {tx(
          'Delivery rates, turnaround buffer, grace period, and overdue fees are managed centrally in ',
          'Tarif ongkir, buffer, grace period, dan denda diatur terpusat melalui menu '
        )}
        <Link to="/superadmin/settings" className="font-medium text-foreground underline">
          {tx('Settings', 'Pengaturan')}
        </Link>
        .
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => (isEdit ? setDetailTab('overview') : setCreateDialogOpen(false))}
        >
          {tx('Cancel', 'Batal')}
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {isEdit ? tx('Save Changes', 'Simpan Perubahan') : tx('Create Branch', 'Buat Cabang')}
        </Button>
      </DialogFooter>
    </form>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {tx('Tenants & Global GMV', 'Cabang & GMV Global')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {tx(
              'Monitor cross-branch revenue performance, deposit liabilities, and manage rental branch configurations.',
              'Pantau performa pendapatan lintas cabang, liabilitas deposit, dan kelola konfigurasi cabang rental.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSeedDemo} disabled={seeding}>
            <Database className="h-3.5 w-3.5" strokeWidth={1.5} />
            {seeding ? tx('Seeding...', 'Menambahkan...') : tx('Seed Sample Branch', 'Seed Cabang Contoh')}
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            {tx('Add Branch', 'Tambah Cabang')}
          </Button>
        </div>
      </div>

      {/* Global GMV KPI Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {tx('Platform Revenue (GMV)', 'Pendapatan Platform (GMV)')}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold text-foreground">
              <CurrencyText amount={totalRevenue} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {tx('Rental + delivery + overdue penalties', 'Sewa + ongkir + denda keterlambatan')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {tx('Deposit Liability Held', 'Liabilitas Deposit Ditahan')}
            </CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold text-foreground">
              <CurrencyText amount={depositLiabilityHeld} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {tx('Segregated from platform revenue', 'Terpisah dari pendapatan platform')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {tx('Active Fleet Rentals', 'Sewa Armada Aktif')}
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          </CardHeader>
          <CardContent>
            <div className="tabular-nums text-xl font-semibold text-foreground">
              {activeRentals}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {tx(
                `Across ${allTenants.filter((t) => t.status === 'active').length} active branches`,
                `Di ${allTenants.filter((t) => t.status === 'active').length} cabang aktif`
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {tx('Overdue Alerts', 'Peringatan Terlambat')}
            </CardTitle>
            <ShieldAlert
              className={`h-4 w-4 ${overdueBookings > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
              strokeWidth={1.5}
            />
          </CardHeader>
          <CardContent>
            <div
              className={`tabular-nums text-xl font-semibold ${overdueBookings > 0 ? 'text-destructive' : 'text-foreground'}`}
            >
              {overdueBookings}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {tx('Active bookings past grace period', 'Booking aktif melewati grace period')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter & Count */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
            strokeWidth={1.5}
          />
          <Input
            placeholder={tx('Search branch name, slug, or address...', 'Cari nama cabang, slug, atau alamat...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {tx(`${filtered.length} of ${allTenants.length} branches`, `${filtered.length} dari ${allTenants.length} cabang`)}
        </span>
      </div>

      {/* Unified Clickable Branch & GMV Table */}
      {isLoading ? (
        <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          {tx('Loading branches & GMV data...', 'Memuat data cabang & GMV...')}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={tx('No rental branches yet', 'Belum ada cabang rental')}
          description={tx(
            'Create your first branch or click Seed Sample Branch to populate a complete demo branch.',
            'Buat cabang pertama atau klik Seed Cabang Contoh untuk menambahkan contoh cabang lengkap.'
          )}
          action={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleSeedDemo} disabled={seeding}>
                {tx('Seed Sample Branch', 'Seed Cabang Contoh')}
              </Button>
              <Button size="sm" onClick={openCreate}>
                {tx('Add Branch', 'Tambah Cabang')}
              </Button>
            </div>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tx('Branch', 'Cabang')}</TableHead>
              <TableHead>{tx('Status', 'Status')}</TableHead>
              <TableHead>{tx('Bookings', 'Booking')}</TableHead>
              <TableHead className="text-right">{tx('Revenue (GMV)', 'Revenue (GMV)')}</TableHead>
              <TableHead className="text-right">{tx('Deposit Held', 'Deposit Ditahan')}</TableHead>
              <TableHead>{tx('Delivery & Buffer', 'Ongkir & Buffer')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((tenant) => {
              const metrics = getTenantMetrics(tenant.id);
              return (
                <TableRow
                  key={tenant.id}
                  onClick={() => openTenantDetail(tenant)}
                  className="group cursor-pointer"
                >
                  <TableCell>
                    <p className="font-medium text-foreground">{tenant.name}</p>
                    <p className="max-w-[260px] truncate text-xs text-muted-foreground">
                      {tenant.address}
                    </p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={tenant.status} />
                  </TableCell>
                  <TableCell className="tabular-nums text-xs">
                    <div className="font-medium text-foreground">
                      {metrics.totalBookings} {tx('bookings', 'booking')}
                    </div>
                    <div className="text-muted-foreground">
                      {metrics.active} {tx('active', 'aktif')}
                      {metrics.overdue > 0 ? (
                        <span className="ml-1.5 font-medium text-destructive">
                          · {metrics.overdue} {tx('overdue', 'terlambat')}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium text-foreground">
                    <CurrencyText amount={metrics.revenue} />
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    <CurrencyText amount={metrics.depositHeld} />
                  </TableCell>
                  <TableCell className="tabular-nums text-xs text-muted-foreground">
                    <div>
                      <CurrencyText amount={tenant.deliveryRatePerKm} suffix="/km" />
                    </div>
                    <div>
                      {tenant.bufferHours}h buffer · {tenant.overdueGraceMinutes}m grace
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <ChevronRight
                      className="ml-auto h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                      strokeWidth={1.5}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Tenant Detail & Edit Dialog */}
      <Dialog
        open={Boolean(detailTenant)}
        onOpenChange={(open) => {
          if (!open) setDetailTenantId(null);
        }}
      >
        <DialogContent className="max-w-xl gap-5">
          {detailTenant && detailMetrics ? (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3 pr-6">
                  <div>
                    <DialogTitle>{detailTenant.name}</DialogTitle>
                    <DialogDescription className="mt-1 font-mono text-xs">
                      {detailTenant.slug}
                    </DialogDescription>
                  </div>
                  <StatusBadge status={detailTenant.status} />
                </div>
              </DialogHeader>

              <Tabs
                value={detailTab}
                onValueChange={(v) => setDetailTab(v as 'overview' | 'edit')}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="overview">{tx('Overview & GMV', 'Ringkasan & GMV')}</TabsTrigger>
                  <TabsTrigger value="edit">{tx('Edit Configuration', 'Edit Konfigurasi')}</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-4 space-y-5">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-md border bg-muted/30 p-3">
                      <p className="text-[11px] text-muted-foreground">{tx('Revenue', 'Pendapatan')}</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        <CurrencyText amount={detailMetrics.revenue} />
                      </p>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-3">
                      <p className="text-[11px] text-muted-foreground">{tx('Deposit Held', 'Deposit Ditahan')}</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        <CurrencyText amount={detailMetrics.depositHeld} />
                      </p>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-3">
                      <p className="text-[11px] text-muted-foreground">{tx('Total Bookings', 'Total Booking')}</p>
                      <p className="mt-1 tabular-nums text-sm font-semibold text-foreground">
                        {detailMetrics.totalBookings}
                      </p>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-3">
                      <p className="text-[11px] text-muted-foreground">{tx('Active / Overdue', 'Aktif / Terlambat')}</p>
                      <p className="mt-1 tabular-nums text-sm font-semibold text-foreground">
                        {detailMetrics.active} /{' '}
                        <span className={detailMetrics.overdue > 0 ? 'text-destructive' : ''}>
                          {detailMetrics.overdue}
                        </span>
                      </p>
                    </div>
                  </div>

                  <dl className="divide-y divide-border text-sm">
                    <div className="flex items-start justify-between gap-4 py-2.5">
                      <dt className="shrink-0 text-muted-foreground">{tx('Address', 'Alamat')}</dt>
                      <dd className="text-right text-foreground">{detailTenant.address}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-2.5">
                      <dt className="text-muted-foreground">{tx('Map Coordinates', 'Koordinat Peta')}</dt>
                      <dd className="flex items-center gap-2 font-mono text-xs text-foreground">
                        <span>
                          {detailTenant.coordinates.lat.toFixed(6)},{' '}
                          {detailTenant.coordinates.lng.toFixed(6)}
                        </span>
                        <a
                          href={`https://www.google.com/maps?q=${detailTenant.coordinates.lat},${detailTenant.coordinates.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-muted-foreground hover:text-foreground"
                          title={tx('Open in Google Maps', 'Buka di Google Maps')}
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </a>
                      </dd>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">{tx('Delivery Rate', 'Tarif Ongkir')}</dt>
                      <dd className="font-medium text-foreground">
                        <CurrencyText amount={detailTenant.deliveryRatePerKm} suffix="/km" />
                      </dd>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">{tx('Buffer / Grace / Penalty', 'Buffer / Grace / Denda')}</dt>
                      <dd className="tabular-nums text-xs font-medium text-foreground">
                        {detailTenant.bufferHours} {tx('hrs', 'jam')} · {detailTenant.overdueGraceMinutes}{' '}
                        {tx('mins', 'menit')} · {detailTenant.overdueHourlyRatePercent}%/{tx('hr', 'jam')}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-4 py-2.5">
                      <dt className="shrink-0 text-muted-foreground">{tx('Bank Account', 'Rekening Bank')}</dt>
                      <dd className="text-right text-xs text-foreground">
                        <div className="font-mono font-medium">
                          {detailTenant.bankDetails.bankName} ·{' '}
                          {detailTenant.bankDetails.accountNumber}
                        </div>
                        <div className="text-muted-foreground">
                          {detailTenant.bankDetails.accountHolder}
                        </div>
                      </dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedTenantId(detailTenant.id);
                        setDetailTenantId(null);
                        navigate('/admin/finance');
                      }}
                    >
                      {tx('Open Branch Cash Flow', 'Buka Cash Flow Cabang')}
                      <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={
                        detailTenant.status === 'active'
                          ? 'text-destructive hover:bg-destructive/10 hover:text-destructive'
                          : ''
                      }
                      onClick={() => void toggleStatus(detailTenant)}
                    >
                      {detailTenant.status === 'active'
                        ? tx('Suspend Branch', 'Suspend Cabang')
                        : tx('Activate Branch', 'Aktifkan Cabang')}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="edit" className="mt-4">
                  {renderTenantFormFields(true)}
                </TabsContent>
              </Tabs>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Create New Tenant Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{tx('Add New Branch', 'Tambah Cabang Baru')}</DialogTitle>
            <DialogDescription>
              {tx(
                'Delivery rates, turnaround buffer, grace period, and overdue fees automatically inherit defaults from Settings.',
                'Nilai ongkir, buffer, grace period, dan denda otomatis mengikuti standar di menu Pengaturan.'
              )}
            </DialogDescription>
          </DialogHeader>
          {renderTenantFormFields(false)}
        </DialogContent>
      </Dialog>

      <LocationPickerModal
        open={branchMapOpen}
        onOpenChange={setBranchMapOpen}
        branchName={form.watch('name') || tx('Branch Location', 'Lokasi Cabang')}
        branchCoordinates={{
          lat: Number(form.watch('lat')) || -6.2088,
          lng: Number(form.watch('lng')) || 106.8456,
        }}
        initialCoordinates={{
          lat: Number(form.watch('lat')) || -6.2088,
          lng: Number(form.watch('lng')) || 106.8456,
        }}
        initialAddress={form.watch('address')}
        singlePinMode
        title={tx('Pin Rental Branch Location', 'Pin Lokasi Cabang Rental')}
        onConfirm={({ coordinates, address }) => {
          form.setValue('lat', Number(coordinates.lat.toFixed(6)), {
            shouldDirty: true,
            shouldValidate: true,
          });
          form.setValue('lng', Number(coordinates.lng.toFixed(6)), {
            shouldDirty: true,
            shouldValidate: true,
          });
          if (address && !form.getValues('address')) {
            form.setValue('address', address, { shouldDirty: true, shouldValidate: true });
          }
          toast.success(
            tx(
              `Branch coordinates updated (${coordinates.lat.toFixed(6)}, ${coordinates.lng.toFixed(6)}).`,
              `Titik cabang diperbarui (${coordinates.lat.toFixed(6)}, ${coordinates.lng.toFixed(6)}).`
            )
          );
        }}
      />
    </div>
  );
}
