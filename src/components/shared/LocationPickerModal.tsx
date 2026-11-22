import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, ExternalLink, Layers, MapPin, Navigation, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  buildGoogleMapsDirectionUrl,
  estimateRoadDistanceKm,
  parseCoordinatesOrMapsLink,
  reverseGeocode,
  searchAddressNominatim,
  type GeoCoordinates,
  type NominatimSearchResult,
} from '@/lib/geo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface LocationPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchName: string;
  branchCoordinates: GeoCoordinates;
  initialCoordinates?: GeoCoordinates | null;
  initialAddress?: string;
  readOnly?: boolean;
  /** When true, hides the branch-origin pin and distance line (used for pinning branch coordinates itself) */
  singlePinMode?: boolean;
  title?: string;
  onConfirm?: (payload: {
    coordinates: GeoCoordinates;
    address: string;
    distanceKm: number;
  }) => void;
}

const TILE_LAYERS = {
  street: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{x}/{y}',
    attribution: 'Tiles &copy; Esri &mdash; World Imagery',
    maxZoom: 19,
  },
} as const;

function createPinIcon(variant: 'branch' | 'delivery'): L.DivIcon {
  const color = variant === 'branch' ? '#18181b' : '#2563eb';
  const label = variant === 'branch' ? 'CABANG' : 'TUJUAN';
  return L.divIcon({
    className: 'camerarent-map-pin',
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);">
        <div style="background:${color};color:#fff;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:600;padding:2px 6px;border-radius:4px;border:1.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.32);white-space:nowrap;">
          ${label}
        </div>
        <div style="width:12px;height:12px;background:${color};border:2px solid #fff;border-radius:9999px;margin-top:2px;box-shadow:0 2px 4px rgba(0,0,0,0.4);"></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export function LocationPickerModal({
  open,
  onOpenChange,
  branchName,
  branchCoordinates,
  initialCoordinates,
  initialAddress = '',
  readOnly = false,
  singlePinMode = false,
  title,
  onConfirm,
}: LocationPickerModalProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const deliveryMarkerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);

  const [mapStyle, setMapStyle] = useState<'street' | 'satellite'>('street');
  const [pinCoords, setPinCoords] = useState<GeoCoordinates>(
    initialCoordinates ?? {
      lat: branchCoordinates.lat + (singlePinMode ? 0 : 0.012),
      lng: branchCoordinates.lng + (singlePinMode ? 0 : 0.012),
    }
  );
  const [address, setAddress] = useState(initialAddress);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locatingGps, setLocatingGps] = useState(false);
  const [resolvingAddress, setResolvingAddress] = useState(false);

  const distanceKm = singlePinMode ? 0 : estimateRoadDistanceKm(branchCoordinates, pinCoords);

  useEffect(() => {
    if (!open) return;
    const startCoords = initialCoordinates ?? {
      lat: branchCoordinates.lat + (singlePinMode ? 0 : 0.012),
      lng: branchCoordinates.lng + (singlePinMode ? 0 : 0.012),
    };
    setPinCoords(startCoords);
    setAddress(initialAddress);
    setSearchResults([]);
    setSearchQuery('');
  }, [
    open,
    initialCoordinates,
    initialAddress,
    branchCoordinates.lat,
    branchCoordinates.lng,
    singlePinMode,
  ]);

  const updatePinPosition = async (next: GeoCoordinates, skipReverseGeocode = false) => {
    setPinCoords(next);
    if (deliveryMarkerRef.current) {
      deliveryMarkerRef.current.setLatLng([next.lat, next.lng]);
    }
    if (routeLineRef.current && !singlePinMode) {
      routeLineRef.current.setLatLngs([
        [branchCoordinates.lat, branchCoordinates.lng],
        [next.lat, next.lng],
      ]);
    }
    if (!skipReverseGeocode && !readOnly) {
      setResolvingAddress(true);
      const resolved = await reverseGeocode(next.lat, next.lng);
      setAddress(resolved);
      setResolvingAddress(false);
    }
  };

  // Switch Street / Satellite tile layer cleanly
  useEffect(() => {
    if (!mapRef.current) return;
    if (tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current);
    }
    const cfg = TILE_LAYERS[mapStyle];
    tileLayerRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
    }).addTo(mapRef.current);
  }, [mapStyle]);

  // Initialize Leaflet map inside Dialog after mount
  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(() => {
      if (!mapContainerRef.current) return;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const startCoords = initialCoordinates ?? {
        lat: branchCoordinates.lat + (singlePinMode ? 0 : 0.012),
        lng: branchCoordinates.lng + (singlePinMode ? 0 : 0.012),
      };

      const map = L.map(mapContainerRef.current, {
        center: [startCoords.lat, startCoords.lng],
        zoom: 14,
        zoomControl: true,
      });

      const cfg = TILE_LAYERS[mapStyle];
      const layer = L.tileLayer(cfg.url, {
        attribution: cfg.attribution,
        maxZoom: cfg.maxZoom,
      }).addTo(map);
      tileLayerRef.current = layer;

      if (!singlePinMode) {
        L.marker([branchCoordinates.lat, branchCoordinates.lng], {
          icon: createPinIcon('branch'),
          interactive: false,
        })
          .addTo(map)
          .bindTooltip(branchName, { direction: 'top' });
      }

      const deliveryMarker = L.marker([startCoords.lat, startCoords.lng], {
        icon: createPinIcon(singlePinMode ? 'branch' : 'delivery'),
        draggable: !readOnly,
      }).addTo(map);

      if (!singlePinMode) {
        const routeLine = L.polyline(
          [
            [branchCoordinates.lat, branchCoordinates.lng],
            [startCoords.lat, startCoords.lng],
          ],
          {
            color: '#2563eb',
            weight: 2.5,
            dashArray: '6, 6',
            opacity: 0.85,
          }
        ).addTo(map);
        routeLineRef.current = routeLine;

        const bounds = L.latLngBounds([
          [branchCoordinates.lat, branchCoordinates.lng],
          [startCoords.lat, startCoords.lng],
        ]);
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
      } else {
        routeLineRef.current = null;
      }

      if (!readOnly) {
        deliveryMarker.on('dragend', () => {
          const pos = deliveryMarker.getLatLng();
          void updatePinPosition({ lat: pos.lat, lng: pos.lng });
        });

        map.on('click', (evt: L.LeafletMouseEvent) => {
          void updatePinPosition({ lat: evt.latlng.lat, lng: evt.latlng.lng });
        });
      }

      mapRef.current = map;
      deliveryMarkerRef.current = deliveryMarker;
    }, 90);

    return () => {
      window.clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      tileLayerRef.current = null;
    };
  }, [open, branchCoordinates.lat, branchCoordinates.lng, branchName, readOnly, singlePinMode]);

  const handleUseCurrentGps = () => {
    if (!navigator.geolocation) {
      toast.error('Browser tidak mendukung GPS / Geolocation.');
      return;
    }
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        void updatePinPosition(next);
        mapRef.current?.setView([next.lat, next.lng], 16, { animate: true });
        setLocatingGps(false);
        toast.success('Lokasi GPS Shareloc berhasil dikunci.');
      },
      (err) => {
        setLocatingGps(false);
        toast.error(`Gagal mengambil lokasi GPS: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSearchLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const parsedCoords = parseCoordinatesOrMapsLink(searchQuery);
    if (parsedCoords) {
      setSearchResults([]);
      await updatePinPosition(parsedCoords);
      mapRef.current?.setView([parsedCoords.lat, parsedCoords.lng], 16, { animate: true });
      toast.success('Koordinat dari link Google Maps berhasil diterapkan.');
      return;
    }

    setSearching(true);
    const results = await searchAddressNominatim(searchQuery);
    setSearchResults(results);
    setSearching(false);
    if (results.length === 0) {
      toast.info('Lokasi tidak ditemukan. Coba kata kunci lain atau geser pin di peta.');
    }
  };

  const handleSelectSearchResult = (res: NominatimSearchResult) => {
    const next = { lat: res.lat, lng: res.lng };
    setAddress(res.displayName);
    setSearchResults([]);
    void updatePinPosition(next, true);
    mapRef.current?.setView([next.lat, next.lng], 16, { animate: true });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-primary" strokeWidth={1.5} />
            {title ??
              (readOnly
                ? 'Delivery Pin Location'
                : 'Pin Delivery / Shooting Set Location')}
          </DialogTitle>
          <DialogDescription>
            {readOnly
              ? `Rute dari ${branchName} (${distanceKm} km estimasi jarak jalan).`
              : 'Klik peta, geser pin, cari nama jalan/gedung, tempel link Google Maps, atau klik Shareloc GPS.'}
          </DialogDescription>
        </DialogHeader>

        {!readOnly ? (
          <div className="space-y-2">
            <form onSubmit={(e) => void handleSearchLocation(e)} className="flex flex-wrap gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search
                  className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400"
                  strokeWidth={1.5}
                />
                <Input
                  placeholder="Cari alamat (mis. Tunjungan Plaza Surabaya) atau tempel link Google Maps..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Button type="submit" variant="outline" size="sm" disabled={searching}>
                {searching ? 'Mencari...' : 'Cari'}
              </Button>
              <Button
                type="button"
                variant="mono"
                size="sm"
                disabled={locatingGps}
                onClick={handleUseCurrentGps}
              >
                <Crosshair className="h-3.5 w-3.5" strokeWidth={1.5} />
                {locatingGps ? 'Mencari GPS...' : 'Shareloc (GPS)'}
              </Button>
            </form>

            {searchResults.length > 0 ? (
              <div className="max-h-36 divide-y divide-zinc-100 overflow-y-auto rounded-md border border-zinc-200 bg-white text-xs shadow-sm">
                {searchResults.map((item, idx) => (
                  <button
                    key={`${item.lat}-${item.lng}-${idx}`}
                    type="button"
                    onClick={() => handleSelectSearchResult(item)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-zinc-50"
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" strokeWidth={1.5} />
                    <span className="line-clamp-2 text-zinc-800">{item.displayName}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Interactive Map Container with Street/Satellite Switcher */}
        <div className="relative">
          <div
            ref={mapContainerRef}
            className="h-[350px] w-full overflow-hidden rounded-md border border-zinc-200 bg-zinc-100"
          />
          <div className="absolute right-3 top-3 z-[400] flex items-center gap-1 rounded-md border border-zinc-200 bg-white/95 p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => setMapStyle('street')}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                mapStyle === 'street'
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <Layers className="h-3 w-3" strokeWidth={1.5} />
              Peta Jalan
            </button>
            <button
              type="button"
              onClick={() => setMapStyle('satellite')}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                mapStyle === 'satellite'
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              Satelit
            </button>
          </div>
        </div>

        {/* Telemetry & Editable Address */}
        <div className="grid grid-cols-1 gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-12">
          <div className="space-y-1 sm:col-span-7">
            <Label className="font-mono text-[10px] uppercase text-zinc-500">
              {resolvingAddress ? 'Mengambil nama jalan...' : 'Alamat Lengkap / Catatan Lokasi'}
            </Label>
            <Input
              value={address}
              readOnly={readOnly}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Detail studio, lantai, patokan gerbang..."
              className="bg-white"
            />
          </div>
          <div className="flex flex-col justify-center space-y-1 font-mono text-[11px] sm:col-span-5">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">KOORDINAT</span>
              <span className="text-zinc-900">
                {pinCoords.lat.toFixed(5)}, {pinCoords.lng.toFixed(5)}
              </span>
            </div>
            {!singlePinMode ? (
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">EST. JARAK</span>
                <span className="font-semibold text-primary">{distanceKm} km</span>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="flex-wrap items-center gap-2 sm:justify-between">
          <Button asChild type="button" variant="outline" size="sm">
            <a
              href={buildGoogleMapsDirectionUrl(
                singlePinMode ? null : branchCoordinates,
                pinCoords
              )}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
              Buka di Google Maps
            </a>
          </Button>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {readOnly ? 'Close' : 'Cancel'}
            </Button>
            {!readOnly && onConfirm ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onConfirm({
                    coordinates: pinCoords,
                    address:
                      address.trim() || `${pinCoords.lat.toFixed(5)}, ${pinCoords.lng.toFixed(5)}`,
                    distanceKm,
                  });
                  onOpenChange(false);
                }}
              >
                <Navigation className="h-3.5 w-3.5" strokeWidth={1.5} />
                {singlePinMode
                  ? 'Simpan Koordinat Cabang'
                  : `Gunakan Titik Lokasi Ini (${distanceKm} km)`}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
