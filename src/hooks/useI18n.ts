import { useCallback } from 'react';
import { COMMON_DICTIONARY, type CommonKey } from '@/lib/i18n';
import { useLanguageStore } from '@/store/useLanguageStore';

export function useI18n() {
  const lang = useLanguageStore((s) => s.lang);
  const setLang = useLanguageStore((s) => s.setLang);
  const toggleLang = useLanguageStore((s) => s.toggleLang);

  const isId = lang === 'id';

  const t = useCallback(
    (key: CommonKey): string => COMMON_DICTIONARY[lang][key] ?? COMMON_DICTIONARY.en[key],
    [lang]
  );

  const tx = useCallback(
    (en: string, id: string): string => (lang === 'id' ? id : en),
    [lang]
  );

  return {
    lang,
    isId,
    setLang,
    toggleLang,
    t,
    tx,
  };
}

