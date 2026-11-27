import { addDoc, collection, doc, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { syncAvailabilitySlotStatus } from '@/lib/availability';
import { calculateOverdueFine } from '@/hooks/useOverdueCalc';
import type { Booking, DamageReport, Tenant } from '@/types/schema';

export async function savePreRentalChecklistOp(
  booking: Booking,
  params: { notes: string; photos: string[]; dispatchActiveRent: boolean }
): Promise<void> {
  if (!db) throw new Error('Firestore not initialized');

  await updateDoc(doc(db, 'bookings', booking.id), {
    preRentalChecklist: {
      photos: params.photos,
      notes: params.notes.trim(),
      confirmedByUserAt: booking.preRentalChecklist?.confirmedByUserAt ?? null,
    },
    ...(params.dispatchActiveRent
      ? { bookingStatus: 'active_rent', dispatchedAt: Timestamp.now() }
      : {}),
  });

  if (params.dispatchActiveRent) {
    await syncAvailabilitySlotStatus(booking.id, 'active_rent');
    for (const item of booking.items) {
      await updateDoc(doc(db, 'equipment_units', item.unitId), {
        status: 'rented',
        lastCheckedAt: Timestamp.now(),
      });
    }
  }
}

export async function applyOverdueFineOp(
  booking: Booking,
  fineAmount: number,
  verifiedByUid: string
): Promise<void> {
  if (!db) throw new Error('Firestore not initialized');

  await updateDoc(doc(db, 'bookings', booking.id), {
    bookingStatus: 'overdue',
    overdueFine: fineAmount,
    totalAmount:
      booking.subtotal + booking.deliveryFee + booking.deposit + fineAmount + booking.damageFine,
  });
  await syncAvailabilitySlotStatus(booking.id, 'overdue');

  if (fineAmount > 0) {
    await addDoc(collection(db, 'transactions'), {
      tenantId: booking.tenantId,
      bookingId: booking.id,
      type: 'overdue_fine',
      category: 'revenue',
      amount: fineAmount,
      paymentMethod: 'cash',
      notes: `Overdue fine assessed for ${booking.invoiceNumber}`,
      verifiedBy: verifiedByUid,
      createdAt: Timestamp.now(),
    });
  }
}

export async function completeCleanReturnOp(
  booking: Booking,
  bookingTenant: Tenant,
  verifiedByUid: string
): Promise<{ finalOverdueFine: number; netDepositRefund: number }> {
  if (!db) throw new Error('Firestore not initialized');

  const now = new Date();
  const overdueCalc = calculateOverdueFine(booking, bookingTenant, now);
  const newlyAssessedOverdue =
    overdueCalc.isOverdue && booking.overdueFine === 0 ? overdueCalc.estimatedFine : 0;
  const finalOverdueFine = Math.max(booking.overdueFine, newlyAssessedOverdue);

  const deductedForOverdue = Math.min(finalOverdueFine, booking.deposit);
  const extraOverdueDue = Math.max(0, finalOverdueFine - booking.deposit);
  const netDepositRefund = Math.max(0, booking.deposit - deductedForOverdue);

  const returnNote =
    finalOverdueFine > 0
      ? `Dikembalikan terlambat (${overdueCalc.billableLateHours} jam lewat grace period) — denda overdue Rp ${finalOverdueFine.toLocaleString('id-ID')} (potong deposit Rp ${deductedForOverdue.toLocaleString('id-ID')}, refund sisa Rp ${netDepositRefund.toLocaleString('id-ID')}).`
      : 'Clean return verified — unit kembali tepat waktu dalam kondisi baik & deposit direfund penuh.';

  await updateDoc(doc(db, 'bookings', booking.id), {
    bookingStatus: 'completed',
    paymentStatus: netDepositRefund > 0 ? 'refunded' : 'paid',
    overdueFine: finalOverdueFine,
    totalAmount:
      booking.subtotal +
      booking.deliveryFee +
      booking.deposit +
      booking.damageFine +
      extraOverdueDue,
    returnedAt: Timestamp.fromDate(now),
    returnNotes: returnNote,
  });
  await syncAvailabilitySlotStatus(booking.id, 'completed');

  for (const item of booking.items) {
    await updateDoc(doc(db, 'equipment_units', item.unitId), {
      status: 'available',
      lastCheckedAt: Timestamp.now(),
    });
  }

  if (newlyAssessedOverdue > 0) {
    await addDoc(collection(db, 'transactions'), {
      tenantId: booking.tenantId,
      bookingId: booking.id,
      type: 'overdue_fine',
      category: 'revenue',
      amount: newlyAssessedOverdue,
      paymentMethod: 'bank_transfer',
      notes: `Auto overdue fine on return (${overdueCalc.billableLateHours}h late) for ${booking.invoiceNumber}`,
      verifiedBy: verifiedByUid,
      createdAt: Timestamp.now(),
    });
  }

  if (deductedForOverdue > 0) {
    await addDoc(collection(db, 'transactions'), {
      tenantId: booking.tenantId,
      bookingId: booking.id,
      type: 'deposit_refund',
      category: 'liability',
      amount: deductedForOverdue,
      paymentMethod: 'bank_transfer',
      notes: `Deposit applied to overdue fine (${booking.invoiceNumber})`,
      verifiedBy: verifiedByUid,
      createdAt: Timestamp.now(),
    });
  }

  if (netDepositRefund > 0) {
    await addDoc(collection(db, 'transactions'), {
      tenantId: booking.tenantId,
      bookingId: booking.id,
      type: 'deposit_refund',
      category: 'liability',
      amount: netDepositRefund,
      paymentMethod: 'bank_transfer',
      notes:
        deductedForOverdue > 0
          ? `Remaining deposit refund after overdue deduction (${booking.invoiceNumber})`
          : `Clean return deposit refund for ${booking.invoiceNumber}`,
      verifiedBy: verifiedByUid,
      createdAt: Timestamp.now(),
    });
  }

  return { finalOverdueFine, netDepositRefund };
}

export async function submitDamageReportOp(
  booking: Booking,
  params: {
    unitId: string;
    severity: DamageReport['severity'];
    description: string;
    repairCost: number;
    evidencePhotos: string[];
  },
  verifiedByUid: string
): Promise<void> {
  if (!db) throw new Error('Firestore not initialized');

  const repairCost = Math.max(0, Number(params.repairCost));
  const deductedFromDeposit = Math.min(repairCost, booking.deposit);
  const extraFineAmount = Math.max(0, repairCost - booking.deposit);
  const remainingDepositRefund = Math.max(0, booking.deposit - deductedFromDeposit);

  await addDoc(collection(db, 'damage_reports'), {
    bookingId: booking.id,
    unitId: params.unitId,
    tenantId: booking.tenantId,
    reportedBy: verifiedByUid,
    severity: params.severity,
    description: params.description.trim() || 'Post-rental equipment damage assessed.',
    evidencePhotos: params.evidencePhotos,
    repairCost,
    deductedFromDeposit,
    extraFineAmount,
    status: 'open',
    createdAt: Timestamp.now(),
  });

  for (const item of booking.items) {
    await updateDoc(doc(db, 'equipment_units', item.unitId), {
      status: item.unitId === params.unitId ? 'maintenance' : 'available',
      ...(item.unitId === params.unitId ? { condition: 'damaged' } : {}),
      lastCheckedAt: Timestamp.now(),
    });
  }

  const damagedItem = booking.items.find((i) => i.unitId === params.unitId);
  const damagedUnitLabel = damagedItem
    ? `${damagedItem.equipmentName} (${damagedItem.serialNumber})`
    : params.unitId;

  await updateDoc(doc(db, 'bookings', booking.id), {
    damageFine: repairCost,
    damagedUnitId: params.unitId,
    bookingStatus: 'completed',
    paymentStatus: remainingDepositRefund > 0 ? 'refunded' : 'paid',
    returnedAt: Timestamp.now(),
    returnNotes: `Dikembalikan dengan laporan kerusakan pada ${damagedUnitLabel} (${params.severity}) — biaya perbaikan Rp ${repairCost.toLocaleString('id-ID')}.`,
    totalAmount:
      booking.subtotal +
      booking.deliveryFee +
      booking.deposit +
      booking.overdueFine +
      extraFineAmount,
  });
  await syncAvailabilitySlotStatus(booking.id, 'completed');

  if (repairCost > 0) {
    await addDoc(collection(db, 'transactions'), {
      tenantId: booking.tenantId,
      bookingId: booking.id,
      type: 'damage_fine',
      category: 'revenue',
      amount: repairCost,
      paymentMethod: 'bank_transfer',
      notes: `Damage fine (${params.severity}) for ${booking.invoiceNumber} — Deducted Rp ${deductedFromDeposit}, Extra Rp ${extraFineAmount}`,
      verifiedBy: verifiedByUid,
      createdAt: Timestamp.now(),
    });
  }

  if (deductedFromDeposit > 0) {
    await addDoc(collection(db, 'transactions'), {
      tenantId: booking.tenantId,
      bookingId: booking.id,
      type: 'deposit_refund',
      category: 'liability',
      amount: deductedFromDeposit,
      paymentMethod: 'bank_transfer',
      notes: `Deposit forfeited to cover damage fine (${booking.invoiceNumber})`,
      verifiedBy: verifiedByUid,
      createdAt: Timestamp.now(),
    });
  }

  if (remainingDepositRefund > 0) {
    await addDoc(collection(db, 'transactions'), {
      tenantId: booking.tenantId,
      bookingId: booking.id,
      type: 'deposit_refund',
      category: 'liability',
      amount: remainingDepositRefund,
      paymentMethod: 'bank_transfer',
      notes: `Partial deposit refund after damage deduction (${booking.invoiceNumber})`,
      verifiedBy: verifiedByUid,
      createdAt: Timestamp.now(),
    });
  }
}

