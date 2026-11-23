import { useState } from 'react';
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
  Eye,
  FileDown,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { db, storage } from '@/lib/firebase';
import { formatDateTime } from '@/lib/utils';
import { generateInvoicePdf } from '@/lib/invoicePdf';
import { useAuth } from '@/hooks/useAuth';
import { calculateOverdueFine } from '@/hooks/useOverdueCalc';
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
import type { Booking } from '@/types/schema';

export function MyBookingsPage() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const { allTenants } = useTenant();
  const [proofTarget, setProofTarget] = useState<Booking | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofUrlInput, setProofUrlInput] = useState('');
  const [uploading, setUploading] = useState(false);

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
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    },
  });

  const handleUploadProof = async () => {
    if (!db || !proofTarget || !userProfile) return;
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
        toast.error('Upload a transfer receipt image or paste a receipt URL.');
        setUploading(false);
        return;
      }

      await updateDoc(doc(db, 'bookings', proofTarget.id), {
        paymentProofUrl: finalUrl,
        paymentStatus: 'waiting_verification',
      });

      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast.success('Payment proof uploaded. Awaiting branch admin verification.');
      setProofTarget(null);
      setProofFile(null);
      setProofUrlInput('');
    } catch (error) {
      console.error('Upload proof error:', error);
      toast.error('Failed to upload payment proof.');
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmGearCondition = async (booking: Booking) => {
    if (!db || !booking.preRentalChecklist) return;
    try {
      await updateDoc(doc(db, 'bookings', booking.id), {
        preRentalChecklist: {
          ...booking.preRentalChecklist,
          confirmedByUserAt: Timestamp.now(),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast.success(`Handover condition confirmed for ${booking.invoiceNumber}.`);
    } catch (error) {
      console.error('Confirm handover error:', error);
      toast.error('Failed to confirm handover checklist.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="border-b border-zinc-200 pb-4">
        <h2 className="text-base font-semibold tracking-tight text-zinc-950">
          My Bookings &amp; Invoices
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Track serial-number allocations, submit transfer receipts, confirm pre-rental gear
          handovers, and download printable A4 invoices.
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-md border border-zinc-200 bg-white p-8 text-center font-mono text-xs text-zinc-400">
          LOADING BOOKINGS...
        </div>
      ) : bookings.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No reservations placed yet"
          description="Browse the Equipment Catalog, choose your shooting dates, and lock serialized units."
        />
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const tenant = allTenants.find((t) => t.id === booking.tenantId) ?? null;
            const overdue = calculateOverdueFine(booking, tenant);
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
                      {booking.paymentStatus === 'waiting_verification' ? (
                        <StatusBadge status="waiting_verification" label="Receipt Pending Review" />
                      ) : null}
                    </div>
                    <div
                      className="flex items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {booking.paymentStatus === 'unpaid' &&
                      booking.bookingStatus !== 'cancelled' ? (
                        <Button
                          size="sm"
                          onClick={() => {
                            setProofTarget(booking);
                            setProofUrlInput(booking.paymentProofUrl ?? '');
                          }}
                        >
                          <Upload className="h-3.5 w-3.5" strokeWidth={1.5} />
                          Upload Payment Proof
                        </Button>
                      ) : null}

                      {needsHandoverConfirm ? (
                        <Button
                          size="sm"
                          variant="mono"
                          onClick={() => void handleConfirmGearCondition(booking)}
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
                          Confirm Gear Condition
                        </Button>
                      ) : null}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDetailBookingId(booking.id)}
                      >
                        <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
                        Details
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          generateInvoicePdf({ booking, tenant, renter: userProfile })
                        }
                      >
                        <FileDown className="h-3.5 w-3.5" strokeWidth={1.5} />
                        A4 Invoice PDF
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pt-4 text-xs">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <p className="font-mono text-[10px] uppercase text-zinc-400">Rental Branch</p>
                      <p className="mt-0.5 font-medium text-zinc-900">
                        {tenant?.name ?? booking.tenantId}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {booking.logisticsType === 'delivery'
                          ? `Antar-Jemput (${booking.courierStatus ?? 'pending_dispatch'})`
                          : 'Self-Pickup at Branch'}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase text-zinc-400">Rental Window</p>
                      <p className="mt-0.5 font-mono text-[11px] text-zinc-900">
                        {formatDateTime(booking.startDate)}
                      </p>
                      <p className="font-mono text-[11px] text-zinc-500">
                        to {formatDateTime(booking.endDate)}
                      </p>
                      {booking.returnedAt ? (
                        <p className="mt-0.5 font-mono text-[10px] font-medium text-emerald-700">
                          Dikembalikan: {formatDateTime(booking.returnedAt)}
                        </p>
                      ) : overdue.isOverdue ? (
                        <p className="mt-0.5 font-mono text-[10px] font-semibold text-red-700">
                          OVERDUE +{overdue.billableLateHours}h · Est. Denda{' '}
                          <CurrencyText amount={overdue.estimatedFine} />
                        </p>
                      ) : null}
                    </div>
                    <div className="sm:text-right">
                      <p className="font-mono text-[10px] uppercase text-zinc-400">Total Payable</p>
                      <p className="mt-0.5 text-sm font-semibold text-zinc-950">
                        <CurrencyText amount={booking.totalAmount} />
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        Includes <CurrencyText amount={booking.deposit} /> refundable deposit
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-1.5">
                    <p className="font-mono text-[10px] uppercase text-zinc-400">
                      Allocated Physical Units ({booking.items.length})
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

                  {booking.paymentStatus === 'unpaid' && tenant?.bankDetails ? (
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2.5 font-mono text-[11px] text-zinc-700">
                      Transfer to <span className="font-semibold">{tenant.bankDetails.bankName}</span>{' '}
                      {tenant.bankDetails.accountNumber} ({tenant.bankDetails.accountHolder})
                    </div>
                  ) : null}

                  {booking.preRentalChecklist ? (
                    <div className="rounded-md border border-zinc-200 bg-zinc-50/70 p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-semibold uppercase text-zinc-500">
                          Pre-Rental Handover Checklist
                        </span>
                        {booking.preRentalChecklist.confirmedByUserAt ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" strokeWidth={1.5} />
                            Confirmed {formatDateTime(booking.preRentalChecklist.confirmedByUserAt)}
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] text-amber-700">
                            Awaiting your confirmation
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Transfer Receipt — {proofTarget?.invoiceNumber}</DialogTitle>
            <DialogDescription>
              Submit bank transfer confirmation for branch admin payment verification.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Receipt Image File (Firebase Storage)</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-1">
              <Label>Or Receipt URL (if Storage is not enabled yet)</Label>
              <Input
                placeholder="https://..."
                value={proofUrlInput}
                onChange={(e) => setProofUrlInput(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProofTarget(null)}>
              Cancel
            </Button>
            <Button disabled={uploading} onClick={() => void handleUploadProof()}>
              {uploading ? 'Submitting...' : 'Submit Payment Proof'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(() => {
        const selectedBooking = bookings.find((b) => b.id === detailBookingId) ?? null;
        const selectedTenant = selectedBooking
          ? allTenants.find((t) => t.id === selectedBooking.tenantId) ?? null
          : null;
        const canConfirm =
          Boolean(selectedBooking?.preRentalChecklist) &&
          !selectedBooking?.preRentalChecklist?.confirmedByUserAt;
        const canUpload =
          selectedBooking?.paymentStatus === 'unpaid' &&
          selectedBooking?.bookingStatus !== 'cancelled';

        return (
          <BookingDetailModal
            open={Boolean(selectedBooking)}
            onOpenChange={(open) => !open && setDetailBookingId(null)}
            booking={selectedBooking}
            tenant={selectedTenant}
            renter={userProfile}
            footerActions={
              selectedBooking ? (
                <>
                  {canUpload ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setProofTarget(selectedBooking);
                        setProofUrlInput(selectedBooking.paymentProofUrl ?? '');
                      }}
                    >
                      <Upload className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Upload Proof
                    </Button>
                  ) : null}
                  {canConfirm ? (
                    <Button
                      size="sm"
                      variant="mono"
                      onClick={() => void handleConfirmGearCondition(selectedBooking)}
                    >
                      <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Confirm Gear Condition
                    </Button>
                  ) : null}
                </>
              ) : null
            }
          />
        );
      })()}
    </div>
  );
}

