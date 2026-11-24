import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDateTime, formatIDR } from '@/lib/utils';
import { calculateRentalDays } from '@/lib/availability';
import { txStatic } from '@/lib/i18n';
import { getLivePlatformSettings, getMembershipBenefits } from '@/lib/membership';
import type { Booking, Tenant, UserProfile } from '@/types/schema';

interface GenerateInvoiceParams {
  booking: Booking;
  tenant: Tenant | null;
  renter?: Pick<UserProfile, 'displayName' | 'email' | 'phone' | 'nik'> | null;
}

export function generateInvoicePdf({ booking, tenant, renter }: GenerateInvoiceParams): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const rentalDays = calculateRentalDays(booking.startDate.toDate(), booking.endDate.toDate());
  const settings = getLivePlatformSettings();
  const tierBenefits = getMembershipBenefits(booking.membershipTier, settings.tiers);
  const brandFallback = settings.seo.siteName || 'CameraRent';

  // Header bar (monochrome editorial style)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(9, 9, 11);
  doc.text(tenant?.name ?? `${brandFallback.toUpperCase()} RENTAL OPS`, 15, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(82, 82, 91);
  doc.text(
    tenant?.address ??
      txStatic('Multi-Tenant Production Equipment House', 'Rumah Sewa Peralatan Produksi Multi-Cabang'),
    15,
    25
  );

  // Right invoice title
  doc.setFont('courier', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(9, 9, 11);
  doc.text(booking.invoiceNumber, pageWidth - 15, 20, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(82, 82, 91);
  doc.text(`STATUS: ${booking.bookingStatus.replace(/_/g, ' ').toUpperCase()}`, pageWidth - 15, 25, {
    align: 'right',
  });
  doc.text(
    `${txStatic('PAYMENT', 'PEMBAYARAN')}: ${booking.paymentStatus.toUpperCase()}`,
    pageWidth - 15,
    30,
    { align: 'right' }
  );
  if (booking.membershipTier) {
    doc.text(
      `${txStatic('MEMBER TIER', 'TIER MEMBER')}: ${tierBenefits.label.toUpperCase()}`,
      pageWidth - 15,
      35,
      { align: 'right' }
    );
  }

  // Hairline rule
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.4);
  doc.line(15, 38, pageWidth - 15, 38);

  // Renter & Rental Window metadata
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(113, 113, 122);
  doc.text(txStatic('BILLED TO', 'DITAGIHKAN KEPADA'), 15, 43);
  doc.text(txStatic('RENTAL WINDOW', 'JADWAL SEWA'), 110, 43);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(9, 9, 11);
  doc.text(renter?.displayName ?? booking.userId, 15, 48);
  doc.setFontSize(8.5);
  doc.setTextColor(82, 82, 91);
  if (renter?.email) doc.text(renter.email, 15, 53);
  if (renter?.phone) doc.text(`${txStatic('Phone', 'HP')}: ${renter.phone}`, 15, 58);
  if (renter?.nik) doc.text(`NIK: ${renter.nik}`, 15, 63);

  doc.setTextColor(9, 9, 11);
  doc.text(`${txStatic('Pickup / Start', 'Mulai / Ambil')} : ${formatDateTime(booking.startDate)}`, 110, 48);
  doc.text(`${txStatic('Due Return', 'Batas Kembali')} : ${formatDateTime(booking.endDate)}`, 110, 53);
  doc.text(
    booking.returnedAt
      ? `${txStatic('Actual Return', 'Kembali Aktual')} : ${formatDateTime(booking.returnedAt)}`
      : `${txStatic('Billing Cycle', 'Durasi Sewa')} : ${rentalDays} ${txStatic('day(s)', 'hari')}`,
    110,
    58
  );
  doc.text(
    `${txStatic('Logistics', 'Logistik')} : ${
      booking.logisticsType === 'delivery'
        ? txStatic('Delivery & Pickup', 'Antar-Jemput')
        : txStatic('Self-Pickup', 'Ambil Sendiri')
    }${booking.deliveryDistanceKm ? ` (${booking.deliveryDistanceKm} km)` : ''}`,
    110,
    63
  );
  if (booking.deliveryAddress) {
    doc.setFontSize(8);
    doc.setTextColor(82, 82, 91);
    doc.text(`${txStatic('Address', 'Alamat')}: ${booking.deliveryAddress}`, 110, 68, {
      maxWidth: 85,
    });
  }

  // Equipment & Serial Numbers Table
  const tableRows = booking.items.map((item, index) => [
    String(index + 1),
    item.equipmentName,
    item.serialNumber,
    `${rentalDays}${txStatic('d', 'h')}`,
    formatIDR(item.dailyRate),
    formatIDR(item.dailyRate * rentalDays),
  ]);

  autoTable(doc, {
    startY: 77,
    head: [
      [
        '#',
        txStatic('Equipment', 'Alat'),
        'Serial Number',
        txStatic('Duration', 'Durasi'),
        txStatic('Daily Rate', 'Tarif / Hari'),
        txStatic('Line Total', 'Subtotal'),
      ],
    ],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [24, 24, 27],
      textColor: [250, 250, 250],
      fontSize: 8,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [24, 24, 27],
      cellPadding: 3,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      2: { font: 'courier', fontSize: 8 },
      3: { halign: 'center', cellWidth: 18 },
      4: { halign: 'right', font: 'courier', fontSize: 8 },
      5: { halign: 'right', font: 'courier', fontSize: 8 },
    },
    margin: { left: 15, right: 15 },
  });

  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 120;

  // Dynamic Discount & Deposit labels (based on actual amounts & live settings)
  const discountAmount = booking.discountAmount ?? 0;
  const grossSubtotal = booking.subtotal + discountAmount;
  const effectiveDiscountPct =
    discountAmount > 0 && grossSubtotal > 0
      ? Math.round((discountAmount / grossSubtotal) * 100)
      : tierBenefits.rentalDiscountPercent;

  const depositPayablePct = Math.max(0, 100 - tierBenefits.depositDiscountPercent);
  const depositLabel =
    booking.membershipTier === 'premium' && tierBenefits.depositDiscountPercent > 0
      ? txStatic(
          `Refundable Security Deposit (${depositPayablePct}% ${tierBenefits.label} Rate, -${tierBenefits.depositDiscountPercent}%)`,
          `Deposit Jaminan (${depositPayablePct}% Tarif ${tierBenefits.label}, Diskon ${tierBenefits.depositDiscountPercent}%)`
        )
      : txStatic('Refundable Security Deposit (Liability)', 'Deposit Jaminan (Liability)');

  const summaryRows: [string, string][] = [
    [txStatic('Rental Subtotal', 'Subtotal Sewa'), formatIDR(grossSubtotal)],
  ];
  if (discountAmount > 0) {
    summaryRows.push([
      txStatic(
        `${tierBenefits.label} Member Discount (${effectiveDiscountPct}%)`,
        `Diskon Member ${tierBenefits.label} (${effectiveDiscountPct}%)`
      ),
      `- ${formatIDR(discountAmount)}`,
    ]);
  }
  summaryRows.push(
    [txStatic('Delivery & Pickup Fee', 'Biaya Antar-Jemput'), formatIDR(booking.deliveryFee)],
    [depositLabel, formatIDR(booking.deposit)]
  );
  if (booking.overdueFine > 0) {
    summaryRows.push([txStatic('Overdue Fine', 'Denda Keterlambatan'), formatIDR(booking.overdueFine)]);
  }
  if (booking.damageFine > 0) {
    summaryRows.push([
      txStatic('Damage Assessment Fine', 'Denda Kerusakan'),
      formatIDR(booking.damageFine),
    ]);
  }
  summaryRows.push([txStatic('TOTAL PAYABLE', 'TOTAL TAGIHAN'), formatIDR(booking.totalAmount)]);

  autoTable(doc, {
    startY: finalY + 6,
    body: summaryRows,
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 2 },
    columnStyles: {
      0: { halign: 'right', textColor: [82, 82, 91] },
      1: {
        halign: 'right',
        font: 'courier',
        fontStyle: 'bold',
        textColor: [9, 9, 11],
        cellWidth: 42,
      },
    },
    margin: { left: 85, right: 15 },
    didParseCell: (data) => {
      if (data.row.index === summaryRows.length - 1) {
        data.cell.styles.fillColor = [244, 244, 245];
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = [9, 9, 11];
      }
    },
  });

  const bankY =
    ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ??
      finalY + 40) + 10;

  // Effective grace period (base tenant grace + membership bonus)
  const baseGrace = tenant?.overdueGraceMinutes ?? settings.defaultOverdueGraceMinutes;
  const extraGrace = tierBenefits.extraOverdueGraceMinutes;
  const effectiveGrace = baseGrace + extraGrace;
  const hourlyRatePct = tenant?.overdueHourlyRatePercent ?? settings.defaultOverdueHourlyRatePercent;

  // Bank transfer instructions
  if (tenant?.bankDetails) {
    doc.setDrawColor(228, 228, 231);
    doc.rect(15, bankY, pageWidth - 30, 24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(9, 9, 11);
    doc.text(
      txStatic('BANK TRANSFER SETTLEMENT INSTRUCTIONS', 'INSTRUKSI PEMBAYARAN TRANSFER BANK'),
      19,
      bankY + 6
    );
    doc.setFont('courier', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(63, 63, 70);
    doc.text(
      `${tenant.bankDetails.bankName} // ACC: ${tenant.bankDetails.accountNumber} // A/N: ${tenant.bankDetails.accountHolder}`,
      19,
      bankY + 12
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(113, 113, 122);
    const graceDetail =
      extraGrace > 0
        ? txStatic(
            `${effectiveGrace} mins (${baseGrace}m base + ${extraGrace}m ${tierBenefits.label} bonus)`,
            `${effectiveGrace} menit (${baseGrace}m standar + ${extraGrace}m bonus ${tierBenefits.label})`
          )
        : txStatic(`${effectiveGrace} mins`, `${effectiveGrace} menit`);
    doc.text(
      txStatic(
        `Security deposit is recorded as a refundable liability and returned upon clean post-rental inspection. Late grace period: ${graceDetail} (${hourlyRatePct}% daily rate/hr thereafter).`,
        `Deposit jaminan dicatat sebagai kewajiban (liability) dan dikembalikan penuh setelah inspeksi pengembalian bersih. Toleransi keterlambatan: ${graceDetail} (denda ${hourlyRatePct}% tarif harian/jam setelahnya).`
      ),
      19,
      bankY + 18,
      { maxWidth: pageWidth - 38 }
    );
  }

  // Footer
  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(161, 161, 170);
  doc.text(
    `${txStatic('GENERATED', 'DICETAK')} ${formatDateTime(new Date())} // DOCUMENT ID ${booking.id}`,
    15,
    285
  );

  const safeFilename = booking.invoiceNumber.replace(/\//g, '-');
  doc.save(`${safeFilename}.pdf`);
}
