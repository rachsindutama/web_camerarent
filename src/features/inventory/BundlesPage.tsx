import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Check, Package, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { useTenant } from '@/hooks/useTenant';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Bundle, Equipment } from '@/types/schema';

export function BundlesPage() {
  const queryClient = useQueryClient();
  const { activeTenantId, activeTenant } = useTenant();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bundleDailyRate, setBundleDailyRate] = useState(950000);
  const [bundleDeposit, setBundleDeposit] = useState(2000000);

  const { data: equipmentList = [] } = useQuery<Equipment[]>({
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

  const { data: bundles = [], isLoading } = useQuery<Bundle[]>({
    queryKey: ['bundles', activeTenantId],
    enabled: Boolean(db && activeTenantId),
    queryFn: async () => {
      if (!db || !activeTenantId) return [];
      const snap = await getDocs(
        query(collection(db, 'bundles'), where('tenantId', '==', activeTenantId))
      );
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Bundle);
    },
  });

  if (!activeTenantId) {
    return (
      <EmptyState
        icon={Package}
        title="No active rental house selected"
        description="Select a tenant branch in the topbar to manage kit bundles."
      />
    );
  }

  const toggleEquipmentId = (eqId: string) => {
    setSelectedIds((prev) =>
      prev.includes(eqId) ? prev.filter((id) => id !== eqId) : [...prev, eqId]
    );
  };

  const standardRateSum = selectedIds.reduce((sum, id) => {
    const eq = equipmentList.find((e) => e.id === id);
    return sum + (eq?.dailyRate ?? 0);
  }, 0);

  const handleCreateBundle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !activeTenantId) return;
    if (!name.trim() || selectedIds.length < 2) {
      toast.error('Provide a kit name and select at least 2 equipment models.');
      return;
    }

    try {
      await addDoc(collection(db, 'bundles'), {
        tenantId: activeTenantId,
        name: name.trim(),
        description: description.trim(),
        equipmentIds: selectedIds,
        bundleDailyRate: Number(bundleDailyRate),
        bundleDeposit: Number(bundleDeposit),
        isActive: true,
      });
      await queryClient.invalidateQueries({ queryKey: ['bundles', activeTenantId] });
      toast.success(`Created production bundle ${name}.`);
      setOpen(false);
      setName('');
      setDescription('');
      setSelectedIds([]);
    } catch (error) {
      console.error('Create bundle error:', error);
      toast.error('Failed to create bundle.');
    }
  };

  const handleToggleActive = async (bundle: Bundle) => {
    if (!db || !activeTenantId) return;
    await updateDoc(doc(db, 'bundles', bundle.id), { isActive: !bundle.isActive });
    await queryClient.invalidateQueries({ queryKey: ['bundles', activeTenantId] });
  };

  const handleDelete = async (bundle: Bundle) => {
    if (!db || !activeTenantId) return;
    await deleteDoc(doc(db, 'bundles', bundle.id));
    await queryClient.invalidateQueries({ queryKey: ['bundles', activeTenantId] });
    toast.success(`Deleted bundle ${bundle.name}.`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-950">
            Production Kit Bundles
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Branch: <span className="font-medium text-zinc-800">{activeTenant?.name}</span> · Bundle
            checkout atomically verifies and locks one physical unit for every component.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
          New Kit Bundle
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-md border border-zinc-200 bg-white p-8 text-center font-mono text-xs text-zinc-400">
          LOADING BUNDLES...
        </div>
      ) : bundles.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No kit bundles configured"
          description="Combine camera bodies, lenses, and stabilizers into discounted production packages."
          action={
            <Button size="sm" onClick={() => setOpen(true)}>
              Build First Kit
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {bundles.map((bundle) => {
            const components = bundle.equipmentIds
              .map((id) => equipmentList.find((e) => e.id === id))
              .filter((e): e is Equipment => Boolean(e));
            const alaCarteRate = components.reduce((sum, e) => sum + e.dailyRate, 0);
            const savings = Math.max(0, alaCarteRate - bundle.bundleDailyRate);

            return (
              <Card key={bundle.id} className="shadow-none">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm">{bundle.name}</CardTitle>
                      <CardDescription className="mt-1">{bundle.description}</CardDescription>
                    </div>
                    <StatusBadge
                      status={bundle.isActive ? 'active' : 'suspended'}
                      label={bundle.isActive ? 'Active' : 'Archived'}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1 rounded-md border border-zinc-200 bg-zinc-50 p-2.5">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                      Included Equipment ({components.length})
                    </p>
                    {components.map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-xs">
                        <span className="text-zinc-800">{item.name}</span>
                        <CurrencyText amount={item.dailyRate} className="text-[11px] text-zinc-500" />
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between border-t border-zinc-100 pt-2">
                    <div>
                      <div className="text-sm font-semibold text-zinc-950">
                        <CurrencyText amount={bundle.bundleDailyRate} suffix="/day" />
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Deposit <CurrencyText amount={bundle.bundleDeposit} />
                        {savings > 0 ? (
                          <span className="ml-2 text-emerald-700">
                            Save <CurrencyText amount={savings} />/d
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleToggleActive(bundle)}
                      >
                        {bundle.isActive ? 'Archive' : 'Activate'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void handleDelete(bundle)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-zinc-400 hover:text-red-600" strokeWidth={1.5} />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Build Production Kit Bundle</DialogTitle>
            <DialogDescription>
              Select catalog items to group into an atomically bookable kit.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateBundle} className="space-y-3">
            <div className="space-y-1">
              <Label>Bundle Name</Label>
              <Input
                placeholder="Commercial Cinema Rig — FX3 + GM II + RS3 Pro"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                placeholder="Recommended crew kit description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Select Component Equipment ({selectedIds.length} selected)</Label>
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-zinc-200 p-2">
                {equipmentList.map((eq) => {
                  const checked = selectedIds.includes(eq.id);
                  return (
                    <button
                      type="button"
                      key={eq.id}
                      onClick={() => toggleEquipmentId(eq.id)}
                      className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors ${
                        checked ? 'bg-zinc-100 font-medium text-zinc-950' : 'hover:bg-zinc-50 text-zinc-700'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`flex h-4 w-4 items-center justify-center rounded border ${
                            checked
                              ? 'border-primary bg-primary text-white'
                              : 'border-zinc-300 bg-white'
                          }`}
                        >
                          {checked ? <Check className="h-3 w-3" strokeWidth={2} /> : null}
                        </span>
                        {eq.name}
                      </span>
                      <CurrencyText amount={eq.dailyRate} className="text-[11px] text-zinc-500" />
                    </button>
                  );
                })}
              </div>
              {standardRateSum > 0 ? (
                <p className="font-mono text-[11px] text-zinc-500">
                  A-la-carte sum: <CurrencyText amount={standardRateSum} suffix="/day" />
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Bundle Daily Rate (IDR)</Label>
                <Input
                  type="number"
                  className="font-mono"
                  value={bundleDailyRate}
                  onChange={(e) => setBundleDailyRate(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label>Bundle Deposit (IDR)</Label>
                <Input
                  type="number"
                  className="font-mono"
                  value={bundleDeposit}
                  onChange={(e) => setBundleDeposit(Number(e.target.value))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create Bundle</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

