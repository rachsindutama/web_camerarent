import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, Timestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useNearestBranch } from '@/hooks/useNearestBranch';
import { ALL_TENANTS_SCOPE, useTenantStore } from '@/store/useTenantStore';
import type { Tenant } from '@/types/schema';

export function useTenant() {
  const { userProfile } = useAuth();
  const { selectedTenantId, isManualSelection, setSelectedTenantId } = useTenantStore();

  const { data: allTenants = [], isLoading } = useQuery<Tenant[]>({
    queryKey: ['tenants', 'all'],
    enabled: isFirebaseConfigured && Boolean(db),
    queryFn: async () => {
      if (!db) return [];
      const snap = await getDocs(query(collection(db, 'tenants')));
      return snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          name: d.name ?? 'Unnamed Rental House',
          slug: d.slug ?? docSnap.id,
          address: d.address ?? '',
          coordinates: d.coordinates ?? { lat: -6.2088, lng: 106.8456 },
          deliveryRatePerKm: Number(d.deliveryRatePerKm ?? 15000),
          bufferHours: Number(d.bufferHours ?? 3),
          overdueGraceMinutes: Number(d.overdueGraceMinutes ?? 60),
          overdueHourlyRatePercent: Number(d.overdueHourlyRatePercent ?? 10),
          bankDetails: d.bankDetails ?? {
            bankName: 'BCA',
            accountNumber: '-',
            accountHolder: '-',
          },
          status: d.status ?? 'active',
          createdAt: (d.createdAt as Timestamp) ?? Timestamp.now(),
        };
      });
    },
    staleTime: 1000 * 30,
  });

  const isSuperAdmin = userProfile?.role === 'superadmin';
  const isGuest = !userProfile;
  const isRenter = userProfile?.role === 'user';
  const autoDetectNearest = isGuest || isRenter;

  const tenants = useMemo(
    () => (isSuperAdmin ? allTenants : allTenants.filter((t) => t.status === 'active')),
    [isSuperAdmin, allTenants]
  );

  const isLockedToTenant = userProfile?.role === 'admin' && Boolean(userProfile.tenantId);

  const {
    visitorLocation,
    detecting: detectingNearest,
    locationReady,
    nearestTenant,
    distancesById,
    sortedTenants,
    detectNow: detectNearestBranch,
  } = useNearestBranch({
    tenants,
    enabled: autoDetectNearest && tenants.length > 0,
  });

  // Superadmin defaults to All Branches unless explicitly switched to a specific tenant
  const isAllTenants =
    isSuperAdmin &&
    (!selectedTenantId ||
      selectedTenantId === ALL_TENANTS_SCOPE ||
      !tenants.some((t) => t.id === selectedTenantId));

  const waitingForInitialGeo =
    autoDetectNearest &&
    !isManualSelection &&
    !selectedTenantId &&
    !locationReady &&
    !visitorLocation;

  const fallbackTenantId = waitingForInitialGeo
    ? null
    : autoDetectNearest && nearestTenant
      ? nearestTenant.id
      : tenants[0]?.id ?? null;

  const activeTenantId = isLockedToTenant
    ? userProfile.tenantId
    : isAllTenants
      ? null
      : selectedTenantId && tenants.some((t) => t.id === selectedTenantId)
        ? selectedTenantId
        : fallbackTenantId;

  useEffect(() => {
    if (isLockedToTenant && userProfile?.tenantId) {
      if (selectedTenantId !== userProfile.tenantId) {
        setSelectedTenantId(userProfile.tenantId, false);
      }
      return;
    }

    if (isSuperAdmin) {
      if (
        selectedTenantId &&
        selectedTenantId !== ALL_TENANTS_SCOPE &&
        tenants.length > 0 &&
        !tenants.some((t) => t.id === selectedTenantId)
      ) {
        setSelectedTenantId(ALL_TENANTS_SCOPE, false);
      }
      return;
    }

    if (tenants.length === 0) return;

    // Guest & Renter: wait briefly for initial geo before picking nearest branch
    if (autoDetectNearest && !isManualSelection) {
      if (visitorLocation && nearestTenant) {
        if (selectedTenantId !== nearestTenant.id) {
          setSelectedTenantId(nearestTenant.id, false);
        }
        return;
      }
      if (!locationReady) return;
    }

    if (!selectedTenantId || !tenants.some((t) => t.id === selectedTenantId)) {
      const targetId = autoDetectNearest && nearestTenant ? nearestTenant.id : tenants[0].id;
      setSelectedTenantId(targetId, false);
    }
  }, [
    isLockedToTenant,
    isSuperAdmin,
    autoDetectNearest,
    userProfile?.tenantId,
    selectedTenantId,
    isManualSelection,
    visitorLocation,
    locationReady,
    nearestTenant,
    tenants,
    setSelectedTenantId,
  ]);

  const activeTenant = activeTenantId ? tenants.find((t) => t.id === activeTenantId) ?? null : null;
  const defaultTenant = waitingForInitialGeo ? null : activeTenant ?? nearestTenant ?? tenants[0] ?? null;

  const tenantById = useMemo(() => {
    const map: Record<string, Tenant> = {};
    allTenants.forEach((t) => {
      map[t.id] = t;
    });
    return map;
  }, [allTenants]);

  return {
    tenants,
    sortedTenants,
    allTenants,
    tenantById,
    activeTenant,
    activeTenantId,
    defaultTenant,
    nearestTenantId: visitorLocation ? nearestTenant?.id ?? null : null,
    distancesById,
    detectingNearest,
    locationReady,
    detectNearestBranch,
    isAllTenants,
    isSuperAdmin,
    isLockedToTenant,
    isLoading: isLoading || waitingForInitialGeo,
    setSelectedTenantId,
  };
}
