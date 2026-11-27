import { useEffect, useMemo, useRef, useState } from 'react';
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
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Eye,
  FileDown,
  Search,
  ShieldAlert,
  Store,
  Truck,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { syncAvailabilitySlotStatus } from '@/lib/availability';
import { expireStalePendingBookings, getPaymentExpiryInfo } from '@/lib/bookingExpiry';
import { generateInvoicePdf } from '@/lib/invoicePdf';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { calculateOverdueFine } from '@/hooks/useOverdueCalc';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';
import { useTenant } from '@/hooks/useTenant';
import {
  applyOverdueFineOp,
  completeCleanReturnOp,
  savePreRentalChecklistOp,
  submitDamageReportOp,
} from '@/features/bookings/bookingInspectionOps';
import { BookingDetailModal } from '@/features/bookings/BookingDetailModal';
import { computeNextPaymentStatus, getBookingPaymentSummary } from '@/lib/bookingPayments';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { ImagePreviewModal } from '@/components/shared/ImagePreviewModal';
import { MembershipBadge } from '@/components/shared/MembershipBadge';
import { SerialNumberTag } from '@/components/shared/SerialNumberTag';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import type {
  Booking,
  BookingPayment,
  BookingStatus,
  DamageReport,
  UserProfile,
} from '@/types/schema';

const PAGE_SIZE = 10;

type BookingsTabFilter = 'all' | BookingStatus | 'damage_reports';

