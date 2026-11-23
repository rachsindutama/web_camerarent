import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import {
  DEFAULT_PLATFORM_SETTINGS,
  normalizePlatformSettings,
  setLivePlatformSettings,
  type PlatformSettings,
} from '@/lib/membership';

export const PLATFORM_SETTINGS_QUERY_KEY = ['platform_settings', 'global'] as const;

export function usePlatformSettings() {
  const query = useQuery<PlatformSettings>({
    queryKey: PLATFORM_SETTINGS_QUERY_KEY,
    enabled: isFirebaseConfigured && Boolean(db),
    initialData: DEFAULT_PLATFORM_SETTINGS,
    staleTime: 1000 * 60,
    queryFn: async () => {
      if (!db) return DEFAULT_PLATFORM_SETTINGS;
      try {
        const snap = await getDoc(doc(db, 'platform_settings', 'global'));
        if (!snap.exists()) return DEFAULT_PLATFORM_SETTINGS;
        return normalizePlatformSettings(snap.data());
      } catch (error) {
        console.warn('Unable to load platform_settings/global, using defaults:', error);
        return DEFAULT_PLATFORM_SETTINGS;
      }
    },
  });

  useEffect(() => {
    if (query.data) {
      setLivePlatformSettings(query.data);
    }
  }, [query.data]);

  return {
    settings: query.data ?? DEFAULT_PLATFORM_SETTINGS,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
  };
}

export async function savePlatformSettings(next: PlatformSettings): Promise<PlatformSettings> {
  if (!db) throw new Error('Firebase is not initialized.');
  const normalized = normalizePlatformSettings(next);
  await setDoc(
    doc(db, 'platform_settings', 'global'),
    {
      ...normalized,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  setLivePlatformSettings(normalized);
  return normalized;
}

export async function applyOperationalDefaultsToAllTenants(defaults: {
  deliveryRatePerKm: number;
  bufferHours: number;
  overdueGraceMinutes: number;
  overdueHourlyRatePercent: number;
}): Promise<number> {
  if (!db) throw new Error('Firebase is not initialized.');
  const snap = await getDocs(collection(db, 'tenants'));
  if (snap.empty) return 0;

  const batch = writeBatch(db);
  snap.docs.forEach((tenantDoc) => {
    batch.update(tenantDoc.ref, {
      deliveryRatePerKm: defaults.deliveryRatePerKm,
      bufferHours: defaults.bufferHours,
      overdueGraceMinutes: defaults.overdueGraceMinutes,
      overdueHourlyRatePercent: defaults.overdueHourlyRatePercent,
    });
  });
  await batch.commit();
  return snap.size;
}

