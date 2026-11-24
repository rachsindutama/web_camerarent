import { doc as firestoreDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  getLivePlatformSettings,
  normalizePlatformSettings,
  setLivePlatformSettings,
  type PlatformSettings,
} from '@/lib/membership';
import type { Booking, EquipmentUnit, UserProfile } from '@/types/schema';

export type RenterDocumentInfo = Pick<UserProfile, 'displayName' | 'email' | 'phone' | 'nik'>;

export async function resolveBookingRenter(
  booking: Booking,
  provided?: RenterDocumentInfo | null
): Promise<RenterDocumentInfo | null> {
  if (provided && provided.displayName) return provided;
  if (!db || !booking.userId) return provided ?? null;

  try {
    const snap = await getDoc(firestoreDoc(db, 'users', booking.userId));
    if (snap.exists()) {
      const data = snap.data();
      return {
        displayName: String(data.displayName ?? booking.userId),
        email: String(data.email ?? ''),
        phone: String(data.phone ?? ''),
        nik: data.nik ? String(data.nik) : undefined,
      };
    }
  } catch {
    // Non-blocking fallback if offline
  }

  return provided ?? null;
}

export async function resolveBookingUnitsMap(
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
        // Fallback cleanly if unit was removed or offline
      }
    })
  );

  return result;
}

/**
 * Ensures PDF generators always read the latest Firestore `platform_settings/global`
 * even if the user clicked Download before the background query settled.
 */
export async function resolveFreshPlatformSettings(): Promise<PlatformSettings> {
  if (!db) return getLivePlatformSettings();
  try {
    const snap = await getDoc(firestoreDoc(db, 'platform_settings', 'global'));
    if (snap.exists()) {
      const normalized = normalizePlatformSettings(snap.data());
      setLivePlatformSettings(normalized);
      return normalized;
    }
  } catch {
    // Fallback to in-memory cached settings
  }
  return getLivePlatformSettings();
}

