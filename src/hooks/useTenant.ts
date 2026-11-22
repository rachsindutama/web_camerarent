import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, Timestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useTenantStore } from '@/store/useTenantStore';
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

  const tenants =
    userProfile?.role === 'superadmin'
      ? allTenants
      : allTenants.filter((t) => t.status === 'active');

  const isLockedToTenant = userProfile?.role === 'admin' && Boolean(userProfile.tenantId);

  const activeTenantId = isLockedToTenant
    ? userProfile.tenantId
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

    if ((!selectedTenantId || !tenants.some((t) => t.id === selectedTenantId)) && tenants.length > 0) {
      setSelectedTenantId(tenants[0].id);
    }
  }, [isLockedToTenant, userProfile?.tenantId, selectedTenantId, tenants, setSelectedTenantId]);

  const activeTenant = tenants.find((t) => t.id === activeTenantId) ?? null;

  return {
    tenants,
    allTenants,
    activeTenant,
    activeTenantId,
    isLockedToTenant,
    isLoading,
    setSelectedTenantId,
  };
}
