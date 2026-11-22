import { create } from 'zustand';
import type { LogisticsType } from '@/types/schema';

export interface DraftEquipmentEntry {
  equipmentId: string;
  name: string;
  brand: string;
  dailyRate: number;
  depositAmount: number;
  quantity: number;
}

export interface DraftBundleEntry {
  bundleId: string;
  name: string;
  equipmentIds: string[];
  bundleDailyRate: number;
  bundleDeposit: number;
}

interface BookingDraftState {
  tenantId: string | null;
  startDateIso: string;
  endDateIso: string;
  items: DraftEquipmentEntry[];
  bundles: DraftBundleEntry[];
  logisticsType: LogisticsType;
  deliveryAddress: string;
  deliveryCoordinates: { lat: number; lng: number } | null;
  deliveryDistanceKm: number;
  setTenantId: (tenantId: string | null) => void;
  setDateRange: (startIso: string, endIso: string) => void;
  addEquipment: (entry: Omit<DraftEquipmentEntry, 'quantity'>) => void;
  decrementEquipment: (equipmentId: string) => void;
  removeEquipment: (equipmentId: string) => void;
  addBundle: (bundle: DraftBundleEntry) => void;
  removeBundle: (bundleId: string) => void;
  setLogisticsType: (type: LogisticsType) => void;
  setDeliveryAddress: (address: string) => void;
  setDeliveryCoordinates: (coords: { lat: number; lng: number } | null) => void;
  setDeliveryDistanceKm: (km: number) => void;
  setDeliveryLocation: (payload: {
    address: string;
    coordinates: { lat: number; lng: number };
    distanceKm: number;
  }) => void;
  clearCart: () => void;
}

function defaultStartIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toLocalInputString(d);
}

function defaultEndIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  d.setHours(18, 0, 0, 0);
  return toLocalInputString(d);
}

export function toLocalInputString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export const useBookingDraftStore = create<BookingDraftState>((set) => ({
  tenantId: null,
  startDateIso: defaultStartIso(),
  endDateIso: defaultEndIso(),
  items: [],
  bundles: [],
  logisticsType: 'self_pickup',
  deliveryAddress: '',
  deliveryCoordinates: null,
  deliveryDistanceKm: 5,
  setTenantId: (tenantId) =>
    set((state) => (state.tenantId === tenantId ? state : { tenantId, items: [], bundles: [] })),
  setDateRange: (startDateIso, endDateIso) => set({ startDateIso, endDateIso }),
  addEquipment: (entry) =>
    set((state) => {
      const existing = state.items.find((i) => i.equipmentId === entry.equipmentId);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.equipmentId === entry.equipmentId ? { ...i, quantity: i.quantity + 1 } : i
          ),
        };
      }
      return { items: [...state.items, { ...entry, quantity: 1 }] };
    }),
  decrementEquipment: (equipmentId) =>
    set((state) => ({
      items: state.items
        .map((i) => (i.equipmentId === equipmentId ? { ...i, quantity: i.quantity - 1 } : i))
        .filter((i) => i.quantity > 0),
    })),
  removeEquipment: (equipmentId) =>
    set((state) => ({ items: state.items.filter((i) => i.equipmentId !== equipmentId) })),
  addBundle: (bundle) =>
    set((state) => {
      if (state.bundles.some((b) => b.bundleId === bundle.bundleId)) return state;
      return { bundles: [...state.bundles, bundle] };
    }),
  removeBundle: (bundleId) =>
    set((state) => ({ bundles: state.bundles.filter((b) => b.bundleId !== bundleId) })),
  setLogisticsType: (logisticsType) => set({ logisticsType }),
  setDeliveryAddress: (deliveryAddress) => set({ deliveryAddress }),
  setDeliveryCoordinates: (deliveryCoordinates) => set({ deliveryCoordinates }),
  setDeliveryDistanceKm: (deliveryDistanceKm) => set({ deliveryDistanceKm }),
  setDeliveryLocation: ({ address, coordinates, distanceKm }) =>
    set({
      deliveryAddress: address,
      deliveryCoordinates: coordinates,
      deliveryDistanceKm: distanceKm,
    }),
  clearCart: () =>
    set({
      items: [],
      bundles: [],
      deliveryAddress: '',
      deliveryCoordinates: null,
      deliveryDistanceKm: 5,
    }),
}));

