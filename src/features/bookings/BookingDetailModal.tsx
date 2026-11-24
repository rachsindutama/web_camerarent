import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  CreditCard,
  ExternalLink,
  Eye,
  FileDown,
  MapPin,
  Navigation,
  Receipt,
  Truck,
  User,
} from 'lucide-react';
import { calculateRentalDays } from '@/lib/availability';
import { buildGoogleMapsDirectionUrl } from '@/lib/geo';
import { generateHandoverPdf } from '@/lib/handoverPdf';
import { generateInvoicePdf } from '@/lib/invoicePdf';
import { resolveBookingUnitsMap } from '@/lib/pdfUnits';
import { formatDateTime } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { calculateOverdueFine } from '@/hooks/useOverdueCalc';
import { CurrencyText } from '@/components/shared/CurrencyText';
import {
  ImagePreviewModal,
  type PreviewImageItem,
} from '@/components/shared/ImagePreviewModal';
import { LocationPickerModal } from '@/components/shared/LocationPickerModal';
import { MembershipBadge } from '@/components/shared/MembershipBadge';
import { SerialNumberTag } from '@/components/shared/SerialNumberTag';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Booking, EquipmentUnit, Tenant, UserProfile } from '@/types/schema';

interface BookingDetailModalProps {
  booking: Booking | null;
  tenant: Tenant | null;
  renter?: Pick<UserProfile, 'displayName' | 'email' | 'phone' | 'nik'> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  footerActions?: React.ReactNode;
}

