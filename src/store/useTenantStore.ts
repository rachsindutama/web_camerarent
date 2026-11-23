import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const ALL_TENANTS_SCOPE = '__all__';

interface TenantStoreState {
  selectedTenantId: string | null;
  isManualSelection: boolean;
  setSelectedTenantId: (tenantId: string | null, manual?: boolean) => void;
  resetSelection: () => void;
}

export const useTenantStore = create<TenantStoreState>()(
  persist(
    (set, get) => ({
      selectedTenantId: null,
      isManualSelection: false,
      setSelectedTenantId: (tenantId, manual = true) => {
        const current = get();
        if (current.selectedTenantId === tenantId && current.isManualSelection === manual) {
          return;
        }
        set({ selectedTenantId: tenantId, isManualSelection: manual });
      },
      resetSelection: () => set({ selectedTenantId: null, isManualSelection: false }),
    }),
    {
      name: 'camerarent-tenant-session-v1',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
