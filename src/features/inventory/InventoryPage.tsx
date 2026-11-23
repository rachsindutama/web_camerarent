import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { Camera, ChevronRight, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { useTenant } from '@/hooks/useTenant';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { EmptyState } from '@/components/shared/EmptyState';
import { SerialNumberTag } from '@/components/shared/SerialNumberTag';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Equipment, EquipmentUnit, UnitCondition, UnitStatus } from '@/types/schema';

const CATEGORIES: Equipment['category'][] = [
  'camera',
  'lens',
  'lighting',
  'audio',
  'stabilizer',
  'accessory',
];

export function InventoryPage() {
  const queryClient = useQueryClient();
  const { activeTenantId, activeTenant, isAllTenants, allTenants, tenantById } = useTenant();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Create Equipment dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [eqForm, setEqForm] = useState({
    tenantId: '',
    name: '',
    brand: '',
    category: 'camera' as Equipment['category'],
    dailyRate: 350000,
    depositAmount: 750000,
    specsText: 'Sensor: Full-Frame\nMount: E-Mount',
    imageUrl: '',
  });

  // Unified Equipment Detail, Edit, Delete & Unit Manager dialog state
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'units' | 'edit'>('units');
  const [confirmDeleteModel, setConfirmDeleteModel] = useState(false);
  const [deletingModel, setDeletingModel] = useState(false);

  const [unitForm, setUnitForm] = useState({
    serialNumber: '',
    condition: 'mint' as UnitCondition,
    status: 'available' as UnitStatus,
    accessoriesText: '2x Battery, Charger, Cap',
  });

  const { data: equipmentList = [], isLoading: loadingEq } = useQuery<Equipment[]>({
    queryKey: ['equipment', isAllTenants ? 'all' : activeTenantId],
    enabled: Boolean(db && (isAllTenants || activeTenantId)),
    queryFn: async () => {
      if (!db || (!isAllTenants && !activeTenantId)) return [];
      const q = isAllTenants
        ? collection(db, 'equipment')
        : query(collection(db, 'equipment'), where('tenantId', '==', activeTenantId));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Equipment);
    },
  });

  const { data: allUnits = [] } = useQuery<EquipmentUnit[]>({
    queryKey: ['equipment_units', isAllTenants ? 'all' : activeTenantId],
    enabled: Boolean(db && (isAllTenants || activeTenantId)),
    queryFn: async () => {
      if (!db || (!isAllTenants && !activeTenantId)) return [];
      const q = isAllTenants
        ? collection(db, 'equipment_units')
        : query(collection(db, 'equipment_units'), where('tenantId', '==', activeTenantId));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EquipmentUnit);
    },
  });

  if (!isAllTenants && !activeTenantId) {
    return (
      <EmptyState
        icon={Camera}
        title="Belum ada cabang aktif"
        description="Pilih atau buat cabang di Platform Governance → Tenants terlebih dahulu."
      />
    );
  }

  const selectedEquipment = equipmentList.find((e) => e.id === selectedEquipmentId) ?? null;
  const selectedUnits = selectedEquipment
    ? allUnits.filter((u) => u.equipmentId === selectedEquipment.id)
    : [];

  const parseSpecsText = (specsText: string) => {
    const specs: Record<string, string> = {};
    specsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const idx = line.indexOf(':');
        if (idx > 0) {
          specs[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
        }
      });
    return specs;
  };

  const openCreateEquipment = () => {
    setEqForm({
      tenantId: activeTenantId ?? allTenants[0]?.id ?? '',
      name: '',
      brand: '',
      category: 'camera',
      dailyRate: 400000,
      depositAmount: 1000000,
      specsText: 'Sensor: 33MP Full-Frame\nVideo: 4K 60p 10-bit',
      imageUrl: '',
    });
    setCreateDialogOpen(true);
  };

  const openEquipmentDetail = (eq: Equipment) => {
    setSelectedEquipmentId(eq.id);
    setDetailTab('units');
    setConfirmDeleteModel(false);
    setEqForm({
      tenantId: eq.tenantId,
      name: eq.name,
      brand: eq.brand,
      category: eq.category,
      dailyRate: eq.dailyRate,
      depositAmount: eq.depositAmount,
      specsText: Object.entries(eq.specs || {})
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n'),
      imageUrl: eq.images?.[0] ?? '',
    });
  };

  const handleCreateEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetTenantId = eqForm.tenantId || activeTenantId;
    if (!db || !targetTenantId) {
      toast.error('Pilih cabang terlebih dahulu.');
      return;
    }
    if (!eqForm.name.trim() || !eqForm.brand.trim()) {
      toast.error('Nama model dan brand wajib diisi.');
      return;
    }

    try {
      await addDoc(collection(db, 'equipment'), {
        tenantId: targetTenantId,
        name: eqForm.name.trim(),
        brand: eqForm.brand.trim(),
        category: eqForm.category,
        dailyRate: Number(eqForm.dailyRate),
        depositAmount: Number(eqForm.depositAmount),
        specs: parseSpecsText(eqForm.specsText),
        images: eqForm.imageUrl.trim() ? [eqForm.imageUrl.trim()] : [],
        totalUnits: 0,
        isActive: true,
      });
      await queryClient.invalidateQueries({ queryKey: ['equipment'] });
      toast.success(`${eqForm.name.trim()} ditambahkan ke katalog.`);
      setCreateDialogOpen(false);
    } catch (error) {
      console.error('Create equipment error:', error);
      toast.error('Gagal menambahkan model alat.');
    }
  };

  const handleUpdateEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !selectedEquipment) return;
    if (!eqForm.name.trim() || !eqForm.brand.trim()) {
      toast.error('Nama model dan brand wajib diisi.');
      return;
    }

    try {
      await updateDoc(doc(db, 'equipment', selectedEquipment.id), {
        name: eqForm.name.trim(),
        brand: eqForm.brand.trim(),
        category: eqForm.category,
        dailyRate: Number(eqForm.dailyRate),
        depositAmount: Number(eqForm.depositAmount),
        specs: parseSpecsText(eqForm.specsText),
        images: eqForm.imageUrl.trim() ? [eqForm.imageUrl.trim()] : [],
      });
      await queryClient.invalidateQueries({ queryKey: ['equipment'] });
      toast.success(`Data ${eqForm.name.trim()} diperbarui.`);
      setDetailTab('units');
    } catch (error) {
      console.error('Update equipment error:', error);
      toast.error('Gagal memperbarui model alat.');
    }
  };

  const handleDeleteEquipment = async () => {
    if (!db || !selectedEquipment) return;
    const rentedUnits = selectedUnits.filter((u) => u.status === 'rented');
    if (rentedUnits.length > 0) {
      toast.error(
        `Tidak bisa menghapus model ini — masih ada ${rentedUnits.length} unit berstatus Rented.`
      );
      return;
    }

    setDeletingModel(true);
    try {
      const firestore = db;
      const batch = writeBatch(firestore);
      selectedUnits.forEach((u) => {
        batch.delete(doc(firestore, 'equipment_units', u.id));
      });
      batch.delete(doc(firestore, 'equipment', selectedEquipment.id));
      await batch.commit();

      await queryClient.invalidateQueries({ queryKey: ['equipment'] });
      await queryClient.invalidateQueries({ queryKey: ['equipment_units'] });
      await queryClient.invalidateQueries({ queryKey: ['public', 'equipment'] });
      toast.success(
        `Model ${selectedEquipment.name} beserta ${selectedUnits.length} unit fisiknya dihapus.`
      );
      setSelectedEquipmentId(null);
      setConfirmDeleteModel(false);
    } catch (error) {
      console.error('Delete equipment error:', error);
      toast.error('Gagal menghapus model alat.');
    } finally {
      setDeletingModel(false);
    }
  };

  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !selectedEquipment) return;
    if (!unitForm.serialNumber.trim()) {
      toast.error('Serial number wajib diisi.');
      return;
    }

    const accessoriesIncluded = unitForm.accessoriesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await addDoc(collection(db, 'equipment_units'), {
        equipmentId: selectedEquipment.id,
        tenantId: selectedEquipment.tenantId,
        serialNumber: unitForm.serialNumber.trim().toUpperCase(),
        condition: unitForm.condition,
        status: unitForm.status,
        accessoriesIncluded,
        lastCheckedAt: Timestamp.now(),
      });

      const currentCount = allUnits.filter((u) => u.equipmentId === selectedEquipment.id).length;
      await updateDoc(doc(db, 'equipment', selectedEquipment.id), {
        totalUnits: currentCount + 1,
      });

      setUnitForm({
        serialNumber: '',
        condition: 'mint',
        status: 'available',
        accessoriesText: '2x Battery, Charger, Cap',
      });

      await queryClient.invalidateQueries({ queryKey: ['equipment_units'] });
      await queryClient.invalidateQueries({ queryKey: ['equipment'] });
      toast.success(`Unit fisik ${unitForm.serialNumber.toUpperCase()} didaftarkan.`);
    } catch (error) {
      console.error('Add unit error:', error);
      toast.error('Gagal mendaftarkan unit fisik.');
    }
  };

  const handleUpdateUnitStatus = async (unit: EquipmentUnit, status: UnitStatus) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'equipment_units', unit.id), {
        status,
        lastCheckedAt: Timestamp.now(),
      });
      await queryClient.invalidateQueries({ queryKey: ['equipment_units'] });
      toast.success(`${unit.serialNumber} diubah ke ${status}.`);
    } catch (error) {
      console.error('Unit status update error:', error);
      toast.error('Gagal memperbarui status unit.');
    }
  };

  const handleDeleteUnit = async (unit: EquipmentUnit) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'equipment_units', unit.id));
      const remaining = allUnits.filter(
        (u) => u.equipmentId === unit.equipmentId && u.id !== unit.id
      ).length;
      await updateDoc(doc(db, 'equipment', unit.equipmentId), {
        totalUnits: remaining,
      });
      await queryClient.invalidateQueries({ queryKey: ['equipment_units'] });
      await queryClient.invalidateQueries({ queryKey: ['equipment'] });
      toast.success(`Unit ${unit.serialNumber} dihapus.`);
    } catch (error) {
      console.error('Delete unit error:', error);
      toast.error('Gagal menghapus unit.');
    }
  };

  const filtered = equipmentList.filter((eq) => {
    if (categoryFilter !== 'all' && eq.category !== categoryFilter) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      eq.name.toLowerCase().includes(q) ||
      eq.brand.toLowerCase().includes(q) ||
      (tenantById[eq.tenantId]?.name ?? '').toLowerCase().includes(q)
    );
  });

  const renderEquipmentFormFields = (isEdit: boolean) => (
    <div className="space-y-4">
      {isAllTenants && !isEdit ? (
        <div className="space-y-1.5">
          <Label>Cabang</Label>
          <Select
            value={eqForm.tenantId}
            onValueChange={(v) => setEqForm({ ...eqForm, tenantId: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pilih cabang..." />
            </SelectTrigger>
            <SelectContent>
              {allTenants.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Nama Model</Label>
          <Input
            placeholder="Sony Alpha a7 IV Body"
            value={eqForm.name}
            onChange={(e) => setEqForm({ ...eqForm, name: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Brand</Label>
          <Input
            placeholder="Sony"
            value={eqForm.brand}
            onChange={(e) => setEqForm({ ...eqForm, brand: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Kategori</Label>
          <Select
            value={eqForm.category}
            onValueChange={(v) => setEqForm({ ...eqForm, category: v as Equipment['category'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tarif / Hari (IDR)</Label>
          <Input
            type="number"
            className="tabular-nums"
            value={eqForm.dailyRate}
            onChange={(e) => setEqForm({ ...eqForm, dailyRate: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Deposit (IDR)</Label>
          <Input
            type="number"
            className="tabular-nums"
            value={eqForm.depositAmount}
            onChange={(e) => setEqForm({ ...eqForm, depositAmount: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Spesifikasi Teknis (Key: Value per baris)</Label>
        <textarea
          rows={3}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={eqForm.specsText}
          onChange={(e) => setEqForm({ ...eqForm, specsText: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Image URL (opsional)</Label>
        <Input
          placeholder="https://..."
          value={eqForm.imageUrl}
          onChange={(e) => setEqForm({ ...eqForm, imageUrl: e.target.value })}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Inventory &amp; Serial Units
          </h2>
          <p className="text-sm text-muted-foreground">
            Cabang{' '}
            <span className="font-medium text-foreground">
              {isAllTenants ? 'Semua Cabang' : activeTenant?.name}
            </span>{' '}
            — klik item untuk mengelola unit serial number, edit model, atau hapus item.
          </p>
        </div>
        <Button size="sm" onClick={openCreateEquipment}>
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
          Tambah Model Alat
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search
              className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
              strokeWidth={1.5}
            />
            <Input
              placeholder="Cari Sony A7 IV, RF 24-70mm..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Kategori</SelectItem>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat} className="capitalize">
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <span className="text-xs text-muted-foreground">
          {equipmentList.length} model · {allUnits.length} unit fisik SN
        </span>
      </div>

      {loadingEq ? (
        <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          Memuat inventaris alat...
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="Belum ada model alat"
          description="Tambahkan kamera, lensa, lighting, atau stabilizer beserta serial number fisiknya."
          action={
            <Button size="sm" onClick={openCreateEquipment}>
              Tambah Model Alat
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model Alat</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Tarif / Hari</TableHead>
              <TableHead>Deposit</TableHead>
              <TableHead>Unit Fisik (SN)</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((eq) => {
              const units = allUnits.filter((u) => u.equipmentId === eq.id);
              const availCount = units.filter(
                (u) => u.status === 'available' && u.condition !== 'damaged'
              ).length;
              const maintCount = units.filter((u) => u.status === 'maintenance').length;
              return (
                <TableRow
                  key={eq.id}
                  onClick={() => openEquipmentDetail(eq)}
                  className="group cursor-pointer"
                >
                  <TableCell>
                    <p className="font-medium text-foreground">{eq.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {eq.brand}
                      {isAllTenants ? ` · ${tenantById[eq.tenantId]?.name ?? eq.tenantId}` : ''}
                    </p>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium capitalize text-secondary-foreground">
                      {eq.category}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium text-foreground">
                    <CurrencyText amount={eq.dailyRate} suffix="/hari" />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <CurrencyText amount={eq.depositAmount} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="tabular-nums text-xs font-medium text-foreground">
                        {availCount}/{units.length} ready
                      </span>
                      {maintCount > 0 ? (
                        <StatusBadge status="maintenance" label={`${maintCount} maint`} />
                      ) : null}
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

      {/* Create Equipment Model Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tambah Model Alat</DialogTitle>
            <DialogDescription>
              Tambahkan model katalog dan tarif sewa untuk{' '}
              {tenantById[eqForm.tenantId]?.name ?? activeTenant?.name ?? 'cabang terpilih'}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateEquipment} className="space-y-4">
            {renderEquipmentFormFields(false)}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Batal
              </Button>
              <Button type="submit">Simpan Model</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Unified Clickable Equipment Detail, Unit Manager, Edit & Delete Dialog */}
      <Dialog
        open={Boolean(selectedEquipment)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedEquipmentId(null);
            setConfirmDeleteModel(false);
          }
        }}
      >
        <DialogContent className="max-w-2xl gap-5">
          {selectedEquipment ? (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3 pr-6">
                  <div>
                    <DialogTitle>{selectedEquipment.name}</DialogTitle>
                    <DialogDescription className="mt-1">
                      {selectedEquipment.brand} ·{' '}
                      <span className="capitalize">{selectedEquipment.category}</span> ·{' '}
                      {tenantById[selectedEquipment.tenantId]?.name ??
                        activeTenant?.name ??
                        'Cabang'}
                    </DialogDescription>
                  </div>
                  <div className="text-right text-xs">
                    <div className="font-semibold text-foreground">
                      <CurrencyText amount={selectedEquipment.dailyRate} suffix="/hari" />
                    </div>
                    <div className="text-muted-foreground">
                      Deposit <CurrencyText amount={selectedEquipment.depositAmount} />
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <Tabs
                value={detailTab}
                onValueChange={(v) => {
                  setDetailTab(v as 'units' | 'edit');
                  setConfirmDeleteModel(false);
                }}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="units">
                    Unit Fisik / SN ({selectedUnits.length})
                  </TabsTrigger>
                  <TabsTrigger value="edit">Edit &amp; Hapus Model</TabsTrigger>
                </TabsList>

                {/* Tab 1: Physical Serial Units */}
                <TabsContent value="units" className="mt-4 space-y-4">
                  <form
                    onSubmit={handleAddUnit}
                    className="grid grid-cols-1 gap-3 rounded-md border bg-muted/30 p-3.5 sm:grid-cols-12"
                  >
                    <div className="space-y-1 sm:col-span-4">
                      <Label className="text-xs">Serial Number</Label>
                      <Input
                        placeholder="SN-A7IV-00425"
                        className="h-8 font-mono text-xs"
                        value={unitForm.serialNumber}
                        onChange={(e) => setUnitForm({ ...unitForm, serialNumber: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-3">
                      <Label className="text-xs">Kondisi</Label>
                      <Select
                        value={unitForm.condition}
                        onValueChange={(v) =>
                          setUnitForm({ ...unitForm, condition: v as UnitCondition })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mint">Mint</SelectItem>
                          <SelectItem value="good">Good</SelectItem>
                          <SelectItem value="fair">Fair</SelectItem>
                          <SelectItem value="damaged">Damaged</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 sm:col-span-5">
                      <Label className="text-xs">Kelengkapan (pisah koma)</Label>
                      <Input
                        placeholder="2x Battery, Dual Charger, 64GB SD"
                        className="h-8 text-xs"
                        value={unitForm.accessoriesText}
                        onChange={(e) =>
                          setUnitForm({ ...unitForm, accessoriesText: e.target.value })
                        }
                      />
                    </div>
                    <div className="flex justify-end sm:col-span-12">
                      <Button type="submit" size="sm">
                        <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                        Tambah Unit SN
                      </Button>
                    </div>
                  </form>

                  {selectedUnits.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                      Belum ada unit fisik terdaftar. Tambahkan minimal 1 serial number agar model
                      ini bisa dibooking.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Serial Number</TableHead>
                          <TableHead>Kondisi</TableHead>
                          <TableHead>Kelengkapan</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="w-12 text-right">Hapus</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedUnits.map((unit) => (
                          <TableRow key={unit.id}>
                            <TableCell>
                              <SerialNumberTag serialNumber={unit.serialNumber} />
                            </TableCell>
                            <TableCell className="text-xs capitalize text-foreground">
                              {unit.condition}
                            </TableCell>
                            <TableCell className="max-w-[180px] text-xs text-muted-foreground">
                              {unit.accessoriesIncluded.join(', ') || '—'}
                            </TableCell>
                            <TableCell>
                              <Select
                                value={unit.status}
                                onValueChange={(v) =>
                                  void handleUpdateUnitStatus(unit, v as UnitStatus)
                                }
                              >
                                <SelectTrigger className="h-7 w-28 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="available">Available</SelectItem>
                                  <SelectItem value="rented">Rented</SelectItem>
                                  <SelectItem value="maintenance">Maintenance</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => void handleDeleteUnit(unit)}
                                title="Hapus unit fisik"
                              >
                                <Trash2
                                  className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive"
                                  strokeWidth={1.5}
                                />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                {/* Tab 2: Edit & Delete Model */}
                <TabsContent value="edit" className="mt-4 space-y-5">
                  <form onSubmit={handleUpdateEquipment} className="space-y-4">
                    {renderEquipmentFormFields(true)}

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                      {!confirmDeleteModel ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setConfirmDeleteModel(true)}
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                          Hapus Model Alat
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={deletingModel}
                            onClick={() => void handleDeleteEquipment()}
                          >
                            {deletingModel
                              ? 'Menghapus...'
                              : `Konfirmasi Hapus (${selectedUnits.length} SN)`}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDeleteModel(false)}
                          >
                            Batal
                          </Button>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setDetailTab('units')}
                        >
                          Batal
                        </Button>
                        <Button type="submit" size="sm">
                          Simpan Perubahan
                        </Button>
                      </div>
                    </div>
                  </form>
                </TabsContent>
              </Tabs>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
