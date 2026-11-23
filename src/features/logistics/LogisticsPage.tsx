import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
  ArrowRight,
  ExternalLink,
  MapPin,
  Navigation,
  Truck,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { buildGoogleMapsDirectionUrl } from '@/lib/geo';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { calculateOverdueFine } from '@/hooks/useOverdueCalc';
import { useTenant } from '@/hooks/useTenant';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { LocationPickerModal } from '@/components/shared/LocationPickerModal';
import { MembershipBadge } from '@/components/shared/MembershipBadge';
import { SerialNumberTag } from '@/components/shared/SerialNumberTag';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  Booking,
  CourierStatus,
  StaffRole,
  TenantStaff,
  UserProfile,
} from '@/types/schema';

const COURIER_STEPS: { key: CourierStatus; label: string }[] = [
  { key: 'pending_dispatch', label: 'Pending Dispatch' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'delivered', label: 'Delivered to Set' },
  { key: 'pickup_scheduled', label: 'Pickup Scheduled' },
  { key: 'returned', label: 'Returned to House' },
];

const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  courier: 'Kurir',
  technician: 'Teknisi',
  admin_ops: 'Ops',
};

interface SelectableCourierOption {
  id: string;
  name: string;
  phone: string;
  label: string;
}

export function LogisticsPage() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const { activeTenantId, activeTenant } = useTenant();

  const [selectedCourierByBooking, setSelectedCourierByBooking] = useState<Record<string, string>>(
    {}
  );
  const [mapBooking, setMapBooking] = useState<Booking | null>(null);

  const { data: deliveries = [], isLoading } = useQuery<Booking[]>({
    queryKey: ['logistics', activeTenantId],
    enabled: Boolean(db && activeTenantId),
    queryFn: async () => {
      if (!db || !activeTenantId) return [];
      const snap = await getDocs(
        query(
          collection(db, 'bookings'),
          where('tenantId', '==', activeTenantId),
          where('logisticsType', '==', 'delivery')
        )
      );
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Booking)
        .filter((b) => b.bookingStatus !== 'cancelled')
        .sort((a, b) => b.startDate.toMillis() - a.startDate.toMillis());
    },
  });

  const { data: branchStaff = [] } = useQuery<TenantStaff[]>({
    queryKey: ['tenant_staff', activeTenantId],
    enabled: Boolean(db && activeTenantId),
    queryFn: async () => {
      if (!db || !activeTenantId) return [];
      const snap = await getDocs(
        query(collection(db, 'tenant_staff'), where('tenantId', '==', activeTenantId))
      );
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as TenantStaff)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const { data: branchAdmins = [] } = useQuery<UserProfile[]>({
    queryKey: ['tenant_admin_staff', activeTenantId],
    enabled: Boolean(db && activeTenantId),
    queryFn: async () => {
      if (!db || !activeTenantId) return [];
      const snap = await getDocs(
        query(
          collection(db, 'users'),
          where('tenantId', '==', activeTenantId),
          where('role', '==', 'admin')
        )
      );
      return snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile);
    },
  });

  const courierOptions = useMemo<SelectableCourierOption[]>(() => {
    const fromStaff: SelectableCourierOption[] = branchStaff
      .filter((s) => s.isActive)
      .map((s) => ({
        id: s.id,
        name: s.vehicleInfo ? `${s.name} (${s.vehicleInfo})` : s.name,
        phone: s.phone,
        label: s.vehicleInfo
          ? `${s.name} · ${STAFF_ROLE_LABELS[s.role]} · ${s.vehicleInfo}`
          : `${s.name} · ${STAFF_ROLE_LABELS[s.role]}`,
      }));

    const linkedStaffUids = new Set(branchStaff.map((s) => s.userId).filter(Boolean));
    const fromAdmins: SelectableCourierOption[] = branchAdmins
      .filter((u) => !linkedStaffUids.has(u.uid))
      .map((u) => ({
        id: `admin_${u.uid}`,
        name: u.displayName,
        phone: u.phone ?? '',
        label: `${u.displayName} · Branch Admin`,
      }));

    return [...fromStaff, ...fromAdmins];
  }, [branchStaff, branchAdmins]);

  if (!activeTenantId || !activeTenant) {
    return (
      <EmptyState
        icon={Truck}
        title="No active rental branch selected"
        description="Select a tenant branch to track Antar-Jemput dispatches."
      />
    );
  }

  const handleAssignCourier = async (booking: Booking) => {
    if (!db) return;
    if (booking.bookingStatus === 'completed') {
      toast.info('Booking sudah selesai (Completed). Kurir tidak dapat diubah.');
      return;
    }

    const chosenId = selectedCourierByBooking[booking.id] ?? booking.courierId ?? '';
    const chosen = courierOptions.find((c) => c.id === chosenId);
    if (!chosen) {
      toast.error('Pilih karyawan / kurir cabang dari daftar terlebih dahulu.');
      return;
    }

    try {
      await updateDoc(doc(db, 'bookings', booking.id), {
        courierId: chosen.id,
        courierName: chosen.name,
        courierPhone: chosen.phone,
        courierStatus: booking.courierStatus ?? 'pending_dispatch',
      });
      await queryClient.invalidateQueries({ queryKey: ['logistics', activeTenantId] });
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast.success(`Kurir ${chosen.name} ditugaskan ke ${booking.invoiceNumber}.`);
    } catch (error) {
      console.error('Assign courier error:', error);
      toast.error('Gagal menugaskan kurir.');
    }
  };

  const handleAdvanceStatus = async (booking: Booking, nextStatus: CourierStatus) => {
    if (!db) return;
    if (booking.bookingStatus === 'completed') {
      toast.info('Booking ini sudah selesai (Completed). Checkpoint logistik terkunci.');
      return;
    }

    try {
      const nowDate = new Date();
      const now = Timestamp.fromDate(nowDate);
      let overduePatch: Partial<Booking> = {};

      if (nextStatus === 'returned') {
        const overdue = calculateOverdueFine(booking, activeTenant, nowDate);
        if (overdue.isOverdue && booking.overdueFine === 0) {
          overduePatch = {
            bookingStatus: 'overdue',
            overdueFine: overdue.estimatedFine,
            totalAmount:
              booking.subtotal +
              booking.deliveryFee +
              booking.deposit +
              booking.damageFine +
              overdue.estimatedFine,
          };

          if (userProfile) {
            await addDoc(collection(db, 'transactions'), {
              tenantId: booking.tenantId,
              bookingId: booking.id,
              type: 'overdue_fine',
              category: 'revenue',
              amount: overdue.estimatedFine,
              paymentMethod: 'bank_transfer',
              notes: `Auto overdue fine on courier return (${overdue.billableLateHours}h late) for ${booking.invoiceNumber}`,
              verifiedBy: userProfile.uid,
              createdAt: now,
            });
          }
          toast.warning(
            `Unit kembali terlambat +${overdue.billableLateHours} jam. Denda Rp ${overdue.estimatedFine.toLocaleString('id-ID')} otomatis dicatat ke Cash Flow.`
          );
        }
      }

      await updateDoc(doc(db, 'bookings', booking.id), {
        courierStatus: nextStatus,
        [`courierTimestamps.${nextStatus}`]: now,
        ...(nextStatus === 'returned' ? { returnedAt: now } : {}),
        ...overduePatch,
      });
      await queryClient.invalidateQueries({ queryKey: ['logistics', activeTenantId] });
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['inspections'] });
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success(`Dispatch status updated to ${nextStatus.replace(/_/g, ' ')}.`);
    } catch (error) {
      console.error('Advance courier status error:', error);
      toast.error('Failed to update courier checkpoint.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="border-b border-zinc-200 pb-4">
        <h2 className="text-base font-semibold tracking-tight text-zinc-950">
          Antar-Jemput Courier Dispatch
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Branch: <span className="font-medium text-zinc-800">{activeTenant.name}</span> · Rate:{' '}
          <CurrencyText amount={activeTenant.deliveryRatePerKm} suffix="/km" /> · Tugaskan kurir
          dari menu{' '}
          <Link to="/admin/staff" className="font-medium text-primary hover:underline">
            Staff &amp; Karyawan
          </Link>
          .
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-md border border-zinc-200 bg-white p-8 text-center font-mono text-xs text-zinc-400">
          LOADING DISPATCH QUEUE...
        </div>
      ) : deliveries.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No Antar-Jemput deliveries queued"
          description="Bookings placed with Antar-Jemput delivery mode will appear here for courier assignment."
        />
      ) : (
        <div className="space-y-4">
          {deliveries.map((booking) => {
            const currentStatus = booking.courierStatus ?? 'pending_dispatch';
            const currentIdx = COURIER_STEPS.findIndex((s) => s.key === currentStatus);
            const nextStep = COURIER_STEPS[currentIdx + 1];
            const isCompleted = booking.bookingStatus === 'completed';
            const activeSelectedId =
              selectedCourierByBooking[booking.id] ?? booking.courierId ?? '';

            return (
              <Card key={booking.id} className="shadow-none">
                <CardHeader className="border-b border-zinc-100 pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <CardTitle className="font-mono text-sm">{booking.invoiceNumber}</CardTitle>
                      <StatusBadge status={booking.bookingStatus} />
                      {booking.membershipTier === 'premium' ? (
                        <MembershipBadge tier="premium" />
                      ) : null}
                      <span className="font-mono text-[11px] text-zinc-500">
                        Fee: <CurrencyText amount={booking.deliveryFee} />
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-zinc-500">
                      {formatDateTime(booking.startDate)} → {formatDateTime(booking.endDate)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-4 text-xs">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                    <div className="space-y-1 md:col-span-5">
                      <p className="flex items-center gap-1 font-mono text-[10px] uppercase text-zinc-400">
                        <MapPin className="h-3 w-3" strokeWidth={1.5} />
                        Destination Address
                      </p>
                      <p className="text-zinc-800">{booking.deliveryAddress ?? '—'}</p>
                      {booking.deliveryCoordinates ? (
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          <span className="font-mono text-[10px] text-zinc-500">
                            {booking.deliveryCoordinates.lat.toFixed(5)},{' '}
                            {booking.deliveryCoordinates.lng.toFixed(5)}
                            {booking.deliveryDistanceKm ? ` · ${booking.deliveryDistanceKm} km` : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => setMapBooking(booking)}
                            className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
                          >
                            <Navigation className="h-2.5 w-2.5" strokeWidth={1.5} />
                            Lihat Pin Peta
                          </button>
                          <a
                            href={buildGoogleMapsDirectionUrl(
                              activeTenant.coordinates,
                              booking.deliveryCoordinates
                            )}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-zinc-600 hover:underline"
                          >
                            Google Maps
                            <ExternalLink className="h-2.5 w-2.5" strokeWidth={1.5} />
                          </a>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-1 pt-1">
                        {booking.items.map((item) => (
                          <SerialNumberTag key={item.unitId} serialNumber={item.serialNumber} />
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5 md:col-span-4">
                      <p className="font-mono text-[10px] uppercase text-zinc-400">
                        Assigned Courier (Karyawan Cabang)
                      </p>

                      {courierOptions.length === 0 ? (
                        <div className="rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
                          Belum ada karyawan cabang aktif. Tambahkan di menu{' '}
                          <Link to="/admin/staff" className="font-semibold underline">
                            Staff &amp; Karyawan
                          </Link>
                          .
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Select
                            value={activeSelectedId}
                            disabled={isCompleted}
                            onValueChange={(val) =>
                              setSelectedCourierByBooking((prev) => ({
                                ...prev,
                                [booking.id]: val,
                              }))
                            }
                          >
                            <SelectTrigger className="flex-1 bg-white">
                              <SelectValue
                                placeholder={
                                  booking.courierName
                                    ? `${booking.courierName} (tersimpan)`
                                    : 'Pilih karyawan cabang...'
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {courierOptions.map((opt) => (
                                <SelectItem key={opt.id} value={opt.id}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isCompleted || !activeSelectedId}
                            onClick={() => void handleAssignCourier(booking)}
                          >
                            <UserCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
                            Assign
                          </Button>
                        </div>
                      )}

                      {booking.courierName ? (
                        <p className="font-mono text-[10px] text-zinc-500">
                          Terpilih: <span className="text-zinc-900">{booking.courierName}</span>
                          {booking.courierPhone ? ` · ${booking.courierPhone}` : ''}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex items-end justify-end md:col-span-3">
                      {nextStep && !isCompleted ? (
                        <Button
                          size="sm"
                          onClick={() => void handleAdvanceStatus(booking, nextStep.key)}
                        >
                          {nextStep.label}
                          <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </Button>
                      ) : (
                        <div className="text-right">
                          <span className="block font-mono text-[11px] font-medium text-emerald-700">
                            DISPATCH CYCLE COMPLETE
                          </span>
                          {booking.returnedAt || booking.courierTimestamps?.returned ? (
                            <span className="font-mono text-[10px] text-zinc-500">
                              Dikembalikan:{' '}
                              {formatDateTime(
                                booking.returnedAt ?? booking.courierTimestamps?.returned
                              )}
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Horizontal Checkpoint Stepper */}
                  <div className="grid grid-cols-2 gap-1.5 pt-1 sm:grid-cols-5">
                    {COURIER_STEPS.map((step, idx) => {
                      const done = idx <= currentIdx;
                      const stepTs = booking.courierTimestamps?.[step.key];
                      return (
                        <button
                          key={step.key}
                          type="button"
                          disabled={isCompleted}
                          onClick={() => void handleAdvanceStatus(booking, step.key)}
                          className={`rounded border px-2 py-1.5 text-left transition-colors disabled:cursor-not-allowed ${
                            done
                              ? 'border-zinc-900 bg-zinc-900 text-white'
                              : 'border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100'
                          }`}
                        >
                          <span className="block font-mono text-[9px] opacity-70">0{idx + 1}</span>
                          <span className="block truncate text-[11px] font-medium">
                            {step.label}
                          </span>
                          <span
                            className={`mt-0.5 block truncate font-mono text-[9px] ${
                              done ? 'text-zinc-300' : 'text-zinc-400'
                            }`}
                          >
                            {stepTs ? formatDateTime(stepTs) : done ? 'Selesai' : '—'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {mapBooking?.deliveryCoordinates ? (
        <LocationPickerModal
          open={Boolean(mapBooking)}
          onOpenChange={(open) => !open && setMapBooking(null)}
          branchName={activeTenant.name}
          branchCoordinates={activeTenant.coordinates}
          initialCoordinates={mapBooking.deliveryCoordinates}
          initialAddress={mapBooking.deliveryAddress ?? ''}
          readOnly
        />
      ) : null}
    </div>
  );
}
