import { DEFAULT_SITE_SEO, type SiteSeoConfig } from '@/lib/membership';

const SEO_CACHE_KEY = 'camerarent-site-seo-v1';

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  if (typeof document === 'undefined') return;
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!content.trim()) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content.trim());
}

function upsertLink(rel: string, href: string, extra?: Record<string, string>): void {
  if (typeof document === 'undefined') return;
  const selector = `link[rel="${rel}"]`;
  let el = document.head.querySelector<HTMLLinkElement>(selector);
  if (!href.trim()) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href.trim());
  if (extra) {
    Object.entries(extra).forEach(([k, v]) => {
      if (v) {
        el?.setAttribute(k, v);
      } else {
        el?.removeAttribute(k);
      }
    });
  }
}

function guessFaviconMime(url: string): string {
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.ico')) return 'image/x-icon';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return '';
}

export function getCachedSiteSeo(): SiteSeoConfig | null {
  try {
    const raw = localStorage.getItem(SEO_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SiteSeoConfig>;
    return { ...DEFAULT_SITE_SEO, ...parsed };
  } catch {
    return null;
  }
}

export function applySiteSeoToDocument(seo: SiteSeoConfig): void {
  if (typeof document === 'undefined') return;

  const title = seo.siteTitle.trim() || seo.siteName.trim() || DEFAULT_SITE_SEO.siteTitle;
  document.title = title;

  const favicon = seo.faviconUrl.trim() || '/favicon.svg';
  const mime = guessFaviconMime(favicon);
  upsertLink('icon', favicon, { type: mime });
  upsertLink('apple-touch-icon', favicon);
  upsertLink('canonical', seo.canonicalUrl);

  upsertMeta('name', 'description', seo.metaDescription);
  upsertMeta('name', 'keywords', seo.metaKeywords);
  upsertMeta('name', 'robots', seo.robots);
  upsertMeta('name', 'theme-color', seo.themeColor);

  // Open Graph
  upsertMeta('property', 'og:type', 'website');
  upsertMeta('property', 'og:site_name', seo.siteName);
  upsertMeta('property', 'og:title', title);
  upsertMeta('property', 'og:description', seo.metaDescription);
  upsertMeta('property', 'og:locale', seo.locale);
  upsertMeta('property', 'og:url', seo.canonicalUrl);
  upsertMeta('property', 'og:image', seo.ogImageUrl);

  // Twitter / X Card
  upsertMeta('name', 'twitter:card', seo.twitterCard);
  upsertMeta('name', 'twitter:title', title);
  upsertMeta('name', 'twitter:description', seo.metaDescription);
  upsertMeta('name', 'twitter:image', seo.ogImageUrl);
  upsertMeta('name', 'twitter:site', seo.twitterHandle);

  try {
    localStorage.setItem(SEO_CACHE_KEY, JSON.stringify(seo));
  } catch {
    // Ignore storage quota errors
  }
}

