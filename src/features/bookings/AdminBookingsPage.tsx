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
  CalendarClock,
  CheckCircle2,
  Eye,
  FileDown,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { syncAvailabilitySlotStatus } from '@/lib/availability';
import { formatDateTime } from '@/lib/utils';
import { generateInvoicePdf } from '@/lib/invoicePdf';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { BookingDetailModal } from '@/features/bookings/BookingDetailModal';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { ImagePreviewModal } from '@/components/shared/ImagePreviewModal';
import { MembershipBadge } from '@/components/shared/MembershipBadge';
import { SerialNumberTag } from '@/components/shared/SerialNumberTag';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
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

export function AdminBookingsPage() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const { activeTenantId, activeTenant } = useTenant();
  const [statusFilter, setStatusFilter] = useState<'all' | BookingStatus>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<{ url: string; label: string } | null>(null);

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
    queryKey: ['bookings', 'tenant', activeTenantId],
    enabled: Boolean(db && activeTenantId),
    queryFn: async () => {
      if (!db || !activeTenantId) return [];
      const snap = await getDocs(
        query(collection(db, 'bookings'), where('tenantId', '==', activeTenantId))
      );
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Booking)
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    },
  });

  if (!activeTenantId || !activeTenant) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="No active rental branch selected"
        description="Select a tenant branch to manage incoming reservations."
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
      });
      await syncAvailabilitySlotStatus(booking.id, 'confirmed');

      // Record strictly separated Revenue vs Deposit Liability entries in immutable ledger
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
      toast.success(
        `${booking.invoiceNumber} confirmed. Revenue & Deposit Liability logged to Cash Flow Ledger.`
      );
    } catch (error) {
      console.error('Approve payment error:', error);
      toast.error('Failed to verify payment.');
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
      });
      await syncAvailabilitySlotStatus(booking.id, 'cancelled');
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['availability'] });
      toast.success(`${booking.invoiceNumber} cancelled. Serial units released.`);
    } catch (error) {
      console.error('Cancel booking error:', error);
      toast.error('Failed to cancel booking.');
    } finally {
      setBusyId(null);
    }
  };

  const filtered = bookings.filter((b) =>
    statusFilter === 'all' ? true : b.bookingStatus === statusFilter
  );

  return (
    <div className="space-y-5">
      <div className="border-b border-zinc-200 pb-4">
        <h2 className="text-base font-semibold tracking-tight text-zinc-950">
          Booking Queue &amp; Payment Verification
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Branch: <span className="font-medium text-zinc-800">{activeTenant.name}</span> · Approving
          payment posts separate Revenue and Security Deposit Liability entries to the immutable
          ledger.
        </p>
      </div>

      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">All ({bookings.length})</TabsTrigger>
          <TabsTrigger value="pending_payment">
            Pending Payment ({bookings.filter((b) => b.bookingStatus === 'pending_payment').length})
          </TabsTrigger>
          <TabsTrigger value="confirmed">
            Confirmed ({bookings.filter((b) => b.bookingStatus === 'confirmed').length})
          </TabsTrigger>
          <TabsTrigger value="active_rent">
            Active Rent ({bookings.filter((b) => b.bookingStatus === 'active_rent').length})
          </TabsTrigger>
          <TabsTrigger value="overdue">
            Overdue ({bookings.filter((b) => b.bookingStatus === 'overdue').length})
          </TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="rounded-md border border-zinc-200 bg-white p-8 text-center font-mono text-xs text-zinc-400">
          LOADING BOOKING QUEUE...
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No bookings in this status"
          description="Incoming renter reservations for this branch will appear here."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice &amp; Window</TableHead>
              <TableHead>Allocated Units (SN)</TableHead>
              <TableHead>Logistics</TableHead>
              <TableHead>Amount / Deposit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((b) => (
              <TableRow
                key={b.id}
                onClick={() => setDetailBookingId(b.id)}
                className="cursor-pointer"
              >
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <p className="font-mono font-semibold text-zinc-950">{b.invoiceNumber}</p>
                    {b.membershipTier === 'premium' ? <MembershipBadge tier="premium" /> : null}
                  </div>
                  <p className="font-mono text-[10px] text-zinc-500">
                    {formatDateTime(b.startDate)} → {formatDateTime(b.endDate)}
                  </p>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    {b.items.map((item) => (
                      <div key={item.unitId} className="flex items-center gap-1.5">
                        <span className="max-w-[160px] truncate text-[11px] text-zinc-800">
                          {item.equipmentName}
                        </span>
                        <SerialNumberTag serialNumber={item.serialNumber} />
                      </div>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-[11px]">
                  <span className="font-mono uppercase text-zinc-700">
                    {b.logisticsType === 'delivery' ? 'Antar-Jemput' : 'Self-Pickup'}
                  </span>
                  {b.deliveryAddress ? (
                    <p className="max-w-[160px] truncate text-zinc-500">{b.deliveryAddress}</p>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="font-semibold text-zinc-950">
                    <CurrencyText amount={b.totalAmount} />
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    Dep: <CurrencyText amount={b.deposit} />
                  </div>
                  {b.paymentProofUrl ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReceiptPreview({
                          url: b.paymentProofUrl!,
                          label: `Transfer Receipt — ${b.invoiceNumber}`,
                        });
                      }}
                      className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                    >
                      <Eye className="h-2.5 w-2.5" strokeWidth={1.5} />
                      Preview Receipt
                    </button>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={b.bookingStatus} />
                    <span className="font-mono text-[10px] uppercase text-zinc-400">
                      PAY: {b.paymentStatus}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="inline-flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDetailBookingId(b.id)}
                    >
                      <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Details
                    </Button>
                    {(b.bookingStatus === 'pending_payment' ||
                      b.bookingStatus === 'waiting_verification') && (
                      <>
                        <Button
                          size="sm"
                          disabled={busyId === b.id}
                          onClick={() => void handleApprovePayment(b)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                          Verify &amp; Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === b.id}
                          onClick={() => void handleCancelBooking(b)}
                          title="Cancel booking"
                        >
                          <XCircle className="h-3.5 w-3.5 text-red-600" strokeWidth={1.5} />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        generateInvoicePdf({
                          booking: b,
                          tenant: activeTenant,
                          renter: rentersById[b.userId] ?? null,
                        })
                      }
                      title="Download A4 PDF Invoice"
                    >
                      <FileDown className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ImagePreviewModal
        open={Boolean(receiptPreview)}
        onOpenChange={(open) => !open && setReceiptPreview(null)}
        images={receiptPreview ? [receiptPreview] : []}
        title="Payment Proof Verification"
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
            tenant={activeTenant}
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
                    Cancel Booking
                  </Button>
                  <Button
                    size="sm"
                    disabled={busyId === selectedBooking.id}
                    onClick={() => void handleApprovePayment(selectedBooking)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Verify &amp; Confirm
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

