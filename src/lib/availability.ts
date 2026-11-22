import {
  collection,
  query,
  where,
  getDocs,
  runTransaction,
  doc,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Booking, BookingStatus, EquipmentUnit } from '@/types/schema';

const BLOCKING_STATUSES: BookingStatus[] = [
  'pending_payment',
  'waiting_verification',
  'confirmed',
  'active_rent',
  'overdue',
];

export interface AvailabilitySlot {
  tenantId: string;
  bookingId: string;
  unitIds: string[];
  startDate: Timestamp;
  endDate: Timestamp;
  bufferEndDate: Timestamp;
  bookingStatus: BookingStatus;
}

/**
 * Checks if two time intervals overlap:
 * [reqStart, reqBufferEnd] overlaps [existingStart, existingBufferEnd]
 */
export function isOverlapping(
  reqStart: Date,
  reqBufferEnd: Date,
  existingStart: Date,
  existingBufferEnd: Date
): boolean {
  return reqStart < existingBufferEnd && reqBufferEnd > existingStart;
}

/**
 * Returns all available physical EquipmentUnits for a tenant within a date range,
 * accounting for tenant.bufferHours and excluding units in 'maintenance'.
 * Queries the PII-free `availability_slots` collection so renters can safely check
 * live fleet availability without reading other users' private booking documents.
 */
export async function getAvailableUnits(
  tenantId: string,
  equipmentIds: string[],
  startDate: Date,
  endDate: Date,
  bufferHours: number
): Promise<Record<string, EquipmentUnit[]>> {
  const availableByEquipment: Record<string, EquipmentUnit[]> = {};
  for (const eqId of equipmentIds) availableByEquipment[eqId] = [];

  if (!db || equipmentIds.length === 0) {
    return availableByEquipment;
  }

  const reqBufferEnd = new Date(endDate.getTime() + bufferHours * 60 * 60 * 1000);

  // 1. Fetch all non-maintenance units for requested equipmentIds (chunked for Firestore 'in' limit)
  const uniqueIds = Array.from(new Set(equipmentIds));
  const validUnits: EquipmentUnit[] = [];

  for (let i = 0; i < uniqueIds.length; i += 30) {
    const chunk = uniqueIds.slice(i, i + 30);
    const unitsSnap = await getDocs(
      query(
        collection(db, 'equipment_units'),
        where('tenantId', '==', tenantId),
        where('equipmentId', 'in', chunk)
      )
    );

    unitsSnap.docs.forEach((d) => {
      const unit = { id: d.id, ...d.data() } as EquipmentUnit;
      if (unit.status !== 'maintenance' && unit.condition !== 'damaged') {
        validUnits.push(unit);
      }
    });
  }

  // 2. Fetch PII-free availability_slots for this tenant (single-field index, zero permission-denied)
  const slotsSnap = await getDocs(
    query(collection(db, 'availability_slots'), where('tenantId', '==', tenantId))
  );

  const blockedUnitIds = new Set<string>();
  slotsSnap.docs.forEach((docSnap) => {
    const slot = docSnap.data() as AvailabilitySlot;
    if (!BLOCKING_STATUSES.includes(slot.bookingStatus)) return;
    if (
      isOverlapping(
        startDate,
        reqBufferEnd,
        slot.startDate.toDate(),
        slot.bufferEndDate.toDate()
      )
    ) {
      slot.unitIds.forEach((uid) => blockedUnitIds.add(uid));
    }
  });

  // 3. Group remaining available units by equipmentId
  for (const unit of validUnits) {
    if (!blockedUnitIds.has(unit.id)) {
      availableByEquipment[unit.equipmentId]?.push(unit);
    }
  }
  return availableByEquipment;
}

/**
 * Atomically verifies bundle/item availability and creates BOTH the booking and its
 * PII-free availability slot lock inside a single Firestore Transaction.
 */
export async function allocateAndCreateBooking(
  tenantId: string,
  requestedEquipmentIds: string[], // Flattened list from cart + expanded bundles
  startDate: Date,
  endDate: Date,
  bufferHours: number,
  buildBookingPayload: (allocatedUnits: EquipmentUnit[]) => Omit<Booking, 'id'>
): Promise<string> {
  if (!db) {
    throw new Error('Firestore is not initialized.');
  }
  const firestore = db;

  return await runTransaction(firestore, async (tx) => {
    const uniqueEqIds = Array.from(new Set(requestedEquipmentIds));
    const availableMap = await getAvailableUnits(
      tenantId,
      uniqueEqIds,
      startDate,
      endDate,
      bufferHours
    );

    const allocatedUnits: EquipmentUnit[] = [];
    const usedUnitIds = new Set<string>();

    for (const eqId of requestedEquipmentIds) {
      const candidate = (availableMap[eqId] || []).find((u) => !usedUnitIds.has(u.id));
      if (!candidate) {
        throw new Error(`Insufficient stock for equipment ID: ${eqId} in the selected date range.`);
      }
      usedUnitIds.add(candidate.id);
      allocatedUnits.push(candidate);
    }

    const newBookingRef = doc(collection(firestore, 'bookings'));
    const bookingPayload = buildBookingPayload(allocatedUnits);
    tx.set(newBookingRef, bookingPayload);

    const slotRef = doc(firestore, 'availability_slots', newBookingRef.id);
    const slotPayload: AvailabilitySlot = {
      tenantId,
      bookingId: newBookingRef.id,
      unitIds: allocatedUnits.map((u) => u.id),
      startDate: bookingPayload.startDate,
      endDate: bookingPayload.endDate,
      bufferEndDate: bookingPayload.bufferEndDate,
      bookingStatus: bookingPayload.bookingStatus,
    };
    tx.set(slotRef, slotPayload);

    return newBookingRef.id;
  });
}

/**
 * Keeps the PII-free availability slot lock synchronized when an admin cancels,
 * confirms, dispatches, or completes a booking.
 */
export async function syncAvailabilitySlotStatus(
  bookingId: string,
  bookingStatus: BookingStatus
): Promise<void> {
  if (!db) return;
  try {
    await setDoc(
      doc(db, 'availability_slots', bookingId),
      { bookingStatus },
      { merge: true }
    );
  } catch (error) {
    console.warn('Could not sync availability slot status:', error);
  }
}

/**
 * Utility to compute rental days (minimum 1 day, rounded up by 24h billing cycles)
 */
export function calculateRentalDays(startDate: Date, endDate: Date): number {
  const diffMs = Math.max(0, endDate.getTime() - startDate.getTime());
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Utility to generate invoice number format: INV/YYYYMM/XXXX
 */
export function generateInvoiceNumber(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const randomSeq = String(Math.floor(1000 + Math.random() * 9000));
  return `INV/${yyyy}${mm}/${randomSeq}`;
}
