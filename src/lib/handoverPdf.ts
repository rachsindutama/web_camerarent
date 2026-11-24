import { formatDateTime, formatIDR } from '@/lib/utils';
import { calculateRentalDays } from '@/lib/availability';
import { txStatic } from '@/lib/i18n';
import { getMembershipBenefits } from '@/lib/membership';
import { resolveBookingUnitsMap, resolveFreshPlatformSettings } from '@/lib/pdfUnits';
import { escapeHtml, renderHtmlToA4Pdf } from '@/lib/htmlPdfEngine';
import type { Booking, EquipmentUnit, Tenant, UserProfile } from '@/types/schema';

interface GenerateHandoverPdfParams {
  booking: Booking;
  tenant: Tenant | null;
  renter?: Pick<UserProfile, 'displayName' | 'email' | 'phone' | 'nik'> | null;
  unitsById?: Record<string, EquipmentUnit>;
}

export async function generateHandoverPdf({
  booking,
  tenant,
  renter,
  unitsById,
}: GenerateHandoverPdfParams): Promise<void> {
  const [resolvedUnits, settings] = await Promise.all([
    resolveBookingUnitsMap(booking, unitsById),
    resolveFreshPlatformSettings(),
  ]);

  const rentalDays = calculateRentalDays(booking.startDate.toDate(), booking.endDate.toDate());
  const tierBenefits = getMembershipBenefits(booking.membershipTier, settings.tiers);
  const brandFallback = settings.seo.siteName || 'CameraRent';

  const branchName = tenant?.name ?? `${brandFallback} Rental Ops`;
  const branchAddress =
    tenant?.address ??
    txStatic('Official Equipment Handover Branch', 'Cabang Resmi Serah Terima Peralatan');

  const renterRows: Array<{ label: string; value: string; bold?: boolean }> = [];
  if (renter?.nik) renterRows.push({ label: 'NIK / KTP', value: renter.nik });
  if (renter?.phone)
    renterRows.push({ label: txStatic('Phone / WA', 'HP / WA'), value: renter.phone });
  if (renter?.email) renterRows.push({ label: 'Email', value: renter.email });
  renterRows.push({
    label: txStatic('Security Deposit', 'Deposit Jaminan'),
    value: formatIDR(booking.deposit),
    bold: true,
  });

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
  ];
  if (booking.deliveryAddress) {
    scheduleRows.push({
      label: txStatic('Address', 'Alamat'),
      value: booking.deliveryAddress,
    });
  }

  const renderKvRows = (rows: Array<{ label: string; value: string; bold?: boolean }>, labelW: string) =>
    rows
      .map(
        (r) => `
      <tr>
        <td style="width:${labelW};padding:3px 8px 3px 0;vertical-align:top;font-size:10.5px;color:#71717a;white-space:nowrap;">${escapeHtml(r.label)}</td>
        <td style="padding:3px 0;vertical-align:top;font-size:11px;color:#18181b;font-weight:${r.bold ? '600' : '400'};line-height:1.4;">${escapeHtml(r.value)}</td>
      </tr>`
      )
      .join('');

  const itemRowsHtml = booking.items
    .map((item, idx) => {
      const unit = resolvedUnits[item.unitId];
      const condLabel = (unit?.condition ?? 'good').toUpperCase();
      const accessories = unit?.accessoriesIncluded ?? [];
      const accessoriesHtml =
        accessories.length > 0
          ? accessories
              .map(
                (acc) =>
                  `<span style="display:inline-block;margin:0 4px 4px 0;padding:2px 6px;border-radius:3px;background:#f4f4f5;border:1px solid #e4e4e7;font-size:9.5px;color:#3f3f46;line-height:1.3;">${escapeHtml(acc)}</span>`
              )
              .join('')
          : `<span style="font-size:10px;color:#a1a1aa;font-style:italic;">${escapeHtml(
              txStatic('Standard unit accessories', 'Kelengkapan standar unit')
            )}</span>`;

      const rowBg = idx % 2 === 1 ? '#fafafa' : '#ffffff';
      return `
        <tr style="background:${rowBg};">
          <td style="padding:10px 8px;border-bottom:1px solid #e4e4e7;text-align:center;vertical-align:top;font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#71717a;">${idx + 1}</td>
          <td style="padding:10px 10px;border-bottom:1px solid #e4e4e7;vertical-align:top;">
            <div style="font-size:11.5px;font-weight:600;color:#09090b;line-height:1.35;">${escapeHtml(item.equipmentName)}</div>
            <div style="margin-top:4px;">
              <span style="display:inline-block;padding:1.5px 6px;border-radius:3px;background:#f4f4f5;border:1px solid #d4d4d8;font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:500;color:#3f3f46;">${escapeHtml(item.serialNumber)}</span>
            </div>
          </td>
          <td style="padding:10px 8px;border-bottom:1px solid #e4e4e7;text-align:center;vertical-align:top;">
            <span style="display:inline-block;padding:2px 6px;border-radius:3px;background:#f4f4f5;border:1px solid #e4e4e7;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700;color:#3f3f46;">${escapeHtml(condLabel)}</span>
          </td>
          <td style="padding:10px 10px;border-bottom:1px solid #e4e4e7;vertical-align:top;">
            <div>${accessoriesHtml}</div>
          </td>
          <td style="padding:10px 6px;border-bottom:1px solid #e4e4e7;text-align:center;vertical-align:top;font-family:'JetBrains Mono',monospace;font-size:10px;color:#52525b;white-space:nowrap;">&#9744; OK</td>
          <td style="padding:10px 6px;border-bottom:1px solid #e4e4e7;text-align:center;vertical-align:top;font-family:'JetBrains Mono',monospace;font-size:10px;color:#52525b;white-space:nowrap;">&#9744; OK</td>
        </tr>`;
    })
    .join('');

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

  const html = `
    <div style="width:100%;min-height:1105px;box-sizing:border-box;background:#ffffff;color:#09090b;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;flex-direction:column;">
      <div style="height:8px;width:100%;background:#18181b;"></div>

      <div style="padding:30px 38px 24px 38px;flex:1;">
        <!-- Header -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
          <tr>
            <td style="width:55%;vertical-align:top;padding-right:16px;">
              <div style="font-size:20px;font-weight:700;color:#09090b;letter-spacing:-0.025em;line-height:1.2;">${escapeHtml(branchName)}</div>
              <div style="margin-top:5px;font-size:10.5px;color:#71717a;line-height:1.45;">${escapeHtml(branchAddress)}</div>
            </td>
            <td style="width:45%;vertical-align:top;text-align:right;">
              <div style="font-size:9.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#71717a;">${escapeHtml(
                txStatic('Equipment Handover Record (BAST)', 'Berita Acara Serah Terima (BAST)')
              )}</div>
              <div style="margin-top:4px;font-family:'JetBrains Mono',monospace;font-size:15.5px;font-weight:700;color:#09090b;">REF: ${escapeHtml(booking.invoiceNumber)}</div>
              <div style="margin-top:6px;">
                <span style="display:inline-block;padding:2.5px 8px;border-radius:4px;background:#f4f4f5;border:1px solid #d4d4d8;font-size:9.5px;font-weight:700;text-transform:uppercase;color:#3f3f46;">${escapeHtml(
                  booking.bookingStatus.replace(/_/g, ' ')
                )}</span>
                <span style="display:inline-block;margin-left:5px;padding:2.5px 8px;border-radius:4px;background:#18181b;font-size:9.5px;font-weight:700;text-transform:uppercase;color:#ffffff;">${escapeHtml(
                  tierBenefits.label
                )}</span>
              </div>
            </td>
          </tr>
        </table>

        <div style="height:1px;background:#e4e4e7;margin-bottom:18px;"></div>

        <!-- 2-Column Metadata Cards -->
        <table style="width:100%;border-collapse:separate;border-spacing:0;margin-bottom:18px;">
          <tr>
            <td style="width:48.5%;vertical-align:top;background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:13px 15px;">
              <div style="font-size:9.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;padding-bottom:6px;margin-bottom:8px;border-bottom:1px solid #e4e4e7;">
                ${escapeHtml(txStatic('Receiving Party (Renter)', 'Pihak Penerima (Penyewa)'))}
              </div>
              <div style="font-size:12.5px;font-weight:700;color:#09090b;margin-bottom:5px;">${escapeHtml(
                renter?.displayName ?? booking.userId
              )}</div>
              <table style="width:100%;border-collapse:collapse;">
                ${renderKvRows(renterRows, '88px')}
              </table>
            </td>
            <td style="width:3%;"></td>
            <td style="width:48.5%;vertical-align:top;background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:13px 15px;">
              <div style="font-size:9.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;padding-bottom:6px;margin-bottom:8px;border-bottom:1px solid #e4e4e7;">
                ${escapeHtml(txStatic('Handover & Rental Schedule', 'Jadwal Serah Terima & Sewa'))}
              </div>
              <table style="width:100%;border-collapse:collapse;">
                ${renderKvRows(scheduleRows, '84px')}
              </table>
            </td>
          </tr>
        </table>

        <!-- Handover Equipment Checklist Table -->
        <div style="border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;margin-bottom:16px;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#18181b;color:#ffffff;">
                <th style="width:30px;padding:9px 8px;text-align:center;font-size:9.5px;font-weight:700;text-transform:uppercase;">#</th>
                <th style="width:200px;padding:9px 10px;text-align:left;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(
                  txStatic('Equipment & Serial No.', 'Peralatan & No. Seri')
                )}</th>
                <th style="width:66px;padding:9px 8px;text-align:center;font-size:9.5px;font-weight:700;text-transform:uppercase;">${escapeHtml(
                  txStatic('Cond.', 'Kondisi')
                )}</th>
                <th style="padding:9px 10px;text-align:left;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(
                  txStatic('Included Accessories', 'Kelengkapan Aksesoris')
                )}</th>
                <th style="width:54px;padding:9px 6px;text-align:center;font-size:9.5px;font-weight:700;text-transform:uppercase;">${escapeHtml(
                  txStatic('Out', 'Keluar')
                )}</th>
                <th style="width:54px;padding:9px 6px;text-align:center;font-size:9.5px;font-weight:700;text-transform:uppercase;">${escapeHtml(
                  txStatic('In', 'Kembali')
                )}</th>
              </tr>
            </thead>
            <tbody>
              ${itemRowsHtml}
            </tbody>
          </table>
        </div>

        <!-- Pre-Rental Inspection Notes -->
        <div class="pdf-avoid-break" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:12px 15px;margin-bottom:12px;">
          <div style="font-size:9.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#18181b;margin-bottom:5px;">
            ${escapeHtml(
              txStatic('Pre-Rental Inspection & Condition Notes', 'Catatan Inspeksi & Kondisi Pra-Sewa')
            )}
          </div>
          <div style="font-size:11px;color:#3f3f46;line-height:1.5;">${escapeHtml(baselineNotes)}</div>
          <div style="margin-top:7px;font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#71717a;">${escapeHtml(confirmLine)}</div>
        </div>

        ${
          booking.returnNotes || booking.returnedAt
            ? `
        <div class="pdf-avoid-break" style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:11px 15px;margin-bottom:12px;">
          <div style="font-size:9.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#065f46;margin-bottom:4px;">
            ${escapeHtml(txStatic('Post-Rental Return Record', 'Catatan Pengembalian Pasca-Sewa'))}${
                booking.returnedAt ? ` (${escapeHtml(formatDateTime(booking.returnedAt))})` : ''
              }
          </div>
          <div style="font-size:11px;color:#065f46;line-height:1.45;">${escapeHtml(
            booking.returnNotes ??
              txStatic('Equipment returned and checked in.', 'Alat dikembalikan dan telah diperiksa.')
          )}</div>
        </div>`
            : ''
        }

        <!-- Declaration -->
        <div class="pdf-avoid-break" style="font-size:9.8px;color:#71717a;line-height:1.55;margin-bottom:18px;">
          ${escapeHtml(
            txStatic(
              `DECLARATION: The Renter acknowledges receipt of all serialized equipment and accessories listed above in the stated condition and accepts full responsibility until official post-rental check-in. Late returns beyond the ${effectiveGrace}-minute grace window incur ${hourlyPct}% of the daily rate per hour. Any damage, loss, or missing accessories will be deducted from the security deposit (${formatIDR(booking.deposit)}) and billed for any excess repair cost.`,
              `PERNYATAAN: Penyewa menyatakan telah menerima seluruh unit bernomor seri beserta aksesoris di atas dalam kondisi sesuai catatan dan bertanggung jawab penuh hingga proses inspeksi pengembalian selesai. Keterlambatan melewati masa toleransi ${effectiveGrace} menit dikenakan denda ${hourlyPct}% dari tarif harian per jam. Kerusakan, kehilangan, atau kekurangan aksesoris akan dipotong dari deposit jaminan (${formatIDR(booking.deposit)}) dan ditagihkan selisihnya bila melebihi deposit.`
            )
          )}
        </div>

        <!-- Dual Physical Signature Cards -->
        <table class="pdf-avoid-break" style="width:100%;border-collapse:separate;border-spacing:0;">
          <tr>
            <td style="width:48%;border:1px solid #e4e4e7;border-radius:8px;padding:14px 16px;text-align:center;vertical-align:top;">
              <div style="font-size:9.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#18181b;">
                ${escapeHtml(txStatic('Handed Over By (Branch Officer)', 'Diserahkan Oleh (Petugas Cabang)'))}
              </div>
              <div style="height:64px;"></div>
              <div style="border-top:1px solid #a1a1aa;width:78%;margin:0 auto 6px auto;"></div>
              <div style="font-size:11px;font-weight:700;color:#18181b;">${escapeHtml(branchName)}</div>
              <div style="margin-top:3px;font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#71717a;">
                ${escapeHtml(txStatic('Date / Time: _______________', 'Tgl / Jam: _______________'))}
              </div>
            </td>
            <td style="width:4%;"></td>
            <td style="width:48%;border:1px solid #e4e4e7;border-radius:8px;padding:14px 16px;text-align:center;vertical-align:top;">
              <div style="font-size:9.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#18181b;">
                ${escapeHtml(txStatic('Received By (Renter)', 'Diterima Oleh (Penyewa)'))}
              </div>
              <div style="height:64px;"></div>
              <div style="border-top:1px solid #a1a1aa;width:78%;margin:0 auto 6px auto;"></div>
              <div style="font-size:11px;font-weight:700;color:#18181b;">${escapeHtml(
                renter?.displayName ?? booking.userId
              )}</div>
              <div style="margin-top:3px;font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#71717a;">
                ${escapeHtml(
                  renter?.nik
                    ? `NIK: ${renter.nik}`
                    : txStatic('Date / Time: _______________', 'Tgl / Jam: _______________')
                )}
              </div>
            </td>
          </tr>
        </table>
      </div>

      <!-- Footer -->
      <div style="padding:12px 38px 18px 38px;border-top:1px solid #e4e4e7;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#a1a1aa;">
              BAST &nbsp;·&nbsp; ${escapeHtml(txStatic('GENERATED', 'DICETAK'))} ${escapeHtml(
                formatDateTime(new Date())
              )} &nbsp;·&nbsp; ID ${escapeHtml(booking.id)}
            </td>
            <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#a1a1aa;">
              ${escapeHtml(brandFallback)} &nbsp;·&nbsp; ${escapeHtml(
                txStatic('Handover Checklist', 'Berita Acara Serah Terima')
              )}
            </td>
          </tr>
        </table>
      </div>
    </div>
  `;

  const safeFilename = booking.invoiceNumber.replace(/\//g, '-');
  await renderHtmlToA4Pdf(html, `BAST-${safeFilename}.pdf`);
}
