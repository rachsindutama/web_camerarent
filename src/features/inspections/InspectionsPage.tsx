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
  FileDown,
  ShieldAlert,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { syncAvailabilitySlotStatus } from '@/lib/availability';
import { generateHandoverPdf } from '@/lib/handoverPdf';
import { formatDateTime } from '@/lib/utils';
import { calculateOverdueFine } from '@/hooks/useOverdueCalc';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
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
import type { Booking, DamageReport, UserProfile } from '@/types/schema';

export function InspectionsPage() {
  const { tx } = useI18n();
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const { activeTenantId, activeTenant, isAllTenants, tenantById } = useTenant();

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
    queryKey: ['inspections', 'bookings', isAllTenants ? 'all' : activeTenantId],
    enabled: Boolean(db && (isAllTenants || activeTenantId)),
    queryFn: async () => {
      if (!db || (!isAllTenants && !activeTenantId)) return [];
      const q = isAllTenants
        ? collection(db, 'bookings')
        : query(collection(db, 'bookings'), where('tenantId', '==', activeTenantId));
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Booking)
        .filter((b) =>
          ['confirmed', 'active_rent', 'overdue'].includes(b.bookingStatus)
        )
        .sort((a, b) => a.startDate.toMillis() - b.startDate.toMillis());
    },
  });

  const { data: rentersById = {} } = useQuery<Record<string, UserProfile>>({
    queryKey: ['inspections-users'],
    enabled: Boolean(db),
    staleTime: 60_000,
    queryFn: async () => {
      if (!db) return {};
      const snap = await getDocs(collection(db, 'users'));
      const map: Record<string, UserProfile> = {};
      snap.docs.forEach((d) => {
        map[d.id] = { uid: d.id, ...d.data() } as UserProfile;
      });
      return map;
    },
  });

  const { data: damageReports = [] } = useQuery<DamageReport[]>({
    queryKey: ['damage_reports', isAllTenants ? 'all' : activeTenantId],
    enabled: Boolean(db && (isAllTenants || activeTenantId)),
    queryFn: async () => {
      if (!db || (!isAllTenants && !activeTenantId)) return [];
      const q = isAllTenants
        ? collection(db, 'damage_reports')
        : query(collection(db, 'damage_reports'), where('tenantId', '==', activeTenantId));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DamageReport);
    },
  });

  if (!isAllTenants && (!activeTenantId || !activeTenant)) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title={tx('No active rental branch selected', 'Belum ada cabang aktif')}
        description={tx(
          'Select a tenant branch to perform pre-rental and post-rental inspections.',
          'Pilih cabang rental untuk melakukan inspeksi pra-sewa dan pasca-sewa.'
        )}
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
        ...(dispatchActiveRent
          ? { bookingStatus: 'active_rent', dispatchedAt: Timestamp.now() }
          : {}),
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
          ? tx(
              `${handoverTarget.invoiceNumber} dispatched to Active Rent.`,
              `${handoverTarget.invoiceNumber} diserahkan ke status Active Rent.`
            )
          : tx(
              `Handover checklist saved for ${handoverTarget.invoiceNumber}.`,
              `Checklist serah terima disimpan untuk ${handoverTarget.invoiceNumber}.`
            )
      );
      setHandoverTarget(null);
    } catch (error) {
      console.error('Pre-rental handover error:', error);
      toast.error(
        tx('Failed to update pre-rental checklist.', 'Gagal memperbarui checklist serah terima.')
      );
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
      toast.success(
        tx('Booking flagged OVERDUE and fine recorded.', 'Booking ditandai OVERDUE dan denda tercatat.')
      );
    } catch (error) {
      console.error('Overdue update error:', error);
      toast.error(tx('Failed to apply overdue fine.', 'Gagal menerapkan denda keterlambatan.'));
    }
  };

  const handleCleanReturn = async (booking: Booking) => {
    const bookingTenant = tenantById[booking.tenantId] ?? activeTenant;
    if (!db || !userProfile || !bookingTenant) return;
    try {
      const now = new Date();
      const overdueCalc = calculateOverdueFine(booking, bookingTenant, now);
      // Auto-assess overdue fine on return if past grace period and not already posted
      const newlyAssessedOverdue =
        overdueCalc.isOverdue && booking.overdueFine === 0 ? overdueCalc.estimatedFine : 0;
      const finalOverdueFine = Math.max(booking.overdueFine, newlyAssessedOverdue);

      const deductedForOverdue = Math.min(finalOverdueFine, booking.deposit);
      const extraOverdueDue = Math.max(0, finalOverdueFine - booking.deposit);
      const netDepositRefund = Math.max(0, booking.deposit - deductedForOverdue);

      const returnNote =
        finalOverdueFine > 0
          ? `Dikembalikan terlambat (${overdueCalc.billableLateHours} jam lewat grace period) — denda overdue Rp ${finalOverdueFine.toLocaleString('id-ID')} (potong deposit Rp ${deductedForOverdue.toLocaleString('id-ID')}, refund sisa Rp ${netDepositRefund.toLocaleString('id-ID')}).`
          : 'Clean return verified — unit kembali tepat waktu dalam kondisi baik & deposit direfund penuh.';

      await updateDoc(doc(db, 'bookings', booking.id), {
        bookingStatus: 'completed',
        paymentStatus: netDepositRefund > 0 ? 'refunded' : 'paid',
        overdueFine: finalOverdueFine,
        totalAmount:
          booking.subtotal +
          booking.deliveryFee +
          booking.deposit +
          booking.damageFine +
          extraOverdueDue,
        returnedAt: Timestamp.fromDate(now),
        returnNotes: returnNote,
      });
      await syncAvailabilitySlotStatus(booking.id, 'completed');

      for (const item of booking.items) {
        await updateDoc(doc(db, 'equipment_units', item.unitId), {
          status: 'available',
          lastCheckedAt: Timestamp.now(),
        });
      }

      // Post newly assessed overdue fine to Revenue ledger if not already posted
      if (newlyAssessedOverdue > 0) {
        await addDoc(collection(db, 'transactions'), {
          tenantId: booking.tenantId,
          bookingId: booking.id,
          type: 'overdue_fine',
          category: 'revenue',
          amount: newlyAssessedOverdue,
          paymentMethod: 'bank_transfer',
          notes: `Auto overdue fine on return (${overdueCalc.billableLateHours}h late) for ${booking.invoiceNumber}`,
          verifiedBy: userProfile.uid,
          createdAt: Timestamp.now(),
        });
      }

      // Clear full deposit liability (forfeited toward overdue + remaining refunded)
      if (deductedForOverdue > 0) {
        await addDoc(collection(db, 'transactions'), {
          tenantId: booking.tenantId,
          bookingId: booking.id,
          type: 'deposit_refund',
          category: 'liability',
          amount: deductedForOverdue,
          paymentMethod: 'bank_transfer',
          notes: `Deposit applied to overdue fine (${booking.invoiceNumber})`,
          verifiedBy: userProfile.uid,
          createdAt: Timestamp.now(),
        });
      }

      if (netDepositRefund > 0) {
        await addDoc(collection(db, 'transactions'), {
          tenantId: booking.tenantId,
          bookingId: booking.id,
          type: 'deposit_refund',
          category: 'liability',
          amount: netDepositRefund,
          paymentMethod: 'bank_transfer',
          notes:
            deductedForOverdue > 0
              ? `Remaining deposit refund after overdue deduction (${booking.invoiceNumber})`
              : `Clean return deposit refund for ${booking.invoiceNumber}`,
          verifiedBy: userProfile.uid,
          createdAt: Timestamp.now(),
        });
      }

      await queryClient.invalidateQueries({ queryKey: ['inspections'] });
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['equipment_units'] });
      toast.success(
        finalOverdueFine > 0
          ? tx(
              `${booking.invoiceNumber} completed with overdue fine Rp ${finalOverdueFine.toLocaleString('id-ID')} posted to Cash Flow.`,
              `${booking.invoiceNumber} selesai dengan denda telat Rp ${finalOverdueFine.toLocaleString('id-ID')} & tercatat ke Cash Flow.`
            )
          : tx(
              `${booking.invoiceNumber} completed. Units returned to available & deposit refunded.`,
              `${booking.invoiceNumber} selesai. Unit kembali tersedia & deposit direfund.`
            )
      );
    } catch (error) {
      console.error('Clean return error:', error);
      toast.error(tx('Failed to complete clean return.', 'Gagal menyelesaikan pengembalian.'));
    }
  };

  const handleSubmitDamageReport = async () => {
    if (!db || !userProfile || !damageTarget || !damageUnitId) {
      toast.error(tx('Select the damaged physical unit.', 'Pilih unit fisik yang mengalami kerusakan.'));
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
        returnedAt: Timestamp.now(),
        returnNotes: `Dikembalikan dengan laporan kerusakan (${damageSeverity}) — biaya perbaikan Rp ${repairCost.toLocaleString('id-ID')}.`,
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

      // Clear full deposit liability (portion applied to repair + portion refunded) so Liability Held balances to 0
      if (deductedFromDeposit > 0) {
        await addDoc(collection(db, 'transactions'), {
          tenantId: damageTarget.tenantId,
          bookingId: damageTarget.id,
          type: 'deposit_refund',
          category: 'liability',
          amount: deductedFromDeposit,
          paymentMethod: 'bank_transfer',
          notes: `Deposit forfeited to cover damage fine (${damageTarget.invoiceNumber})`,
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
      toast.success(
        tx(
          'Damage report filed, unit moved to maintenance, and ledger updated.',
          'Laporan kerusakan dicatat, unit dipindah ke maintenance, dan ledger diperbarui.'
        )
      );
      setDamageTarget(null);
      setDamageDesc('');
    } catch (error) {
      console.error('Damage report error:', error);
      toast.error(tx('Failed to file damage report.', 'Gagal mencatat laporan kerusakan.'));
    }
  };

  return (
    <div className="space-y-5">
      <div className="border-b border-zinc-200 pb-4">
        <h2 className="text-base font-semibold tracking-tight text-zinc-950">
          {tx('Pre-Rental & Post-Rental Inspections', 'Inspeksi Pra-Sewa & Pasca-Sewa')}
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          {isAllTenants
            ? tx(
                'All Branches — handover documentation, overdue grace period monitoring, and damage reports.',
                'Semua Cabang — dokumentasi serah terima, pemantauan grace period overdue, dan laporan kerusakan.'
              )
            : tx(
                `Document physical unit condition before dispatch, monitor overdue grace windows (${activeTenant?.overdueGraceMinutes ?? 60}m grace / ${activeTenant?.overdueHourlyRatePercent ?? 10}% per late hour), and process damage deductions.`,
                `Dokumentasikan kondisi unit fisik sebelum serah terima, pantau batas grace period (${activeTenant?.overdueGraceMinutes ?? 60} menit / ${activeTenant?.overdueHourlyRatePercent ?? 10}% per jam telat), dan proses potongan kerusakan.`
              )}
        </p>
      </div>

      <Tabs defaultValue="pre">
        <TabsList>
          <TabsTrigger value="pre">
            {tx('Pre-Rental Handover', 'Serah Terima Pra-Sewa')} ({preRentalBookings.length})
          </TabsTrigger>
          <TabsTrigger value="post">
            {tx('Post-Rental Return & Overdue', 'Pengembalian & Overdue')} ({postRentalBookings.length})
          </TabsTrigger>
          <TabsTrigger value="reports">
            {tx('Damage Reports', 'Laporan Kerusakan')} ({damageReports.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pre" className="space-y-3">
          {isLoading ? (
            <div className="rounded-md border border-zinc-200 bg-white p-8 text-center font-mono text-xs text-zinc-400">
              {tx('LOADING HANDOVER QUEUE...', 'MEMUAT ANTRIAN SERAH TERIMA...')}
            </div>
          ) : preRentalBookings.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title={tx('No confirmed bookings awaiting handover', 'Tidak ada booking menunggu serah terima')}
              description={tx(
                'Once payment is verified in Bookings, reservations appear here for pre-rental inspection.',
                'Setelah pembayaran diverifikasi di menu Booking, reservasi akan muncul di sini untuk inspeksi pra-sewa.'
              )}
            />
          ) : (
            preRentalBookings.map((booking) => {
              const renter = rentersById[booking.userId] ?? null;
              return (
              <Card key={booking.id} className="shadow-none">
                <CardHeader className="border-b border-zinc-100 pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="font-mono text-sm">{booking.invoiceNumber}</CardTitle>
                      {renter ? (
                        <span className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-800">
                          <User className="h-3 w-3 text-zinc-400" strokeWidth={1.5} />
                          {renter.displayName}
                          {renter.phone ? (
                            <span className="font-mono text-[10px] text-zinc-500">
                              · {renter.phone}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                      <StatusBadge status={booking.bookingStatus} />
                      {booking.preRentalChecklist?.confirmedByUserAt ? (
                        <StatusBadge
                          status="verified"
                          label={tx('Renter Confirmed', 'Dikonfirmasi Penyewa')}
                        />
                      ) : booking.preRentalChecklist ? (
                        <StatusBadge
                          status="pending"
                          label={tx('Awaiting Renter Sign-Off', 'Menunggu Konfirmasi Penyewa')}
                        />
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void generateHandoverPdf({
                            booking,
                            tenant: tenantById[booking.tenantId] ?? activeTenant,
                            renter,
                          })
                        }
                      >
                        <FileDown className="h-3.5 w-3.5" strokeWidth={1.5} />
                        {tx('BAST PNG', 'BAST PNG')}
                      </Button>
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
                        {tx('Inspect & Dispatch', 'Inspeksi & Serahkan')}
                      </Button>
                    </div>
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
                    {tx('Start:', 'Mulai:')} {formatDateTime(booking.startDate)}
                  </span>
                </CardContent>
              </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="post" className="space-y-3">
          {postRentalBookings.length === 0 ? (
            <EmptyState
              icon={Clock}
              title={tx('No active rentals awaiting return', 'Tidak ada sewa aktif menunggu kembali')}
              description={tx(
                'Dispatched bookings in active rent or overdue will appear here for return inspection.',
                'Booking yang sedang disewa atau terlambat akan tampil di sini untuk inspeksi pengembalian.'
              )}
            />
          ) : (
            postRentalBookings.map((booking) => {
              const bookingTenant = tenantById[booking.tenantId] ?? activeTenant;
              const overdue = calculateOverdueFine(booking, bookingTenant);
              const renter = rentersById[booking.userId] ?? null;

              return (
                <Card
                  key={booking.id}
                  className={`shadow-none ${overdue.isOverdue ? 'border-red-200' : ''}`}
                >
                  <CardHeader className="border-b border-zinc-100 pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="font-mono text-sm">
                          {booking.invoiceNumber}
                        </CardTitle>
                        {renter ? (
                          <span className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-800">
                            <User className="h-3 w-3 text-zinc-400" strokeWidth={1.5} />
                            {renter.displayName}
                            {renter.phone ? (
                              <span className="font-mono text-[10px] text-zinc-500">
                                · {renter.phone}
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                        {isAllTenants && bookingTenant ? (
                          <span className="rounded bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                            {bookingTenant.name}
                          </span>
                        ) : null}
                        <StatusBadge
                          status={overdue.isOverdue ? 'overdue' : booking.bookingStatus}
                        />
                        {booking.membershipTier === 'premium' ? (
                          <MembershipBadge tier="premium" />
                        ) : null}
                        {overdue.isOverdue ? (
                          <span className="font-mono text-[11px] font-medium text-red-700">
                            +{overdue.billableLateHours}h {tx('late · Est. Fine', 'telat · Est. Denda')}{' '}
                            <CurrencyText amount={overdue.estimatedFine} />
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void generateHandoverPdf({
                              booking,
                              tenant: bookingTenant,
                              renter,
                            })
                          }
                        >
                          <FileDown className="h-3.5 w-3.5" strokeWidth={1.5} />
                          BAST PNG
                        </Button>
                        {overdue.isOverdue && booking.bookingStatus !== 'overdue' ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() =>
                              void handleApplyOverdueFine(booking, overdue.estimatedFine)
                            }
                          >
                            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} />
                            {tx('Flag Overdue & Post Fine', 'Tandai Overdue & Catat Denda')}
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
                          {tx('Report Damage', 'Laporkan Kerusakan')}
                        </Button>
                        <Button size="sm" onClick={() => void handleCleanReturn(booking)}>
                          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                          {overdue.isOverdue && booking.overdueFine === 0
                            ? tx('Return + Overdue Fine', 'Kembali + Denda Telat')
                            : tx('Clean Return & Refund', 'Kembali Baik & Refund')}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-4 pt-3 text-xs md:grid-cols-2">
                    <div className="rounded border border-zinc-200 bg-zinc-50 p-3">
                      <p className="font-mono text-[10px] uppercase text-zinc-400">
                        {tx('Pre-Rental Baseline', 'Catatan Awal Pra-Sewa')}
                      </p>
                      <p className="mt-1 text-zinc-700">
                        {booking.preRentalChecklist?.notes ??
                          tx('No baseline notes recorded.', 'Belum ada catatan baseline.')}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {booking.items.map((item) => (
                          <SerialNumberTag key={item.unitId} serialNumber={item.serialNumber} />
                        ))}
                      </div>
                    </div>
                    <div className="rounded border border-zinc-200 bg-white p-3 font-mono text-[11px] space-y-1">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">{tx('DUE RETURN', 'JADWAL KEMBALI')}</span>
                        <span>{formatDateTime(booking.endDate)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">
                          {tx('GRACE DEADLINE', 'BATAS GRACE')} ({overdue.effectiveGraceMinutes}m)
                        </span>
                        <span>{formatDateTime(overdue.graceDeadline)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">{tx('DEPOSIT HELD', 'DEPOSIT DITAHAN')}</span>
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
              title={tx('No damage incidents filed', 'Belum ada laporan kerusakan')}
              description={tx(
                'Post-rental damage assessments and deposit deductions are logged here.',
                'Penilaian kerusakan pasca-sewa dan pemotongan deposit dicatat di sini.'
              )}
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
                      {tx('Repair:', 'Perbaikan:')} <CurrencyText amount={rep.repairCost} />
                    </p>
                    <p className="text-zinc-500">
                      {tx('From Deposit:', 'Potong Deposit:')}{' '}
                      <CurrencyText amount={rep.deductedFromDeposit} />
                    </p>
                    {rep.extraFineAmount > 0 ? (
                      <p className="text-red-700">
                        {tx('Extra Fine:', 'Denda Tambahan:')}{' '}
                        <CurrencyText amount={rep.extraFineAmount} />
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
            <DialogTitle>
              {tx('Pre-Rental Handover', 'Serah Terima Pra-Sewa')} — {handoverTarget?.invoiceNumber}
            </DialogTitle>
            <DialogDescription>
              {tx(
                'Log baseline gear condition before handing over serialized equipment.',
                'Catat kondisi awal perangkat sebelum menyerahkan unit bernomor seri.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>
                {tx('Handover Condition Notes & Accessories Check', 'Catatan Kondisi & Kelengkapan Aksesoris')}
              </Label>
              <Textarea
                value={handoverNotes}
                onChange={(e) => setHandoverNotes(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>
                {tx('Handover Photo URLs (one per line, optional)', 'URL Foto Serah Terima (satu per baris, opsional)')}
              </Label>
              <Textarea
                placeholder="https://..."
                value={handoverPhotosText}
                onChange={(e) => setHandoverPhotosText(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => void handleSavePreRentalChecklist(false)}>
              {tx('Save Checklist Only', 'Simpan Checklist Saja')}
            </Button>
            <Button onClick={() => void handleSavePreRentalChecklist(true)}>
              {tx('Save & Start Active Rent', 'Simpan & Mulai Masa Sewa')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post-Rental Damage Assessment Modal */}
      <Dialog open={Boolean(damageTarget)} onOpenChange={(o) => !o && setDamageTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tx('Post-Rental Damage Assessment', 'Penilaian Kerusakan Pasca-Sewa')}</DialogTitle>
            <DialogDescription>
              {damageTarget?.invoiceNumber} · {tx('Deposit held:', 'Deposit ditahan:')}{' '}
              <CurrencyText amount={damageTarget?.deposit ?? 0} />
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{tx('Affected Physical Unit (SN)', 'Unit Fisik Terdampak (SN)')}</Label>
              <Select value={damageUnitId} onValueChange={setDamageUnitId}>
                <SelectTrigger>
                  <SelectValue placeholder={tx('Select unit...', 'Pilih unit...')} />
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
                <Label>{tx('Severity', 'Tingkat Kerusakan')}</Label>
                <Select
                  value={damageSeverity}
                  onValueChange={(v) => setDamageSeverity(v as DamageReport['severity'])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minor">{tx('Minor', 'Ringan')}</SelectItem>
                    <SelectItem value="major">{tx('Major', 'Berat')}</SelectItem>
                    <SelectItem value="total_loss">{tx('Total Loss', 'Hilang / Rusak Total')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{tx('Repair Cost (IDR)', 'Biaya Perbaikan (IDR)')}</Label>
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
                <span className="text-zinc-500">
                  {tx('DEDUCTED FROM DEPOSIT', 'DIPOTONG DARI DEPOSIT')}
                </span>
                <CurrencyText
                  amount={Math.min(damageRepairCost, damageTarget?.deposit ?? 0)}
                />
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">
                  {tx('EXTRA FINE BILLABLE', 'DENDA TAMBAHAN DITAGIH')}
                </span>
                <CurrencyText
                  amount={Math.max(0, damageRepairCost - (damageTarget?.deposit ?? 0))}
                  className="text-red-700"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>{tx('Damage Description', 'Deskripsi Kerusakan')}</Label>
              <Textarea
                placeholder={tx(
                  'e.g., Front optical element scratch on RF 24-70mm f/2.8L...',
                  'mis. Goresan elemen optik depan pada RF 24-70mm f/2.8L...'
                )}
                value={damageDesc}
                onChange={(e) => setDamageDesc(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>
                {tx('Evidence Photo URLs (optional, one per line)', 'URL Foto Bukti (opsional, satu per baris)')}
              </Label>
              <Textarea
                placeholder="https://..."
                value={damagePhotosText}
                onChange={(e) => setDamagePhotosText(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDamageTarget(null)}>
              {tx('Cancel', 'Batal')}
            </Button>
            <Button variant="destructive" onClick={() => void handleSubmitDamageReport()}>
              {tx('Log Damage & Move Unit to Maintenance', 'Catat Kerusakan & Pindah ke Maintenance')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

