import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { syncAvailabilitySlotStatus } from '@/lib/availability';
import { formatDateTime } from '@/lib/utils';
import { calculateOverdueFine } from '@/hooks/useOverdueCalc';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { MembershipBadge } from '@/components/shared/MembershipBadge';
import { SerialNumberTag } from '@/components/shared/SerialNumberTag';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import type { Booking, DamageReport } from '@/types/schema';

export function InspectionsPage() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const { activeTenantId, activeTenant } = useTenant();

  // Pre-rental handover dialog
  const [handoverTarget, setHandoverTarget] = useState<Booking | null>(null);
  const [handoverNotes, setHandoverNotes] = useState(
    'Sensor clean, shutter count verified, all batteries charged 100%, lens elements scratch-free.'
  );
  const [handoverPhotosText, setHandoverPhotosText] = useState('');

  // Post-rental damage dialog
  const [damageTarget, setDamageTarget] = useState<Booking | null>(null);
  const [damageUnitId, setDamageUnitId] = useState('');
  const [damageSeverity, setDamageSeverity] = useState<DamageReport['severity']>('minor');
  const [damageDesc, setDamageDesc] = useState('');
  const [damageRepairCost, setDamageRepairCost] = useState(500000);
  const [damagePhotosText, setDamagePhotosText] = useState('');

  const { data: bookings = [], isLoading } = useQuery<Booking[]>({
    queryKey: ['inspections', 'bookings', activeTenantId],
    enabled: Boolean(db && activeTenantId),
    queryFn: async () => {
      if (!db || !activeTenantId) return [];
      const snap = await getDocs(
        query(collection(db, 'bookings'), where('tenantId', '==', activeTenantId))
      );
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Booking)
        .filter((b) =>
          ['confirmed', 'active_rent', 'overdue'].includes(b.bookingStatus)
        )
        .sort((a, b) => a.startDate.toMillis() - b.startDate.toMillis());
    },
  });

  const { data: damageReports = [] } = useQuery<DamageReport[]>({
    queryKey: ['damage_reports', activeTenantId],
    enabled: Boolean(db && activeTenantId),
    queryFn: async () => {
      if (!db || !activeTenantId) return [];
      const snap = await getDocs(
        query(collection(db, 'damage_reports'), where('tenantId', '==', activeTenantId))
      );
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DamageReport);
    },
  });

  if (!activeTenantId || !activeTenant) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="No active rental branch selected"
        description="Select a tenant branch to perform pre-rental and post-rental inspections."
      />
    );
  }

  const preRentalBookings = bookings.filter((b) => b.bookingStatus === 'confirmed');
  const postRentalBookings = bookings.filter(
    (b) => b.bookingStatus === 'active_rent' || b.bookingStatus === 'overdue'
  );

  const handleSavePreRentalChecklist = async (dispatchActiveRent: boolean) => {
    if (!db || !handoverTarget) return;
    const photos = handoverPhotosText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await updateDoc(doc(db, 'bookings', handoverTarget.id), {
        preRentalChecklist: {
          photos,
          notes: handoverNotes.trim(),
          confirmedByUserAt: handoverTarget.preRentalChecklist?.confirmedByUserAt ?? null,
        },
        ...(dispatchActiveRent ? { bookingStatus: 'active_rent' } : {}),
      });

      if (dispatchActiveRent) {
        await syncAvailabilitySlotStatus(handoverTarget.id, 'active_rent');
        for (const item of handoverTarget.items) {
          await updateDoc(doc(db, 'equipment_units', item.unitId), {
            status: 'rented',
            lastCheckedAt: Timestamp.now(),
          });
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['inspections'] });
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['equipment_units'] });
      toast.success(
        dispatchActiveRent
          ? `${handoverTarget.invoiceNumber} dispatched to Active Rent.`
          : `Handover checklist saved for ${handoverTarget.invoiceNumber}.`
      );
      setHandoverTarget(null);
    } catch (error) {
      console.error('Pre-rental handover error:', error);
      toast.error('Failed to update pre-rental checklist.');
    }
  };

  const handleApplyOverdueFine = async (booking: Booking, fineAmount: number) => {
    if (!db || !userProfile) return;
    try {
      await updateDoc(doc(db, 'bookings', booking.id), {
        bookingStatus: 'overdue',
        overdueFine: fineAmount,
        totalAmount:
          booking.subtotal + booking.deliveryFee + booking.deposit + fineAmount + booking.damageFine,
      });
      await syncAvailabilitySlotStatus(booking.id, 'overdue');

      if (fineAmount > 0) {
        await addDoc(collection(db, 'transactions'), {
          tenantId: booking.tenantId,
          bookingId: booking.id,
          type: 'overdue_fine',
          category: 'revenue',
          amount: fineAmount,
          paymentMethod: 'cash',
          notes: `Overdue fine assessed for ${booking.invoiceNumber}`,
          verifiedBy: userProfile.uid,
          createdAt: Timestamp.now(),
        });
      }

      await queryClient.invalidateQueries({ queryKey: ['inspections'] });
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success(`Booking flagged OVERDUE and fine recorded.`);
    } catch (error) {
      console.error('Overdue update error:', error);
      toast.error('Failed to apply overdue fine.');
    }
  };

  const handleCleanReturn = async (booking: Booking) => {
    if (!db || !userProfile) return;
    try {
      await updateDoc(doc(db, 'bookings', booking.id), {
        bookingStatus: 'completed',
        paymentStatus: 'refunded',
      });
      await syncAvailabilitySlotStatus(booking.id, 'completed');

      for (const item of booking.items) {
        await updateDoc(doc(db, 'equipment_units', item.unitId), {
          status: 'available',
          lastCheckedAt: Timestamp.now(),
        });
      }

      // Refund full security deposit from Liability account
      if (booking.deposit > 0) {
        await addDoc(collection(db, 'transactions'), {
          tenantId: booking.tenantId,
          bookingId: booking.id,
          type: 'deposit_refund',
          category: 'liability',
          amount: booking.deposit,
          paymentMethod: 'bank_transfer',
          notes: `Clean return deposit refund for ${booking.invoiceNumber}`,
          verifiedBy: userProfile.uid,
          createdAt: Timestamp.now(),
        });
      }

      await queryClient.invalidateQueries({ queryKey: ['inspections'] });
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['equipment_units'] });
      toast.success(
        `${booking.invoiceNumber} completed. Units returned to available & deposit refunded.`
      );
    } catch (error) {
      console.error('Clean return error:', error);
      toast.error('Failed to complete clean return.');
    }
  };

  const handleSubmitDamageReport = async () => {
    if (!db || !userProfile || !damageTarget || !damageUnitId) {
      toast.error('Select the damaged physical unit.');
      return;
    }

    const repairCost = Math.max(0, Number(damageRepairCost));
    const deductedFromDeposit = Math.min(repairCost, damageTarget.deposit);
    const extraFineAmount = Math.max(0, repairCost - damageTarget.deposit);
    const remainingDepositRefund = Math.max(0, damageTarget.deposit - deductedFromDeposit);
    const evidencePhotos = damagePhotosText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await addDoc(collection(db, 'damage_reports'), {
        bookingId: damageTarget.id,
        unitId: damageUnitId,
        tenantId: damageTarget.tenantId,
        reportedBy: userProfile.uid,
        severity: damageSeverity,
        description: damageDesc.trim() || 'Post-rental equipment damage assessed.',
        evidencePhotos,
        repairCost,
        deductedFromDeposit,
        extraFineAmount,
        status: 'open',
        createdAt: Timestamp.now(),
      });

      // Set damaged unit to maintenance & damaged; return unaffected units to available
      for (const item of damageTarget.items) {
        await updateDoc(doc(db, 'equipment_units', item.unitId), {
          status: item.unitId === damageUnitId ? 'maintenance' : 'available',
          ...(item.unitId === damageUnitId ? { condition: 'damaged' } : {}),
          lastCheckedAt: Timestamp.now(),
        });
      }

      await updateDoc(doc(db, 'bookings', damageTarget.id), {
        damageFine: repairCost,
        bookingStatus: 'completed',
        totalAmount:
          damageTarget.subtotal +
          damageTarget.deliveryFee +
          damageTarget.deposit +
          damageTarget.overdueFine +
          extraFineAmount,
      });
      await syncAvailabilitySlotStatus(damageTarget.id, 'completed');

      // Ledger: Damage Fine (Revenue) + Remaining Deposit Refund (Liability)
      if (repairCost > 0) {
        await addDoc(collection(db, 'transactions'), {
          tenantId: damageTarget.tenantId,
          bookingId: damageTarget.id,
          type: 'damage_fine',
          category: 'revenue',
          amount: repairCost,
          paymentMethod: 'bank_transfer',
          notes: `Damage fine (${damageSeverity}) for ${damageTarget.invoiceNumber} — Deducted Rp ${deductedFromDeposit}, Extra Rp ${extraFineAmount}`,
          verifiedBy: userProfile.uid,
          createdAt: Timestamp.now(),
        });
      }

      if (remainingDepositRefund > 0) {
        await addDoc(collection(db, 'transactions'), {
          tenantId: damageTarget.tenantId,
          bookingId: damageTarget.id,
          type: 'deposit_refund',
          category: 'liability',
          amount: remainingDepositRefund,
          paymentMethod: 'bank_transfer',
          notes: `Partial deposit refund after damage deduction (${damageTarget.invoiceNumber})`,
          verifiedBy: userProfile.uid,
          createdAt: Timestamp.now(),
        });
      }

      await queryClient.invalidateQueries({ queryKey: ['inspections'] });
      await queryClient.invalidateQueries({ queryKey: ['damage_reports'] });
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['equipment_units'] });
      toast.success('Damage report filed, unit moved to maintenance, and ledger updated.');
      setDamageTarget(null);
      setDamageDesc('');
    } catch (error) {
      console.error('Damage report error:', error);
      toast.error('Failed to file damage report.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="border-b border-zinc-200 pb-4">
        <h2 className="text-base font-semibold tracking-tight text-zinc-950">
          Pre-Rental &amp; Post-Rental Inspections
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Document physical unit condition before dispatch, monitor overdue grace windows (
          {activeTenant.overdueGraceMinutes}m grace / {activeTenant.overdueHourlyRatePercent}% per
          late hour), and process damage deductions.
        </p>
      </div>

      <Tabs defaultValue="pre">
        <TabsList>
          <TabsTrigger value="pre">Pre-Rental Handover ({preRentalBookings.length})</TabsTrigger>
          <TabsTrigger value="post">
            Post-Rental Return &amp; Overdue ({postRentalBookings.length})
          </TabsTrigger>
          <TabsTrigger value="reports">Damage Reports ({damageReports.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pre" className="space-y-3">
          {isLoading ? (
            <div className="rounded-md border border-zinc-200 bg-white p-8 text-center font-mono text-xs text-zinc-400">
              LOADING HANDOVER QUEUE...
            </div>
          ) : preRentalBookings.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="No confirmed bookings awaiting handover"
              description="Once payment is verified in Bookings, reservations appear here for pre-rental inspection."
            />
          ) : (
            preRentalBookings.map((booking) => (
              <Card key={booking.id} className="shadow-none">
                <CardHeader className="border-b border-zinc-100 pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CardTitle className="font-mono text-sm">{booking.invoiceNumber}</CardTitle>
                      <StatusBadge status={booking.bookingStatus} />
                      {booking.preRentalChecklist?.confirmedByUserAt ? (
                        <StatusBadge status="verified" label="Renter Confirmed" />
                      ) : booking.preRentalChecklist ? (
                        <StatusBadge status="pending" label="Awaiting Renter Sign-Off" />
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        setHandoverTarget(booking);
                        setHandoverNotes(
                          booking.preRentalChecklist?.notes ??
                            'Sensor clean, shutter count verified, batteries 100%, optical elements clear.'
                        );
                        setHandoverPhotosText(
                          (booking.preRentalChecklist?.photos ?? []).join('\n')
                        );
                      }}
                    >
                      <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Inspect &amp; Dispatch
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-3 text-xs">
                  <div className="flex flex-wrap gap-1.5">
                    {booking.items.map((item) => (
                      <div key={item.unitId} className="flex items-center gap-1.5">
                        <span className="text-zinc-700">{item.equipmentName}</span>
                        <SerialNumberTag serialNumber={item.serialNumber} />
                      </div>
                    ))}
                  </div>
                  <span className="font-mono text-[11px] text-zinc-500">
                    Start: {formatDateTime(booking.startDate)}
                  </span>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="post" className="space-y-3">
          {postRentalBookings.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No active rentals awaiting return"
              description="Dispatched bookings in active_rent or overdue will appear here for return inspection."
            />
          ) : (
            postRentalBookings.map((booking) => {
              const overdue = calculateOverdueFine(booking, activeTenant);

              return (
                <Card
                  key={booking.id}
                  className={`shadow-none ${overdue.isOverdue ? 'border-red-200' : ''}`}
                >
                  <CardHeader className="border-b border-zinc-100 pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CardTitle className="font-mono text-sm">
                          {booking.invoiceNumber}
                        </CardTitle>
                        <StatusBadge
                          status={overdue.isOverdue ? 'overdue' : booking.bookingStatus}
                        />
                        {booking.membershipTier === 'premium' ? (
                          <MembershipBadge tier="premium" />
                        ) : null}
                        {overdue.isOverdue ? (
                          <span className="font-mono text-[11px] font-medium text-red-700">
                            +{overdue.billableLateHours}h late · Est. Fine{' '}
                            <CurrencyText amount={overdue.estimatedFine} />
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {overdue.isOverdue && booking.bookingStatus !== 'overdue' ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() =>
                              void handleApplyOverdueFine(booking, overdue.estimatedFine)
                            }
                          >
                            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} />
                            Flag Overdue &amp; Post Fine
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDamageTarget(booking);
                            setDamageUnitId(booking.items[0]?.unitId ?? '');
                            setDamageRepairCost(500000);
                          }}
                        >
                          <ShieldAlert className="h-3.5 w-3.5 text-red-600" strokeWidth={1.5} />
                          Report Damage
                        </Button>
                        <Button size="sm" onClick={() => void handleCleanReturn(booking)}>
                          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                          Clean Return &amp; Refund
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-4 pt-3 text-xs md:grid-cols-2">
                    <div className="rounded border border-zinc-200 bg-zinc-50 p-3">
                      <p className="font-mono text-[10px] uppercase text-zinc-400">
                        Pre-Rental Baseline
                      </p>
                      <p className="mt-1 text-zinc-700">
                        {booking.preRentalChecklist?.notes ?? 'No baseline notes recorded.'}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {booking.items.map((item) => (
                          <SerialNumberTag key={item.unitId} serialNumber={item.serialNumber} />
                        ))}
                      </div>
                    </div>
                    <div className="rounded border border-zinc-200 bg-white p-3 font-mono text-[11px] space-y-1">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">DUE RETURN</span>
                        <span>{formatDateTime(booking.endDate)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">
                          GRACE DEADLINE ({overdue.effectiveGraceMinutes}m)
                        </span>
                        <span>{formatDateTime(overdue.graceDeadline)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">DEPOSIT HELD</span>
                        <CurrencyText amount={booking.deposit} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="reports" className="space-y-3">
          {damageReports.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="No damage incidents filed"
              description="Post-rental damage assessments and deposit deductions are logged here."
            />
          ) : (
            damageReports.map((rep) => (
              <Card key={rep.id} className="shadow-none">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status="damaged" label={rep.severity.toUpperCase()} />
                      <span className="font-mono text-[11px] text-zinc-500">
                        Booking: {rep.bookingId}
                      </span>
                    </div>
                    <p className="mt-1.5 text-zinc-800">{rep.description}</p>
                  </div>
                  <div className="text-right font-mono text-[11px]">
                    <p className="font-semibold text-zinc-950">
                      Repair: <CurrencyText amount={rep.repairCost} />
                    </p>
                    <p className="text-zinc-500">
                      From Deposit: <CurrencyText amount={rep.deductedFromDeposit} />
                    </p>
                    {rep.extraFineAmount > 0 ? (
                      <p className="text-red-700">
                        Extra Fine: <CurrencyText amount={rep.extraFineAmount} />
                      </p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Pre-Rental Handover Modal */}
      <Dialog open={Boolean(handoverTarget)} onOpenChange={(o) => !o && setHandoverTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pre-Rental Handover — {handoverTarget?.invoiceNumber}</DialogTitle>
            <DialogDescription>
              Log baseline gear condition before handing over serialized equipment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Handover Condition Notes &amp; Accessories Check</Label>
              <Textarea
                value={handoverNotes}
                onChange={(e) => setHandoverNotes(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Handover Photo URLs (one per line, optional)</Label>
              <Textarea
                placeholder="https://..."
                value={handoverPhotosText}
                onChange={(e) => setHandoverPhotosText(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => void handleSavePreRentalChecklist(false)}>
              Save Checklist Only
            </Button>
            <Button onClick={() => void handleSavePreRentalChecklist(true)}>
              Save &amp; Start Active Rent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post-Rental Damage Assessment Modal */}
      <Dialog open={Boolean(damageTarget)} onOpenChange={(o) => !o && setDamageTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Post-Rental Damage Assessment</DialogTitle>
            <DialogDescription>
              {damageTarget?.invoiceNumber} · Deposit held:{' '}
              <CurrencyText amount={damageTarget?.deposit ?? 0} />
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Affected Physical Unit (SN)</Label>
              <Select value={damageUnitId} onValueChange={setDamageUnitId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select unit..." />
                </SelectTrigger>
                <SelectContent>
                  {damageTarget?.items.map((item) => (
                    <SelectItem key={item.unitId} value={item.unitId}>
                      {item.equipmentName} ({item.serialNumber})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Severity</Label>
                <Select
                  value={damageSeverity}
                  onValueChange={(v) => setDamageSeverity(v as DamageReport['severity'])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minor">Minor</SelectItem>
                    <SelectItem value="major">Major</SelectItem>
                    <SelectItem value="total_loss">Total Loss</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Repair Cost (IDR)</Label>
                <Input
                  type="number"
                  className="font-mono"
                  value={damageRepairCost}
                  onChange={(e) => setDamageRepairCost(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2.5 font-mono text-[11px] space-y-1">
              <div className="flex justify-between">
                <span className="text-zinc-500">DEDUCTED FROM DEPOSIT</span>
                <CurrencyText
                  amount={Math.min(damageRepairCost, damageTarget?.deposit ?? 0)}
                />
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">EXTRA FINE BILLABLE</span>
                <CurrencyText
                  amount={Math.max(0, damageRepairCost - (damageTarget?.deposit ?? 0))}
                  className="text-red-700"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Damage Description</Label>
              <Textarea
                placeholder="e.g., Front optical element scratch on RF 24-70mm f/2.8L..."
                value={damageDesc}
                onChange={(e) => setDamageDesc(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Evidence Photo URLs (optional, one per line)</Label>
              <Textarea
                placeholder="https://..."
                value={damagePhotosText}
                onChange={(e) => setDamagePhotosText(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDamageTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleSubmitDamageReport()}>
              Log Damage &amp; Move Unit to Maintenance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

