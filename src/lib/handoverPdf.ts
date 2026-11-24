import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { doc as firestoreDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatDateTime, formatIDR } from '@/lib/utils';
import { calculateRentalDays } from '@/lib/availability';
import { txStatic } from '@/lib/i18n';
import { getLivePlatformSettings, getMembershipBenefits } from '@/lib/membership';
import type { Booking, EquipmentUnit, Tenant, UserProfile } from '@/types/schema';

interface GenerateHandoverPdfParams {
  booking: Booking;
  tenant: Tenant | null;
  renter?: Pick<UserProfile, 'displayName' | 'email' | 'phone' | 'nik'> | null;
  unitsById?: Record<string, EquipmentUnit>;
}

async function resolveUnitsMap(
  booking: Booking,
  provided?: Record<string, EquipmentUnit>
): Promise<Record<string, EquipmentUnit>> {
  const result: Record<string, EquipmentUnit> = { ...(provided ?? {}) };
  if (!db) return result;
  const missingIds = booking.items
    .map((item) => item.unitId)
    .filter((id) => Boolean(id) && !result[id]);

  if (missingIds.length === 0) return result;

  await Promise.all(
    missingIds.map(async (unitId) => {
      try {
        if (!db) return;
        const snap = await getDoc(firestoreDoc(db, 'equipment_units', unitId));
        if (snap.exists()) {
          result[unitId] = { id: snap.id, ...snap.data() } as EquipmentUnit;
        }
      } catch {
        // Non-blocking fallback when offline or unit doc was archived
      }
    })
  );
  return result;
}

