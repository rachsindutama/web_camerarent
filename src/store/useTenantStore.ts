import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TenantStoreState {
  selectedTenantId: string | null;
  setSelectedTenantId: (tenantId: string | null) => void;
}

export const useTenantStore = create<TenantStoreState>()(
  persist(
    (set) => ({
      selectedTenantId: null,
      setSelectedTenantId: (tenantId) => set({ selectedTenantId: tenantId }),
    }),
    {
      name: 'camerarent-tenant-context',
    }
  )
);

