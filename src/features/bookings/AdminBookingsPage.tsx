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
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileDown,
  Search,
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
import { usePlatformSettings } from '@/hooks/usePlatformSettings';
import { useTenant } from '@/hooks/useTenant';
import { BookingDetailModal } from '@/features/bookings/BookingDetailModal';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { ImagePreviewModal } from '@/components/shared/ImagePreviewModal';
import { MembershipBadge } from '@/components/shared/MembershipBadge';
import { SerialNumberTag } from '@/components/shared/SerialNumberTag';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Booking, BookingStatus, UserProfile } from '@/types/schema';

const PAGE_SIZE = 10;

function formatCompactDate(ts: Timestamp): string {
  return ts.toDate().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPaymentLabel(status: Booking['paymentStatus'], tx: (en: string, id: string) => string): string {
  switch (status) {
    case 'paid':
      return tx('Paid', 'Lunas');
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

  const [statusFilter, setStatusFilter] = useState<'all' | BookingStatus>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<{ url: string; label: string } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const expiredSweepIdsRef = useRef<Set<string>>(new Set());

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
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (!isAllTenants && (!activeTenantId || !activeTenant)) {
    return (
      <EmptyState
        icon={CalendarClock}
        title={tx('No active rental branch selected', 'Belum ada cabang rental dipilih')}
        description={tx(
          'Select a tenant branch to manage incoming reservations.',
          'Pilih cabang untuk mengelola pemesanan masuk.'
        )}
      />
    );
  }

  const handleApprovePayment = async (booking: Booking) => {
    if (!db || !userProfile) return;
    setBusyId(booking.id);
    try {
      await updateDoc(doc(db, 'bookings', booking.id), {
        paymentStatus: 'paid',
        bookingStatus: 'confirmed',
        paidAt: Timestamp.now(),
      });
      await syncAvailabilitySlotStatus(booking.id, 'confirmed');

      const rentalRevenue = booking.subtotal + booking.deliveryFee;
      if (rentalRevenue > 0) {
        const deliveryDetail =
          booking.deliveryFee > 0
            ? ` (Sewa Rp ${booking.subtotal.toLocaleString('id-ID')} + Antar-Jemput Rp ${booking.deliveryFee.toLocaleString('id-ID')})`
            : '';
        await addDoc(collection(db, 'transactions'), {
          tenantId: booking.tenantId,
          bookingId: booking.id,
          type: 'rental_income',
          category: 'revenue',
          amount: rentalRevenue,
          paymentMethod: 'bank_transfer',
          ...(booking.paymentProofUrl ? { proofUrl: booking.paymentProofUrl } : {}),
          notes: `Verified payment for ${booking.invoiceNumber}${deliveryDetail}`,
          verifiedBy: userProfile.uid,
          createdAt: Timestamp.now(),
        });
      }

      if (booking.deposit > 0) {
        await addDoc(collection(db, 'transactions'), {
          tenantId: booking.tenantId,
          bookingId: booking.id,
          type: 'deposit_in',
          category: 'liability',
          amount: booking.deposit,
          paymentMethod: 'bank_transfer',
          ...(booking.paymentProofUrl ? { proofUrl: booking.paymentProofUrl } : {}),
          notes: `Refundable deposit held for ${booking.invoiceNumber}`,
          verifiedBy: userProfile.uid,
          createdAt: Timestamp.now(),
        });
      }

      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['sidebar-badges'] });
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
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['availability'] });
      await queryClient.invalidateQueries({ queryKey: ['sidebar-badges'] });
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

  return (
    <div className="space-y-4">
      {/* Header + Search */}
      <div className="flex flex-col gap-3 border-b border-zinc-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-950">
            {tx('Booking Queue & Payment Verification', 'Antrean Booking & Verifikasi Pembayaran')}
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {tx('Scope:', 'Cakupan:')}{' '}
            <span className="font-medium text-zinc-800">
              {isAllTenants ? tx('All Branches', 'Semua Cabang') : activeTenant?.name}
            </span>{' '}
            ·{' '}
            {tx(
              'Click any row to inspect units, accessories, timeline, and documents.',
              'Klik baris mana saja untuk melihat detail unit, aksesoris, timeline, dan dokumen.'
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

      {/* Filter Tabs */}
      <Tabs
        value={statusFilter}
        onValueChange={(v) => {
          setStatusFilter(v as typeof statusFilter);
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
            {tx('Confirmed', 'Dikonfirmasi')} ({counts.confirmed})
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
        </TabsList>
      </Tabs>

      {/* Compact Professional Table */}
      {isLoading ? (
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
                const expiry = getPaymentExpiryInfo(b, settings.paymentExpiryHours, nowMs);

                return (
                  <TableRow
                    key={b.id}
                    onClick={() => setDetailBookingId(b.id)}
                    className="group cursor-pointer"
                  >
                    {/* Col 1: Invoice, Renter, Schedule */}
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

                    {/* Col 2: Compact Gear Summary (uniform row height) */}
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

                    {/* Col 3: Compact Logistics */}
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

                    {/* Col 4: Amount / Deposit */}
                    <TableCell className="whitespace-nowrap py-3 text-right">
                      <div className="text-xs font-semibold text-zinc-950">
                        <CurrencyText amount={b.totalAmount} />
                      </div>
                      <div className="mt-0.5 text-[10.5px] text-zinc-500">
                        {tx('Dep', 'Dep')}: <CurrencyText amount={b.deposit} />
                      </div>
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
                          {tx('Receipt', 'Bukti')}
                        </button>
                      ) : null}
                    </TableCell>

                    {/* Col 5: Status & Payment */}
                    <TableCell className="whitespace-nowrap py-3">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={b.bookingStatus} />
                        <span className="font-mono text-[10px] text-zinc-400">
                          {formatPaymentLabel(b.paymentStatus, tx)}
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

                    {/* Col 6: Compact Uniform Actions */}
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
                          title={tx('View Booking Details', 'Lihat Detail Booking')}
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

          {/* Compact Pagination */}
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

      {(() => {
        const selectedBooking = bookings.find((b) => b.id === detailBookingId) ?? null;
        const canVerify =
          selectedBooking?.bookingStatus === 'pending_payment' ||
          selectedBooking?.bookingStatus === 'waiting_verification';

        return (
          <BookingDetailModal
            open={Boolean(selectedBooking)}
            onOpenChange={(open) => !open && setDetailBookingId(null)}
            booking={selectedBooking}
            tenant={
              selectedBooking
                ? tenantById[selectedBooking.tenantId] ?? activeTenant
                : activeTenant
            }
            renter={selectedBooking ? rentersById[selectedBooking.userId] ?? null : null}
            footerActions={
              selectedBooking && canVerify ? (
                <>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busyId === selectedBooking.id}
                    onClick={() => void handleCancelBooking(selectedBooking)}
                  >
                    <XCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {tx('Cancel Booking', 'Batalkan Booking')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={busyId === selectedBooking.id}
                    onClick={() => void handleApprovePayment(selectedBooking)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {tx('Verify & Confirm', 'Verifikasi & Konfirmasi')}
                  </Button>
                </>
              ) : null
            }
          />
        );
      })()}
    </div>
  );
}
