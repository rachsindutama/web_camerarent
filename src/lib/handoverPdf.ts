import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDateTime, formatIDR } from '@/lib/utils';
import { calculateRentalDays } from '@/lib/availability';
import { txStatic } from '@/lib/i18n';
import { getMembershipBenefits } from '@/lib/membership';
import { resolveBookingUnitsMap, resolveFreshPlatformSettings } from '@/lib/pdfUnits';
import type { Booking, EquipmentUnit, Tenant, UserProfile } from '@/types/schema';

interface GenerateHandoverPdfParams {
  booking: Booking;
  tenant: Tenant | null;
  renter?: Pick<UserProfile, 'displayName' | 'email' | 'phone' | 'nik'> | null;
  unitsById?: Record<string, EquipmentUnit>;
}

interface KvRow {
  label: string;
  value: string;
  bold?: boolean;
}

function measureCardHeight(
  doc: jsPDF,
  width: number,
  labelW: number,
  rows: KvRow[],
  hasHeadline: boolean
): number {
  const valueMaxW = width - labelW - 9;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  let h = 11;
  if (hasHeadline) h += 5.5;
  for (const row of rows) {
    const lines = doc.splitTextToSize(row.value || '—', valueMaxW) as string[];
    h += Math.max(1, lines.length) * 3.8 + 1.3;
  }
  return h + 3;
}

