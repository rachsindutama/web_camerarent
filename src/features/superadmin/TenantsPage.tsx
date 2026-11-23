import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import {
  Building2,
  Database,
  Lock,
  MapPin,
  Pencil,
  Plus,
  Power,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { useTenant } from '@/hooks/useTenant';
import { seedSampleRentalHouse } from '@/features/superadmin/seedDemoData';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { LocationPickerModal } from '@/components/shared/LocationPickerModal';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Tenant } from '@/types/schema';

const tenantSchema = z.object({
  name: z.string().min(2, 'Tenant name is required'),
  slug: z
    .string()
    .min(2, 'Slug is required')
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and hyphens only'),
  address: z.string().min(5, 'Branch address is required'),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  deliveryRatePerKm: z.coerce.number().min(0),
  bufferHours: z.coerce.number().min(0).max(72),
  overdueGraceMinutes: z.coerce.number().min(0).max(1440),
  overdueHourlyRatePercent: z.coerce.number().min(1).max(100),
  bankName: z.string().min(2, 'Bank name is required'),
  accountNumber: z.string().min(4, 'Account number is required'),
  accountHolder: z.string().min(2, 'Account holder is required'),
});

type TenantFormValues = z.infer<typeof tenantSchema>;

export function TenantsPage() {
  const queryClient = useQueryClient();
  const { allTenants, isLoading, setSelectedTenantId } = useTenant();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [branchMapOpen, setBranchMapOpen] = useState(false);

  const form = useForm<TenantFormValues>({
    resolver: zodResolver(tenantSchema),
    defaultValues: {
      name: '',
      slug: '',
      address: '',
      lat: -6.2088,
      lng: 106.8456,
      deliveryRatePerKm: 12000,
      bufferHours: 3,
      overdueGraceMinutes: 60,
      overdueHourlyRatePercent: 10,
      bankName: 'BCA',
      accountNumber: '',
      accountHolder: '',
    },
  });

  const openCreate = () => {
    setEditingTenant(null);
    form.reset({
      name: '',
      slug: '',
      address: '',
      lat: -6.2088,
      lng: 106.8456,
      deliveryRatePerKm: 12000,
      bufferHours: 3,
      overdueGraceMinutes: 60,
      overdueHourlyRatePercent: 10,
      bankName: 'BCA',
      accountNumber: '',
      accountHolder: '',
    });
    setDialogOpen(true);
  };

  const openEdit = (tenant: Tenant) => {
    setEditingTenant(tenant);
    form.reset({
      name: tenant.name,
      slug: tenant.slug,
      address: tenant.address,
      lat: tenant.coordinates.lat,
      lng: tenant.coordinates.lng,
      deliveryRatePerKm: tenant.deliveryRatePerKm,
      bufferHours: tenant.bufferHours,
      overdueGraceMinutes: tenant.overdueGraceMinutes,
      overdueHourlyRatePercent: tenant.overdueHourlyRatePercent,
      bankName: tenant.bankDetails.bankName,
      accountNumber: tenant.bankDetails.accountNumber,
      accountHolder: tenant.bankDetails.accountHolder,
    });
    setDialogOpen(true);
  };

  const onSubmit = async (values: TenantFormValues) => {
    if (!db) return;
    try {
      const payload = {
        name: values.name.trim(),
        slug: values.slug.trim().toLowerCase(),
        address: values.address.trim(),
        coordinates: { lat: values.lat, lng: values.lng },
        deliveryRatePerKm: values.deliveryRatePerKm,
        bufferHours: values.bufferHours,
        overdueGraceMinutes: values.overdueGraceMinutes,
        overdueHourlyRatePercent: values.overdueHourlyRatePercent,
        bankDetails: {
          bankName: values.bankName.trim(),
          accountNumber: values.accountNumber.trim(),
          accountHolder: values.accountHolder.trim(),
        },
      };

      if (editingTenant) {
        await updateDoc(doc(db, 'tenants', editingTenant.id), payload);
        toast.success(`Updated tenant ${values.name}.`);
      } else {
        const ref = await addDoc(collection(db, 'tenants'), {
          ...payload,
          status: 'active',
          createdAt: serverTimestamp(),
        });
        setSelectedTenantId(ref.id);
        toast.success(`Provisioned rental branch ${values.name}.`);
      }

      await queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setDialogOpen(false);
    } catch (error) {
      console.error('Failed to save tenant:', error);
      toast.error('Failed to save tenant configuration.');
    }
  };

  const toggleStatus = async (tenant: Tenant) => {
    if (!db) return;
    const nextStatus = tenant.status === 'active' ? 'suspended' : 'active';
    try {
      await updateDoc(doc(db, 'tenants', tenant.id), { status: nextStatus });
      await queryClient.invalidateQueries({ queryKey: ['tenants'] });
      toast.success(`${tenant.name} marked ${nextStatus}.`);
    } catch (error) {
      console.error('Failed to toggle tenant status:', error);
      toast.error('Unable to update tenant status.');
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
      toast.success('Seeded CameraRent Jakarta Selatan with 6 gear lines, 8 SN units, and 2 kits.');
    } catch (error) {
      console.error('Seed error:', error);
      toast.error('Failed to seed sample branch. Ensure you are logged in as superadmin.');
    } finally {
      setSeeding(false);
    }
  };

  const filtered = allTenants.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase()) ||
      t.address.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-950">
            Rental House Tenants
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Configure multi-tenant branch rules: turnaround buffer windows, Antar-Jemput rates,
            overdue grace schedules, and settlement bank accounts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSeedDemo} disabled={seeding}>
            <Database className="h-3.5 w-3.5" strokeWidth={1.5} />
            {seeding ? 'Seeding Fleet...' : 'Seed Sample Branch & Gear'}
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            New Tenant
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400"
            strokeWidth={1.5}
          />
          <Input
            placeholder="Filter by name, slug, or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <span className="font-mono text-[11px] text-zinc-500">
          {filtered.length} / {allTenants.length} BRANCHES
        </span>
      </div>

      {isLoading ? (
        <div className="rounded-md border border-zinc-200 bg-white p-8 text-center font-mono text-xs text-zinc-400">
          LOADING TENANTS...
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No rental house tenants provisioned"
          description="Create your first rental branch or click 'Seed Sample Branch & Gear' to populate a complete Jakarta Selatan camera house with realistic inventory."
          action={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleSeedDemo} disabled={seeding}>
                Seed Sample Branch &amp; Gear
              </Button>
              <Button size="sm" onClick={openCreate}>
                Create Tenant
              </Button>
            </div>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Branch &amp; Slug</TableHead>
              <TableHead>Delivery Rate</TableHead>
              <TableHead>Buffer / Grace</TableHead>
              <TableHead>Overdue Rate</TableHead>
              <TableHead>Bank Account</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((tenant) => (
              <TableRow key={tenant.id}>
                <TableCell>
                  <p className="font-medium text-zinc-950">{tenant.name}</p>
                  <p className="font-mono text-[10px] text-zinc-400">{tenant.slug}</p>
                  <p className="mt-0.5 max-w-[260px] truncate text-[11px] text-zinc-500">
                    {tenant.address}
                  </p>
                </TableCell>
                <TableCell>
                  <CurrencyText amount={tenant.deliveryRatePerKm} suffix="/km" />
                </TableCell>
                <TableCell className="font-mono text-xs">
                  <div>{tenant.bufferHours}h buffer</div>
                  <div className="text-[11px] text-zinc-500">{tenant.overdueGraceMinutes}m grace</div>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {tenant.overdueHourlyRatePercent}% / hr
                </TableCell>
                <TableCell>
                  <p className="font-mono text-[11px] font-medium text-zinc-900">
                    {tenant.bankDetails.bankName} · {tenant.bankDetails.accountNumber}
                  </p>
                  <p className="text-[11px] text-zinc-500">{tenant.bankDetails.accountHolder}</p>
                </TableCell>
                <TableCell>
                  <StatusBadge status={tenant.status} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => openEdit(tenant)}>
                      <Pencil className="h-3 w-3" strokeWidth={1.5} />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void toggleStatus(tenant)}
                      title={tenant.status === 'active' ? 'Suspend branch' : 'Activate branch'}
                    >
                      <Power className="h-3.5 w-3.5 text-zinc-600" strokeWidth={1.5} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingTenant ? 'Edit Tenant Configuration' : 'Provision New Tenant'}</DialogTitle>
            <DialogDescription>
              Branch parameters govern availability buffer intervals, delivery pricing, and automated
              overdue calculations.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="t-name">Branch Name</Label>
                <Input
                  id="t-name"
                  placeholder="CameraRent Jakarta Selatan"
                  {...form.register('name')}
                />
                {form.formState.errors.name ? (
                  <p className="text-[11px] text-red-600">{form.formState.errors.name.message}</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="t-slug">Slug Identifier</Label>
                <Input
                  id="t-slug"
                  placeholder="camerarent-jaksel"
                  className="font-mono"
                  {...form.register('slug')}
                />
                {form.formState.errors.slug ? (
                  <p className="text-[11px] text-red-600">{form.formState.errors.slug.message}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="t-address">Full Pickup Address</Label>
              <Input
                id="t-address"
                placeholder="Jl. Kemang Raya No. 48, Jakarta Selatan"
                {...form.register('address')}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="t-rate">Delivery / km (IDR)</Label>
                <Input id="t-rate" type="number" className="font-mono" {...form.register('deliveryRatePerKm')} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="t-buffer">Buffer (hrs)</Label>
                <Input id="t-buffer" type="number" className="font-mono" {...form.register('bufferHours')} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="t-grace">Grace (mins)</Label>
                <Input
                  id="t-grace"
                  type="number"
                  className="font-mono"
                  {...form.register('overdueGraceMinutes')}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="t-overdue">Overdue %/hr</Label>
                <Input
                  id="t-overdue"
                  type="number"
                  className="font-mono"
                  {...form.register('overdueHourlyRatePercent')}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
                <div className="space-y-1">
                  <Label htmlFor="t-lat" className="inline-flex items-center gap-1">
                    Latitude
                    <Lock className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />
                  </Label>
                  <Input
                    id="t-lat"
                    readOnly
                    value={Number(form.watch('lat')).toFixed(6)}
                    onClick={() => setBranchMapOpen(true)}
                    title="Klik untuk ubah melalui Pin Cabang di Peta"
                    className="cursor-pointer bg-muted/50 font-mono text-xs text-muted-foreground"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="t-lng" className="inline-flex items-center gap-1">
                    Longitude
                    <Lock className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />
                  </Label>
                  <Input
                    id="t-lng"
                    readOnly
                    value={Number(form.watch('lng')).toFixed(6)}
                    onClick={() => setBranchMapOpen(true)}
                    title="Klik untuk ubah melalui Pin Cabang di Peta"
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
                  Pin Cabang di Peta
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Koordinat terkunci otomatis mengikuti titik pin peta cabang.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="t-bank">Bank Name</Label>
                <Input id="t-bank" placeholder="BCA" {...form.register('bankName')} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="t-acc">Account Number</Label>
                <Input id="t-acc" className="font-mono" {...form.register('accountNumber')} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="t-holder">Account Holder</Label>
                <Input id="t-holder" {...form.register('accountHolder')} />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {editingTenant ? 'Save Changes' : 'Create Tenant'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <LocationPickerModal
        open={branchMapOpen}
        onOpenChange={setBranchMapOpen}
        branchName={form.watch('name') || 'Branch Location'}
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
        title="Pin Lokasi Cabang Rental"
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
            `Titik cabang diperbarui (${coordinates.lat.toFixed(6)}, ${coordinates.lng.toFixed(6)}).`
          );
        }}
      />
    </div>
  );
}

