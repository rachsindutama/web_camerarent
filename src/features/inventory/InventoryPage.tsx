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
} from 'firebase/firestore';
import {
  Camera,
  Cpu,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { useTenant } from '@/hooks/useTenant';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { SerialNumberTag } from '@/components/shared/SerialNumberTag';
import { StatusBadge } from '@/components/shared/StatusBadge';
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
  const { activeTenantId, activeTenant } = useTenant();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Equipment CRUD dialog state
  const [eqDialogOpen, setEqDialogOpen] = useState(false);
  const [editingEq, setEditingEq] = useState<Equipment | null>(null);
  const [eqForm, setEqForm] = useState({
    name: '',
    brand: '',
    category: 'camera' as Equipment['category'],
    dailyRate: 350000,
    depositAmount: 750000,
    specsText: 'Sensor: Full-Frame\nMount: E-Mount',
    imageUrl: '',
  });

  // Physical Unit Manager dialog state
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [unitForm, setUnitForm] = useState({
    serialNumber: '',
    condition: 'mint' as UnitCondition,
    status: 'available' as UnitStatus,
    accessoriesText: '2x Battery, Charger, Cap',
  });

  const { data: equipmentList = [], isLoading: loadingEq } = useQuery<Equipment[]>({
    queryKey: ['equipment', activeTenantId],
    enabled: Boolean(db && activeTenantId),
    queryFn: async () => {
      if (!db || !activeTenantId) return [];
      const snap = await getDocs(
        query(collection(db, 'equipment'), where('tenantId', '==', activeTenantId))
      );
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Equipment);
    },
  });

  const { data: allUnits = [] } = useQuery<EquipmentUnit[]>({
    queryKey: ['equipment_units', activeTenantId],
    enabled: Boolean(db && activeTenantId),
    queryFn: async () => {
      if (!db || !activeTenantId) return [];
      const snap = await getDocs(
        query(collection(db, 'equipment_units'), where('tenantId', '==', activeTenantId))
      );
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EquipmentUnit);
    },
  });

  if (!activeTenantId) {
    return (
      <EmptyState
        icon={Camera}
        title="No active rental house selected"
        description="Select or create a tenant branch in Platform Governance → Tenants before managing inventory."
      />
    );
  }

  const openCreateEquipment = () => {
    setEditingEq(null);
    setEqForm({
      name: '',
      brand: '',
      category: 'camera',
      dailyRate: 400000,
      depositAmount: 1000000,
      specsText: 'Sensor: 33MP Full-Frame\nVideo: 4K 60p 10-bit',
      imageUrl: '',
    });
    setEqDialogOpen(true);
  };

  const openEditEquipment = (eq: Equipment) => {
    setEditingEq(eq);
    setEqForm({
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
    setEqDialogOpen(true);
  };

  const handleSaveEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !activeTenantId) return;
    if (!eqForm.name.trim() || !eqForm.brand.trim()) {
      toast.error('Equipment name and brand are required.');
      return;
    }

    const specs: Record<string, string> = {};
    eqForm.specsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const idx = line.indexOf(':');
        if (idx > 0) {
          specs[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
        }
      });

    try {
      if (editingEq) {
        await updateDoc(doc(db, 'equipment', editingEq.id), {
          name: eqForm.name.trim(),
          brand: eqForm.brand.trim(),
          category: eqForm.category,
          dailyRate: Number(eqForm.dailyRate),
          depositAmount: Number(eqForm.depositAmount),
          specs,
          images: eqForm.imageUrl.trim() ? [eqForm.imageUrl.trim()] : [],
        });
        toast.success(`Updated ${eqForm.name}.`);
      } else {
        await addDoc(collection(db, 'equipment'), {
          tenantId: activeTenantId,
          name: eqForm.name.trim(),
          brand: eqForm.brand.trim(),
          category: eqForm.category,
          dailyRate: Number(eqForm.dailyRate),
          depositAmount: Number(eqForm.depositAmount),
          specs,
          images: eqForm.imageUrl.trim() ? [eqForm.imageUrl.trim()] : [],
          totalUnits: 0,
          isActive: true,
        });
        toast.success(`Added ${eqForm.name} to catalog.`);
      }
      await queryClient.invalidateQueries({ queryKey: ['equipment', activeTenantId] });
      setEqDialogOpen(false);
    } catch (error) {
      console.error('Save equipment error:', error);
      toast.error('Failed to save equipment.');
    }
  };

  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !activeTenantId || !selectedEquipment) return;
    if (!unitForm.serialNumber.trim()) {
      toast.error('Serial number is required.');
      return;
    }

    const accessoriesIncluded = unitForm.accessoriesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await addDoc(collection(db, 'equipment_units'), {
        equipmentId: selectedEquipment.id,
        tenantId: activeTenantId,
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

      await queryClient.invalidateQueries({ queryKey: ['equipment_units', activeTenantId] });
      await queryClient.invalidateQueries({ queryKey: ['equipment', activeTenantId] });
      toast.success(`Registered physical unit ${unitForm.serialNumber.toUpperCase()}.`);
    } catch (error) {
      console.error('Add unit error:', error);
      toast.error('Failed to register physical unit.');
    }
  };

  const handleUpdateUnitStatus = async (unit: EquipmentUnit, status: UnitStatus) => {
    if (!db || !activeTenantId) return;
    try {
      await updateDoc(doc(db, 'equipment_units', unit.id), {
        status,
        lastCheckedAt: Timestamp.now(),
      });
      await queryClient.invalidateQueries({ queryKey: ['equipment_units', activeTenantId] });
      toast.success(`${unit.serialNumber} marked ${status}.`);
    } catch (error) {
      console.error('Unit status update error:', error);
      toast.error('Failed to update unit status.');
    }
  };

  const handleDeleteUnit = async (unit: EquipmentUnit) => {
    if (!db || !activeTenantId) return;
    try {
      await deleteDoc(doc(db, 'equipment_units', unit.id));
      const remaining = allUnits.filter(
        (u) => u.equipmentId === unit.equipmentId && u.id !== unit.id
      ).length;
      await updateDoc(doc(db, 'equipment', unit.equipmentId), {
        totalUnits: remaining,
      });
      await queryClient.invalidateQueries({ queryKey: ['equipment_units', activeTenantId] });
      await queryClient.invalidateQueries({ queryKey: ['equipment', activeTenantId] });
      toast.success(`Removed unit ${unit.serialNumber}.`);
    } catch (error) {
      console.error('Delete unit error:', error);
      toast.error('Failed to delete unit.');
    }
  };

  const filtered = equipmentList.filter((eq) => {
    if (categoryFilter !== 'all' && eq.category !== categoryFilter) return false;
    const q = search.toLowerCase();
    return eq.name.toLowerCase().includes(q) || eq.brand.toLowerCase().includes(q);
  });

  const selectedUnits = selectedEquipment
    ? allUnits.filter((u) => u.equipmentId === selectedEquipment.id)
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-950">
            Equipment Catalog &amp; Serial Units
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Branch: <span className="font-medium text-zinc-800">{activeTenant?.name}</span> · Track
            catalog pricing and individual serial-numbered physical assets.
          </p>
        </div>
        <Button size="sm" onClick={openCreateEquipment}>
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
          Add Equipment Model
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search
              className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400"
              strokeWidth={1.5}
            />
            <Input
              placeholder="Search Sony A7 IV, RF 24-70mm..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat} className="capitalize">
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="font-mono text-[11px] text-zinc-500">
          {equipmentList.length} MODELS // {allUnits.length} PHYSICAL SN UNITS
        </div>
      </div>

      {loadingEq ? (
        <div className="rounded-md border border-zinc-200 bg-white p-8 text-center font-mono text-xs text-zinc-400">
          LOADING FLEET INVENTORY...
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="No equipment models in this branch"
          description="Add camera bodies, lenses, lighting, or stabilizers and register their serial numbers."
          action={
            <Button size="sm" onClick={openCreateEquipment}>
              Add Equipment Model
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Equipment Model</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Daily Rate</TableHead>
              <TableHead>Deposit (Liability)</TableHead>
              <TableHead>Physical Units (SN)</TableHead>
              <TableHead className="text-right">Actions</TableHead>
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
                <TableRow key={eq.id}>
                  <TableCell>
                    <p className="font-medium text-zinc-950">{eq.name}</p>
                    <p className="text-[11px] text-zinc-500">{eq.brand}</p>
                  </TableCell>
                  <TableCell>
                    <span className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-600">
                      {eq.category}
                    </span>
                  </TableCell>
                  <TableCell>
                    <CurrencyText amount={eq.dailyRate} suffix="/day" />
                  </TableCell>
                  <TableCell>
                    <CurrencyText amount={eq.depositAmount} className="text-zinc-600" />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs font-medium text-zinc-900">
                        {availCount}/{units.length} ready
                      </span>
                      {maintCount > 0 ? (
                        <StatusBadge status="maintenance" label={`${maintCount} maint`} />
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedEquipment(eq)}
                      >
                        <Cpu className="h-3 w-3" strokeWidth={1.5} />
                        Units ({units.length})
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEditEquipment(eq)}>
                        <Pencil className="h-3 w-3" strokeWidth={1.5} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Equipment Model Dialog */}
      <Dialog open={eqDialogOpen} onOpenChange={setEqDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEq ? 'Edit Equipment Model' : 'New Equipment Model'}</DialogTitle>
            <DialogDescription>
              Define catalog metadata and daily pricing for {activeTenant?.name}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveEquipment} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Model Name</Label>
                <Input
                  placeholder="Sony Alpha a7 IV Body"
                  value={eqForm.name}
                  onChange={(e) => setEqForm({ ...eqForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Brand</Label>
                <Input
                  placeholder="Sony"
                  value={eqForm.brand}
                  onChange={(e) => setEqForm({ ...eqForm, brand: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Category</Label>
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
              <div className="space-y-1">
                <Label>Daily Rate (IDR)</Label>
                <Input
                  type="number"
                  className="font-mono"
                  value={eqForm.dailyRate}
                  onChange={(e) => setEqForm({ ...eqForm, dailyRate: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label>Deposit (IDR)</Label>
                <Input
                  type="number"
                  className="font-mono"
                  value={eqForm.depositAmount}
                  onChange={(e) => setEqForm({ ...eqForm, depositAmount: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Technical Specs (Key: Value per line)</Label>
              <textarea
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={eqForm.specsText}
                onChange={(e) => setEqForm({ ...eqForm, specsText: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <Label>Image URL (optional)</Label>
              <Input
                placeholder="https://..."
                value={eqForm.imageUrl}
                onChange={(e) => setEqForm({ ...eqForm, imageUrl: e.target.value })}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEqDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editingEq ? 'Save Changes' : 'Create Model'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Physical Serial-Number Units Manager */}
      <Dialog
        open={Boolean(selectedEquipment)}
        onOpenChange={(o) => !o && setSelectedEquipment(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-zinc-500" strokeWidth={1.5} />
              Physical Units — {selectedEquipment?.name}
            </DialogTitle>
            <DialogDescription>
              Register serialized units and track maintenance, condition, and kit accessories.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleAddUnit}
            className="grid grid-cols-1 gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-12"
          >
            <div className="sm:col-span-4">
              <Label className="text-[10px] uppercase">Serial Number</Label>
              <Input
                placeholder="SN-A7IV-00425"
                className="mt-1 font-mono"
                value={unitForm.serialNumber}
                onChange={(e) => setUnitForm({ ...unitForm, serialNumber: e.target.value })}
              />
            </div>
            <div className="sm:col-span-3">
              <Label className="text-[10px] uppercase">Condition</Label>
              <Select
                value={unitForm.condition}
                onValueChange={(v) => setUnitForm({ ...unitForm, condition: v as UnitCondition })}
              >
                <SelectTrigger className="mt-1">
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
            <div className="sm:col-span-5">
              <Label className="text-[10px] uppercase">Accessories (comma separated)</Label>
              <Input
                placeholder="2x NP-FZ100, Dual Charger, 64GB SD"
                className="mt-1"
                value={unitForm.accessoriesText}
                onChange={(e) => setUnitForm({ ...unitForm, accessoriesText: e.target.value })}
              />
            </div>
            <div className="flex justify-end sm:col-span-12">
              <Button type="submit" size="sm">
                <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                Register Serial Unit
              </Button>
            </div>
          </form>

          {selectedUnits.length === 0 ? (
            <p className="py-4 text-center text-xs text-zinc-500">
              No physical units registered yet. Add at least one serial number so this model becomes
              bookable.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serial Number</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Accessories</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedUnits.map((unit) => (
                  <TableRow key={unit.id}>
                    <TableCell>
                      <SerialNumberTag serialNumber={unit.serialNumber} />
                    </TableCell>
                    <TableCell className="font-mono text-[11px] uppercase">
                      {unit.condition}
                    </TableCell>
                    <TableCell className="max-w-[200px] text-[11px] text-zinc-500">
                      {unit.accessoriesIncluded.join(', ') || '—'}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={unit.status}
                        onValueChange={(v) => void handleUpdateUnitStatus(unit, v as UnitStatus)}
                      >
                        <SelectTrigger className="h-7 w-28 text-[11px]">
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
                        title="Delete physical unit"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-zinc-400 hover:text-red-600" strokeWidth={1.5} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

