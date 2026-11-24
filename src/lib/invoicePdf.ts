import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDateTime, formatIDR } from '@/lib/utils';
import { calculateRentalDays } from '@/lib/availability';
import { txStatic } from '@/lib/i18n';
import { getMembershipBenefits } from '@/lib/membership';
import { resolveBookingUnitsMap, resolveFreshPlatformSettings } from '@/lib/pdfUnits';
import type { Booking, EquipmentUnit, Tenant, UserProfile } from '@/types/schema';

interface GenerateInvoiceParams {
  booking: Booking;
  tenant: Tenant | null;
  renter?: Pick<UserProfile, 'displayName' | 'email' | 'phone' | 'nik'> | null;
  unitsById?: Record<string, EquipmentUnit>;
}

type RGB = [number, number, number];

interface BadgeSpec {
  text: string;
  bg: RGB;
  border: RGB;
  fg: RGB;
}

interface KvRow {
  label: string;
  value: string;
  bold?: boolean;
}

function getBookingStatusColors(status: string): { bg: RGB; border: RGB; fg: RGB } {
  switch (status) {
    case 'confirmed':
    case 'completed':
      return { bg: [236, 253, 245], border: [167, 243, 208], fg: [6, 95, 70] };
    case 'active_rent':
      return { bg: [239, 246, 255], border: [191, 219, 254], fg: [30, 64, 175] };
    case 'overdue':
    case 'cancelled':
      return { bg: [254, 242, 242], border: [254, 202, 202], fg: [185, 28, 28] };
    default:
      return { bg: [255, 251, 235], border: [253, 230, 138], fg: [146, 64, 14] };
  }
}

function getPaymentStatusColors(status: string): { bg: RGB; border: RGB; fg: RGB } {
  switch (status) {
    case 'paid':
      return { bg: [236, 253, 245], border: [167, 243, 208], fg: [6, 95, 70] };
    case 'refunded':
      return { bg: [239, 246, 255], border: [191, 219, 254], fg: [30, 64, 175] };
    default:
      return { bg: [255, 251, 235], border: [253, 230, 138], fg: [146, 64, 14] };
  }
}

function drawBadgeRowRight(doc: jsPDF, rightX: number, y: number, badges: BadgeSpec[]): number {
  let cursorX = rightX;
  const h = 5.4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);

  for (let i = badges.length - 1; i >= 0; i--) {
    const b = badges[i];
    const w = doc.getTextWidth(b.text) + 5;
    cursorX -= w;
    doc.setFillColor(...b.bg);
    doc.setDrawColor(...b.border);
    doc.setLineWidth(0.25);
    doc.roundedRect(cursorX, y, w, h, 1.2, 1.2, 'FD');
    doc.setTextColor(...b.fg);
    doc.text(b.text, cursorX + w / 2, y + 3.65, { align: 'center' });
    cursorX -= 2;
  }

  return y + h;
}

function measureKvCardHeight(
  doc: jsPDF,
  width: number,
  labelW: number,
  rows: KvRow[],
  hasHeadline: boolean
): number {
  const valueMaxW = width - labelW - 9;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  let h = 11; // top header strip + padding
  if (hasHeadline) h += 5.5;
  for (const row of rows) {
    const lines = doc.splitTextToSize(row.value || '—', valueMaxW) as string[];
    h += Math.max(1, lines.length) * 3.8 + 1.3;
  }
  return h + 3;
}

