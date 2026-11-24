import { calculateRentalDays } from '@/lib/availability';
import { txStatic } from '@/lib/i18n';
import { getMembershipBenefits, type PlatformSettings } from '@/lib/membership';
import { formatDateTime, formatIDR } from '@/lib/utils';
import type { Booking, EquipmentUnit, Tenant, UserProfile } from '@/types/schema';

export interface InvoiceDocumentProps {
  booking: Booking;
  tenant: Tenant | null;
  renter?: Pick<UserProfile, 'displayName' | 'email' | 'phone' | 'nik'> | null;
  unitsById: Record<string, EquipmentUnit>;
  settings: PlatformSettings;
}

function badgeClass(status: string): string {
  switch (status) {
    case 'confirmed':
    case 'completed':
    case 'paid':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'active_rent':
    case 'refunded':
      return 'border-blue-200 bg-blue-50 text-blue-800';
    case 'overdue':
    case 'cancelled':
      return 'border-red-200 bg-red-50 text-red-700';
    default:
      return 'border-amber-200 bg-amber-50 text-amber-800';
  }
}

export function InvoiceDocument({
  booking,
  tenant,
  renter,
  unitsById,
  settings,
}: InvoiceDocumentProps) {
  const rentalDays = calculateRentalDays(booking.startDate.toDate(), booking.endDate.toDate());
  const tierBenefits = getMembershipBenefits(booking.membershipTier, settings.tiers);
  const brandFallback = settings.seo.siteName || 'CameraRent';

  const branchName = tenant?.name ?? `${brandFallback} Rental Ops`;
  const branchAddress =
    tenant?.address ??
    txStatic('Multi-Tenant Production Equipment House', 'Rumah Sewa Peralatan Produksi Multi-Cabang');

  const discountAmount = booking.discountAmount ?? 0;
  const grossSubtotal = booking.subtotal + discountAmount;
  const effectiveDiscountPct =
    discountAmount > 0 && grossSubtotal > 0
      ? Math.round((discountAmount / grossSubtotal) * 100)
      : tierBenefits.rentalDiscountPercent;

  const depositPayablePct = Math.max(0, 100 - tierBenefits.depositDiscountPercent);
  const depositRowLabel =
    booking.membershipTier === 'premium' && tierBenefits.depositDiscountPercent > 0
      ? txStatic(
          `Security Deposit (${depositPayablePct}% Rate)`,
          `Deposit Jaminan (Tarif ${depositPayablePct}%)`
        )
      : txStatic('Security Deposit (Liability)', 'Deposit Jaminan (Liability)');

  const baseGrace = tenant?.overdueGraceMinutes ?? settings.defaultOverdueGraceMinutes;
  const extraGrace = tierBenefits.extraOverdueGraceMinutes;
  const effectiveGrace = baseGrace + extraGrace;
  const hourlyRatePct = tenant?.overdueHourlyRatePercent ?? settings.defaultOverdueHourlyRatePercent;

  const graceDetail =
    extraGrace > 0
      ? txStatic(
          `${effectiveGrace} mins (${baseGrace}m branch + ${extraGrace}m ${tierBenefits.label} bonus)`,
          `${effectiveGrace} menit (${baseGrace}m cabang + ${extraGrace}m bonus ${tierBenefits.label})`
        )
      : txStatic(`${effectiveGrace} mins`, `${effectiveGrace} menit`);

  const billedRows: Array<{ label: string; value: string; bold?: boolean }> = [
    ...(renter?.email ? [{ label: 'Email', value: renter.email }] : []),
    ...(renter?.phone ? [{ label: txStatic('Phone', 'No. HP'), value: renter.phone }] : []),
    ...(renter?.nik ? [{ label: 'NIK / KTP', value: renter.nik }] : []),
    {
      label: txStatic('Member Tier', 'Tier Member'),
      value: tierBenefits.label,
      bold: booking.membershipTier === 'premium',
    },
  ];

  const scheduleRows: Array<{ label: string; value: string; bold?: boolean }> = [
    {
      label: txStatic('Pickup / Start', 'Mulai / Ambil'),
      value: formatDateTime(booking.startDate),
      bold: true,
    },
    {
      label: txStatic('Due Return', 'Batas Kembali'),
      value: formatDateTime(booking.endDate),
      bold: true,
    },
    {
      label: booking.returnedAt
        ? txStatic('Actual Return', 'Kembali Aktual')
        : txStatic('Duration', 'Durasi Sewa'),
      value: booking.returnedAt
        ? `${formatDateTime(booking.returnedAt)} (${rentalDays}${txStatic('d', 'h')})`
        : `${rentalDays} ${txStatic('day(s)', 'hari')}`,
    },
    {
      label: txStatic('Logistics', 'Logistik'),
      value:
        booking.logisticsType === 'delivery'
          ? `${txStatic('Delivery & Pickup', 'Antar-Jemput')}${
              booking.deliveryDistanceKm ? ` (${booking.deliveryDistanceKm} km)` : ''
            }`
          : txStatic('Self-Pickup at Branch', 'Ambil Sendiri di Cabang'),
    },
    ...(booking.deliveryAddress
      ? [{ label: txStatic('Address', 'Alamat'), value: booking.deliveryAddress }]
      : []),
  ];

  const summaryRows: Array<{ label: string; value: string; accentClass?: string }> = [
    { label: txStatic('Rental Subtotal', 'Subtotal Sewa'), value: formatIDR(grossSubtotal) },
    ...(discountAmount > 0
      ? [
          {
            label: txStatic(
              `${tierBenefits.label} Discount (${effectiveDiscountPct}%)`,
              `Diskon ${tierBenefits.label} (${effectiveDiscountPct}%)`
            ),
            value: `- ${formatIDR(discountAmount)}`,
            accentClass: 'text-emerald-700',
          },
        ]
      : []),
    {
      label: txStatic('Delivery & Pickup Fee', 'Biaya Antar-Jemput'),
      value: formatIDR(booking.deliveryFee),
    },
    {
      label: depositRowLabel,
      value: formatIDR(booking.deposit),
    },
    ...(booking.overdueFine > 0
      ? [
          {
            label: txStatic('Overdue Fine', 'Denda Keterlambatan'),
            value: formatIDR(booking.overdueFine),
            accentClass: 'text-red-700',
          },
        ]
      : []),
    ...(booking.damageFine > 0
      ? [
          {
            label: txStatic('Damage Fine', 'Denda Kerusakan'),
            value: formatIDR(booking.damageFine),
            accentClass: 'text-red-700',
          },
        ]
      : []),
  ];

  const policyItems = [
    booking.membershipTier === 'premium' && tierBenefits.depositDiscountPercent > 0
      ? txStatic(
          `Security deposit enjoys -${tierBenefits.depositDiscountPercent}% ${tierBenefits.label} discount (${depositPayablePct}% payable) and is refunded in full upon clean return.`,
          `Deposit mendapat diskon -${tierBenefits.depositDiscountPercent}% ${tierBenefits.label} (bayar ${depositPayablePct}%) dan dikembalikan penuh setelah inspeksi pengembalian bersih.`
        )
      : txStatic(
          'Security deposit is recorded as a refundable liability and returned in full upon clean post-rental inspection.',
          'Deposit jaminan dicatat sebagai liabilitas dan dikembalikan penuh setelah inspeksi pengembalian bersih.'
        ),
    txStatic(
      `Late return grace period: ${graceDetail}. Overtime is billed at ${hourlyRatePct}% daily rate per hour thereafter.`,
      `Toleransi keterlambatan: ${graceDetail}. Keterlambatan setelahnya dikenakan denda ${hourlyRatePct}% tarif harian per jam.`
    ),
    ...(booking.paidAt
      ? [
          txStatic(
            `Payment verified on ${formatDateTime(booking.paidAt)}.`,
            `Pembayaran terverifikasi pada ${formatDateTime(booking.paidAt)}.`
          ),
        ]
      : []),
  ];

  return (
    <div className="w-[820px] bg-white font-sans text-zinc-950 antialiased">
      {/* Top Accent Bar */}
      <div className="h-2 w-full bg-zinc-900" />

      <div className="space-y-6 px-10 py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-8 border-b border-zinc-200 pb-6">
          <div className="min-w-0 flex-1 space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-950">{branchName}</h1>
            <p className="text-xs leading-relaxed text-zinc-500">{branchAddress}</p>
          </div>

          <div className="shrink-0 space-y-2 text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">
              {txStatic('Official Rental Invoice', 'Invoice Resmi Penyewaan')}
            </p>
            <p className="font-mono text-lg font-bold tracking-tight text-zinc-950">
              {booking.invoiceNumber}
            </p>
            <div className="flex flex-wrap items-center justify-end gap-1.5 pt-0.5">
              {booking.membershipTier === 'premium' ? (
                <span className="inline-flex items-center rounded border border-zinc-900 bg-zinc-900 px-2.5 py-1 text-[10px] font-semibold uppercase leading-none tracking-wider text-white">
                  {tierBenefits.label}
                </span>
              ) : null}
              <span
                className={`inline-flex items-center rounded border px-2.5 py-1 text-[10px] font-semibold uppercase leading-none tracking-wider ${badgeClass(
                  booking.bookingStatus
                )}`}
              >
                {booking.bookingStatus.replace(/_/g, ' ')}
              </span>
              <span
                className={`inline-flex items-center rounded border px-2.5 py-1 text-[10px] font-semibold uppercase leading-none tracking-wider ${badgeClass(
                  booking.paymentStatus
                )}`}
              >
                {txStatic('PAY', 'BAYAR')}: {booking.paymentStatus.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
        </div>

        {/* 2-Column Equal-Height Metadata Cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4">
            <p className="border-b border-zinc-200 pb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              {txStatic('Billed To', 'Ditagihkan Kepada')}
            </p>
            <p className="mt-3 text-sm font-semibold text-zinc-950">
              {renter?.displayName ?? booking.userId}
            </p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
              {billedRows.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="whitespace-nowrap text-zinc-500">{row.label}</dt>
                  <dd
                    className={`min-w-0 break-words text-zinc-900 ${row.bold ? 'font-semibold' : ''}`}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4">
            <p className="border-b border-zinc-200 pb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              {txStatic('Rental Window & Logistics', 'Jadwal Sewa & Logistik')}
            </p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
              {scheduleRows.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="whitespace-nowrap text-zinc-500">{row.label}</dt>
                  <dd
                    className={`min-w-0 break-words text-zinc-900 ${row.bold ? 'font-semibold' : ''}`}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* Equipment & Included Accessories Table */}
        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-zinc-900 text-white">
                <th className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wider">
                  #
                </th>
                <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wider">
                  {txStatic('Equipment & Serial No.', 'Peralatan & No. Seri')}
                </th>
                <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wider">
                  {txStatic('Included Accessories', 'Kelengkapan Aksesoris')}
                </th>
                <th className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wider">
                  {txStatic('Dur.', 'Dur.')}
                </th>
                <th className="whitespace-nowrap px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wider">
                  {txStatic('Daily Rate', 'Tarif / Hari')}
                </th>
                <th className="whitespace-nowrap px-3.5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider">
                  {txStatic('Line Total', 'Subtotal')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {booking.items.map((item, idx) => {
                const unit = unitsById[item.unitId];
                const accessories = unit?.accessoriesIncluded ?? [];
                return (
                  <tr key={item.unitId} className={idx % 2 === 1 ? 'bg-zinc-50/70' : 'bg-white'}>
                    <td className="px-3 py-3.5 text-center align-top font-mono text-[11px] text-zinc-400">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-3.5 align-top">
                      <p className="font-semibold leading-snug text-zinc-950">
                        {item.equipmentName}
                      </p>
                      <span className="mt-1.5 inline-flex items-center rounded border border-zinc-300 bg-zinc-100 px-2 py-0.5 font-mono text-[10px] font-medium leading-none text-zinc-700">
                        {item.serialNumber}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 align-top">
                      {accessories.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {accessories.map((acc) => (
                            <span
                              key={acc}
                              className="inline-flex items-center rounded border border-zinc-200 bg-zinc-100/80 px-2 py-1 text-[10px] leading-none text-zinc-700"
                            >
                              {acc}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] italic text-zinc-400">
                          {txStatic('Standard unit accessories', 'Kelengkapan standar unit')}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-center align-top font-mono text-[11px] text-zinc-600">
                      {rentalDays}
                      {txStatic('d', 'h')}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-right align-top font-mono text-[11px] tabular-nums text-zinc-600">
                      {formatIDR(item.dailyRate)}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3.5 text-right align-top font-mono text-xs font-semibold tabular-nums text-zinc-950">
                      {formatIDR(item.dailyRate * rentalDays)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Bottom 2-Column Settlement & Payment Summary */}
        <div className="grid grid-cols-12 items-start gap-5">
          {/* Left: Bank Transfer & Terms */}
          <div className="col-span-6 space-y-3">
            {tenant?.bankDetails ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  {txStatic('Bank Transfer Settlement', 'Rekening Transfer Pembayaran')}
                </p>
                <p className="mt-2 font-mono text-sm font-bold text-zinc-950">
                  {tenant.bankDetails.bankName} · {tenant.bankDetails.accountNumber}
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  {txStatic('Account Holder:', 'Atas Nama:')}{' '}
                  <span className="font-semibold text-zinc-900">
                    {tenant.bankDetails.accountHolder}
                  </span>
                </p>
              </div>
            ) : null}

            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                {txStatic('Terms & Rental Policy', 'Ketentuan & Kebijakan Sewa')}
              </p>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[11px] leading-relaxed text-zinc-600">
                {policyItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right: Financial Summary */}
          <div className="col-span-6 overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 bg-zinc-100/80 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
              {txStatic('Payment Summary', 'Ringkasan Pembayaran')}
            </div>
            <div className="divide-y divide-zinc-100">
              {summaryRows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-4 px-4 py-2.5 text-xs"
                >
                  <span className={row.accentClass ?? 'text-zinc-600'}>{row.label}</span>
                  <span
                    className={`whitespace-nowrap font-mono font-semibold tabular-nums ${
                      row.accentClass ?? 'text-zinc-950'
                    }`}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-4 bg-zinc-900 px-4 py-3.5 text-white">
              <span className="text-xs font-bold uppercase tracking-wider">
                {txStatic('Total Payable', 'Total Tagihan')}
              </span>
              <span className="whitespace-nowrap font-mono text-base font-bold tabular-nums">
                {formatIDR(booking.totalAmount)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-zinc-200 px-10 py-4 font-mono text-[10px] text-zinc-400">
        <span>
          {txStatic('GENERATED', 'DICETAK')} {formatDateTime(new Date())} · DOC ID {booking.id}
        </span>
        <span>
          {brandFallback} · {txStatic('Official Electronic Invoice', 'Invoice Elektronik Resmi')}
        </span>
      </div>
    </div>
  );
}

