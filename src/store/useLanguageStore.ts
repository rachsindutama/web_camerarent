import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppLanguage = 'en' | 'id';

interface LanguageStoreState {
  lang: AppLanguage;
  setLang: (lang: AppLanguage) => void;
  toggleLang: () => void;
}

function syncDocumentLang(lang: AppLanguage) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
}

export const useLanguageStore = create<LanguageStoreState>()(
  persist(
    (set, get) => ({
      lang: 'en',
      setLang: (lang) => {
        syncDocumentLang(lang);
        set({ lang });
      },
      toggleLang: () => {
        const next: AppLanguage = get().lang === 'en' ? 'id' : 'en';
        syncDocumentLang(next);
        set({ lang: next });
      },
    }),
    {
      name: 'camerarent-language-v1',
      onRehydrateStorage: () => (state) => {
        syncDocumentLang(state?.lang ?? 'en');
      },
    }
  )
);