export async function generateHandoverPdf({
  booking,
  tenant,
  renter,
  unitsById,
}: GenerateHandoverPdfParams): Promise<void> {
  const resolvedUnits = await resolveUnitsMap(booking, unitsById);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const rentalDays = calculateRentalDays(booking.startDate.toDate(), booking.endDate.toDate());
  const settings = getLivePlatformSettings();
  const tierBenefits = getMembershipBenefits(booking.membershipTier, settings.tiers);
  const brandFallback = settings.seo.siteName || 'CameraRent';

  // Header
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.setTextColor(9, 9, 11);
  pdf.text(tenant?.name ?? `${brandFallback.toUpperCase()} RENTAL OPS`, 15, 19);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(82, 82, 91);
  pdf.text(
    tenant?.address ??
      txStatic('Official Equipment Handover Branch', 'Cabang Resmi Serah Terima Peralatan'),
    15,
    24
  );

  // Right document title
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(9, 9, 11);
  pdf.text(
    txStatic('EQUIPMENT HANDOVER RECORD (BAST)', 'BERITA ACARA SERAH TERIMA (BAST)'),
    pageWidth - 15,
    19,
    { align: 'right' }
  );

  pdf.setFont('courier', 'bold');
  pdf.setFontSize(9.5);
  pdf.setTextColor(63, 63, 70);
  pdf.text(`REF: ${booking.invoiceNumber}`, pageWidth - 15, 24, { align: 'right' });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(113, 113, 122);
  pdf.text(
    `STATUS: ${booking.bookingStatus.replace(/_/g, ' ').toUpperCase()} // ${tierBenefits.label.toUpperCase()}`,
    pageWidth - 15,
    29,
    { align: 'right' }
  );

  // Hairline divider
  pdf.setDrawColor(228, 228, 231);
  pdf.setLineWidth(0.4);
  pdf.line(15, 33, pageWidth - 15, 33);

  // Two-column metadata
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(113, 113, 122);
  pdf.text(txStatic('RECEIVING PARTY (RENTER)', 'PIHAK PENERIMA (PENYEWA)'), 15, 39);
  pdf.text(txStatic('HANDOVER & RENTAL SCHEDULE', 'JADWAL SERAH TERIMA & SEWA'), 110, 39);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(9, 9, 11);
  pdf.text(renter?.displayName ?? booking.userId, 15, 44);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(63, 63, 70);
  let leftY = 49;
  if (renter?.nik) {
    pdf.text(`NIK / KTP : ${renter.nik}`, 15, leftY);
    leftY += 4.5;
  }
  if (renter?.phone) {
    pdf.text(`${txStatic('Phone', 'HP / WA')}   : ${renter.phone}`, 15, leftY);
    leftY += 4.5;
  }
  if (renter?.email) {
    pdf.text(`Email     : ${renter.email}`, 15, leftY);
    leftY += 4.5;
  }
  pdf.text(
    `${txStatic('Deposit', 'Deposit')}   : ${formatIDR(booking.deposit)}`,
    15,
    leftY
  );

  let rightY = 44;
  pdf.setTextColor(9, 9, 11);
  pdf.text(`${txStatic('Start / Pickup', 'Mulai / Ambil')} : ${formatDateTime(booking.startDate)}`, 110, rightY);
  rightY += 4.5;
  pdf.text(`${txStatic('Due Return', 'Batas Kembali')} : ${formatDateTime(booking.endDate)} (${rentalDays}${txStatic('d', 'h')})`, 110, rightY);
  rightY += 4.5;
  pdf.text(
    `${txStatic('Dispatched', 'Diserahkan')}    : ${
      booking.dispatchedAt ? formatDateTime(booking.dispatchedAt) : txStatic('Pending Dispatch', 'Menunggu Serah Terima')
    }`,
    110,
    rightY
  );
  rightY += 4.5;
  pdf.text(
    `${txStatic('Logistics', 'Logistik')}      : ${
      booking.logisticsType === 'delivery'
        ? txStatic('Delivery & Pickup', 'Antar-Jemput')
        : txStatic('Self-Pickup at Branch', 'Self-Pickup di Cabang')
    }${booking.courierName ? ` (${booking.courierName})` : ''}`,
    110,
    rightY
  );
  if (booking.deliveryAddress) {
    rightY += 4.5;
    pdf.setFontSize(8);
    pdf.setTextColor(82, 82, 91);
    pdf.text(`${txStatic('Address', 'Alamat')}: ${booking.deliveryAddress}`, 110, rightY, {
      maxWidth: 85,
    });
  }

  // Serialized Units & Accessories Checklist Table
  const tableStartY = Math.max(leftY + 8, rightY + 10, 72);
  const tableRows = booking.items.map((item, idx) => {
    const unit = resolvedUnits[item.unitId];
    const conditionLabel = unit?.condition
      ? unit.condition.toUpperCase()
      : txStatic('GOOD', 'BAIK');
    const accessoriesText =
      unit?.accessoriesIncluded && unit.accessoriesIncluded.length > 0
        ? unit.accessoriesIncluded.join(', ')
        : txStatic('Standard body/lens caps & battery', 'Kelengkapan standar unit');
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
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [24, 24, 27],
      cellPadding: 2.8,
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 42 },
      2: { font: 'courier', fontSize: 7.5, cellWidth: 30 },
      3: { halign: 'center', fontSize: 7.5, cellWidth: 16 },
      4: { fontSize: 7.5 },
      5: { halign: 'center', font: 'courier', fontSize: 7.5, cellWidth: 16 },
      6: { halign: 'center', font: 'courier', fontSize: 7.5, cellWidth: 16 },
    },
    margin: { left: 15, right: 15 },
  });

  let cursorY =
    ((pdf as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 130) + 7;

  // Inspection & Baseline Notes Box
  pdf.setDrawColor(228, 228, 231);
  pdf.setFillColor(250, 250, 250);
  pdf.rect(15, cursorY, pageWidth - 30, 28, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(9, 9, 11);
  pdf.text(
    txStatic('PRE-RENTAL INSPECTION & CONDITION NOTES', 'CATATAN INSPEKSI & KONDISI PRA-SEWA'),
    19,
    cursorY + 6
  );

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(63, 63, 70);
  const baselineText =
    booking.preRentalChecklist?.notes ||
    txStatic(
      'All serialized units, optical elements, mounts, and listed accessories have been jointly inspected and verified in working order prior to handover.',
      'Seluruh unit bernomor seri, elemen optik, mount, dan aksesoris tertera telah diperiksa bersama dan dipastikan berfungsi normal sebelum serah terima.'
    );
  pdf.text(baselineText, 19, cursorY + 12, { maxWidth: pageWidth - 38 });

  pdf.setFont('courier', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(113, 113, 122);
  const confirmLine = booking.preRentalChecklist?.confirmedByUserAt
    ? `${txStatic('Digital Sign-Off by Renter', 'Konfirmasi Digital Penyewa')}: ${formatDateTime(booking.preRentalChecklist.confirmedByUserAt)}`
    : txStatic(
        'Digital Sign-Off: Pending / Physical signature below applies.',
        'Konfirmasi Digital: Menunggu / Berlaku tanda tangan fisik di bawah.'
      );
  pdf.text(confirmLine, 19, cursorY + 24);

  cursorY += 34;

  // Optional Return Notes if already returned
  if (booking.returnNotes || booking.returnedAt) {
    pdf.setDrawColor(167, 243, 208);
    pdf.setFillColor(236, 253, 245);
    pdf.rect(15, cursorY, pageWidth - 30, 18, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(6, 95, 70);
    pdf.text(
      `${txStatic('POST-RENTAL RETURN RECORD', 'CATATAN PENGEMBALIAN PASCA-SEWA')}${
        booking.returnedAt ? ` (${formatDateTime(booking.returnedAt)})` : ''
      }`,
      19,
      cursorY + 6
    );
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text(
      booking.returnNotes ?? txStatic('Equipment returned and checked in.', 'Alat dikembalikan dan telah diperiksa.'),
      19,
      cursorY + 12,
      { maxWidth: pageWidth - 38 }
    );
    cursorY += 24;
  }

  // Terms & Liability Statement
  const baseGrace = tenant?.overdueGraceMinutes ?? settings.defaultOverdueGraceMinutes;
  const effectiveGrace = baseGrace + tierBenefits.extraOverdueGraceMinutes;
  const hourlyPct = tenant?.overdueHourlyRatePercent ?? settings.defaultOverdueHourlyRatePercent;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(113, 113, 122);
  pdf.text(
    txStatic(
      `DECLARATION: The Renter acknowledges receipt of the serialized equipment and accessories listed above in the stated condition and accepts full responsibility until official post-rental check-in. Late returns beyond the ${effectiveGrace}-minute grace window incur ${hourlyPct}% of the daily rate per hour. Any damage, loss, or missing accessories will be deducted from the security deposit (${formatIDR(booking.deposit)}) and billed for any excess repair cost.`,
      `PERNYATAAN: Penyewa menyatakan telah menerima seluruh unit bernomor seri beserta aksesoris di atas dalam kondisi sesuai catatan dan bertanggung jawab penuh hingga proses inspeksi pengembalian selesai. Keterlambatan melewati masa toleransi ${effectiveGrace} menit dikenakan denda ${hourlyPct}% dari tarif harian per jam. Kerusakan, kehilangan, atau kekurangan aksesoris akan dipotong dari deposit jaminan (${formatIDR(booking.deposit)}) dan ditagihkan selisihnya bila melebihi deposit.`
    ),
    15,
    cursorY + 2,
    { maxWidth: pageWidth - 30 }
  );

  // Dual Signature Blocks
  const sigY = Math.min(Math.max(cursorY + 24, 222), 236);
  const leftBoxX = 15;
  const rightBoxX = pageWidth / 2 + 5;
  const boxWidth = pageWidth / 2 - 20;

  pdf.setDrawColor(228, 228, 231);
  pdf.rect(leftBoxX, sigY, boxWidth, 38);
  pdf.rect(rightBoxX, sigY, boxWidth, 38);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
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

  // Signature lines
  pdf.setDrawColor(161, 161, 170);
  pdf.line(leftBoxX + 12, sigY + 26, leftBoxX + boxWidth - 12, sigY + 26);
  pdf.line(rightBoxX + 12, sigY + 26, rightBoxX + boxWidth - 12, sigY + 26);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(63, 63, 70);
  pdf.text(
    tenant?.name ?? brandFallback,
    leftBoxX + boxWidth / 2,
    sigY + 31,
    { align: 'center' }
  );
  pdf.text(
    renter?.displayName ?? booking.userId,
    rightBoxX + boxWidth / 2,
    sigY + 31,
    { align: 'center' }
  );

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
    renter?.nik ? `NIK: ${renter.nik}` : txStatic('Date / Time: _______________', 'Tgl / Jam: _______________'),
    rightBoxX + boxWidth / 2,
    sigY + 35.5,
    { align: 'center' }
  );

  // Footer
  pdf.setFont('courier', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(161, 161, 170);
  pdf.text(
    `BAST // ${txStatic('GENERATED', 'DICETAK')} ${formatDateTime(new Date())} // ID ${booking.id}`,
    15,
    285
  );

  const safeFilename = booking.invoiceNumber.replace(/\//g, '-');
  pdf.save(`BAST-${safeFilename}.pdf`);
}