function drawKvCard(
  doc: jsPDF,
  opts: {
    x: number;
    y: number;
    width: number;
    height: number;
    labelW: number;
    title: string;
    headline?: string;
    rows: KvRow[];
  }
): void {
  const { x, y, width, height, labelW, title, headline, rows } = opts;

  // Outer card
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, width, height, 1.8, 1.8, 'FD');

  // Card section label
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(113, 113, 122);
  doc.text(title, x + 4, y + 5.5);

  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.2);
  doc.line(x + 4, y + 7.5, x + width - 4, y + 7.5);

  let cursorY = y + 12;

  if (headline) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    doc.setTextColor(9, 9, 11);
    const hLines = doc.splitTextToSize(headline, width - 8) as string[];
    doc.text(hLines[0] ?? headline, x + 4, cursorY);
    cursorY += 5.2;
  }

  const valueX = x + 4 + labelW;
  const valueMaxW = width - labelW - 9;

  for (const row of rows) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(113, 113, 122);
    doc.text(row.label, x + 4, cursorY);

    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.setTextColor(24, 24, 27);
    const lines = doc.splitTextToSize(row.value || '—', valueMaxW) as string[];
    doc.text(lines, valueX, cursorY);
    cursorY += Math.max(1, lines.length) * 3.8 + 1.3;
  }
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

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182mm
  const rightEdge = pageWidth - margin; // 196mm

  const rentalDays = calculateRentalDays(booking.startDate.toDate(), booking.endDate.toDate());
  const tierBenefits = getMembershipBenefits(booking.membershipTier, settings.tiers);
  const brandFallback = settings.seo.siteName || 'CameraRent';

  // 1. Top dark editorial accent bar
  doc.setFillColor(24, 24, 27);
  doc.rect(0, 0, pageWidth, 3.5, 'F');

  // 2. Two-Column Header (strict maxWidth so branch address NEVER overlaps right column)
  const leftMaxW = 104;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15.5);
  doc.setTextColor(9, 9, 11);
  const branchTitle = tenant?.name ?? `${brandFallback} Rental Ops`;
  const titleLines = doc.splitTextToSize(branchTitle, leftMaxW) as string[];
  doc.text(titleLines, margin, 14.5);

  let leftY = 14.5 + (titleLines.length - 1) * 5.8 + 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(113, 113, 122);
  const addressText =
    tenant?.address ??
    txStatic('Multi-Tenant Production Equipment House', 'Rumah Sewa Peralatan Produksi Multi-Cabang');
  const addressLines = doc.splitTextToSize(addressText, leftMaxW) as string[];
  doc.text(addressLines, margin, leftY);
  leftY += addressLines.length * 3.7;

  // Right Header: Label + Invoice Number + Crisp Pill Badges
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(113, 113, 122);
  doc.text(txStatic('OFFICIAL RENTAL INVOICE', 'INVOICE RESMI PENYEWAAN'), rightEdge, 11.5, {
    align: 'right',
  });

  doc.setFont('courier', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(9, 9, 11);
  doc.text(booking.invoiceNumber, rightEdge, 17.5, { align: 'right' });

  const headerBadges: BadgeSpec[] = [
    {
      text: booking.bookingStatus.replace(/_/g, ' ').toUpperCase(),
      ...getBookingStatusColors(booking.bookingStatus),
    },
    {
      text: `${txStatic('PAY', 'BAYAR')}: ${booking.paymentStatus.replace(/_/g, ' ').toUpperCase()}`,
      ...getPaymentStatusColors(booking.paymentStatus),
    },
  ];
  if (booking.membershipTier === 'premium') {
    headerBadges.unshift({
      text: `${tierBenefits.label.toUpperCase()}`,
      bg: [24, 24, 27],
      border: [24, 24, 27],
      fg: [255, 255, 255],
    });
  }
  const rightY = drawBadgeRowRight(doc, rightEdge, 20.5, headerBadges);

  const dividerY = Math.max(leftY, rightY) + 4.5;
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.35);
  doc.line(margin, dividerY, rightEdge, dividerY);

  // 3. Structured 2-Card Metadata Row (Equal Height, Fixed-Column Alignment)
  const cardsY = dividerY + 4.5;
  const leftCardW = 86;
  const cardGap = 4;
  const rightCardW = contentWidth - leftCardW - cardGap; // 92mm

  const billedRows: KvRow[] = [];
  if (renter?.email) billedRows.push({ label: 'Email', value: renter.email });
  if (renter?.phone) billedRows.push({ label: txStatic('Phone', 'No. HP'), value: renter.phone });
  if (renter?.nik) billedRows.push({ label: 'NIK / KTP', value: renter.nik });
  billedRows.push({
    label: txStatic('Tier', 'Tier Member'),
    value: tierBenefits.label,
    bold: booking.membershipTier === 'premium',
  });

  const rentalRows: KvRow[] = [
    {
      label: txStatic('Start / Pickup', 'Mulai / Ambil'),
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

  const leftCardH = measureKvCardHeight(doc, leftCardW, 21, billedRows, true);
  const rightCardH = measureKvCardHeight(doc, rightCardW, 25, rentalRows, false);
  const equalCardH = Math.max(leftCardH, rightCardH);

  drawKvCard(doc, {
    x: margin,
    y: cardsY,
    width: leftCardW,
    height: equalCardH,
    labelW: 21,
    title: txStatic('BILLED TO', 'DITAGIHKAN KEPADA'),
    headline: renter?.displayName ?? booking.userId,
    rows: billedRows,
  });

  drawKvCard(doc, {
    x: margin + leftCardW + cardGap,
    y: cardsY,
    width: rightCardW,
    height: equalCardH,
    labelW: 25,
    title: txStatic('RENTAL WINDOW & LOGISTICS', 'JADWAL SEWA & LOGISTIK'),
    rows: rentalRows,
  });

  // 4. Equipment, Serial Numbers & Included Accessories Table (182mm exact width)
  const tableStartY = cardsY + equalCardH + 6;
  const tableRows = booking.items.map((item, index) => {
    const unit = resolvedUnits[item.unitId];
    const accessoriesText =
      unit?.accessoriesIncluded && unit.accessoriesIncluded.length > 0
        ? unit.accessoriesIncluded.join(', ')
        : txStatic('Standard unit accessories', 'Kelengkapan standar unit');
    return [
      String(index + 1),
      item.equipmentName,
      item.serialNumber,
      accessoriesText,
      `${rentalDays}${txStatic('d', 'h')}`,
      formatIDR(item.dailyRate),
      formatIDR(item.dailyRate * rentalDays),
    ];
  });

  autoTable(doc, {
    startY: tableStartY,
    head: [
      [
        '#',
        txStatic('Equipment', 'Peralatan'),
        'Serial Number',
        txStatic('Included Accessories', 'Kelengkapan Aksesoris'),
        txStatic('Dur.', 'Dur.'),
        txStatic('Daily Rate', 'Tarif / Hari'),
        txStatic('Line Total', 'Subtotal'),
      ],
    ],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [24, 24, 27],
      textColor: [250, 250, 250],
      fontSize: 7.5,
      fontStyle: 'bold',
      cellPadding: { top: 2.8, right: 2.5, bottom: 2.8, left: 2.5 },
      lineColor: [24, 24, 27],
      lineWidth: 0.2,
    },
    bodyStyles: {
      fontSize: 7.8,
      textColor: [24, 24, 27],
      cellPadding: { top: 2.8, right: 2.5, bottom: 2.8, left: 2.5 },
      lineColor: [228, 228, 231],
      lineWidth: 0.2,
      valign: 'top',
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center', textColor: [113, 113, 122] },
      1: { cellWidth: 42, fontStyle: 'bold' },
      2: { cellWidth: 28, font: 'courier', fontSize: 7.2, textColor: [63, 63, 70] },
      3: { cellWidth: 46, fontSize: 7.2, textColor: [82, 82, 91] },
      4: { cellWidth: 11, halign: 'center' },
      5: { cellWidth: 23, halign: 'right', font: 'courier', fontSize: 7.5 },
      6: { cellWidth: 24, halign: 'right', font: 'courier', fontStyle: 'bold', fontSize: 7.6 },
    },
    margin: { left: margin, right: margin },
  });

  let sectionY =
    ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ??
      tableStartY + 35) + 7;

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

  interface SummaryLine {
    label: string;
    value: string;
    color?: RGB;
  }

  const summaryLines: SummaryLine[] = [
    { label: txStatic('Rental Subtotal', 'Subtotal Sewa'), value: formatIDR(grossSubtotal) },
  ];
  if (discountAmount > 0) {
    summaryLines.push({
      label: txStatic(
        `${tierBenefits.label} Discount (${effectiveDiscountPct}%)`,
        `Diskon ${tierBenefits.label} (${effectiveDiscountPct}%)`
      ),
      value: `- ${formatIDR(discountAmount)}`,
      color: [6, 95, 70],
    });
  }
  summaryLines.push(
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
    summaryLines.push({
      label: txStatic('Overdue Fine', 'Denda Keterlambatan'),
      value: formatIDR(booking.overdueFine),
      color: [185, 28, 28],
    });
  }
  if (booking.damageFine > 0) {
    summaryLines.push({
      label: txStatic('Damage Fine', 'Denda Kerusakan'),
      value: formatIDR(booking.damageFine),
      color: [185, 28, 28],
    });
  }

  // Ensure bottom 2-column section fits cleanly above footer
  const summaryCardH = 10 + summaryLines.length * 6.2 + 12;
  if (sectionY + Math.max(summaryCardH, 54) > pageHeight - 18) {
    doc.addPage();
    sectionY = 16;
  }

  // 5. Bottom 2-Column Layout: Left = Bank Transfer + Policy, Right = Financial Summary Box
  const leftColW = 94;
  const colGap = 6;
  const rightColX = margin + leftColW + colGap; // 114mm
  const rightColW = contentWidth - leftColW - colGap; // 82mm

  // Right Financial Summary Box
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.35);
  doc.roundedRect(rightColX, sectionY, rightColW, summaryCardH, 1.8, 1.8, 'FD');

  // Header strip inside Summary Box
  doc.setFillColor(244, 244, 245);
  doc.rect(rightColX + 0.2, sectionY + 0.2, rightColW - 0.4, 7.2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(82, 82, 91);
  doc.text(txStatic('PAYMENT SUMMARY', 'RINGKASAN PEMBAYARAN'), rightColX + 4, sectionY + 4.9);

  let sumY = sectionY + 12.5;
  for (const line of summaryLines) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    if (line.color) {
      doc.setTextColor(...line.color);
    } else {
      doc.setTextColor(82, 82, 91);
    }
    doc.text(line.label, rightColX + 4, sumY);

    doc.setFont('courier', 'bold');
    doc.setFontSize(8);
    if (line.color) {
      doc.setTextColor(...line.color);
    } else {
      doc.setTextColor(9, 9, 11);
    }
    doc.text(line.value, rightColX + rightColW - 4, sumY, { align: 'right' });
    sumY += 6.2;
  }

  // Dark Total Payable Bar at bottom of Summary Card
  const totalBarY = sectionY + summaryCardH - 10;
  doc.setFillColor(24, 24, 27);
  doc.roundedRect(rightColX, totalBarY, rightColW, 10, 1.5, 1.5, 'F');
  doc.rect(rightColX, totalBarY, rightColW, 3, 'F'); // square top corners

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(255, 255, 255);
  doc.text(txStatic('TOTAL PAYABLE', 'TOTAL TAGIHAN'), rightColX + 4, totalBarY + 6.3);

  doc.setFont('courier', 'bold');
  doc.setFontSize(9.8);
  doc.setTextColor(255, 255, 255);
  doc.text(formatIDR(booking.totalAmount), rightColX + rightColW - 4, totalBarY + 6.4, {
    align: 'right',
  });

  // Left Column: Bank Settlement + Terms
  let leftBoxY = sectionY;
  if (tenant?.bankDetails) {
    const bankBoxH = 22;
    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, leftBoxY, leftColW, bankBoxH, 1.8, 1.8, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(113, 113, 122);
    doc.text(
      txStatic('BANK TRANSFER SETTLEMENT', 'REKENING TRANSFER PEMBAYARAN'),
      margin + 4,
      leftBoxY + 5.5
    );

    doc.setFont('courier', 'bold');
    doc.setFontSize(9.2);
    doc.setTextColor(9, 9, 11);
    doc.text(
      `${tenant.bankDetails.bankName}  ·  ${tenant.bankDetails.accountNumber}`,
      margin + 4,
      leftBoxY + 12
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(63, 63, 70);
    doc.text(
      `${txStatic('Account Holder', 'Atas Nama')}: ${tenant.bankDetails.accountHolder}`,
      margin + 4,
      leftBoxY + 17.5
    );

    leftBoxY += bankBoxH + 4;
  }

  // Policy & Grace Period Notice Box
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

  const policyBullets = [
    booking.membershipTier === 'premium' && tierBenefits.depositDiscountPercent > 0
      ? txStatic(
          `• Security deposit enjoys -${tierBenefits.depositDiscountPercent}% ${tierBenefits.label} discount (${depositPayablePct}% payable) and is refunded upon clean return.`,
          `• Deposit mendapat diskon -${tierBenefits.depositDiscountPercent}% ${tierBenefits.label} (bayar ${depositPayablePct}%) dan dikembalikan penuh setelah inspeksi bersih.`
        )
      : txStatic(
          '• Security deposit is held as a refundable liability and returned in full upon clean post-rental inspection.',
          '• Deposit jaminan dicatat sebagai liabilitas dan dikembalikan penuh setelah inspeksi pengembalian bersih.'
        ),
    txStatic(
      `• Late return grace period: ${graceDetail}. Overtime billed at ${hourlyRatePct}% daily rate per hour.`,
      `• Toleransi keterlambatan: ${graceDetail}. Keterlambatan dikenakan ${hourlyRatePct}% tarif harian per jam.`
    ),
  ];
  if (booking.paidAt) {
    policyBullets.push(
      txStatic(
        `• Payment verified on ${formatDateTime(booking.paidAt)}.`,
        `• Pembayaran terverifikasi pada ${formatDateTime(booking.paidAt)}.`
      )
    );
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  const wrappedPolicies = policyBullets.flatMap(
    (line) => doc.splitTextToSize(line, leftColW - 8) as string[]
  );
  const policyBoxH = 9.5 + wrappedPolicies.length * 3.5;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.25);
  doc.roundedRect(margin, leftBoxY, leftColW, policyBoxH, 1.8, 1.8, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(113, 113, 122);
  doc.text(txStatic('TERMS & NOTES', 'KETENTUAN & CATATAN'), margin + 4, leftBoxY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(82, 82, 91);
  doc.text(wrappedPolicies, margin + 4, leftBoxY + 9.5, { lineHeightFactor: 1.35 });

  // 6. Clean Footer across all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.25);
    doc.line(margin, pageHeight - 14, rightEdge, pageHeight - 14);

    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(161, 161, 170);
    doc.text(
      `${txStatic('GENERATED', 'DICETAK')} ${formatDateTime(new Date())}  ·  DOC ID ${booking.id}`,
      margin,
      pageHeight - 9.5
    );
    doc.text(
      `${brandFallback}  ·  ${txStatic('Page', 'Hal')} ${p}/${totalPages}`,
      rightEdge,
      pageHeight - 9.5,
      { align: 'right' }
    );
  }

  const safeFilename = booking.invoiceNumber.replace(/\//g, '-');
  doc.save(`${safeFilename}.pdf`);
}
