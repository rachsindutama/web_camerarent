import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDateTime, formatIDR } from '@/lib/utils';
import { calculateRentalDays } from '@/lib/availability';
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

  // Header bar (monochrome editorial style)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(9, 9, 11);
  doc.text(tenant?.name ?? 'CAMERARENT RENTAL OPS', 15, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(82, 82, 91);
  doc.text(tenant?.address ?? 'Multi-Tenant Production Equipment House', 15, 25);

  // Right invoice title
  doc.setFont('courier', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(9, 9, 11);
  doc.text(booking.invoiceNumber, pageWidth - 15, 20, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(82, 82, 91);
  doc.text(`STATUS: ${booking.bookingStatus.toUpperCase()}`, pageWidth - 15, 25, {
    align: 'right',
  });
  doc.text(`PAYMENT: ${booking.paymentStatus.toUpperCase()}`, pageWidth - 15, 30, {
    align: 'right',
  });
  if (booking.membershipTier) {
    doc.text(`MEMBER TIER: ${booking.membershipTier.toUpperCase()}`, pageWidth - 15, 35, {
      align: 'right',
    });
  }

  // Hairline rule
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.4);
  doc.line(15, 38, pageWidth - 15, 38);

  // Renter & Rental Window metadata
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(113, 113, 122);
  doc.text('BILLED TO', 15, 41);
  doc.text('RENTAL WINDOW', 110, 41);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(9, 9, 11);
  doc.text(renter?.displayName ?? booking.userId, 15, 46);
  doc.setFontSize(8.5);
  doc.setTextColor(82, 82, 91);
  if (renter?.email) doc.text(renter.email, 15, 51);
  if (renter?.phone) doc.text(`Phone: ${renter.phone}`, 15, 56);
  if (renter?.nik) doc.text(`NIK: ${renter.nik}`, 15, 61);

  doc.setTextColor(9, 9, 11);
  doc.text(`Pickup / Start : ${formatDateTime(booking.startDate)}`, 110, 46);
  doc.text(`Due Return     : ${formatDateTime(booking.endDate)}`, 110, 51);
  doc.text(
    booking.returnedAt
      ? `Actual Return  : ${formatDateTime(booking.returnedAt)}`
      : `Billing Cycle  : ${rentalDays} day(s)`,
    110,
    56
  );
  doc.text(
    `Logistics      : ${booking.logisticsType === 'delivery' ? 'Antar-Jemput Delivery' : 'Self-Pickup'}`,
    110,
    61
  );
  if (booking.deliveryAddress) {
    doc.setFontSize(8);
    doc.setTextColor(82, 82, 91);
    doc.text(`Address: ${booking.deliveryAddress}`, 110, 66, { maxWidth: 85 });
  }

  // Equipment & Serial Numbers Table
  const tableRows = booking.items.map((item, index) => [
    String(index + 1),
    item.equipmentName,
    item.serialNumber,
    `${rentalDays}d`,
    formatIDR(item.dailyRate),
    formatIDR(item.dailyRate * rentalDays),
  ]);

  autoTable(doc, {
    startY: 74,
    head: [['#', 'Equipment', 'Serial Number', 'Duration', 'Daily Rate', 'Line Total']],
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

  const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 120;

  // Financial Summary Table (right aligned, arithmetically transparent)
  const discountAmount = booking.discountAmount ?? 0;
  const grossSubtotal = booking.subtotal + discountAmount;
  const summaryRows: [string, string][] = [
    ['Rental Subtotal', formatIDR(grossSubtotal)],
  ];
  if (discountAmount > 0) {
    summaryRows.push([
      `Premium Member Discount (10%)`,
      `- ${formatIDR(discountAmount)}`,
    ]);
  }
  summaryRows.push(
    ['Antar-Jemput Delivery Fee', formatIDR(booking.deliveryFee)],
    [
      booking.membershipTier === 'premium'
        ? 'Refundable Security Deposit (50% Premium Rate)'
        : 'Refundable Security Deposit (Liability)',
      formatIDR(booking.deposit),
    ]
  );
  if (booking.overdueFine > 0) {
    summaryRows.push(['Overdue Fine', formatIDR(booking.overdueFine)]);
  }
  if (booking.damageFine > 0) {
    summaryRows.push(['Damage Assessment Fine', formatIDR(booking.damageFine)]);
  }
  summaryRows.push(['TOTAL PAYABLE', formatIDR(booking.totalAmount)]);

  autoTable(doc, {
    startY: finalY + 6,
    body: summaryRows,
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 2 },
    columnStyles: {
      0: { halign: 'right', textColor: [82, 82, 91] },
      1: { halign: 'right', font: 'courier', fontStyle: 'bold', textColor: [9, 9, 11], cellWidth: 42 },
    },
    margin: { left: 95, right: 15 },
    didParseCell: (data) => {
      if (data.row.index === summaryRows.length - 1) {
        data.cell.styles.fillColor = [244, 244, 245];
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = [9, 9, 11];
      }
    },
  });

  const bankY =
    ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? finalY + 40) +
    10;

  // Bank transfer instructions
  if (tenant?.bankDetails) {
    doc.setDrawColor(228, 228, 231);
    doc.rect(15, bankY, pageWidth - 30, 22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(9, 9, 11);
    doc.text('BANK TRANSFER SETTLEMENT INSTRUCTIONS', 19, bankY + 6);
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
    doc.text(
      `Security deposit is recorded as a refundable liability and returned upon clean post-rental inspection. Late grace period: ${tenant.overdueGraceMinutes} mins (${tenant.overdueHourlyRatePercent}% daily rate/hr thereafter).`,
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
    `GENERATED ${formatDateTime(new Date())} // DOCUMENT ID ${booking.id}`,
    15,
    285
  );

  const safeFilename = booking.invoiceNumber.replace(/\//g, '-');
  doc.save(`${safeFilename}.pdf`);
}

