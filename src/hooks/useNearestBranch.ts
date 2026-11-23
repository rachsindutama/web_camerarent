import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getBrowserGpsLocation,
  getCachedVisitorLocation,
  getIpVisitorLocation,
  rankBranchesByDistance,
  type VisitorLocation,
} from '@/lib/geo';
import type { Tenant } from '@/types/schema';

interface UseNearestBranchOptions {
  tenants: Tenant[];
  enabled?: boolean;
}

export function useNearestBranch({ tenants, enabled = true }: UseNearestBranchOptions) {
  const [visitorLocation, setVisitorLocation] = useState<VisitorLocation | null>(() =>
    getCachedVisitorLocation()
  );
  const [detecting, setDetecting] = useState<boolean>(
    () => enabled && !getCachedVisitorLocation()
  );
  const [locationReady, setLocationReady] = useState<boolean>(() =>
    Boolean(getCachedVisitorLocation())
  );
  const hasAutoRunRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setDetecting(false);
      return;
    }
    if (hasAutoRunRef.current) return;
    hasAutoRunRef.current = true;

    const cached = getCachedVisitorLocation();
    if (cached?.source === 'gps') {
      setVisitorLocation(cached);
      setDetecting(false);
      setLocationReady(true);
      return;
    }

    let cancelled = false;
    let settled = Boolean(cached);

    const markReady = () => {
      if (!cancelled && !settled) {
        settled = true;
        setDetecting(false);
        setLocationReady(true);
      }
    };

    if (!cached) {
      setDetecting(true);
    }

    // 1. Fast silent IP geolocation fallback so branch resolves immediately without waiting on GPS prompt
    void getIpVisitorLocation(3000).then((ipLoc) => {
      if (cancelled) return;
      if (ipLoc) {
        setVisitorLocation((prev) => (prev?.source === 'gps' ? prev : ipLoc));
      }
      markReady();
    });

    // 2. High-precision browser GPS in parallel (upgrades IP approximation if user allows)
    void getBrowserGpsLocation(8000).then((gpsLoc) => {
      if (cancelled) return;
      if (gpsLoc) {
        setVisitorLocation(gpsLoc);
      }
      markReady();
    });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const detectNow = useCallback(async (): Promise<VisitorLocation | null> => {
    setDetecting(true);
    try {
      const gpsLoc = await getBrowserGpsLocation(9000);
      if (gpsLoc) {
        setVisitorLocation(gpsLoc);
        setLocationReady(true);
        return gpsLoc;
      }
      const ipLoc = await getIpVisitorLocation(3500);
      if (ipLoc) {
        setVisitorLocation(ipLoc);
        setLocationReady(true);
        return ipLoc;
      }
      setLocationReady(true);
      return null;
    } finally {
      setDetecting(false);
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
    detecting,
    locationReady,
    nearestTenant: ranked.nearest,
    nearestDistanceKm: ranked.nearestDistanceKm,
    distancesById: ranked.distancesById,
    sortedTenants: ranked.sorted,
    detectNow,
  };
}

