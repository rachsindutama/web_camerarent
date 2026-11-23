import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, Timestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { normalizeTierMap } from '@/lib/membership';
import { useAuth } from '@/hooks/useAuth';
import { ALL_TENANTS_SCOPE, useTenantStore } from '@/store/useTenantStore';
import type { Tenant } from '@/types/schema';

export function useTenant() {
  const { userProfile } = useAuth();
  const { selectedTenantId, setSelectedTenantId } = useTenantStore();

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
          ...(d.membershipTiers ? { membershipTiers: normalizeTierMap(d.membershipTiers) } : {}),
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

  const tenants = isSuperAdmin
    ? allTenants
    : allTenants.filter((t) => t.status === 'active');

  const isLockedToTenant = userProfile?.role === 'admin' && Boolean(userProfile.tenantId);

  // Superadmin defaults to All Branches unless explicitly switched to a specific tenant
  const isAllTenants =
    isSuperAdmin &&
    (!selectedTenantId ||
      selectedTenantId === ALL_TENANTS_SCOPE ||
      !tenants.some((t) => t.id === selectedTenantId));

  const activeTenantId = isLockedToTenant
    ? userProfile.tenantId
    : isAllTenants
      ? null
      : selectedTenantId && tenants.some((t) => t.id === selectedTenantId)
        ? selectedTenantId
        : tenants[0]?.id ?? null;

  useEffect(() => {
    if (isLockedToTenant && userProfile?.tenantId) {
      if (selectedTenantId !== userProfile.tenantId) {
        setSelectedTenantId(userProfile.tenantId);
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
        setSelectedTenantId(ALL_TENANTS_SCOPE);
      }
      return;
    }

    if ((!selectedTenantId || !tenants.some((t) => t.id === selectedTenantId)) && tenants.length > 0) {
      setSelectedTenantId(tenants[0].id);
    }
  }, [isLockedToTenant, isSuperAdmin, userProfile?.tenantId, selectedTenantId, tenants, setSelectedTenantId]);

  const activeTenant = activeTenantId ? tenants.find((t) => t.id === activeTenantId) ?? null : null;
  const defaultTenant = activeTenant ?? tenants[0] ?? null;

  const tenantById = useMemo(() => {
    const map: Record<string, Tenant> = {};
    allTenants.forEach((t) => {
      map[t.id] = t;
    });
    return map;
  }, [allTenants]);

  return {
    tenants,
    allTenants,
    tenantById,
    activeTenant,
    activeTenantId,
    defaultTenant,
    isAllTenants,
    isSuperAdmin,
    isLockedToTenant,
    isLoading,
    setSelectedTenantId,
  };
}
