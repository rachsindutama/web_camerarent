export interface GeoCoordinates {
  lat: number;
  lng: number;
}

export interface VisitorLocation {
  coords: GeoCoordinates;
  source: 'gps' | 'ip';
  city?: string;
}

export interface NominatimSearchResult {
  displayName: string;
  lat: number;
  lng: number;
}

/**
 * Great-circle Haversine distance in kilometers.
 */
export function haversineDistanceKm(origin: GeoCoordinates, dest: GeoCoordinates): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(dest.lat - origin.lat);
  const dLng = toRad(dest.lng - origin.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(origin.lat)) *
      Math.cos(toRad(dest.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Estimates urban driving distance using a 1.25x road-routing multiplier.
 * Rounded to 1 decimal place (minimum 1 km when non-zero).
 */
export function estimateRoadDistanceKm(origin: GeoCoordinates, dest: GeoCoordinates): number {
  const straight = haversineDistanceKm(origin, dest);
  if (straight < 0.05) return 1;
  return Math.max(1, Math.round(straight * 1.25 * 10) / 10);
}

/**
 * Parses raw "lat, lng" text or Google Maps Shareloc URLs containing coordinates.
 */
export function parseCoordinatesOrMapsLink(input: string): GeoCoordinates | null {
  const trimmed = input.trim();

  // Direct "lat, lng" format e.g. "-7.2575, 112.7521"
  const directMatch = trimmed.match(/^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/);
  if (directMatch) {
    const lat = Number(directMatch[1]);
    const lng = Number(directMatch[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }

  // Google Maps "@lat,lng" or "?q=lat,lng" or "!3dlat!4dlng"
  const atMatch = trimmed.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
  if (atMatch) {
    return { lat: Number(atMatch[1]), lng: Number(atMatch[2]) };
  }

  const qMatch = trimmed.match(/[?&](?:q|ll|query)=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
  if (qMatch) {
    return { lat: Number(qMatch[1]), lng: Number(qMatch[2]) };
  }

  const bangMatch = trimmed.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/);
  if (bangMatch) {
    return { lat: Number(bangMatch[1]), lng: Number(bangMatch[2]) };
  }

  return null;
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(
        lat
      )}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`,
      {
        headers: {
          'Accept-Language': 'id,en',
        },
      }
    );
    if (!res.ok) throw new Error('Reverse geocode failed');
    const data = (await res.json()) as { display_name?: string };
    return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

export async function searchAddressNominatim(queryText: string): Promise<NominatimSearchResult[]> {
  if (!queryText.trim()) return [];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=id&q=${encodeURIComponent(
        queryText.trim()
      )}`,
      {
        headers: {
          'Accept-Language': 'id,en',
        },
      }
    );
    if (!res.ok) return [];
    const items = (await res.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
    }>;
    return items.map((item) => ({
      displayName: item.display_name,
      lat: Number(item.lat),
      lng: Number(item.lon),
    }));
  } catch {
    return [];
  }
}

export function buildGoogleMapsDirectionUrl(
  origin: GeoCoordinates | null | undefined,
  dest: GeoCoordinates
): string {
  if (origin) {
    return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${dest.lat},${dest.lng}`;
}

const VISITOR_LOCATION_CACHE_KEY = 'camerarent-visitor-location-v1';

export function getCachedVisitorLocation(): VisitorLocation | null {
  try {
    const raw = sessionStorage.getItem(VISITOR_LOCATION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VisitorLocation;
    if (
      parsed?.coords &&
      typeof parsed.coords.lat === 'number' &&
      typeof parsed.coords.lng === 'number'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function setCachedVisitorLocation(loc: VisitorLocation): void {
  try {
    sessionStorage.setItem(VISITOR_LOCATION_CACHE_KEY, JSON.stringify(loc));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function formatBranchDistanceKm(km: number): string {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return '<1 km';
  if (km < 10) return `${Math.round(km * 10) / 10} km`;
  return `${Math.round(km)} km`;
}

export function getBrowserGpsLocation(timeoutMs = 7000): Promise<VisitorLocation | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: VisitorLocation = {
          coords: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          },
          source: 'gps',
        };
        setCachedVisitorLocation(loc);
        resolve(loc);
      },
      () => resolve(null),
      {
        enableHighAccuracy: false,
        timeout: timeoutMs,
        maximumAge: 1000 * 60 * 15,
      }
    );
  });
}

export async function getIpVisitorLocation(timeoutMs = 3500): Promise<VisitorLocation | null> {
  const endpoints: Array<{
    url: string;
    parse: (data: Record<string, unknown>) => VisitorLocation | null;
  }> = [
    {
      url: 'https://get.geojs.io/v1/ip/geo.json',
      parse: (data) => {
        const lat = Number(data.latitude);
        const lng = Number(data.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          coords: { lat, lng },
          source: 'ip',
          city: typeof data.city === 'string' ? data.city : undefined,
        };
      },
    },
    {
      url: 'https://ipwho.is/',
      parse: (data) => {
        if (data.success === false) return null;
        const lat = Number(data.latitude);
        const lng = Number(data.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          coords: { lat, lng },
          source: 'ip',
          city: typeof data.city === 'string' ? data.city : undefined,
        };
      },
    },
  ];

  for (const ep of endpoints) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(ep.url, { signal: controller.signal });
      window.clearTimeout(timer);
      if (!res.ok) continue;
      const json = (await res.json()) as Record<string, unknown>;
      const loc = ep.parse(json);
      if (loc) {
        // Don't overwrite an already-cached exact GPS fix with lower-precision IP geo
        const existing = getCachedVisitorLocation();
        if (!existing || existing.source !== 'gps') {
          setCachedVisitorLocation(loc);
        }
        return loc;
      }
    } catch {
      window.clearTimeout(timer);
    }
  }
  return null;
}

export function rankBranchesByDistance<
  T extends { id: string; coordinates: GeoCoordinates },
>(coords: GeoCoordinates, branches: T[]) {
  const distancesById: Record<string, number> = {};
  const withDist = branches.map((branch) => {
    const distanceKm = haversineDistanceKm(coords, branch.coordinates);
    distancesById[branch.id] = distanceKm;
    return { branch, distanceKm };
  });
  withDist.sort((a, b) => a.distanceKm - b.distanceKm);
  return {
    nearest: withDist[0]?.branch ?? null,
    nearestDistanceKm: withDist[0]?.distanceKm ?? null,
    distancesById,
    sorted: withDist.map((item) => item.branch),
  };
}

