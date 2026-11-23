import { useCallback, useEffect, useMemo } from 'react';
import { create } from 'zustand';
import {
  getBrowserGpsLocation,
  getCachedVisitorLocation,
  getIpVisitorLocation,
  rankBranchesByDistance,
  type VisitorLocation,
} from '@/lib/geo';
import type { Tenant } from '@/types/schema';

interface VisitorLocationState {
  visitorLocation: VisitorLocation | null;
  detecting: boolean;
  locationReady: boolean;
  hasAutoStarted: boolean;
  setVisitorLocation: (loc: VisitorLocation | null) => void;
  setDetecting: (detecting: boolean) => void;
  setLocationReady: (ready: boolean) => void;
  markAutoStarted: () => void;
}

const initialCached = typeof window !== 'undefined' ? getCachedVisitorLocation() : null;

const useVisitorLocationStore = create<VisitorLocationState>((set) => ({
  visitorLocation: initialCached,
  detecting: false,
  locationReady: Boolean(initialCached),
  hasAutoStarted: false,
  setVisitorLocation: (visitorLocation) => set({ visitorLocation }),
  setDetecting: (detecting) => set({ detecting }),
  setLocationReady: (locationReady) => set({ locationReady }),
  markAutoStarted: () => set({ hasAutoStarted: true }),
}));

function startAutoDetectionOnce() {
  const state = useVisitorLocationStore.getState();
  if (state.hasAutoStarted) return;
  state.markAutoStarted();

  const cached = getCachedVisitorLocation();
  if (cached?.source === 'gps') {
    useVisitorLocationStore.setState({
      visitorLocation: cached,
      detecting: false,
      locationReady: true,
    });
    return;
  }

  let settled = Boolean(cached);
  const markReady = () => {
    if (!settled) {
      settled = true;
      useVisitorLocationStore.setState({ detecting: false, locationReady: true });
    }
  };

  if (!cached) {
    useVisitorLocationStore.setState({ detecting: true });
  }

  // 1. Fast silent IP geolocation fallback so branch resolves immediately without waiting on GPS prompt
  void getIpVisitorLocation(3000).then((ipLoc) => {
    if (ipLoc) {
      const curr = useVisitorLocationStore.getState().visitorLocation;
      if (curr?.source !== 'gps') {
        useVisitorLocationStore.setState({ visitorLocation: ipLoc });
      }
    }
    markReady();
  });

  // 2. High-precision browser GPS in parallel (upgrades IP approximation if user allows)
  void getBrowserGpsLocation(8000).then((gpsLoc) => {
    if (gpsLoc) {
      useVisitorLocationStore.setState({ visitorLocation: gpsLoc });
    }
    markReady();
  });
}

interface UseNearestBranchOptions {
  tenants: Tenant[];
  enabled?: boolean;
}

export function useNearestBranch({ tenants, enabled = true }: UseNearestBranchOptions) {
  const visitorLocation = useVisitorLocationStore((s) => s.visitorLocation);
  const detecting = useVisitorLocationStore((s) => s.detecting);
  const locationReady = useVisitorLocationStore((s) => s.locationReady);

  useEffect(() => {
    if (!enabled) return;
    startAutoDetectionOnce();
  }, [enabled]);

  const detectNow = useCallback(async (): Promise<VisitorLocation | null> => {
    useVisitorLocationStore.setState({ detecting: true });
    try {
      const gpsLoc = await getBrowserGpsLocation(9000);
      if (gpsLoc) {
        useVisitorLocationStore.setState({
          visitorLocation: gpsLoc,
          locationReady: true,
        });
        return gpsLoc;
      }
      const ipLoc = await getIpVisitorLocation(3500);
      if (ipLoc) {
        useVisitorLocationStore.setState({
          visitorLocation: ipLoc,
          locationReady: true,
        });
        return ipLoc;
      }
      useVisitorLocationStore.setState({ locationReady: true });
      return null;
    } finally {
      useVisitorLocationStore.setState({ detecting: false });
    }
  }, []);

  const ranked = useMemo(() => {
    if (!visitorLocation || tenants.length === 0) {
      return {
        nearest: tenants[0] ?? null,
        nearestDistanceKm: null as number | null,
        distancesById: {} as Record<string, number>,
        sorted: tenants,
      };
    }
    return rankBranchesByDistance(visitorLocation.coords, tenants);
  }, [visitorLocation, tenants]);

  return {
    visitorLocation,
    detecting: enabled ? detecting : false,
    locationReady,
    nearestTenant: ranked.nearest,
    nearestDistanceKm: ranked.nearestDistanceKm,
    distancesById: ranked.distancesById,
    sortedTenants: ranked.sorted,
    detectNow,
  };
}
