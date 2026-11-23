import { useI18n } from '@/hooks/useI18n';

export function LanguageToggle() {
  const { lang, setLang } = useI18n();

  return (
    <div
      role="group"
      aria-label="Language switch"
      className="inline-flex h-7 items-center rounded-md border border-zinc-200 bg-zinc-50 p-0.5 text-[11px] font-medium"
    >
      <button
        type="button"
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
        className={`rounded px-2 py-0.5 transition-colors ${
          lang === 'en'
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        title="Switch to English"
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang('id')}
        aria-pressed={lang === 'id'}
        className={`rounded px-2 py-0.5 transition-colors ${
          lang === 'id'
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        title="Ganti ke Bahasa Indonesia"
      >
        ID
      </button>
    </div>
  );
}

