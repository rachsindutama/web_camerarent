export interface GeoCoordinates {
  lat: number;
  lng: number;
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

