import { calculateRentalDays } from '@/lib/availability';
import { txStatic } from '@/lib/i18n';
import { getMembershipBenefits, type PlatformSettings } from '@/lib/membership';
import { formatDateTime, formatIDR } from '@/lib/utils';
import type { Booking, EquipmentUnit, Tenant, UserProfile } from '@/types/schema';

export interface HandoverDocumentProps {
  booking: Booking;
  tenant: Tenant | null;
  renter?: Pick<UserProfile, 'displayName' | 'email' | 'phone' | 'nik'> | null;
  unitsById: Record<string, EquipmentUnit>;
  settings: PlatformSettings;
}

export function HandoverDocument({
  booking,
  tenant,
  renter,
  unitsById,
  settings,
}: HandoverDocumentProps) {
  const rentalDays = calculateRentalDays(booking.startDate.toDate(), booking.endDate.toDate());
  const tierBenefits = getMembershipBenefits(booking.membershipTier, settings.tiers);
  const brandFallback = settings.seo.siteName || 'CameraRent';

  const branchName = tenant?.name ?? `${brandFallback} Rental Ops`;
  const branchAddress =
    tenant?.address ??
    txStatic('Official Equipment Handover Branch', 'Cabang Resmi Serah Terima Peralatan');

  const renterRows: Array<{ label: string; value: string; bold?: boolean }> = [
    ...(renter?.nik ? [{ label: 'NIK / KTP', value: renter.nik }] : []),
    ...(renter?.phone ? [{ label: txStatic('Phone / WA', 'HP / WA'), value: renter.phone }] : []),
    ...(renter?.email ? [{ label: 'Email', value: renter.email }] : []),
    {
      label: txStatic('Security Deposit', 'Deposit Jaminan'),
      value: formatIDR(booking.deposit),
      bold: true,
    },
  ];

  const scheduleRows: Array<{ label: string; value: string; bold?: boolean }> = [
    {
      label: txStatic('Start / Pickup', 'Mulai / Ambil'),
      value: formatDateTime(booking.startDate),
      bold: true,
    },
    {
      label: txStatic('Due Return', 'Batas Kembali'),
      value: `${formatDateTime(booking.endDate)} (${rentalDays}${txStatic('d', 'h')})`,
      bold: true,
    },
    {
      label: txStatic('Dispatched', 'Diserahkan'),
      value: booking.dispatchedAt
        ? formatDateTime(booking.dispatchedAt)
        : txStatic('Pending Dispatch', 'Menunggu Serah Terima'),
    },
    {
      label: txStatic('Logistics', 'Logistik'),
      value: `${
        booking.logisticsType === 'delivery'
          ? txStatic('Delivery & Pickup', 'Antar-Jemput')
          : txStatic('Self-Pickup at Branch', 'Ambil Sendiri di Cabang')
      }${booking.courierName ? ` (${booking.courierName})` : ''}`,
    },
    ...(booking.deliveryAddress
      ? [{ label: txStatic('Address', 'Alamat'), value: booking.deliveryAddress }]
      : []),
  ];

  const baselineNotes =
    booking.preRentalChecklist?.notes ||
    txStatic(
      'All serialized units, optical elements, mounts, and listed accessories have been jointly inspected and verified in working order prior to handover.',
      'Seluruh unit bernomor seri, elemen optik, mount, dan aksesoris tertera telah diperiksa bersama dan dipastikan berfungsi normal sebelum serah terima.'
    );

  const confirmLine = booking.preRentalChecklist?.confirmedByUserAt
    ? `${txStatic('Digital Sign-Off by Renter', 'Konfirmasi Digital Penyewa')}: ${formatDateTime(
        booking.preRentalChecklist.confirmedByUserAt
      )}`
    : txStatic(
        'Digital Sign-Off: Pending · Physical signature below applies.',
        'Konfirmasi Digital: Menunggu · Berlaku tanda tangan fisik di bawah.'
      );

  const baseGrace = tenant?.overdueGraceMinutes ?? settings.defaultOverdueGraceMinutes;
  const effectiveGrace = baseGrace + tierBenefits.extraOverdueGraceMinutes;
  const hourlyPct = tenant?.overdueHourlyRatePercent ?? settings.defaultOverdueHourlyRatePercent;

  return (
    <div className="w-[820px] bg-white font-sans text-zinc-950 antialiased">
      <div className="h-2 w-full bg-zinc-900" />

      <div className="space-y-5 px-10 py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-8 border-b border-zinc-200 pb-5">
          <div className="min-w-0 flex-1 space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-950">{branchName}</h1>
            <p className="text-xs leading-relaxed text-zinc-500">{branchAddress}</p>
          </div>
          <div className="shrink-0 space-y-2 text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">
              {txStatic('Equipment Handover Record (BAST)', 'Berita Acara Serah Terima (BAST)')}
            </p>
            <p className="font-mono text-base font-bold text-zinc-950">
              REF: {booking.invoiceNumber}
            </p>
            <div className="flex flex-wrap items-center justify-end gap-1.5 pt-0.5">
              <span className="inline-flex items-center rounded border border-zinc-300 bg-zinc-100 px-2.5 py-1 text-[10px] font-semibold uppercase leading-none tracking-wider text-zinc-700">
                {booking.bookingStatus.replace(/_/g, ' ')}
              </span>
              <span className="inline-flex items-center rounded border border-zinc-900 bg-zinc-900 px-2.5 py-1 text-[10px] font-semibold uppercase leading-none tracking-wider text-white">
                {tierBenefits.label}
              </span>
            </div>
          </div>
        </div>

        {/* 2-Column Metadata */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4">
            <p className="border-b border-zinc-200 pb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              {txStatic('Receiving Party (Renter)', 'Pihak Penerima (Penyewa)')}
            </p>
            <p className="mt-3 text-sm font-semibold text-zinc-950">
              {renter?.displayName ?? booking.userId}
            </p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
              {renterRows.map((row) => (
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
              {txStatic('Handover & Rental Schedule', 'Jadwal Serah Terima & Sewa')}
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

        {/* Checklist Table */}
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
                <th className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wider">
                  {txStatic('Cond.', 'Kondisi')}
                </th>
                <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wider">
                  {txStatic('Included Accessories', 'Kelengkapan Aksesoris')}
                </th>
                <th className="whitespace-nowrap px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wider">
                  {txStatic('Out', 'Keluar')}
                </th>
                <th className="whitespace-nowrap px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wider">
                  {txStatic('In', 'Kembali')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {booking.items.map((item, idx) => {
                const unit = unitsById[item.unitId];
                const condLabel = (unit?.condition ?? 'good').toUpperCase();
                const accessories = unit?.accessoriesIncluded ?? [];
                return (
                  <tr key={item.unitId} className={idx % 2 === 1 ? 'bg-zinc-50/70' : 'bg-white'}>
                    <td className="px-3 py-3 text-center align-top font-mono text-[11px] text-zinc-400">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <p className="font-semibold leading-snug text-zinc-950">
                        {item.equipmentName}
                      </p>
                      <span className="mt-1.5 inline-flex items-center rounded border border-zinc-300 bg-zinc-100 px-2 py-0.5 font-mono text-[10px] font-medium leading-none text-zinc-700">
                        {item.serialNumber}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center align-top">
                      <span className="inline-flex items-center rounded border border-zinc-200 bg-zinc-100 px-2 py-1 font-mono text-[10px] font-semibold leading-none text-zinc-700">
                        {condLabel}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top">
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
                    <td className="whitespace-nowrap px-3 py-3 text-center align-top font-mono text-[11px] text-zinc-600">
                      ☐ OK
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-center align-top font-mono text-[11px] text-zinc-600">
                      ☐ OK
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Inspection Notes */}
        <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-900">
            {txStatic('Pre-Rental Inspection & Condition Notes', 'Catatan Inspeksi & Kondisi Pra-Sewa')}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-700">{baselineNotes}</p>
          <p className="mt-2 font-mono text-[10px] text-zinc-500">{confirmLine}</p>
        </div>

        {booking.returnNotes || booking.returnedAt ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
              {txStatic('Post-Rental Return Record', 'Catatan Pengembalian Pasca-Sewa')}
              {booking.returnedAt ? ` (${formatDateTime(booking.returnedAt)})` : ''}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-emerald-900">
              {booking.returnNotes ??
                txStatic('Equipment returned and checked in.', 'Alat dikembalikan dan telah diperiksa.')}
            </p>
          </div>
        ) : null}

        {/* Declaration */}
        <p className="text-[11px] leading-relaxed text-zinc-500">
          {txStatic(
            `DECLARATION: The Renter acknowledges receipt of all serialized equipment and accessories listed above in the stated condition and accepts full responsibility until official post-rental check-in. Late returns beyond the ${effectiveGrace}-minute grace window incur ${hourlyPct}% of the daily rate per hour. Any damage, loss, or missing accessories will be deducted from the security deposit (${formatIDR(booking.deposit)}) and billed for any excess repair cost.`,
            `PERNYATAAN: Penyewa menyatakan telah menerima seluruh unit bernomor seri beserta aksesoris di atas dalam kondisi sesuai catatan dan bertanggung jawab penuh hingga proses inspeksi pengembalian selesai. Keterlambatan melewati masa toleransi ${effectiveGrace} menit dikenakan denda ${hourlyPct}% dari tarif harian per jam. Kerusakan, kehilangan, atau kekurangan aksesoris akan dipotong dari deposit jaminan (${formatIDR(booking.deposit)}) dan ditagihkan selisihnya bila melebihi deposit.`
          )}
        </p>

        {/* Dual Signature Cards */}
        <div className="grid grid-cols-2 gap-5 pt-1">
          <div className="rounded-lg border border-zinc-200 bg-white p-4 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-800">
              {txStatic('Handed Over By (Branch Officer)', 'Diserahkan Oleh (Petugas Cabang)')}
            </p>
            <div className="h-16" />
            <div className="mx-auto w-3/4 border-t border-zinc-400" />
            <p className="mt-2 text-xs font-semibold text-zinc-900">{branchName}</p>
            <p className="mt-0.5 font-mono text-[10px] text-zinc-500">
              {txStatic('Date / Time: _______________', 'Tgl / Jam: _______________')}
            </p>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-800">
              {txStatic('Received By (Renter)', 'Diterima Oleh (Penyewa)')}
            </p>
            <div className="h-16" />
            <div className="mx-auto w-3/4 border-t border-zinc-400" />
            <p className="mt-2 text-xs font-semibold text-zinc-900">
              {renter?.displayName ?? booking.userId}
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-zinc-500">
              {renter?.nik
                ? `NIK: ${renter.nik}`
                : txStatic('Date / Time: _______________', 'Tgl / Jam: _______________')}
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-zinc-200 px-10 py-4 font-mono text-[10px] text-zinc-400">
        <span>
          BAST · {txStatic('GENERATED', 'DICETAK')} {formatDateTime(new Date())} · ID {booking.id}
        </span>
        <span>
          {brandFallback} · {txStatic('Handover Checklist', 'Berita Acara Serah Terima')}
        </span>
      </div>
    </div>
  );
}