function drawCard(
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

  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, width, height, 1.8, 1.8, 'FD');

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

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182mm
  const rightEdge = pageWidth - margin; // 196mm

  const rentalDays = calculateRentalDays(booking.startDate.toDate(), booking.endDate.toDate());
  const tierBenefits = getMembershipBenefits(booking.membershipTier, settings.tiers);
  const brandFallback = settings.seo.siteName || 'CameraRent';

  // Top dark accent bar
  pdf.setFillColor(24, 24, 27);
  pdf.rect(0, 0, pageWidth, 3.5, 'F');

  // Header Left (strict maxWidth = 96mm so address NEVER overlaps right title)
  const leftMaxW = 96;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.setTextColor(9, 9, 11);
  const branchTitle = tenant?.name ?? `${brandFallback} Rental Ops`;
  const titleLines = pdf.splitTextToSize(branchTitle, leftMaxW) as string[];
  pdf.text(titleLines, margin, 14.5);

  let leftY = 14.5 + (titleLines.length - 1) * 5.6 + 4.5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(113, 113, 122);
  const addressText =
    tenant?.address ??
    txStatic('Official Equipment Handover Branch', 'Cabang Resmi Serah Terima Peralatan');
  const addressLines = pdf.splitTextToSize(addressText, leftMaxW) as string[];
  pdf.text(addressLines, margin, leftY);
  leftY += addressLines.length * 3.7;

  // Header Right
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10.5);
  pdf.setTextColor(9, 9, 11);
  pdf.text(
    txStatic('EQUIPMENT HANDOVER (BAST)', 'BERITA ACARA SERAH TERIMA'),
    rightEdge,
    13.5,
    { align: 'right' }
  );

  pdf.setFont('courier', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(63, 63, 70);
  pdf.text(`REF: ${booking.invoiceNumber}`, rightEdge, 19, { align: 'right' });

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(113, 113, 122);
  pdf.text(
    `${booking.bookingStatus.replace(/_/g, ' ').toUpperCase()}  ·  ${tierBenefits.label.toUpperCase()}`,
    rightEdge,
    24,
    { align: 'right' }
  );
  const rightY = 26;

  const dividerY = Math.max(leftY, rightY) + 4;
  pdf.setDrawColor(228, 228, 231);
  pdf.setLineWidth(0.35);
  pdf.line(margin, dividerY, rightEdge, dividerY);

  // Two-column aligned metadata cards
  const cardsY = dividerY + 4.5;
  const leftCardW = 86;
  const cardGap = 4;
  const rightCardW = contentWidth - leftCardW - cardGap;

  const renterRows: KvRow[] = [];
  if (renter?.nik) renterRows.push({ label: 'NIK / KTP', value: renter.nik });
  if (renter?.phone) renterRows.push({ label: txStatic('Phone', 'HP / WA'), value: renter.phone });
  if (renter?.email) renterRows.push({ label: 'Email', value: renter.email });
  renterRows.push({
    label: txStatic('Deposit', 'Deposit'),
    value: formatIDR(booking.deposit),
    bold: true,
  });

  const scheduleRows: KvRow[] = [
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
    scheduleRows.push({ label: txStatic('Address', 'Alamat'), value: booking.deliveryAddress });
  }

  const equalCardH = Math.max(
    measureCardHeight(pdf, leftCardW, 21, renterRows, true),
    measureCardHeight(pdf, rightCardW, 25, scheduleRows, false)
  );

  drawCard(pdf, {
    x: margin,
    y: cardsY,
    width: leftCardW,
    height: equalCardH,
    labelW: 21,
    title: txStatic('RECEIVING PARTY (RENTER)', 'PIHAK PENERIMA (PENYEWA)'),
    headline: renter?.displayName ?? booking.userId,
    rows: renterRows,
  });

  drawCard(pdf, {
    x: margin + leftCardW + cardGap,
    y: cardsY,
    width: rightCardW,
    height: equalCardH,
    labelW: 25,
    title: txStatic('HANDOVER & RENTAL SCHEDULE', 'JADWAL SERAH TERIMA & SEWA'),
    rows: scheduleRows,
  });

  // Serialized Units & Included Accessories Checklist Table (182mm total)
  const tableStartY = cardsY + equalCardH + 6;
  const tableRows = booking.items.map((item, idx) => {
    const unit = resolvedUnits[item.unitId];
    const conditionLabel = unit?.condition
      ? unit.condition.toUpperCase()
      : txStatic('GOOD', 'BAIK');
    const accessoriesText =
      unit?.accessoriesIncluded && unit.accessoriesIncluded.length > 0
        ? unit.accessoriesIncluded.join(', ')
        : txStatic('Standard unit accessories', 'Kelengkapan standar unit');
    return [
      String(idx + 1),
      item.equipmentName,
      item.serialNumber,
      conditionLabel,
      accessoriesText,
      '[  ] OK',
      '[  ] OK',
    ];
  });

  autoTable(pdf, {
    startY: tableStartY,
    head: [
      [
        '#',
        txStatic('Equipment Model', 'Nama Peralatan'),
        'Serial Number',
        txStatic('Cond.', 'Kondisi'),
        txStatic('Included Accessories', 'Kelengkapan Aksesoris'),
        txStatic('Out', 'Keluar'),
        txStatic('In', 'Kembali'),
      ],
    ],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [24, 24, 27],
      textColor: [250, 250, 250],
      fontSize: 7.5,
      fontStyle: 'bold',
      cellPadding: 2.6,
    },
    bodyStyles: {
      fontSize: 7.8,
      textColor: [24, 24, 27],
      cellPadding: 2.6,
      lineColor: [228, 228, 231],
      lineWidth: 0.2,
      valign: 'top',
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 42, fontStyle: 'bold' },
      2: { font: 'courier', fontSize: 7.2, cellWidth: 29 },
      3: { halign: 'center', fontSize: 7.2, cellWidth: 15 },
      4: { fontSize: 7.2, textColor: [82, 82, 91] },
      5: { halign: 'center', font: 'courier', fontSize: 7.2, cellWidth: 16 },
      6: { halign: 'center', font: 'courier', fontSize: 7.2, cellWidth: 16 },
    },
    margin: { left: margin, right: margin },
  });

  let cursorY =
    ((pdf as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 130) + 6;

  // Pre-Rental Inspection Notes Box (auto-sized height)
  const baselineText =
    booking.preRentalChecklist?.notes ||
    txStatic(
      'All serialized units, optical elements, mounts, and listed accessories have been jointly inspected and verified in working order prior to handover.',
      'Seluruh unit bernomor seri, elemen optik, mount, dan aksesoris tertera telah diperiksa bersama dan dipastikan berfungsi normal sebelum serah terima.'
    );
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  const baselineLines = pdf.splitTextToSize(baselineText, contentWidth - 8) as string[];
  const notesBoxH = 14 + baselineLines.length * 3.8 + 5;

  if (cursorY + notesBoxH + 62 > pageHeight - 16) {
    pdf.addPage();
    cursorY = 16;
  }

  pdf.setDrawColor(228, 228, 231);
  pdf.setFillColor(250, 250, 250);
  pdf.roundedRect(margin, cursorY, contentWidth, notesBoxH, 1.8, 1.8, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.4);
  pdf.setTextColor(9, 9, 11);
  pdf.text(
    txStatic('PRE-RENTAL INSPECTION & CONDITION NOTES', 'CATATAN INSPEKSI & KONDISI PRA-SEWA'),
    margin + 4,
    cursorY + 5.5
  );

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(63, 63, 70);
  pdf.text(baselineLines, margin + 4, cursorY + 11);

  pdf.setFont('courier', 'normal');
  pdf.setFontSize(7.2);
  pdf.setTextColor(113, 113, 122);
  const confirmLine = booking.preRentalChecklist?.confirmedByUserAt
    ? `${txStatic('Digital Sign-Off by Renter', 'Konfirmasi Digital Penyewa')}: ${formatDateTime(
        booking.preRentalChecklist.confirmedByUserAt
      )}`
    : txStatic(
        'Digital Sign-Off: Pending · Physical signature below applies.',
        'Konfirmasi Digital: Menunggu · Berlaku tanda tangan fisik di bawah.'
      );
  pdf.text(confirmLine, margin + 4, cursorY + notesBoxH - 3.5);

  cursorY += notesBoxH + 5;

  // Optional Post-Rental Return Record
  if (booking.returnNotes || booking.returnedAt) {
    const retText =
      booking.returnNotes ??
      txStatic('Equipment returned and checked in.', 'Alat dikembalikan dan telah diperiksa.');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    const retLines = pdf.splitTextToSize(retText, contentWidth - 8) as string[];
    const retBoxH = 10.5 + retLines.length * 3.8 + 2.5;

    pdf.setDrawColor(167, 243, 208);
    pdf.setFillColor(236, 253, 245);
    pdf.roundedRect(margin, cursorY, contentWidth, retBoxH, 1.8, 1.8, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.4);
    pdf.setTextColor(6, 95, 70);
    pdf.text(
      `${txStatic('POST-RENTAL RETURN RECORD', 'CATATAN PENGEMBALIAN PASCA-SEWA')}${
        booking.returnedAt ? ` (${formatDateTime(booking.returnedAt)})` : ''
      }`,
      margin + 4,
      cursorY + 5.5
    );
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text(retLines, margin + 4, cursorY + 10.5);
    cursorY += retBoxH + 5;
  }

  // Declaration Notice
  const baseGrace = tenant?.overdueGraceMinutes ?? settings.defaultOverdueGraceMinutes;
  const effectiveGrace = baseGrace + tierBenefits.extraOverdueGraceMinutes;
  const hourlyPct = tenant?.overdueHourlyRatePercent ?? settings.defaultOverdueHourlyRatePercent;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.4);
  pdf.setTextColor(113, 113, 122);
  const declLines = pdf.splitTextToSize(
    txStatic(
      `DECLARATION: The Renter acknowledges receipt of the serialized equipment and accessories listed above in the stated condition and accepts full responsibility until official post-rental check-in. Late returns beyond the ${effectiveGrace}-minute grace window incur ${hourlyPct}% of the daily rate per hour. Any damage, loss, or missing accessories will be deducted from the security deposit (${formatIDR(booking.deposit)}) and billed for any excess repair cost.`,
      `PERNYATAAN: Penyewa menyatakan telah menerima seluruh unit bernomor seri beserta aksesoris di atas dalam kondisi sesuai catatan dan bertanggung jawab penuh hingga proses inspeksi pengembalian selesai. Keterlambatan melewati masa toleransi ${effectiveGrace} menit dikenakan denda ${hourlyPct}% dari tarif harian per jam. Kerusakan, kehilangan, atau kekurangan aksesoris akan dipotong dari deposit jaminan (${formatIDR(booking.deposit)}) dan ditagihkan selisihnya bila melebihi deposit.`
    ),
    contentWidth
  ) as string[];
  pdf.text(declLines, margin, cursorY + 2);
  cursorY += declLines.length * 3.5 + 8;

  // Dual Signature Blocks
  if (cursorY + 42 > pageHeight - 16) {
    pdf.addPage();
    cursorY = 20;
  }
  const sigY = Math.min(Math.max(cursorY, 224), 236);
  const boxWidth = (contentWidth - 8) / 2; // 87mm
  const leftBoxX = margin;
  const rightBoxX = margin + boxWidth + 8;

  pdf.setDrawColor(228, 228, 231);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(leftBoxX, sigY, boxWidth, 38, 1.8, 1.8, 'FD');
  pdf.roundedRect(rightBoxX, sigY, boxWidth, 38, 1.8, 1.8, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(9, 9, 11);
  pdf.text(
    txStatic('HANDED OVER BY (BRANCH OFFICER)', 'DISERAHKAN OLEH (PETUGAS CABANG)'),
    leftBoxX + boxWidth / 2,
    sigY + 6,
    { align: 'center' }
  );
  pdf.text(
    txStatic('RECEIVED BY (RENTER)', 'DITERIMA OLEH (PENYEWA)'),
    rightBoxX + boxWidth / 2,
    sigY + 6,
    { align: 'center' }
  );

  pdf.setDrawColor(161, 161, 170);
  pdf.line(leftBoxX + 12, sigY + 26, leftBoxX + boxWidth - 12, sigY + 26);
  pdf.line(rightBoxX + 12, sigY + 26, rightBoxX + boxWidth - 12, sigY + 26);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(39, 39, 42);
  pdf.text(tenant?.name ?? brandFallback, leftBoxX + boxWidth / 2, sigY + 31, { align: 'center' });
  pdf.text(renter?.displayName ?? booking.userId, rightBoxX + boxWidth / 2, sigY + 31, {
    align: 'center',
  });

  pdf.setFont('courier', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(113, 113, 122);
  pdf.text(
    txStatic('Date / Time: _______________', 'Tgl / Jam: _______________'),
    leftBoxX + boxWidth / 2,
    sigY + 35.5,
    { align: 'center' }
  );
  pdf.text(
    renter?.nik
      ? `NIK: ${renter.nik}`
      : txStatic('Date / Time: _______________', 'Tgl / Jam: _______________'),
    rightBoxX + boxWidth / 2,
    sigY + 35.5,
    { align: 'center' }
  );

  // Footer across all pages
  const totalPages = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    pdf.setDrawColor(228, 228, 231);
    pdf.setLineWidth(0.25);
    pdf.line(margin, pageHeight - 14, rightEdge, pageHeight - 14);

    pdf.setFont('courier', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(161, 161, 170);
    pdf.text(
      `BAST  ·  ${txStatic('GENERATED', 'DICETAK')} ${formatDateTime(new Date())}  ·  ID ${booking.id}`,
      margin,
      pageHeight - 9.5
    );
    pdf.text(
      `${brandFallback}  ·  ${txStatic('Page', 'Hal')} ${p}/${totalPages}`,
      rightEdge,
      pageHeight - 9.5,
      { align: 'right' }
    );
  }

  const safeFilename = booking.invoiceNumber.replace(/\//g, '-');
  pdf.save(`BAST-${safeFilename}.pdf`);
}
