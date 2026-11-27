import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  doc,
  getDocs,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  FileDown,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { db, storage } from '@/lib/firebase';
import { expireStalePendingBookings, getPaymentExpiryInfo } from '@/lib/bookingExpiry';
import {
  computeNextPaymentStatus,
  getBookingPaymentSummary,
  suggestPaymentStageName,
} from '@/lib/bookingPayments';
import { generateHandoverPdf } from '@/lib/handoverPdf';
import { formatDateTime } from '@/lib/utils';
import { generateInvoicePdf } from '@/lib/invoicePdf';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { calculateOverdueFine } from '@/hooks/useOverdueCalc';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';
import { useTenant } from '@/hooks/useTenant';
import { BookingDetailModal } from '@/features/bookings/BookingDetailModal';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { MembershipBadge } from '@/components/shared/MembershipBadge';
import { SerialNumberTag } from '@/components/shared/SerialNumberTag';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Booking, BookingPayment } from '@/types/schema';

export function MyBookingsPage() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const { tx } = useI18n();
  const { settings } = usePlatformSettings();
  const { allTenants } = useTenant();
  const [proofTarget, setProofTarget] = useState<Booking | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [confirmHandoverTarget, setConfirmHandoverTarget] = useState<Booking | null>(null);
  const [confirmHandoverChecked, setConfirmHandoverChecked] = useState(false);
  const [confirmingHandover, setConfirmingHandover] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofUrlInput, setProofUrlInput] = useState('');
  const [stageNameInput, setStageNameInput] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const expiredSweepIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const { data: bookings = [], isLoading } = useQuery<Booking[]>({
    queryKey: ['bookings', 'user', userProfile?.uid],
    enabled: Boolean(db && userProfile?.uid),
    queryFn: async () => {
      if (!db || !userProfile?.uid) return [];
      const snap = await getDocs(
        query(collection(db, 'bookings'), where('userId', '==', userProfile.uid))
      );
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Booking)
        .sort(
          (a, b) =>
            b.startDate.toMillis() - a.startDate.toMillis() ||
            b.createdAt.toMillis() - a.createdAt.toMillis()
        );
    },
  });

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
              `${expiredInvoices.length} unpaid booking(s) expired and were auto-cancelled (${expiredInvoices.join(', ')}).`,
              `${expiredInvoices.length} pesanan belum dibayar kedaluwarsa & otomatis dibatalkan (${expiredInvoices.join(', ')}).`
            )
          );
        }
      }
    );
  }, [bookings, nowMs, queryClient, settings.paymentExpiryHours, tx]);

  const openUploadPaymentModal = (booking: Booking) => {
    const summary = getBookingPaymentSummary(booking);
    const defaultAmount = summary.remainingUncommitted > 0 ? summary.remainingUncommitted : booking.totalAmount;
    setProofTarget(booking);
    setProofFile(null);
    setProofUrlInput('');
    setAmountInput(String(defaultAmount));
    setStageNameInput(
      suggestPaymentStageName(booking, defaultAmount, summary.remainingUncommitted, tx)
    );
  };

  const handleUploadProof = async () => {
    if (!db || !proofTarget || !userProfile) return;
    const summary = getBookingPaymentSummary(proofTarget);
    const parsedAmount = Math.round(Number(amountInput.replace(/[^\d]/g, '')) || 0);
    if (parsedAmount <= 0) {
      toast.error(tx('Enter a valid payment amount.', 'Masukkan nominal pembayaran yang valid.'));
      return;
    }
    if (summary.remainingUncommitted > 0 && parsedAmount > summary.remainingUncommitted) {
      toast.error(
        tx(
          `Amount exceeds remaining balance (Rp ${summary.remainingUncommitted.toLocaleString('id-ID')}).`,
          `Nominal melebihi sisa tagihan (Rp ${summary.remainingUncommitted.toLocaleString('id-ID')}).`
        )
      );
      return;
    }

    const stageLabel =
      stageNameInput.trim() ||
      suggestPaymentStageName(proofTarget, parsedAmount, summary.remainingUncommitted, tx);

    setUploading(true);
    try {
      let finalUrl = proofUrlInput.trim();
      if (proofFile && storage) {
        const storageRef = ref(
          storage,
          `payment_proofs/${proofTarget.id}/${Date.now()}_${proofFile.name}`
        );
        await uploadBytes(storageRef, proofFile);
        finalUrl = await getDownloadURL(storageRef);
      }

      if (!finalUrl) {
        toast.error(
          tx(
            'Upload a transfer receipt image or paste a receipt URL.',
            'Unggah file gambar bukti transfer atau tempel URL bukti.'
          )
        );
        setUploading(false);
        return;
      }

      const newTranche: BookingPayment = {
        id:
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `pay_${Date.now()}`,
        stageName: stageLabel,
        amount: parsedAmount,
        proofUrl: finalUrl,
        status: 'waiting_verification',
        uploadedAt: Timestamp.now(),
      };

      const nextPayments = [...(proofTarget.payments ?? []), newTranche];
      const nextStatus = computeNextPaymentStatus(proofTarget.totalAmount, nextPayments);

      await updateDoc(doc(db, 'bookings', proofTarget.id), {
        payments: nextPayments,
        paymentProofUrl: finalUrl,
        paymentStatus: nextStatus,
      });

      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['sidebar-badges'] });
      toast.success(
        tx(
          `${stageLabel} (Rp ${parsedAmount.toLocaleString('id-ID')}) submitted for verification.`,
          `${stageLabel} (Rp ${parsedAmount.toLocaleString('id-ID')}) dikirim untuk verifikasi admin.`
        )
      );
      setProofTarget(null);
      setProofFile(null);
      setProofUrlInput('');
      setAmountInput('');
      setStageNameInput('');
    } catch (error) {
      console.error('Upload proof error:', error);
      toast.error(tx('Failed to upload payment proof.', 'Gagal mengunggah bukti pembayaran.'));
    } finally {
      setUploading(false);
    }
  };

  const openConfirmHandoverDialog = (booking: Booking) => {
    setConfirmHandoverTarget(booking);
    setConfirmHandoverChecked(false);
  };

  const handleConfirmGearCondition = async () => {
    if (!db || !confirmHandoverTarget || !confirmHandoverTarget.preRentalChecklist) return;
    setConfirmingHandover(true);
    try {
      await updateDoc(doc(db, 'bookings', confirmHandoverTarget.id), {
        preRentalChecklist: {
          ...confirmHandoverTarget.preRentalChecklist,
          confirmedByUserAt: Timestamp.now(),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['sidebar-badges'] });
      toast.success(
        tx(
          `Handover condition confirmed for ${confirmHandoverTarget.invoiceNumber}.`,
          `Kondisi serah terima dikonfirmasi untuk ${confirmHandoverTarget.invoiceNumber}.`
        )
      );
      setConfirmHandoverTarget(null);
      setConfirmHandoverChecked(false);
    } catch (error) {
      console.error('Confirm handover error:', error);
      toast.error(
        tx('Failed to confirm handover checklist.', 'Gagal mengonfirmasi checklist serah terima.')
      );
    } finally {
      setConfirmingHandover(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="border-b border-zinc-200 pb-4">
        <h2 className="text-base font-semibold tracking-tight text-zinc-950">
          {tx('My Bookings & Invoices', 'Pesanan & Invoice Saya')}
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          {tx(
            'Track serial-number allocations, submit transfer receipts, confirm pre-rental gear handovers, and download printable A4 invoices.',
            'Pantau alokasi nomor seri, unggah bukti transfer, konfirmasi serah terima alat, dan unduh invoice PDF A4.'
          )}
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-md border border-zinc-200 bg-white p-8 text-center font-mono text-xs text-zinc-400">
          {tx('LOADING BOOKINGS...', 'MEMUAT PESANAN...')}
        </div>
      ) : bookings.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={tx('No reservations placed yet', 'Belum ada pesanan dibuat')}
          description={tx(
            'Browse the Equipment Catalog, choose your shooting dates, and lock serialized units.',
            'Jelajahi Katalog Gear, pilih tanggal syuting Anda, dan kunci unit fisik.'
          )}
        />
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const tenant = allTenants.find((t) => t.id === booking.tenantId) ?? null;
            const overdue = calculateOverdueFine(booking, tenant);
            const expiry = getPaymentExpiryInfo(booking, settings.paymentExpiryHours, nowMs);
            const paySummary = getBookingPaymentSummary(booking);
            const needsHandoverConfirm =
              Boolean(booking.preRentalChecklist) &&
              !booking.preRentalChecklist?.confirmedByUserAt;

            return (
              <Card
                key={booking.id}
                role="button"
                tabIndex={0}
                onClick={() => setDetailBookingId(booking.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setDetailBookingId(booking.id);
                  }
                }}
                className="cursor-pointer shadow-none transition-colors hover:border-zinc-400"
              >
                <CardHeader className="border-b border-zinc-100 pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <CardTitle className="font-mono text-sm">{booking.invoiceNumber}</CardTitle>
                      <StatusBadge status={booking.bookingStatus} />
                      {booking.membershipTier === 'premium' ? (
                        <MembershipBadge tier="premium" />
                      ) : null}
                      {booking.paymentStatus === 'partial_paid' ? (
                        <StatusBadge status="partial_paid" />
                      ) : null}
                      {booking.paymentStatus === 'waiting_verification' ? (
                        <StatusBadge
                          status="waiting_verification"
                          label={tx('Receipt Pending Review', 'Bukti Menunggu Verifikasi')}
                        />
                      ) : null}
                      {expiry.applies ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                            expiry.isUrgent
                              ? 'border-amber-300 bg-amber-50 text-amber-800'
                              : 'border-zinc-200 bg-zinc-50 text-zinc-600'
                          }`}
                        >
                          <Clock className="h-3 w-3" strokeWidth={1.5} />
                          {tx(expiry.labelEn, expiry.labelId)}
                        </span>
                      ) : null}
                    </div>
                    <div
                      className="flex items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {paySummary.canUploadMore ? (
                        <Button
                          size="sm"
                          onClick={() => openUploadPaymentModal(booking)}
                        >
                          <Upload className="h-3.5 w-3.5" strokeWidth={1.5} />
                          {paySummary.payments.length > 0
                            ? tx('Add Payment', 'Tambah Pembayaran')
                            : tx('Upload Payment Proof', 'Unggah Bukti Bayar')}
                        </Button>
                      ) : null}

                      {needsHandoverConfirm ? (
                        <Button
                          size="sm"
                          variant="mono"
                          onClick={() => openConfirmHandoverDialog(booking)}
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
                          {tx('Confirm Gear Condition', 'Konfirmasi Kondisi Alat')}
                        </Button>
                      ) : null}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDetailBookingId(booking.id)}
                      >
                        <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
                        {tx('Details', 'Detail')}
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void generateInvoicePdf({ booking, tenant, renter: userProfile })
                        }
                      >
                        <FileDown className="h-3.5 w-3.5" strokeWidth={1.5} />
                        {tx('Invoice PNG', 'Invoice PNG')}
                      </Button>

                      {['confirmed', 'active_rent', 'overdue', 'completed'].includes(
                        booking.bookingStatus
                      ) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void generateHandoverPdf({ booking, tenant, renter: userProfile })
                          }
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
                          BAST PNG
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pt-4 text-xs">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <p className="font-mono text-[10px] uppercase text-zinc-400">
                        {tx('Rental Branch', 'Cabang Rental')}
                      </p>
                      <p className="mt-0.5 font-medium text-zinc-900">
                        {tenant?.name ?? booking.tenantId}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {booking.logisticsType === 'delivery'
                          ? `${tx('Delivery & Pickup', 'Antar-Jemput')} (${booking.courierStatus ?? 'pending_dispatch'})`
                          : tx('Self-Pickup at Branch', 'Ambil Sendiri di Cabang')}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase text-zinc-400">
                        {tx('Rental Window', 'Jadwal Sewa')}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-zinc-900">
                        {formatDateTime(booking.startDate)}
                      </p>
                      <p className="font-mono text-[11px] text-zinc-500">
                        {tx('to', 's/d')} {formatDateTime(booking.endDate)}
                      </p>
                      {booking.returnedAt ? (
                        <p className="mt-0.5 font-mono text-[10px] font-medium text-emerald-700">
                          {tx('Returned:', 'Dikembalikan:')} {formatDateTime(booking.returnedAt)}
                        </p>
                      ) : overdue.isOverdue ? (
                        <p className="mt-0.5 font-mono text-[10px] font-semibold text-red-700">
                          {tx(
                            `OVERDUE +${overdue.billableLateHours}h · Est. Fine`,
                            `TERLAMBAT +${overdue.billableLateHours}j · Est. Denda`
                          )}{' '}
                          <CurrencyText amount={overdue.estimatedFine} />
                        </p>
                      ) : null}
                    </div>
                    <div className="sm:text-right">
                      <p className="font-mono text-[10px] uppercase text-zinc-400">
                        {tx('Total Payable', 'Total Tagihan')}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-zinc-950">
                        <CurrencyText amount={booking.totalAmount} />
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {tx('Includes', 'Termasuk')} <CurrencyText amount={booking.deposit} />{' '}
                        {tx('refundable deposit', 'deposit jaminan')}
                      </p>
                      {paySummary.payments.length > 0 && !paySummary.isFullyPaid ? (
                        <p className="mt-0.5 font-mono text-[10px] text-zinc-700">
                          {tx('Paid', 'Terbayar')}{' '}
                          <CurrencyText amount={paySummary.verifiedAmount} className="font-semibold" />
                          {' · '}
                          {tx('Remaining', 'Sisa')}{' '}
                          <CurrencyText
                            amount={paySummary.remainingAmount}
                            className="font-semibold text-amber-700"
                          />
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-1.5">
                    <p className="font-mono text-[10px] uppercase text-zinc-400">
                      {tx('Allocated Physical Units', 'Unit Fisik Teralokasi')} ({booking.items.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {booking.items.map((item) => (
                        <div
                          key={item.unitId}
                          className="flex items-center gap-2 rounded border border-zinc-200 bg-zinc-50 px-2 py-1"
                        >
                          <span className="font-medium text-zinc-800">{item.equipmentName}</span>
                          <SerialNumberTag serialNumber={item.serialNumber} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {!paySummary.isFullyPaid &&
                  booking.bookingStatus !== 'cancelled' &&
                  tenant?.bankDetails ? (
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2.5 font-mono text-[11px] text-zinc-700">
                      {tx('Transfer to', 'Transfer ke')}{' '}
                      <span className="font-semibold">{tenant.bankDetails.bankName}</span>{' '}
                      {tenant.bankDetails.accountNumber} ({tenant.bankDetails.accountHolder})
                    </div>
                  ) : null}

                  {booking.preRentalChecklist ? (
                    <div className="rounded-md border border-zinc-200 bg-zinc-50/70 p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-semibold uppercase text-zinc-500">
                          {tx('Pre-Rental Handover Checklist', 'Checklist Serah Terima Pra-Sewa')}
                        </span>
                        {booking.preRentalChecklist.confirmedByUserAt ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" strokeWidth={1.5} />
                            {tx('Confirmed', 'Dikonfirmasi')}{' '}
                            {formatDateTime(booking.preRentalChecklist.confirmedByUserAt)}
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] text-amber-700">
                            {tx('Awaiting your confirmation', 'Menunggu konfirmasi Anda')}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-zinc-700">{booking.preRentalChecklist.notes}</p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(proofTarget)} onOpenChange={(o) => !o && setProofTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {tx('Upload Transfer Receipt', 'Unggah Bukti Transfer')} — {proofTarget?.invoiceNumber}
            </DialogTitle>
            <DialogDescription>
              {tx(
                'You can pay in full or split across installments (e.g. Payment 1 / DP, Payment 2, Final Settlement).',
                'Pembayaran dapat dilakukan sekaligus atau dibagi beberapa tahap (misal Pembayaran 1 / DP, Pembayaran 2, Pelunasan).'
              )}
            </DialogDescription>
          </DialogHeader>
          {proofTarget
            ? (() => {
                const targetSummary = getBookingPaymentSummary(proofTarget);
                const maxPayable =
                  targetSummary.remainingUncommitted > 0
                    ? targetSummary.remainingUncommitted
                    : proofTarget.totalAmount;
                const stagePresets = [
                  tx('Payment 1 (DP)', 'Pembayaran 1 (DP)'),
                  tx('Payment 2', 'Pembayaran 2'),
                  tx('Payment 3', 'Pembayaran 3'),
                  tx('Final Settlement', 'Pelunasan'),
                ];
                const halfAmount = Math.round(maxPayable / 2);
                const dp30Amount = Math.round(proofTarget.totalAmount * 0.3);

                return (
                  <div className="space-y-4">
                    {/* Payment Progress Summary */}
                    <div className="grid grid-cols-3 gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs">
                      <div>
                        <p className="font-mono text-[10px] uppercase text-zinc-400">
                          {tx('Total Bill', 'Total Tagihan')}
                        </p>
                        <p className="mt-0.5 font-mono font-semibold text-zinc-900">
                          <CurrencyText amount={proofTarget.totalAmount} />
                        </p>
                      </div>
                      <div>
                        <p className="font-mono text-[10px] uppercase text-zinc-400">
                          {tx('Verified / Pending', 'Masuk / Review')}
                        </p>
                        <p className="mt-0.5 font-mono font-semibold text-emerald-700">
                          <CurrencyText
                            amount={targetSummary.verifiedAmount + targetSummary.pendingAmount}
                          />
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-[10px] uppercase text-zinc-400">
                          {tx('Remaining', 'Sisa Tagihan')}
                        </p>
                        <p className="mt-0.5 font-mono font-semibold text-zinc-950">
                          <CurrencyText amount={maxPayable} />
                        </p>
                      </div>
                    </div>

                    {/* Existing Installments History */}
                    {targetSummary.payments.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                          {tx('Submitted Payments', 'Riwayat Pembayaran Sebelumnya')}
                        </p>
                        <div className="max-h-28 divide-y divide-zinc-100 overflow-y-auto rounded-md border border-zinc-200 bg-white">
                          {targetSummary.payments.map((tranche) => (
                            <div
                              key={tranche.id}
                              className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px]"
                            >
                              <span className="font-medium text-zinc-800">{tranche.stageName}</span>
                              <div className="flex items-center gap-2">
                                <CurrencyText
                                  amount={tranche.amount}
                                  className="font-mono font-semibold text-zinc-900"
                                />
                                <span
                                  className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                                    tranche.status === 'verified'
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                      : tranche.status === 'rejected'
                                        ? 'border-red-200 bg-red-50 text-red-700'
                                        : 'border-amber-200 bg-amber-50 text-amber-800'
                                  }`}
                                >
                                  {tranche.status === 'verified'
                                    ? tx('Verified', 'OK')
                                    : tranche.status === 'rejected'
                                      ? tx('Rejected', 'Ditolak')
                                      : tx('Pending', 'Review')}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* Stage Name */}
                    <div className="space-y-1.5">
                      <Label>{tx('Payment Stage / Label', 'Tahap / Nama Pembayaran')}</Label>
                      <Input
                        placeholder={tx('e.g. Payment 1 (DP), Pelunasan', 'Misal: Pembayaran 1 (DP), Pelunasan')}
                        value={stageNameInput}
                        onChange={(e) => setStageNameInput(e.target.value)}
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {stagePresets.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setStageNameInput(preset)}
                            className={`rounded border px-2 py-0.5 text-[11px] transition-colors ${
                              stageNameInput === preset
                                ? 'border-zinc-900 bg-zinc-900 text-white'
                                : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400 hover:text-zinc-900'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Transfer Amount */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label>{tx('Transfer Amount (IDR)', 'Nominal Transfer (IDR)')}</Label>
                        <div className="flex items-center gap-1">
                          {dp30Amount > 0 && dp30Amount < maxPayable ? (
                            <button
                              type="button"
                              onClick={() => {
                                setAmountInput(String(dp30Amount));
                                setStageNameInput(
                                  suggestPaymentStageName(proofTarget, dp30Amount, maxPayable, tx)
                                );
                              }}
                              className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                            >
                              DP 30%
                            </button>
                          ) : null}
                          {halfAmount > 0 && halfAmount < maxPayable ? (
                            <button
                              type="button"
                              onClick={() => {
                                setAmountInput(String(halfAmount));
                                setStageNameInput(
                                  suggestPaymentStageName(proofTarget, halfAmount, maxPayable, tx)
                                );
                              }}
                              className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                            >
                              50%
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              setAmountInput(String(maxPayable));
                              setStageNameInput(
                                suggestPaymentStageName(proofTarget, maxPayable, maxPayable, tx)
                              );
                            }}
                            className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-800 hover:border-zinc-400"
                          >
                            {tx('Full Remaining', 'Sisa / Lunas')}
                          </button>
                        </div>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        max={maxPayable}
                        value={amountInput}
                        onChange={(e) => setAmountInput(e.target.value)}
                      />
                    </div>

                    {/* Receipt Upload */}
                    <div className="space-y-1">
                      <Label>
                        {tx('Receipt Image File (Firebase Storage)', 'File Gambar Bukti (Firebase Storage)')}
                      </Label>
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>{tx('Or Receipt URL', 'Atau URL Bukti Transfer')}</Label>
                      <Input
                        placeholder="https://..."
                        value={proofUrlInput}
                        onChange={(e) => setProofUrlInput(e.target.value)}
                      />
                    </div>
                  </div>
                );
              })()
            : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProofTarget(null)}>
              {tx('Cancel', 'Batal')}
            </Button>
            <Button disabled={uploading} onClick={() => void handleUploadProof()}>
              {uploading
                ? tx('Submitting...', 'Mengirim...')
                : tx('Submit Payment Proof', 'Kirim Bukti Pembayaran')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(() => {
        const selectedBooking = bookings.find((b) => b.id === detailBookingId) ?? null;
        const selectedTenant = selectedBooking
          ? allTenants.find((t) => t.id === selectedBooking.tenantId) ?? null
          : null;
        const selectedPaySummary = selectedBooking
          ? getBookingPaymentSummary(selectedBooking)
          : null;
        const canConfirm =
          Boolean(selectedBooking?.preRentalChecklist) &&
          !selectedBooking?.preRentalChecklist?.confirmedByUserAt;
        const canUpload = Boolean(selectedPaySummary?.canUploadMore);

        const hasActions = Boolean(selectedBooking && (canUpload || canConfirm));

        return (
          <BookingDetailModal
            open={Boolean(selectedBooking)}
            onOpenChange={(open) => !open && setDetailBookingId(null)}
            booking={selectedBooking}
            tenant={selectedTenant}
            renter={userProfile}
            footerActions={
              selectedBooking && hasActions ? (
                <>
                  {canUpload ? (
                    <Button
                      size="sm"
                      className="h-8 whitespace-nowrap text-xs"
                      onClick={() => openUploadPaymentModal(selectedBooking)}
                    >
                      <Upload className="h-3.5 w-3.5" strokeWidth={1.5} />
                      {selectedPaySummary && selectedPaySummary.payments.length > 0
                        ? tx('Add Payment', 'Tambah Pembayaran')
                        : tx('Upload Proof', 'Unggah Bukti')}
                    </Button>
                  ) : null}
                  {canConfirm ? (
                    <Button
                      size="sm"
                      variant="mono"
                      className="h-8 whitespace-nowrap text-xs"
                      onClick={() => openConfirmHandoverDialog(selectedBooking)}
                    >
                      <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
                      {tx('Confirm Gear Condition', 'Konfirmasi Kondisi Alat')}
                    </Button>
                  ) : null}
                </>
              ) : undefined
            }
          />
        );
      })()}

      {/* Pre-Rental Handover Confirmation Dialog */}
      <Dialog
        open={Boolean(confirmHandoverTarget)}
        onOpenChange={(open) => {
          if (!open && !confirmingHandover) {
            setConfirmHandoverTarget(null);
            setConfirmHandoverChecked(false);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-4 w-4 text-zinc-900" strokeWidth={1.5} />
              {tx('Confirm Gear Handover Condition', 'Konfirmasi Kondisi Serah Terima Alat')}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {confirmHandoverTarget?.invoiceNumber} ·{' '}
              {tx(
                'Verify unit serial numbers & admin baseline notes before signing off.',
                'Periksa nomor seri unit & catatan kondisi dari cabang sebelum menyetujui.'
              )}
            </DialogDescription>
          </DialogHeader>

          {confirmHandoverTarget ? (
            <div className="space-y-4 text-xs">
              {/* Allocated Units */}
              <div className="space-y-1.5">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {tx(
                    `Equipment Handed Over (${confirmHandoverTarget.items.length} Units)`,
                    `Alat yang Diserahkan (${confirmHandoverTarget.items.length} Unit)`
                  )}
                </p>
                <div className="space-y-1.5 rounded-md border border-zinc-200 bg-zinc-50 p-2.5">
                  {confirmHandoverTarget.items.map((item) => (
                    <div
                      key={item.unitId}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="font-medium text-zinc-900">{item.equipmentName}</span>
                      <SerialNumberTag serialNumber={item.serialNumber} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Admin Pre-Rental Notes & Photos */}
              <div className="space-y-1.5">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {tx('Branch Pre-Rental Checklist Notes', 'Catatan Checklist Pra-Sewa Cabang')}
                </p>
                <div className="rounded-md border border-zinc-200 bg-white p-3 leading-relaxed text-zinc-700">
                  {confirmHandoverTarget.preRentalChecklist?.notes || '—'}
                </div>
                {(confirmHandoverTarget.preRentalChecklist?.photos?.length ?? 0) > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {confirmHandoverTarget.preRentalChecklist?.photos.map((url, idx) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block h-14 w-14 overflow-hidden rounded border border-zinc-200"
                      >
                        <img
                          src={url}
                          alt={`Handover ${idx + 1}`}
                          className="h-full w-full object-cover"
                        />
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Mandatory Acknowledgment Checkbox */}
              <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-zinc-200 bg-zinc-50/80 p-3 text-xs leading-relaxed text-zinc-800">
                <input
                  type="checkbox"
                  checked={confirmHandoverChecked}
                  onChange={(e) => setConfirmHandoverChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-zinc-900"
                />
                <span>
                  {tx(
                    'I have physically inspected the listed units, serial numbers, and included accessories and agree that their condition matches the pre-rental checklist above.',
                    'Saya telah memeriksa secara fisik unit, nomor seri, dan kelengkapan aksesoris di atas serta menyetujui bahwa kondisinya sesuai dengan catatan checklist pra-sewa.'
                  )}
                </span>
              </label>

              <p className="text-[11px] text-zinc-500">
                {tx(
                  'This digital sign-off timestamp is permanent and will appear on your BAST handover record.',
                  'Timestamp konfirmasi digital ini bersifat permanen dan akan tercatat di dokumen BAST serah terima.'
                )}
              </p>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={confirmingHandover}
              onClick={() => {
                setConfirmHandoverTarget(null);
                setConfirmHandoverChecked(false);
              }}
            >
              {tx('Cancel', 'Batal')}
            </Button>
            <Button
              type="button"
              variant="mono"
              disabled={!confirmHandoverChecked || confirmingHandover}
              onClick={() => void handleConfirmGearCondition()}
            >
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              {confirmingHandover
                ? tx('Confirming...', 'Mengonfirmasi...')
                : tx('Yes, Confirm Handover', 'Ya, Konfirmasi Kondisi Alat')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

