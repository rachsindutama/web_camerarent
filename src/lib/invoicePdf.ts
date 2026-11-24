import { formatDateTime, formatIDR } from '@/lib/utils';
import { calculateRentalDays } from '@/lib/availability';
import { txStatic } from '@/lib/i18n';
import { getMembershipBenefits } from '@/lib/membership';
import { resolveBookingUnitsMap, resolveFreshPlatformSettings } from '@/lib/pdfUnits';
import { escapeHtml, renderHtmlToA4Pdf } from '@/lib/htmlPdfEngine';
import type { Booking, EquipmentUnit, Tenant, UserProfile } from '@/types/schema';

interface GenerateInvoiceParams {
  booking: Booking;
  tenant: Tenant | null;
  renter?: Pick<UserProfile, 'displayName' | 'email' | 'phone' | 'nik'> | null;
  unitsById?: Record<string, EquipmentUnit>;
}

function getStatusBadgeStyle(status: string): { bg: string; border: string; fg: string } {
  switch (status) {
    case 'confirmed':
    case 'completed':
    case 'paid':
      return { bg: '#ecfdf5', border: '#a7f3d0', fg: '#065f46' };
    case 'active_rent':
    case 'refunded':
      return { bg: '#eff6ff', border: '#bfdbfe', fg: '#1e40af' };
    case 'overdue':
    case 'cancelled':
      return { bg: '#fef2f2', border: '#fecaca', fg: '#b91c1c' };
    default:
      return { bg: '#fffbeb', border: '#fde68a', fg: '#92400e' };
  }
}

function renderPill(text: string, style: { bg: string; border: string; fg: string }): string {
  return `<span style="display:inline-block;padding:3px 9px;margin-left:6px;border-radius:4px;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;font-size:9.5px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;background:${style.bg};border:1px solid ${style.border};color:${style.fg};line-height:1.2;">${escapeHtml(text)}</span>`;
}

