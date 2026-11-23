import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const ALL_TENANTS_SCOPE = '__all__';

interface TenantStoreState {
  selectedTenantId: string | null;
  isManualSelection: boolean;
  setSelectedTenantId: (tenantId: string | null, manual?: boolean) => void;
}

export const useTenantStore = create<TenantStoreState>()(
  persist(
    (set) => ({
      selectedTenantId: null,
      isManualSelection: false,
      setSelectedTenantId: (tenantId, manual = true) =>
        set({ selectedTenantId: tenantId, isManualSelection: manual }),
    }),
    {
      name: 'camerarent-tenant-context-v2',
    }
  )
);
