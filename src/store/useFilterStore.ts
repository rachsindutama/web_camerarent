import { create } from 'zustand';

interface FilterStoreState {
  searchQuery: string;
  category: string;
  status: string;
  setSearchQuery: (query: string) => void;
  setCategory: (category: string) => void;
  setStatus: (status: string) => void;
  resetFilters: () => void;
}

export const useFilterStore = create<FilterStoreState>((set) => ({
  searchQuery: '',
  category: 'all',
  status: 'all',
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setCategory: (category) => set({ category }),
  setStatus: (status) => set({ status }),
  resetFilters: () => set({ searchQuery: '', category: 'all', status: 'all' }),
}));