export function BookingDetailModal({
  booking,
  tenant,
  renter,
  open,
  onOpenChange,
  footerActions,
}: BookingDetailModalProps) {
  const { tx } = useI18n();
  const [previewState, setPreviewState] = useState<{
    open: boolean;
    title: string;
    images: PreviewImageItem[];
    index: number;
  }>({ open: false, title: 'Document Preview', images: [], index: 0 });
  const [mapPreviewOpen, setMapPreviewOpen] = useState(false);

  const { data: unitsById = {} } = useQuery<Record<string, EquipmentUnit>>({
    queryKey: ['booking-units', booking?.id ?? 'none'],
    enabled: Boolean(open && booking),
    staleTime: 60_000,
    queryFn: async () => (booking ? resolveBookingUnitsMap(booking) : {}),
  });

  if (!booking) return null;

  const rentalDays = calculateRentalDays(booking.startDate.toDate(), booking.endDate.toDate());
  const handoverPhotos = booking.preRentalChecklist?.photos ?? [];
  const discountAmount = booking.discountAmount ?? 0;
  const grossSubtotal = booking.subtotal + discountAmount;
  const liveOverdue = calculateOverdueFine(
    booking,
    tenant,
    booking.returnedAt ? booking.returnedAt.toDate() : new Date()
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[88vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          {/* Clean Editorial Header */}
          <DialogHeader className="shrink-0 border-b border-zinc-200 bg-zinc-50/80 px-6 py-4 pr-12">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="font-mono text-base font-semibold tracking-tight text-zinc-950">
                {booking.invoiceNumber}
              </DialogTitle>
              <StatusBadge status={booking.bookingStatus} />
              {booking.membershipTier ? <MembershipBadge tier={booking.membershipTier} /> : null}
              <span className="rounded border border-zinc-200 bg-white px-2 py-0.5 font-mono text-[10px] font-medium uppercase text-zinc-600">
                PAY: {booking.paymentStatus}
              </span>
            </div>
            <DialogDescription className="mt-1 font-mono text-[11px] text-zinc-500">
              ID: {booking.id} · {tx('Created', 'Dibuat')} {formatDateTime(booking.createdAt)}
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable Body */}
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5 text-xs">
            {/* Top 2-Column Overview */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Left: Branch & Logistics */}
              <div className="flex flex-col justify-between space-y-3 rounded-md border border-zinc-200 bg-white p-4">
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    <Building2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {tx('Branch & Logistics', 'Cabang & Logistik')}
                  </p>
                  <div>
                    <p className="text-sm font-semibold text-zinc-950">
                      {tenant?.name ?? booking.tenantId}
                    </p>
                    {tenant?.address ? (
                      <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
                        {tenant.address}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2 border-t border-zinc-100 pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-medium text-zinc-800">
                      <Truck className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.5} />
                      {booking.logisticsType === 'delivery'
                        ? tx('Delivery & Pickup', 'Antar-Jemput')
                        : tx('Self-Pickup at Branch', 'Self-Pickup di Cabang')}
                    </span>
                    {booking.logisticsType === 'delivery' ? (
                      <span className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-600">
                        {(booking.courierStatus ?? 'pending_dispatch').replace(/_/g, ' ')}
                      </span>
                    ) : null}
                  </div>

                  {booking.courierName ? (
                    <p className="font-mono text-[11px] text-zinc-600">
                      {tx('Courier:', 'Kurir:')}{' '}
                      <span className="text-zinc-900">{booking.courierName}</span>
                      {booking.courierPhone ? (
                        <span className="text-zinc-500"> · {booking.courierPhone}</span>
                      ) : null}
                    </p>
                  ) : null}

                  {booking.deliveryAddress ? (
                    <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-zinc-600">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" strokeWidth={1.5} />
                      <span>{booking.deliveryAddress}</span>
                    </p>
                  ) : null}

                  {booking.deliveryCoordinates ? (
                    <div className="space-y-2 rounded border border-zinc-200 bg-zinc-50 p-2.5">
                      <div className="flex items-center justify-between font-mono text-[10px] text-zinc-600">
                        <span>
                          {booking.deliveryCoordinates.lat.toFixed(5)},{' '}
                          {booking.deliveryCoordinates.lng.toFixed(5)}
                        </span>
                        {booking.deliveryDistanceKm ? (
                          <span className="font-semibold text-zinc-900">
                            {booking.deliveryDistanceKm} km
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {tenant ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 flex-1 bg-white text-[11px]"
                            onClick={() => setMapPreviewOpen(true)}
                          >
                            <Navigation className="h-3 w-3 text-primary" strokeWidth={1.5} />
                            {tx('View Map Pin', 'Lihat Pin Peta')}
                          </Button>
                        ) : null}
                        <Button
                          asChild
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 flex-1 bg-white text-[11px]"
                        >
                          <a
                            href={buildGoogleMapsDirectionUrl(
                              tenant?.coordinates,
                              booking.deliveryCoordinates
                            )}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="h-3 w-3 text-zinc-500" strokeWidth={1.5} />
                            Google Maps
                          </a>
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Right: Schedule & Renter */}
              <div className="flex flex-col justify-between space-y-3 rounded-md border border-zinc-200 bg-white p-4">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.5} />
                      {tx('Rental Schedule', 'Jadwal Sewa')}
                    </p>
                    <span className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-700">
                      {rentalDays} {tx('DAYS', 'HARI')}
                    </span>
                  </div>

                  <div className="space-y-1.5 rounded border border-zinc-100 bg-zinc-50/70 p-2.5 font-mono text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-zinc-400">{tx('START', 'MULAI')}</span>
                      <span className="font-medium text-zinc-950">
                        {formatDateTime(booking.startDate)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-zinc-400">{tx('DUE RETURN', 'BATAS KEMBALI')}</span>
                      <span className="font-medium text-zinc-950">
                        {formatDateTime(booking.endDate)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-zinc-400">BUFFER END</span>
                      <span className="text-zinc-500">{formatDateTime(booking.bufferEndDate)}</span>
                    </div>
                    {booking.dispatchedAt ? (
                      <div className="flex items-center justify-between gap-2 border-t border-zinc-200 pt-1.5">
                        <span className="text-zinc-400">{tx('DISPATCHED', 'DISERAHKAN')}</span>
                        <span className="text-zinc-700">
                          {formatDateTime(booking.dispatchedAt)}
                        </span>
                      </div>
                    ) : null}
                    {booking.returnedAt || booking.bookingStatus === 'completed' ? (
                      <div className="-mx-2.5 -mb-2.5 mt-1.5 flex items-center justify-between gap-2 rounded-b border-t border-emerald-200 bg-emerald-50/70 px-2.5 py-1.5 text-emerald-800">
                        <span className="font-semibold">{tx('RETURNED', 'DIKEMBALIKAN')}</span>
                        <span className="font-semibold">
                          {booking.returnedAt
                            ? formatDateTime(booking.returnedAt)
                            : tx('Recorded Complete', 'Tercatat Selesai')}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  {booking.returnNotes ? (
                    <p className="rounded border border-emerald-200 bg-emerald-50/40 px-2.5 py-1.5 text-[11px] text-emerald-900">
                      {booking.returnNotes}
                    </p>
                  ) : null}
                </div>

                {renter ? (
                  <div className="space-y-1.5 border-t border-zinc-100 pt-3">
                    <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      <User className="h-3.5 w-3.5" strokeWidth={1.5} />
                      {tx('Renter Details', 'Data Penyewa')}
                    </p>
                    <p className="font-semibold text-zinc-950">{renter.displayName}</p>
                    <div className="space-y-0.5 font-mono text-[11px] text-zinc-600">
                      <p className="truncate">{renter.email}</p>
                      {renter.phone ? (
                        <p>
                          {tx('Phone:', 'HP:')} {renter.phone}
                        </p>
                      ) : null}
                      {renter.nik ? <p>NIK: {renter.nik}</p> : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Allocated Physical Equipment Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {tx(
                    `Allocated Physical Units (${booking.items.length} Units)`,
                    `Unit Fisik Teralokasi (${booking.items.length} Unit)`
                  )}
                </p>
                <span className="font-mono text-[10px] text-zinc-400">
                  SERIAL-NUMBER TRACKED
                </span>
              </div>
              <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
                <table className="w-full text-xs">
                  <thead className="border-b border-zinc-200 bg-zinc-50 font-mono text-[10px] uppercase text-zinc-500">
                    <tr>
                      <th className="px-3.5 py-2 text-left">
                        {tx('Equipment & Included Accessories', 'Alat & Kelengkapan Aksesoris')}
                      </th>
                      <th className="px-3.5 py-2 text-left">Serial Number</th>
                      <th className="px-3.5 py-2 text-right">{tx('Daily Rate', 'Tarif / Hari')}</th>
                      <th className="px-3.5 py-2 text-right">
                        Subtotal ({rentalDays}
                        {tx('d', 'h')})
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {booking.items.map((item) => {
                      const unit = unitsById[item.unitId];
                      const accessories = unit?.accessoriesIncluded ?? [];
                      return (
                        <tr key={item.unitId}>
                          <td className="px-3.5 py-2.5 align-top">
                            <p className="font-medium text-zinc-950">{item.equipmentName}</p>
                            {accessories.length > 0 ? (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {accessories.map((acc) => (
                                  <span
                                    key={acc}
                                    className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] text-zinc-600"
                                  >
                                    {acc}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3.5 py-2.5 align-top">
                            <SerialNumberTag serialNumber={item.serialNumber} />
                          </td>
                          <td className="px-3.5 py-2.5 text-right align-top text-zinc-600">
                            <CurrencyText amount={item.dailyRate} />
                          </td>
                          <td className="px-3.5 py-2.5 text-right align-top font-medium text-zinc-950">
                            <CurrencyText amount={item.dailyRate * rentalDays} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Lifecycle Timestamp Audit Timeline */}
            <div className="space-y-2.5 rounded-md border border-zinc-200 bg-white p-4">
              <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                <Clock className="h-3.5 w-3.5" strokeWidth={1.5} />
                {tx('Booking Audit Timeline', 'Riwayat Timestamp Booking')}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                <div className="rounded border border-zinc-100 bg-zinc-50 px-2.5 py-2">
                  <p className="font-mono text-[9px] uppercase text-zinc-400">
                    {tx('01 · Booking Created', '01 · Booking Dibuat')}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] font-medium text-zinc-900">
                    {formatDateTime(booking.createdAt)}
                  </p>
                </div>

                {booking.paidAt ? (
                  <div className="rounded border border-zinc-100 bg-zinc-50 px-2.5 py-2">
                    <p className="font-mono text-[9px] uppercase text-zinc-400">
                      {tx('02 · Payment Verified', '02 · Pembayaran Terverifikasi')}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] font-medium text-zinc-900">
                      {formatDateTime(booking.paidAt)}
                    </p>
                  </div>
                ) : null}

                {booking.preRentalChecklist?.confirmedByUserAt ? (
                  <div className="rounded border border-zinc-100 bg-zinc-50 px-2.5 py-2">
                    <p className="font-mono text-[9px] uppercase text-zinc-400">
                      {tx('03 · Handover Confirmed', '03 · Handover Dikonfirmasi')}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] font-medium text-zinc-900">
                      {formatDateTime(booking.preRentalChecklist.confirmedByUserAt)}
                    </p>
                  </div>
                ) : null}

                {booking.dispatchedAt ? (
                  <div className="rounded border border-zinc-100 bg-zinc-50 px-2.5 py-2">
                    <p className="font-mono text-[9px] uppercase text-zinc-400">
                      {tx('04 · Gear Dispatched', '04 · Barang Diserahkan')}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] font-medium text-zinc-900">
                      {formatDateTime(booking.dispatchedAt)}
                    </p>
                  </div>
                ) : null}

                {booking.courierTimestamps?.delivered ? (
                  <div className="rounded border border-zinc-100 bg-zinc-50 px-2.5 py-2">
                    <p className="font-mono text-[9px] uppercase text-zinc-400">
                      {tx('Courier · Delivered', 'Kurir · Tiba di Lokasi')}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] font-medium text-zinc-900">
                      {formatDateTime(booking.courierTimestamps.delivered)}
                    </p>
                  </div>
                ) : null}

                {booking.courierTimestamps?.pickup_scheduled ? (
                  <div className="rounded border border-zinc-100 bg-zinc-50 px-2.5 py-2">
                    <p className="font-mono text-[9px] uppercase text-zinc-400">
                      {tx('Courier · Return Pickup', 'Kurir · Penjemputan')}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] font-medium text-zinc-900">
                      {formatDateTime(booking.courierTimestamps.pickup_scheduled)}
                    </p>
                  </div>
                ) : null}

                {booking.returnedAt || booking.courierTimestamps?.returned ? (
                  <div className="rounded border border-emerald-200 bg-emerald-50/70 px-2.5 py-2">
                    <p className="font-mono text-[9px] font-semibold uppercase text-emerald-700">
                      {tx('Gear Returned', 'Barang Dikembalikan')}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] font-semibold text-emerald-950">
                      {formatDateTime(
                        booking.returnedAt ?? booking.courierTimestamps?.returned
                      )}
                    </p>
                  </div>
                ) : booking.bookingStatus === 'completed' ? (
                  <div className="rounded border border-emerald-200 bg-emerald-50/70 px-2.5 py-2">
                    <p className="font-mono text-[9px] font-semibold uppercase text-emerald-700">
                      {tx('Gear Returned', 'Barang Dikembalikan')}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] font-semibold text-emerald-950">
                      {tx('Completed (legacy)', 'Selesai (data lama)')}
                    </p>
                  </div>
                ) : null}

                {booking.cancelledAt ? (
                  <div className="rounded border border-red-200 bg-red-50/70 px-2.5 py-2">
                    <p className="font-mono text-[9px] font-semibold uppercase text-red-700">
                      {tx('Booking Cancelled', 'Booking Dibatalkan')}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] font-semibold text-red-950">
                      {formatDateTime(booking.cancelledAt)}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Bottom 2-Column: Handover & Financial Breakdown */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Pre-Rental Handover & Bank Info */}
              <div className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {tx('Pre-Rental Handover', 'Serah Terima Pra-Sewa')}
                  </span>
                  {booking.preRentalChecklist?.confirmedByUserAt ? (
                    <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" strokeWidth={1.5} />
                      {tx('Confirmed', 'Dikonfirmasi')}
                    </span>
                  ) : booking.preRentalChecklist ? (
                    <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] text-amber-800">
                      {tx('Pending Confirmation', 'Menunggu Konfirmasi')}
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-zinc-400">
                      {tx('Not Recorded Yet', 'Belum Dicatat')}
                    </span>
                  )}
                </div>

                {booking.preRentalChecklist ? (
                  <div className="space-y-2">
                    <p className="rounded border border-zinc-100 bg-zinc-50 p-2.5 text-[11px] leading-relaxed text-zinc-700">
                      {booking.preRentalChecklist.notes}
                    </p>
                    {booking.preRentalChecklist.confirmedByUserAt ? (
                      <p className="font-mono text-[10px] text-zinc-400">
                        {tx('Confirmed', 'Dikonfirmasi')}{' '}
                        {formatDateTime(booking.preRentalChecklist.confirmedByUserAt)}
                      </p>
                    ) : null}
                    {handoverPhotos.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {handoverPhotos.map((url, idx) => (
                          <button
                            key={url}
                            type="button"
                            onClick={() =>
                              setPreviewState({
                                open: true,
                                title: `${tx('Pre-Rental Handover', 'Serah Terima Pra-Sewa')} — ${booking.invoiceNumber}`,
                                images: handoverPhotos.map((u, i) => ({
                                  url: u,
                                  label: `${tx('Handover Photo', 'Foto Serah Terima')} ${i + 1}`,
                                })),
                                index: idx,
                              })
                            }
                            className="group relative h-14 w-14 overflow-hidden rounded border border-zinc-200"
                          >
                            <img
                              src={url}
                              alt={`Handover ${idx + 1}`}
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-[11px] leading-relaxed text-zinc-400">
                    {tx(
                      'Branch admin will log condition photos & checklist before equipment handover.',
                      'Admin akan mencatat foto & checklist kondisi fisik sebelum unit diserahkan.'
                    )}
                  </p>
                )}

                {booking.paymentStatus === 'unpaid' && tenant?.bankDetails ? (
                  <div className="space-y-1 rounded border border-zinc-200 bg-zinc-50 p-2.5 text-[11px]">
                    <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase text-zinc-500">
                      <CreditCard className="h-3 w-3" strokeWidth={1.5} />
                      {tx('Payment Bank Account', 'Rekening Pembayaran')}
                    </p>
                    <p className="font-mono font-semibold text-zinc-900">
                      {tenant.bankDetails.bankName} · {tenant.bankDetails.accountNumber}
                    </p>
                    <p className="text-zinc-600">
                      {tx('Holder:', 'a/n')} {tenant.bankDetails.accountHolder}
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Financial Breakdown (Arithmetically Transparent) */}
              <div className="flex flex-col justify-between space-y-3 rounded-md border border-zinc-200 bg-white p-4">
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    <Receipt className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {tx('Payment Breakdown', 'Rincian Pembayaran')}
                  </p>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-zinc-600">
                      <span>{tx('Rental Subtotal', 'Subtotal Sewa')}</span>
                      <CurrencyText amount={grossSubtotal} />
                    </div>
                    {discountAmount > 0 ? (
                      <div className="flex justify-between text-emerald-700">
                        <span>{tx('Member Discount', 'Diskon Member')}</span>
                        <span className="font-mono tabular-nums">
                          - <CurrencyText amount={discountAmount} />
                        </span>
                      </div>
                    ) : null}
                    <div className="flex justify-between text-zinc-600">
                      <span>{tx('Delivery Fee', 'Biaya Antar-Jemput')}</span>
                      <CurrencyText amount={booking.deliveryFee} />
                    </div>
                    <div className="flex justify-between text-zinc-600">
                      <span>{tx('Security Deposit (Liability)', 'Deposit Jaminan (Liability)')}</span>
                      <CurrencyText amount={booking.deposit} />
                    </div>
                    {booking.overdueFine > 0 ? (
                      <div className="flex justify-between text-red-700">
                        <span>{tx('Overdue Fine', 'Denda Keterlambatan')}</span>
                        <CurrencyText amount={booking.overdueFine} />
                      </div>
                    ) : liveOverdue.isOverdue ? (
                      <div className="flex justify-between text-red-700">
                        <span>
                          {tx(
                            `Est. Overdue Fine (+${liveOverdue.billableLateHours}h)`,
                            `Estimasi Denda Telat (+${liveOverdue.billableLateHours} jam)`
                          )}
                        </span>
                        <CurrencyText amount={liveOverdue.estimatedFine} />
                      </div>
                    ) : null}
                    {booking.damageFine > 0 ? (
                      <div className="flex justify-between text-red-700">
                        <span>{tx('Damage Fine', 'Denda Kerusakan')}</span>
                        <CurrencyText amount={booking.damageFine} />
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <Separator />
                  <div className="flex items-center justify-between text-sm font-semibold text-zinc-950">
                    <span>{tx('Total Payable', 'Total Tagihan')}</span>
                    <CurrencyText amount={booking.totalAmount} />
                  </div>

                  {booking.paymentProofUrl ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() =>
                        setPreviewState({
                          open: true,
                          title: `${tx('Transfer Receipt', 'Bukti Transfer')} — ${booking.invoiceNumber}`,
                          images: [
                            {
                              url: booking.paymentProofUrl!,
                              label: `Payment Proof (${booking.invoiceNumber})`,
                            },
                          ],
                          index: 0,
                        })
                      }
                    >
                      <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
                      {tx('Preview Transfer Receipt', 'Preview Bukti Transfer')}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Footer */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-zinc-200 bg-zinc-50/80 px-6 py-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-white"
                onClick={() => void generateInvoicePdf({ booking, tenant, renter, unitsById })}
              >
                <FileDown className="h-3.5 w-3.5" strokeWidth={1.5} />
                {tx('Download A4 Invoice PDF', 'Unduh Invoice PDF A4')}
              </Button>
              {['confirmed', 'active_rent', 'overdue', 'completed'].includes(
                booking.bookingStatus
              ) ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="bg-white"
                  onClick={() => void generateHandoverPdf({ booking, tenant, renter, unitsById })}
                >
                  <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
                  {tx('Download BAST PDF', 'Unduh BAST PDF')}
                </Button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {footerActions}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-white"
                onClick={() => onOpenChange(false)}
              >
                {tx('Close', 'Tutup')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ImagePreviewModal
        open={previewState.open}
        onOpenChange={(o) => setPreviewState((prev) => ({ ...prev, open: o }))}
        images={previewState.images}
        initialIndex={previewState.index}
        title={previewState.title}
      />

      {tenant && booking.deliveryCoordinates ? (
        <LocationPickerModal
          open={mapPreviewOpen}
          onOpenChange={setMapPreviewOpen}
          branchName={tenant.name}
          branchCoordinates={tenant.coordinates}
          initialCoordinates={booking.deliveryCoordinates}
          initialAddress={booking.deliveryAddress ?? ''}
          readOnly
        />
      ) : null}
    </>
  );
}
