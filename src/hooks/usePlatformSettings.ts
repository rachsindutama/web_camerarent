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
import { applySiteSeoToDocument, getCachedSiteSeo } from '@/lib/seo';

export const PLATFORM_SETTINGS_QUERY_KEY = ['platform_settings', 'global'] as const;

function getInitialPlatformSettings(): PlatformSettings {
  const cachedSeo = getCachedSiteSeo();
  if (!cachedSeo) return DEFAULT_PLATFORM_SETTINGS;
  return {
    ...DEFAULT_PLATFORM_SETTINGS,
    seo: cachedSeo,
  };
}

export function usePlatformSettings() {
  const query = useQuery<PlatformSettings>({
    queryKey: PLATFORM_SETTINGS_QUERY_KEY,
    enabled: isFirebaseConfigured && Boolean(db),
    initialData: getInitialPlatformSettings,
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
      applySiteSeoToDocument(query.data.seo);
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
  applySiteSeoToDocument(normalized.seo);
  return normalized;
}

export async function applyOperationalDefaultsToTenants(
  defaults: {
    deliveryRatePerKm: number;
    bufferHours: number;
    overdueGraceMinutes: number;
    overdueHourlyRatePercent: number;
  },
  targetTenantIds?: string[]
): Promise<number> {
  if (!db) throw new Error('Firebase is not initialized.');
  const snap = await getDocs(collection(db, 'tenants'));
  if (snap.empty) return 0;

  const targetSet =
    targetTenantIds && targetTenantIds.length > 0 ? new Set(targetTenantIds) : null;
  const matchedDocs = targetSet
    ? snap.docs.filter((d) => targetSet.has(d.id))
    : snap.docs;

  if (matchedDocs.length === 0) return 0;

  const batch = writeBatch(db);
  matchedDocs.forEach((tenantDoc) => {
    batch.update(tenantDoc.ref, {
      deliveryRatePerKm: defaults.deliveryRatePerKm,
      bufferHours: defaults.bufferHours,
      overdueGraceMinutes: defaults.overdueGraceMinutes,
      overdueHourlyRatePercent: defaults.overdueHourlyRatePercent,
    });
  });
  await batch.commit();
  return matchedDocs.length;
}