function formatCompactDate(ts: Timestamp): string {
  return ts.toDate().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPaymentLabel(
  status: Booking['paymentStatus'],
  tx: (en: string, id: string) => string
): string {
  switch (status) {
    case 'paid':
      return tx('Paid', 'Lunas');
    case 'partial_paid':
      return tx('Partially Paid', 'Dibayar Sebagian');
    case 'waiting_verification':
      return tx('Verifying Receipt', 'Cek Bukti');
    case 'refunded':
      return tx('Refunded', 'Refund');
    default:
      return tx('Unpaid', 'Belum Bayar');
  }
}

export function AdminBookingsPage() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const { tx } = useI18n();
  const { settings } = usePlatformSettings();
  const { activeTenantId, activeTenant, isAllTenants, tenantById } = useTenant();

  const [statusFilter, setStatusFilter] = useState<BookingsTabFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyPaymentId, setBusyPaymentId] = useState<string | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<{ url: string; label: string } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const expiredSweepIdsRef = useRef<Set<string>>(new Set());

  // Pre-rental handover dialog (triggered from Booking Detail Modal)
  const [handoverTarget, setHandoverTarget] = useState<Booking | null>(null);
  const [handoverNotes, setHandoverNotes] = useState(
    'Sensor clean, shutter count verified, all batteries charged 100%, lens elements scratch-free.'
  );
  const [handoverPhotosText, setHandoverPhotosText] = useState('');
  const [savingHandover, setSavingHandover] = useState(false);

  // Post-rental damage assessment dialog (triggered from Booking Detail Modal)
  const [damageTarget, setDamageTarget] = useState<Booking | null>(null);
  const [damageUnitId, setDamageUnitId] = useState('');
  const [damageSeverity, setDamageSeverity] = useState<DamageReport['severity']>('minor');
  const [damageDesc, setDamageDesc] = useState('');
  const [damageRepairCost, setDamageRepairCost] = useState(500000);
  const [damagePhotosText, setDamagePhotosText] = useState('');
  const [savingDamage, setSavingDamage] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const { data: rentersById = {} } = useQuery<Record<string, UserProfile>>({
    queryKey: ['admin-bookings', 'renters'],
    enabled: Boolean(db),
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

  const { data: bookings = [], isLoading } = useQuery<Booking[]>({
    queryKey: ['bookings', 'tenant', isAllTenants ? 'all' : activeTenantId],
    enabled: Boolean(db && (isAllTenants || activeTenantId)),
    queryFn: async () => {
      if (!db || (!isAllTenants && !activeTenantId)) return [];
      const q = isAllTenants
        ? collection(db, 'bookings')
        : query(collection(db, 'bookings'), where('tenantId', '==', activeTenantId));
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Booking)
        .sort(
          (a, b) =>
            b.startDate.toMillis() - a.startDate.toMillis() ||
            b.createdAt.toMillis() - a.createdAt.toMillis()
        );
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
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as DamageReport)
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    },
  });

  const bookingsById = useMemo(() => {
    const map: Record<string, Booking> = {};
    bookings.forEach((b) => {
      map[b.id] = b;
    });
    return map;
  }, [bookings]);

  useEffect(() => {
    const candidates = bookings.filter(
      (b) =>
        !expiredSweepIdsRef.current.has(b.id) &&
        getPaymentExpiryInfo(b, settings.paymentExpiryHours, nowMs).isExpired
    );
    if (candidates.length === 0) return;

    candidates.forEach((b) => expiredSweepIdsRef.current.add(b.id));
    void expireStalePendingBookings(candidates, settings.paymentExpiryHours, nowMs).then(
      async (expiredInvoices) => {
        if (expiredInvoices.length > 0) {
          await queryClient.invalidateQueries({ queryKey: ['bookings'] });
          await queryClient.invalidateQueries({ queryKey: ['availability'] });
          await queryClient.invalidateQueries({ queryKey: ['sidebar-badges'] });
          toast.info(
            tx(
              `${expiredInvoices.length} expired unpaid booking(s) auto-cancelled & units released (${expiredInvoices.join(', ')}).`,
              `${expiredInvoices.length} booking belum dibayar kedaluwarsa & unit dilepas otomatis (${expiredInvoices.join(', ')}).`
            )
          );
        }
      }
    );
  }, [bookings, nowMs, queryClient, settings.paymentExpiryHours, tx]);

  const counts = useMemo(() => {
    const map: Record<BookingStatus, number> = {
      pending_payment: 0,
      waiting_verification: 0,
      confirmed: 0,
      active_rent: 0,
      overdue: 0,
      completed: 0,
      cancelled: 0,
    };
    bookings.forEach((b) => {
      map[b.bookingStatus] = (map[b.bookingStatus] ?? 0) + 1;
    });
    return map;
  }, [bookings]);

  const filtered = useMemo(() => {
    if (statusFilter === 'damage_reports') return [];
    const q = search.trim().toLowerCase();
    return bookings.filter((b) => {
      if (statusFilter !== 'all' && b.bookingStatus !== statusFilter) return false;
      if (!q) return true;
      const renterName = rentersById[b.userId]?.displayName?.toLowerCase() ?? '';
      const branchName = tenantById[b.tenantId]?.name?.toLowerCase() ?? '';
      return (
        b.invoiceNumber.toLowerCase().includes(q) ||
        renterName.includes(q) ||
        branchName.includes(q) ||
        b.items.some(
          (i) =>
            i.equipmentName.toLowerCase().includes(q) || i.serialNumber.toLowerCase().includes(q)
        )
      );
    });
  }, [bookings, statusFilter, search, rentersById, tenantById]);

  const filteredDamageReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return damageReports;
    return damageReports.filter((rep) => {
      const b = bookingsById[rep.bookingId];
      const renterName = b ? rentersById[b.userId]?.displayName?.toLowerCase() ?? '' : '';
      return (
        rep.description.toLowerCase().includes(q) ||
        rep.severity.toLowerCase().includes(q) ||
        (b?.invoiceNumber ?? rep.bookingId).toLowerCase().includes(q) ||
        renterName.includes(q)
      );
    });
  }, [damageReports, search, bookingsById, rentersById]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (!isAllTenants && (!activeTenantId || !activeTenant)) {
    return (
      <EmptyState
        icon={CalendarClock}
        title={tx('No active rental branch selected', 'Belum ada cabang rental dipilih')}
        description={tx(
          'Select a tenant branch to manage incoming reservations & inspections.',
          'Pilih cabang untuk mengelola pemesanan & inspeksi.'
        )}
      />
    );
  }

  const invalidateAllBookingQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['bookings'] }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['equipment_units'] }),
      queryClient.invalidateQueries({ queryKey: ['availability'] }),
      queryClient.invalidateQueries({ queryKey: ['damage_reports'] }),
      queryClient.invalidateQueries({ queryKey: ['sidebar-badges'] }),
    ]);
  };

  const logVerifiedPaymentDelta = async (
    booking: Booking,
    prevVerifiedAmount: number,
    newVerifiedAmount: number,
    stageLabel: string,
    proofUrl?: string
  ) => {
    if (!db || !userProfile) return;
    const rentalPortion = booking.subtotal + booking.deliveryFee;
    const prevRentalCovered = Math.min(prevVerifiedAmount, rentalPortion);
    const newRentalCovered = Math.min(newVerifiedAmount, rentalPortion);
    const deltaRental = Math.max(0, newRentalCovered - prevRentalCovered);

    const prevDepositCovered = Math.max(0, prevVerifiedAmount - rentalPortion);
    const newDepositCovered = Math.min(
      booking.deposit,
      Math.max(0, newVerifiedAmount - rentalPortion)
    );
    const deltaDeposit = Math.max(0, newDepositCovered - prevDepositCovered);

    if (deltaRental > 0) {
      await addDoc(collection(db, 'transactions'), {
        tenantId: booking.tenantId,
        bookingId: booking.id,
        type: 'rental_income',
        category: 'revenue',
        amount: deltaRental,
        paymentMethod: 'bank_transfer',
        ...(proofUrl ? { proofUrl } : {}),
        notes: `${stageLabel} — ${booking.invoiceNumber}`,
        verifiedBy: userProfile.uid,
        createdAt: Timestamp.now(),
      });
    }

    if (deltaDeposit > 0) {
      await addDoc(collection(db, 'transactions'), {
        tenantId: booking.tenantId,
        bookingId: booking.id,
        type: 'deposit_in',
        category: 'liability',
        amount: deltaDeposit,
        paymentMethod: 'bank_transfer',
        ...(proofUrl ? { proofUrl } : {}),
        notes: `${stageLabel} (Deposit) — ${booking.invoiceNumber}`,
        verifiedBy: userProfile.uid,
        createdAt: Timestamp.now(),
      });
    }
  };

  const handleVerifyInstallment = async (booking: Booking, payment: BookingPayment) => {
    if (!db || !userProfile) return;
    setBusyPaymentId(payment.id);
    try {
      const prevSummary = getBookingPaymentSummary(booking);
      const nextPayments: BookingPayment[] = (booking.payments ?? []).map((p) =>
        p.id === payment.id
          ? {
              ...p,
              status: 'verified',
              verifiedAt: Timestamp.now(),
              verifiedBy: userProfile.uid,
            }
          : p
      );
      const newVerifiedAmount = nextPayments
        .filter((p) => p.status === 'verified')
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const nextPaymentStatus = computeNextPaymentStatus(booking.totalAmount, nextPayments);
      const isNowPaid = nextPaymentStatus === 'paid';

      await updateDoc(doc(db, 'bookings', booking.id), {
        payments: nextPayments,
        amountPaid: newVerifiedAmount,
        paymentStatus: nextPaymentStatus,
        ...(isNowPaid &&
        (booking.bookingStatus === 'pending_payment' ||
          booking.bookingStatus === 'waiting_verification')
          ? { bookingStatus: 'confirmed', paidAt: Timestamp.now() }
          : {}),
      });

      if (
        isNowPaid &&
        (booking.bookingStatus === 'pending_payment' ||
          booking.bookingStatus === 'waiting_verification')
      ) {
        await syncAvailabilitySlotStatus(booking.id, 'confirmed');
      }

      await logVerifiedPaymentDelta(
        booking,
        prevSummary.verifiedAmount,
        newVerifiedAmount,
        payment.stageName,
        payment.proofUrl
      );

      await invalidateAllBookingQueries();
      toast.success(
        isNowPaid
          ? tx(
              `${payment.stageName} verified — ${booking.invoiceNumber} is now Paid & Confirmed.`,
              `${payment.stageName} terverifikasi — ${booking.invoiceNumber} Lunas & Dikonfirmasi.`
            )
          : tx(
              `${payment.stageName} (Rp ${payment.amount.toLocaleString('id-ID')}) verified. Remaining Rp ${Math.max(0, booking.totalAmount - newVerifiedAmount).toLocaleString('id-ID')}.`,
              `${payment.stageName} (Rp ${payment.amount.toLocaleString('id-ID')}) terverifikasi. Sisa tagihan Rp ${Math.max(0, booking.totalAmount - newVerifiedAmount).toLocaleString('id-ID')}.`
            )
      );
    } catch (error) {
      console.error('Verify installment error:', error);
      toast.error(tx('Failed to verify installment.', 'Gagal memverifikasi termin pembayaran.'));
    } finally {
      setBusyPaymentId(null);
    }
  };

  const handleRejectInstallment = async (booking: Booking, payment: BookingPayment) => {
    if (!db || !userProfile) return;
    setBusyPaymentId(payment.id);
    try {
      const nextPayments: BookingPayment[] = (booking.payments ?? []).map((p) =>
        p.id === payment.id ? { ...p, status: 'rejected' } : p
      );
      const nextPaymentStatus = computeNextPaymentStatus(booking.totalAmount, nextPayments);
      await updateDoc(doc(db, 'bookings', booking.id), {
        payments: nextPayments,
        paymentStatus: nextPaymentStatus,
      });
      await invalidateAllBookingQueries();
      toast.info(
        tx(
          `${payment.stageName} marked as rejected. Renter can resubmit.`,
          `${payment.stageName} ditolak. Penyewa dapat mengunggah ulang.`
        )
      );
    } catch (error) {
      console.error('Reject installment error:', error);
      toast.error(tx('Failed to reject installment.', 'Gagal menolak bukti termin.'));
    } finally {
      setBusyPaymentId(null);
    }
  };

  const handleApprovePayment = async (booking: Booking) => {
    if (!db || !userProfile) return;
    setBusyId(booking.id);
    try {
      const prevSummary = getBookingPaymentSummary(booking);
      const nowTs = Timestamp.now();
      const updatedPayments: BookingPayment[] | undefined =
        booking.payments && booking.payments.length > 0
          ? booking.payments.map((p) =>
              p.status === 'waiting_verification'
                ? { ...p, status: 'verified', verifiedAt: nowTs, verifiedBy: userProfile.uid }
                : p
            )
          : undefined;

      await updateDoc(doc(db, 'bookings', booking.id), {
        paymentStatus: 'paid',
        bookingStatus: 'confirmed',
        amountPaid: booking.totalAmount,
        paidAt: nowTs,
        ...(updatedPayments ? { payments: updatedPayments } : {}),
      });
      await syncAvailabilitySlotStatus(booking.id, 'confirmed');

      await logVerifiedPaymentDelta(
        booking,
        prevSummary.verifiedAmount,
        booking.totalAmount,
        tx('Full Settlement', 'Pelunasan'),
        booking.paymentProofUrl
      );

      await invalidateAllBookingQueries();
      toast.success(
        tx(
          `${booking.invoiceNumber} confirmed. Revenue & Deposit Liability logged.`,
          `${booking.invoiceNumber} dikonfirmasi. Pendapatan & Deposit tercatat ke Buku Kas.`
        )
      );
    } catch (error) {
      console.error('Approve payment error:', error);
      toast.error(tx('Failed to verify payment.', 'Gagal memverifikasi pembayaran.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleCancelBooking = async (booking: Booking) => {
    if (!db) return;
    setBusyId(booking.id);
    try {
      await updateDoc(doc(db, 'bookings', booking.id), {
        bookingStatus: 'cancelled',
        cancelledAt: Timestamp.now(),
      });
      await syncAvailabilitySlotStatus(booking.id, 'cancelled');
      await invalidateAllBookingQueries();
      toast.success(
        tx(
          `${booking.invoiceNumber} cancelled. Serial units released.`,
          `${booking.invoiceNumber} dibatalkan. Unit SN dilepas kembali.`
        )
      );
    } catch (error) {
      console.error('Cancel booking error:', error);
      toast.error(tx('Failed to cancel booking.', 'Gagal membatalkan booking.'));
    } finally {
      setBusyId(null);
    }
  };

  const openPreRentalHandover = (booking: Booking) => {
    setHandoverTarget(booking);
    setHandoverNotes(
      booking.preRentalChecklist?.notes ??
        'Sensor clean, shutter count verified, all batteries charged 100%, optical elements clear.'
    );
    setHandoverPhotosText((booking.preRentalChecklist?.photos ?? []).join('\n'));
  };

  const handleSavePreRental = async (dispatchActiveRent: boolean) => {
    if (!handoverTarget) return;
    setSavingHandover(true);
    try {
      const photos = handoverPhotosText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      await savePreRentalChecklistOp(handoverTarget, {
        notes: handoverNotes,
        photos,
        dispatchActiveRent,
      });
      await invalidateAllBookingQueries();
      toast.success(
        dispatchActiveRent
          ? tx(
              `${handoverTarget.invoiceNumber} dispatched to Active Rent.`,
              `${handoverTarget.invoiceNumber} diserahkan ke status Sedang Disewa.`
            )
          : tx(
              `Pre-rental checklist saved for ${handoverTarget.invoiceNumber}.`,
              `Checklist pra-sewa disimpan untuk ${handoverTarget.invoiceNumber}.`
            )
      );
      setHandoverTarget(null);
    } catch (error) {
      console.error('Pre-rental handover error:', error);
      toast.error(
        tx('Failed to update pre-rental checklist.', 'Gagal memperbarui checklist serah terima.')
      );
    } finally {
      setSavingHandover(false);
    }
  };

  const handleApplyOverdueFine = async (booking: Booking, fineAmount: number) => {
    if (!userProfile) return;
    setBusyId(booking.id);
    try {
      await applyOverdueFineOp(booking, fineAmount, userProfile.uid);
      await invalidateAllBookingQueries();
      toast.success(
        tx('Booking flagged OVERDUE and fine recorded.', 'Booking ditandai OVERDUE dan denda tercatat.')
      );
    } catch (error) {
      console.error('Overdue update error:', error);
      toast.error(tx('Failed to apply overdue fine.', 'Gagal menerapkan denda keterlambatan.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleCleanReturn = async (booking: Booking) => {
    const bookingTenant = tenantById[booking.tenantId] ?? activeTenant;
    if (!userProfile || !bookingTenant) return;
    setBusyId(booking.id);
    try {
      const { finalOverdueFine } = await completeCleanReturnOp(
        booking,
        bookingTenant,
        userProfile.uid
      );
      await invalidateAllBookingQueries();
      toast.success(
        finalOverdueFine > 0
          ? tx(
              `${booking.invoiceNumber} completed with overdue fine Rp ${finalOverdueFine.toLocaleString('id-ID')} posted to Cash Flow.`,
              `${booking.invoiceNumber} selesai dengan denda telat Rp ${finalOverdueFine.toLocaleString('id-ID')} & tercatat ke Buku Kas.`
            )
          : tx(
              `${booking.invoiceNumber} completed. Units returned to available & deposit refunded.`,
              `${booking.invoiceNumber} selesai. Unit kembali tersedia & deposit direfund.`
            )
      );
    } catch (error) {
      console.error('Clean return error:', error);
      toast.error(tx('Failed to complete clean return.', 'Gagal menyelesaikan pengembalian.'));
    } finally {
      setBusyId(null);
    }
  };

  const openDamageAssessment = (booking: Booking) => {
    setDamageTarget(booking);
    setDamageUnitId(booking.items[0]?.unitId ?? '');
    setDamageSeverity('minor');
    setDamageRepairCost(500000);
    setDamageDesc('');
    setDamagePhotosText('');
  };

  const handleSubmitDamageReport = async () => {
    if (!userProfile || !damageTarget || !damageUnitId) {
      toast.error(tx('Select the damaged physical unit.', 'Pilih unit fisik yang mengalami kerusakan.'));
      return;
    }
    setSavingDamage(true);
    try {
      const evidencePhotos = damagePhotosText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      await submitDamageReportOp(
        damageTarget,
        {
          unitId: damageUnitId,
          severity: damageSeverity,
          description: damageDesc,
          repairCost: damageRepairCost,
          evidencePhotos,
        },
        userProfile.uid
      );
      await invalidateAllBookingQueries();
      toast.success(
        tx(
          'Damage report filed, unit moved to maintenance, and ledger updated.',
          'Laporan kerusakan dicatat, unit dipindah ke maintenance, dan Buku Kas diperbarui.'
        )
      );
      setDamageTarget(null);
      setDamageDesc('');
    } catch (error) {
      console.error('Damage report error:', error);
      toast.error(tx('Failed to file damage report.', 'Gagal mencatat laporan kerusakan.'));
    } finally {
      setSavingDamage(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header + Search */}
      <div className="flex flex-col gap-3 border-b border-zinc-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-950">
            {tx('Bookings, Verification & QC Inspections', 'Booking, Verifikasi & Inspeksi QC')}
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {tx('Scope:', 'Cakupan:')}{' '}
            <span className="font-medium text-zinc-800">
              {isAllTenants ? tx('All Branches', 'Semua Cabang') : activeTenant?.name}
            </span>{' '}
            ·{' '}
            {tx(
              'Click any booking to verify payment, log pre-rental handover, process returns, or file damage reports.',
              'Klik booking mana saja untuk verifikasi bayar, inspeksi serah terima pra-sewa, pengembalian, atau laporan kerusakan.'
            )}
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400"
            strokeWidth={1.5}
          />
          <Input
            placeholder={tx('Search invoice, renter, SN...', 'Cari invoice, penyewa, SN...')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="h-8 bg-white pl-8 text-xs"
          />
        </div>
      </div>

      {/* Filter Tabs (including Damage Reports) */}
      <Tabs
        value={statusFilter}
        onValueChange={(v) => {
          setStatusFilter(v as BookingsTabFilter);
          setPage(1);
        }}
      >
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="all" className="text-xs">
            {tx('All', 'Semua')} ({bookings.length})
          </TabsTrigger>
          <TabsTrigger value="waiting_verification" className="text-xs">
            {tx('Verify', 'Verifikasi')} ({counts.waiting_verification})
          </TabsTrigger>
          <TabsTrigger value="pending_payment" className="text-xs">
            {tx('Pending', 'Menunggu')} ({counts.pending_payment})
          </TabsTrigger>
          <TabsTrigger value="confirmed" className="text-xs">
            {tx('Handover', 'Serah Terima')} ({counts.confirmed})
          </TabsTrigger>
          <TabsTrigger value="active_rent" className="text-xs">
            {tx('Active', 'Aktif')} ({counts.active_rent})
          </TabsTrigger>
          <TabsTrigger value="overdue" className="text-xs">
            {tx('Overdue', 'Telat')} ({counts.overdue})
          </TabsTrigger>
          <TabsTrigger value="completed" className="text-xs">
            {tx('Completed', 'Selesai')} ({counts.completed})
          </TabsTrigger>
          <TabsTrigger value="cancelled" className="text-xs">
            {tx('Cancelled', 'Batal')} ({counts.cancelled})
          </TabsTrigger>
          <TabsTrigger value="damage_reports" className="text-xs">
            {tx('Damage Reports', 'Kerusakan')} ({damageReports.length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Main Content: Damage Reports View OR Compact Bookings Table */}
      {statusFilter === 'damage_reports' ? (
        filteredDamageReports.length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title={tx('No damage incidents filed', 'Belum ada laporan kerusakan')}
            description={tx(
              'Post-rental damage assessments and deposit deductions filed from any booking will appear here.',
              'Penilaian kerusakan pasca-sewa dan pemotongan deposit dari booking akan tercatat di sini.'
            )}
          />
        ) : (
          <div className="space-y-3">
            {filteredDamageReports.map((rep) => {
              const linked = bookingsById[rep.bookingId];
              const renter = linked ? rentersById[linked.userId] : null;
              const affectedItem = linked?.items.find((i) => i.unitId === rep.unitId);
              return (
                <Card
                  key={rep.id}
                  role={linked ? 'button' : undefined}
                  tabIndex={linked ? 0 : undefined}
                  onClick={() => linked && setDetailBookingId(linked.id)}
                  className={`shadow-none transition-colors ${
                    linked ? 'cursor-pointer hover:border-zinc-400' : ''
                  }`}
                >
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-xs">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status="damaged" label={rep.severity.toUpperCase()} />
                        <span className="font-mono font-semibold text-zinc-950">
                          {linked?.invoiceNumber ?? rep.bookingId}
                        </span>
                        {renter ? (
                          <span className="text-zinc-600">· {renter.displayName}</span>
                        ) : null}
                        {affectedItem ? (
                          <SerialNumberTag serialNumber={affectedItem.serialNumber} />
                        ) : null}
                      </div>
                      <p className="text-zinc-800">{rep.description}</p>
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
              );
            })}
          </div>
        )
      ) : isLoading ? (
        <div className="rounded-md border border-zinc-200 bg-white p-8 text-center font-mono text-xs text-zinc-400">
          {tx('LOADING BOOKING QUEUE...', 'MEMUAT ANTREAN BOOKING...')}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={tx('No matching bookings', 'Tidak ada booking yang cocok')}
          description={tx(
            'Try switching the status tab or clearing your search filter.',
            'Coba ubah tab status atau hapus kata kunci pencarian.'
          )}
        />
      ) : (
        <div className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tx('Booking & Renter', 'Booking & Penyewa')}</TableHead>
                <TableHead>{tx('Gear & Serial', 'Alat & SN')}</TableHead>
                <TableHead>{tx('Logistics', 'Logistik')}</TableHead>
                <TableHead className="text-right">{tx('Total', 'Total')}</TableHead>
                <TableHead>{tx('Status', 'Status')}</TableHead>
                <TableHead className="text-right">{tx('Actions', 'Aksi')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((b) => {
                const renter = rentersById[b.userId];
                const branch = tenantById[b.tenantId];
                const firstItem = b.items[0];
                const extraCount = Math.max(0, b.items.length - 1);
                const canVerify =
                  b.bookingStatus === 'pending_payment' ||
                  b.bookingStatus === 'waiting_verification';
                const paySummary = getBookingPaymentSummary(b);
                const expiry = getPaymentExpiryInfo(b, settings.paymentExpiryHours, nowMs);

                return (
                  <TableRow
                    key={b.id}
                    onClick={() => setDetailBookingId(b.id)}
                    className="group cursor-pointer"
                  >
                    <TableCell className="py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-zinc-950">
                          {b.invoiceNumber}
                        </span>
                        {b.membershipTier === 'premium' ? <MembershipBadge tier="premium" /> : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs font-medium text-zinc-700">
                        {renter?.displayName ?? b.userId}
                        {isAllTenants && branch ? (
                          <span className="font-normal text-zinc-400"> · {branch.name}</span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 whitespace-nowrap font-mono text-[10px] text-zinc-400">
                        {formatCompactDate(b.startDate)} → {formatCompactDate(b.endDate)}
                      </p>
                    </TableCell>

                    <TableCell className="py-3">
                      {firstItem ? (
                        <div className="space-y-1">
                          <p className="max-w-[210px] truncate text-xs font-medium text-zinc-900">
                            {firstItem.equipmentName}
                          </p>
                          <div className="flex items-center gap-1.5">
                            <SerialNumberTag serialNumber={firstItem.serialNumber} />
                            {extraCount > 0 ? (
                              <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none text-zinc-600">
                                +{extraCount} {tx('more', 'lagi')}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </TableCell>

                    <TableCell className="py-3">
                      <div className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-zinc-700">
                        {b.logisticsType === 'delivery' ? (
                          <Truck className="h-3.5 w-3.5 shrink-0 text-zinc-400" strokeWidth={1.5} />
                        ) : (
                          <Store className="h-3.5 w-3.5 shrink-0 text-zinc-400" strokeWidth={1.5} />
                        )}
                        <span>
                          {b.logisticsType === 'delivery'
                            ? tx('Delivery', 'Antar-Jemput')
                            : tx('Self-Pickup', 'Ambil Sendiri')}
                        </span>
                      </div>
                      {b.logisticsType === 'delivery' ? (
                        <p className="mt-0.5 max-w-[155px] truncate text-[11px] text-zinc-400">
                          {b.deliveryDistanceKm ? `${b.deliveryDistanceKm} km` : ''}
                          {b.deliveryDistanceKm && b.deliveryAddress ? ' · ' : ''}
                          {b.deliveryAddress ?? ''}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[11px] text-zinc-400">
                          {tx('At branch counter', 'Di loket cabang')}
                        </p>
                      )}
                    </TableCell>

                    <TableCell className="whitespace-nowrap py-3 text-right">
                      <div className="text-xs font-semibold text-zinc-950">
                        <CurrencyText amount={b.totalAmount} />
                      </div>
                      {paySummary.payments.length > 0 && !paySummary.isFullyPaid ? (
                        <div className="mt-0.5 font-mono text-[10px] text-amber-700">
                          {tx('Paid', 'Masuk')}: <CurrencyText amount={paySummary.verifiedAmount} />
                        </div>
                      ) : (
                        <div className="mt-0.5 text-[10.5px] text-zinc-500">
                          {tx('Dep', 'Dep')}: <CurrencyText amount={b.deposit} />
                        </div>
                      )}
                      {b.paymentProofUrl ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReceiptPreview({
                              url: b.paymentProofUrl!,
                              label: `${tx('Transfer Receipt', 'Bukti Transfer')} — ${b.invoiceNumber}`,
                            });
                          }}
                          className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-zinc-600 hover:text-zinc-950 hover:underline"
                        >
                          <Eye className="h-2.5 w-2.5" strokeWidth={1.5} />
                          {paySummary.payments.length > 1
                            ? tx(`${paySummary.payments.length} receipts`, `${paySummary.payments.length} bukti`)
                            : tx('Receipt', 'Bukti')}
                        </button>
                      ) : null}
                    </TableCell>

                    <TableCell className="whitespace-nowrap py-3">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={b.bookingStatus} />
                        <span className="font-mono text-[10px] text-zinc-400">
                          {formatPaymentLabel(b.paymentStatus, tx)}
                          {b.bookingStatus === 'confirmed' && b.preRentalChecklist?.confirmedByUserAt
                            ? ` · ${tx('QC OK', 'QC OK')}`
                            : ''}
                        </span>
                        {expiry.applies ? (
                          <span
                            className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                              expiry.isUrgent
                                ? 'border-amber-300 bg-amber-50 text-amber-800'
                                : 'border-zinc-200 bg-zinc-50 text-zinc-600'
                            }`}
                          >
                            <Clock className="h-2.5 w-2.5" strokeWidth={1.5} />
                            {tx(expiry.labelEn, expiry.labelId)}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>

                    <TableCell
                      className="whitespace-nowrap py-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center justify-end gap-1">
                        {canVerify ? (
                          <>
                            <Button
                              size="sm"
                              className="h-7 px-2.5 text-[11px]"
                              disabled={busyId === b.id}
                              onClick={() => void handleApprovePayment(b)}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                              {tx('Verify', 'Verifikasi')}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700"
                              disabled={busyId === b.id}
                              onClick={() => void handleCancelBooking(b)}
                              title={tx('Cancel booking', 'Batalkan booking')}
                            >
                              <XCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
                            </Button>
                          </>
                        ) : null}
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() =>
                            void generateInvoicePdf({
                              booking: b,
                              tenant: branch ?? activeTenant,
                              renter: renter ?? null,
                            })
                          }
                          title={tx('Download Invoice PNG', 'Unduh Invoice PNG')}
                        >
                          <FileDown className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-zinc-400 group-hover:text-zinc-900"
                          onClick={() => setDetailBookingId(b.id)}
                          title={tx('Open Details & QC Actions', 'Buka Detail & Aksi QC')}
                        >
                          <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>
                {tx(
                  `Showing ${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(
                    safePage * PAGE_SIZE,
                    filtered.length
                  )} of ${filtered.length} bookings`,
                  `Menampilkan ${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(
                    safePage * PAGE_SIZE,
                    filtered.length
                  )} dari ${filtered.length} booking`
                )}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
                  {tx('Prev', 'Sebelumnya')}
                </Button>
                <span className="px-2 font-mono text-[11px] text-zinc-700">
                  {safePage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  {tx('Next', 'Berikutnya')}
                  <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      <ImagePreviewModal
        open={Boolean(receiptPreview)}
        onOpenChange={(open) => !open && setReceiptPreview(null)}
        images={receiptPreview ? [receiptPreview] : []}
        title={tx('Payment Proof Verification', 'Verifikasi Bukti Pembayaran')}
      />

      {/* Unified Booking Detail + Pre-Rental & Post-Rental Inspection Actions */}
      {(() => {
        const selectedBooking = bookings.find((b) => b.id === detailBookingId) ?? null;
        const selectedTenant = selectedBooking
          ? tenantById[selectedBooking.tenantId] ?? activeTenant
          : activeTenant;
        const canVerify =
          selectedBooking?.bookingStatus === 'pending_payment' ||
          selectedBooking?.bookingStatus === 'waiting_verification';
        const isConfirmed = selectedBooking?.bookingStatus === 'confirmed';
        const isActiveOrOverdue =
          selectedBooking?.bookingStatus === 'active_rent' ||
          selectedBooking?.bookingStatus === 'overdue';
        const overdueCalc =
          selectedBooking && isActiveOrOverdue
            ? calculateOverdueFine(selectedBooking, selectedTenant)
            : null;

        const hasActions = Boolean(selectedBooking && (canVerify || isConfirmed || isActiveOrOverdue));

        return (
          <BookingDetailModal
            open={Boolean(selectedBooking)}
            onOpenChange={(open) => !open && setDetailBookingId(null)}
            booking={selectedBooking}
            tenant={selectedTenant}
            renter={selectedBooking ? rentersById[selectedBooking.userId] ?? null : null}
            onVerifyInstallment={(b, p) => void handleVerifyInstallment(b, p)}
            onRejectInstallment={(b, p) => void handleRejectInstallment(b, p)}
            busyPaymentId={busyPaymentId}
            footerActions={
              selectedBooking && hasActions ? (
                <>
                  {canVerify ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 whitespace-nowrap text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                        disabled={busyId === selectedBooking.id}
                        onClick={() => void handleCancelBooking(selectedBooking)}
                      >
                        <XCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
                        {tx('Cancel', 'Batalkan')}
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 whitespace-nowrap text-xs"
                        disabled={busyId === selectedBooking.id}
                        onClick={() => void handleApprovePayment(selectedBooking)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                        {tx('Verify & Confirm', 'Verifikasi & Konfirmasi')}
                      </Button>
                    </>
                  ) : null}

                  {isConfirmed ? (
                    <Button
                      size="sm"
                      className="h-8 whitespace-nowrap text-xs"
                      onClick={() => openPreRentalHandover(selectedBooking)}
                    >
                      <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
                      {tx('Inspect & Dispatch', 'Inspeksi & Serahkan')}
                    </Button>
                  ) : null}

                  {isActiveOrOverdue ? (
                    <>
                      {overdueCalc?.isOverdue && selectedBooking.bookingStatus !== 'overdue' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 whitespace-nowrap border-red-200 bg-white text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                          disabled={busyId === selectedBooking.id}
                          onClick={() =>
                            void handleApplyOverdueFine(selectedBooking, overdueCalc.estimatedFine)
                          }
                        >
                          <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} />
                          {tx('Flag Overdue', 'Tandai Overdue')}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 whitespace-nowrap text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                        disabled={busyId === selectedBooking.id}
                        onClick={() => openDamageAssessment(selectedBooking)}
                      >
                        <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.5} />
                        {tx('Report Damage', 'Lapor Kerusakan')}
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 whitespace-nowrap text-xs"
                        disabled={busyId === selectedBooking.id}
                        onClick={() => void handleCleanReturn(selectedBooking)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                        {overdueCalc?.isOverdue && selectedBooking.overdueFine === 0
                          ? tx('Return + Fine', 'Kembali + Denda')
                          : tx('Return & Refund', 'Kembali & Refund')}
                      </Button>
                    </>
                  ) : null}
                </>
              ) : undefined
            }
          />
        );
      })()}

      {/* Pre-Rental Handover Modal */}
      <Dialog
        open={Boolean(handoverTarget)}
        onOpenChange={(o) => !o && !savingHandover && setHandoverTarget(null)}
      >
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
                {tx(
                  'Handover Condition Notes & Accessories Check',
                  'Catatan Kondisi & Kelengkapan Aksesoris'
                )}
              </Label>
              <Textarea
                value={handoverNotes}
                onChange={(e) => setHandoverNotes(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>
                {tx(
                  'Handover Photo URLs (one per line, optional)',
                  'URL Foto Serah Terima (satu per baris, opsional)'
                )}
              </Label>
              <Textarea
                placeholder="https://..."
                value={handoverPhotosText}
                onChange={(e) => setHandoverPhotosText(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={savingHandover}
              onClick={() => void handleSavePreRental(false)}
            >
              {tx('Save Checklist Only', 'Simpan Checklist Saja')}
            </Button>
            <Button disabled={savingHandover} onClick={() => void handleSavePreRental(true)}>
              {tx('Save & Start Active Rent', 'Simpan & Mulai Masa Sewa')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post-Rental Damage Assessment Modal */}
      <Dialog
        open={Boolean(damageTarget)}
        onOpenChange={(o) => !o && !savingDamage && setDamageTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {tx('Post-Rental Damage Assessment', 'Penilaian Kerusakan Pasca-Sewa')}
            </DialogTitle>
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

            {damageTarget ? (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 font-mono text-[11px] space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-500">{tx('Deducted from Deposit', 'Potong Deposit')}</span>
                  <CurrencyText amount={Math.min(Math.max(0, damageRepairCost), damageTarget.deposit)} />
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">{tx('Remaining Deposit Refund', 'Sisa Refund Deposit')}</span>
                  <CurrencyText
                    amount={Math.max(0, damageTarget.deposit - Math.max(0, damageRepairCost))}
                    className="text-emerald-700"
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">{tx('Extra Fine Billed', 'Tagihan Denda Tambahan')}</span>
                  <CurrencyText
                    amount={Math.max(0, Math.max(0, damageRepairCost) - damageTarget.deposit)}
                    className="text-red-700"
                  />
                </div>
              </div>
            ) : null}

            <div className="space-y-1">
              <Label>{tx('Damage Description', 'Deskripsi Kerusakan')}</Label>
              <Textarea
                placeholder={tx(
                  'Describe physical damage, scratch, or missing accessory...',
                  'Jelaskan kerusakan fisik, goresan, atau aksesoris yang hilang...'
                )}
                value={damageDesc}
                onChange={(e) => setDamageDesc(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>
                {tx(
                  'Evidence Photo URLs (one per line, optional)',
                  'URL Foto Bukti Kerusakan (satu per baris, opsional)'
                )}
              </Label>
              <Textarea
                placeholder="https://..."
                value={damagePhotosText}
                onChange={(e) => setDamagePhotosText(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              disabled={savingDamage}
              onClick={() => setDamageTarget(null)}
            >
              {tx('Cancel', 'Batal')}
            </Button>
            <Button
              variant="destructive"
              disabled={savingDamage}
              onClick={() => void handleSubmitDamageReport()}
            >
              {savingDamage
                ? tx('Submitting...', 'Menyimpan...')
                : tx('File Damage Report & Settle', 'Simpan Laporan & Selesaikan')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