export async function generateInvoicePdf({
  booking,
  tenant,
  renter,
  unitsById,
}: GenerateInvoiceParams): Promise<void> {
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
    txStatic('Multi-Tenant Production Equipment House', 'Rumah Sewa Peralatan Produksi Multi-Cabang');

  // Dynamic Discount & Deposit calculations
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

  // Header status badges
  const badgesHtml = [
    booking.membershipTier === 'premium'
      ? renderPill(tierBenefits.label, { bg: '#18181b', border: '#18181b', fg: '#ffffff' })
      : '',
    renderPill(
      booking.bookingStatus.replace(/_/g, ' '),
      getStatusBadgeStyle(booking.bookingStatus)
    ),
    renderPill(
      `${txStatic('PAY', 'BAYAR')}: ${booking.paymentStatus.replace(/_/g, ' ')}`,
      getStatusBadgeStyle(booking.paymentStatus)
    ),
  ]
    .filter(Boolean)
    .join('');

  // Renter details rows
  const billedRows: Array<{ label: string; value: string; bold?: boolean }> = [];
  if (renter?.email) billedRows.push({ label: 'Email', value: renter.email });
  if (renter?.phone)
    billedRows.push({ label: txStatic('Phone', 'No. HP'), value: renter.phone });
  if (renter?.nik) billedRows.push({ label: 'NIK / KTP', value: renter.nik });
  billedRows.push({
    label: txStatic('Member Tier', 'Tier Member'),
    value: tierBenefits.label,
    bold: booking.membershipTier === 'premium',
  });

  // Schedule & logistics rows
  const rentalRows: Array<{ label: string; value: string; bold?: boolean }> = [
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
  ];
  if (booking.deliveryAddress) {
    rentalRows.push({
      label: txStatic('Address', 'Alamat'),
      value: booking.deliveryAddress,
    });
  }

  const renderKvTableRows = (rows: Array<{ label: string; value: string; bold?: boolean }>, labelWidth: string) =>
    rows
      .map(
        (r) => `
        <tr>
          <td style="width:${labelWidth};padding:3.5px 8px 3.5px 0;vertical-align:top;font-size:10.5px;color:#71717a;white-space:nowrap;">${escapeHtml(r.label)}</td>
          <td style="padding:3.5px 0;vertical-align:top;font-size:11px;color:#18181b;font-weight:${r.bold ? '600' : '400'};line-height:1.4;">${escapeHtml(r.value)}</td>
        </tr>`
      )
      .join('');

  // Equipment + Included Accessories Table Rows
  const itemRowsHtml = booking.items
    .map((item, idx) => {
      const unit = resolvedUnits[item.unitId];
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
          <td style="padding:11px 8px;border-bottom:1px solid #e4e4e7;text-align:center;vertical-align:top;font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#71717a;">${idx + 1}</td>
          <td style="padding:11px 10px;border-bottom:1px solid #e4e4e7;vertical-align:top;">
            <div style="font-size:11.5px;font-weight:600;color:#09090b;line-height:1.35;">${escapeHtml(item.equipmentName)}</div>
            <div style="margin-top:4px;">
              <span style="display:inline-block;padding:1.5px 6px;border-radius:3px;background:#f4f4f5;border:1px solid #d4d4d8;font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:500;color:#3f3f46;">${escapeHtml(item.serialNumber)}</span>
            </div>
          </td>
          <td style="padding:11px 10px;border-bottom:1px solid #e4e4e7;vertical-align:top;">
            <div>${accessoriesHtml}</div>
          </td>
          <td style="padding:11px 8px;border-bottom:1px solid #e4e4e7;text-align:center;vertical-align:top;font-family:'JetBrains Mono',monospace;font-size:11px;color:#3f3f46;white-space:nowrap;">${rentalDays}${txStatic('d', 'h')}</td>
          <td style="padding:11px 10px;border-bottom:1px solid #e4e4e7;text-align:right;vertical-align:top;font-family:'JetBrains Mono',monospace;font-size:11px;color:#52525b;white-space:nowrap;">${escapeHtml(formatIDR(item.dailyRate))}</td>
          <td style="padding:11px 12px;border-bottom:1px solid #e4e4e7;text-align:right;vertical-align:top;font-family:'JetBrains Mono',monospace;font-size:11.5px;font-weight:700;color:#09090b;white-space:nowrap;">${escapeHtml(formatIDR(item.dailyRate * rentalDays))}</td>
        </tr>`;
    })
    .join('');

  // Financial Summary Rows
  const summaryRows: Array<{ label: string; value: string; color?: string }> = [
    { label: txStatic('Rental Subtotal', 'Subtotal Sewa'), value: formatIDR(grossSubtotal) },
  ];
  if (discountAmount > 0) {
    summaryRows.push({
      label: txStatic(
        `${tierBenefits.label} Discount (${effectiveDiscountPct}%)`,
        `Diskon ${tierBenefits.label} (${effectiveDiscountPct}%)`
      ),
      value: `- ${formatIDR(discountAmount)}`,
      color: '#047857',
    });
  }
  summaryRows.push(
    {
      label: txStatic('Delivery & Pickup Fee', 'Biaya Antar-Jemput'),
      value: formatIDR(booking.deliveryFee),
    },
    {
      label: depositRowLabel,
      value: formatIDR(booking.deposit),
    }
  );
  if (booking.overdueFine > 0) {
    summaryRows.push({
      label: txStatic('Overdue Fine', 'Denda Keterlambatan'),
      value: formatIDR(booking.overdueFine),
      color: '#b91c1c',
    });
  }
  if (booking.damageFine > 0) {
    summaryRows.push({
      label: txStatic('Damage Fine', 'Denda Kerusakan'),
      value: formatIDR(booking.damageFine),
      color: '#b91c1c',
    });
  }

  const summaryRowsHtml = summaryRows
    .map(
      (s) => `
      <tr>
        <td style="padding:7px 14px;font-size:11px;color:${s.color ?? '#52525b'};border-bottom:1px solid #f4f4f5;">${escapeHtml(s.label)}</td>
        <td style="padding:7px 14px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:11.5px;font-weight:600;color:${s.color ?? '#09090b'};border-bottom:1px solid #f4f4f5;white-space:nowrap;">${escapeHtml(s.value)}</td>
      </tr>`
    )
    .join('');

  const policyBullets = [
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

  const html = `
    <div style="width:100%;min-height:1105px;box-sizing:border-box;background:#ffffff;color:#09090b;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;position:relative;display:flex;flex-direction:column;">
      <!-- Top Editorial Accent Bar -->
      <div style="height:8px;width:100%;background:#18181b;"></div>

      <!-- Main Body -->
      <div style="padding:32px 38px 28px 38px;flex:1;">
        <!-- Header 2-Column -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:22px;">
          <tr>
            <td style="width:58%;vertical-align:top;padding-right:16px;">
              <div style="font-size:21px;font-weight:700;color:#09090b;letter-spacing:-0.025em;line-height:1.2;">${escapeHtml(branchName)}</div>
              <div style="margin-top:6px;font-size:10.5px;color:#71717a;line-height:1.5;">${escapeHtml(branchAddress)}</div>
            </td>
            <td style="width:42%;vertical-align:top;text-align:right;">
              <div style="font-size:9.5px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#71717a;">${escapeHtml(
                txStatic('Official Rental Invoice', 'Invoice Resmi Penyewaan')
              )}</div>
              <div style="margin-top:4px;font-family:'JetBrains Mono',monospace;font-size:16.5px;font-weight:700;color:#09090b;letter-spacing:-0.01em;">${escapeHtml(booking.invoiceNumber)}</div>
              <div style="margin-top:8px;">${badgesHtml}</div>
            </td>
          </tr>
        </table>

        <div style="height:1px;background:#e4e4e7;margin-bottom:20px;"></div>

        <!-- 2 Equal-Height Metadata Cards -->
        <table style="width:100%;border-collapse:separate;border-spacing:0;margin-bottom:22px;">
          <tr>
            <td style="width:48.5%;vertical-align:top;background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:14px 16px;">
              <div style="font-size:9.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;padding-bottom:7px;margin-bottom:9px;border-bottom:1px solid #e4e4e7;">
                ${escapeHtml(txStatic('Billed To', 'Ditagihkan Kepada'))}
              </div>
              <div style="font-size:13px;font-weight:700;color:#09090b;margin-bottom:6px;">${escapeHtml(
                renter?.displayName ?? booking.userId
              )}</div>
              <table style="width:100%;border-collapse:collapse;">
                ${renderKvTableRows(billedRows, '78px')}
              </table>
            </td>
            <td style="width:3%;"></td>
            <td style="width:48.5%;vertical-align:top;background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:14px 16px;">
              <div style="font-size:9.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;padding-bottom:7px;margin-bottom:9px;border-bottom:1px solid #e4e4e7;">
                ${escapeHtml(txStatic('Rental Window & Logistics', 'Jadwal Sewa & Logistik'))}
              </div>
              <table style="width:100%;border-collapse:collapse;">
                ${renderKvTableRows(rentalRows, '88px')}
              </table>
            </td>
          </tr>
        </table>

        <!-- Equipment & Included Accessories Table -->
        <div style="border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;margin-bottom:22px;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#18181b;color:#ffffff;">
                <th style="width:32px;padding:10px 8px;text-align:center;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">#</th>
                <th style="width:206px;padding:10px 10px;text-align:left;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">${escapeHtml(
                  txStatic('Equipment & Serial No.', 'Peralatan & No. Seri')
                )}</th>
                <th style="padding:10px 10px;text-align:left;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">${escapeHtml(
                  txStatic('Included Accessories', 'Kelengkapan Aksesoris')
                )}</th>
                <th style="width:46px;padding:10px 8px;text-align:center;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">${escapeHtml(
                  txStatic('Dur.', 'Dur.')
                )}</th>
                <th style="width:92px;padding:10px 10px;text-align:right;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">${escapeHtml(
                  txStatic('Daily Rate', 'Tarif / Hari')
                )}</th>
                <th style="width:98px;padding:10px 12px;text-align:right;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">${escapeHtml(
                  txStatic('Line Total', 'Subtotal')
                )}</th>
              </tr>
            </thead>
            <tbody>
              ${itemRowsHtml}
            </tbody>
          </table>
        </div>

        <!-- Bottom 2-Column Settlement & Summary -->
        <table class="pdf-avoid-break" style="width:100%;border-collapse:separate;border-spacing:0;">
          <tr>
            <!-- Left: Bank & Policy -->
            <td style="width:52%;vertical-align:top;padding-right:18px;">
              ${
                tenant?.bankDetails
                  ? `
              <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:13px 15px;margin-bottom:12px;">
                <div style="font-size:9.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;margin-bottom:7px;">
                  ${escapeHtml(
                    txStatic('Bank Transfer Settlement', 'Rekening Transfer Pembayaran')
                  )}
                </div>
                <div style="font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:#09090b;">
                  ${escapeHtml(tenant.bankDetails.bankName)} &nbsp;·&nbsp; ${escapeHtml(
                      tenant.bankDetails.accountNumber
                    )}
                </div>
                <div style="margin-top:4px;font-size:11px;color:#52525b;">
                  ${escapeHtml(txStatic('Account Holder', 'Atas Nama'))}: <strong style="color:#18181b;">${escapeHtml(
                      tenant.bankDetails.accountHolder
                    )}</strong>
                </div>
              </div>`
                  : ''
              }

              <div style="background:#ffffff;border:1px solid #e4e4e7;border-radius:8px;padding:12px 15px;">
                <div style="font-size:9.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;margin-bottom:6px;">
                  ${escapeHtml(txStatic('Terms & Rental Policy', 'Ketentuan & Kebijakan Sewa'))}
                </div>
                <ul style="margin:0;padding-left:15px;font-size:10px;color:#52525b;line-height:1.55;">
                  ${policyBullets
                    .map((b) => `<li style="margin-bottom:3px;">${escapeHtml(b)}</li>`)
                    .join('')}
                </ul>
              </div>
            </td>

            <!-- Right: Financial Summary Box -->
            <td style="width:48%;vertical-align:top;">
              <div style="border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;background:#ffffff;">
                <div style="background:#f4f4f5;padding:9px 14px;border-bottom:1px solid #e4e4e7;font-size:9.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#52525b;">
                  ${escapeHtml(txStatic('Payment Summary', 'Ringkasan Pembayaran'))}
                </div>
                <table style="width:100%;border-collapse:collapse;">
                  ${summaryRowsHtml}
                  <tr style="background:#18181b;color:#ffffff;">
                    <td style="padding:12px 14px;font-size:11.5px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">
                      ${escapeHtml(txStatic('Total Payable', 'Total Tagihan'))}
                    </td>
                    <td style="padding:12px 14px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:14.5px;font-weight:700;white-space:nowrap;">
                      ${escapeHtml(formatIDR(booking.totalAmount))}
                    </td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>
        </table>
      </div>

      <!-- Footer -->
      <div style="padding:14px 38px 20px 38px;border-top:1px solid #e4e4e7;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#a1a1aa;">
              ${escapeHtml(txStatic('GENERATED', 'DICETAK'))} ${escapeHtml(
                formatDateTime(new Date())
              )} &nbsp;·&nbsp; DOC ID ${escapeHtml(booking.id)}
            </td>
            <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#a1a1aa;">
              ${escapeHtml(brandFallback)} &nbsp;·&nbsp; ${escapeHtml(
                txStatic('Official Electronic Invoice', 'Invoice Elektronik Resmi')
              )}
            </td>
          </tr>
        </table>
      </div>
    </div>
  `;

  const safeFilename = booking.invoiceNumber.replace(/\//g, '-');
  await renderHtmlToA4Pdf(html, `${safeFilename}.pdf`);
}
