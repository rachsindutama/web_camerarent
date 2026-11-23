import { useState } from 'react';
import { Aperture } from 'lucide-react';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';

interface BrandMarkProps {
  size?: 'sm' | 'md';
  subtitle?: string;
}

export function BrandMark({ size = 'sm', subtitle }: BrandMarkProps) {
  const { settings } = usePlatformSettings();
  const { siteName, logoUrl } = settings.seo;
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);

  const showLogo = Boolean(logoUrl && brokenUrl !== logoUrl);
  const boxClass = size === 'md' ? 'h-7 w-7' : 'h-6 w-6';
  const iconClass = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';

  return (
    <div className="flex items-center gap-2.5">
      {showLogo ? (
        <div
          className={`flex ${boxClass} shrink-0 items-center justify-center overflow-hidden rounded border border-zinc-200 bg-white`}
        >
          <img
            src={logoUrl}
            alt={siteName}
            onError={() => setBrokenUrl(logoUrl)}
            className="h-full w-full object-contain p-0.5"
          />
        </div>
      ) : (
        <div
          className={`flex ${boxClass} shrink-0 items-center justify-center rounded border border-zinc-900 bg-zinc-950 text-white`}
        >
          <Aperture className={iconClass} strokeWidth={1.5} />
        </div>
      )}
      <div className="min-w-0">
        <span className="block truncate text-sm font-semibold tracking-tight text-zinc-950">
          {siteName}
        </span>
        {subtitle ? <span className="block truncate text-xs text-zinc-500">{subtitle}</span> : null}
      </div>
    </div>
  );
}

