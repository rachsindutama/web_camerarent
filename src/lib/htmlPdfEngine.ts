import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { toPng } from 'html-to-image';

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/**
 * Mounts a real React component off-screen and captures it using the browser's
 * native layout engine (html-to-image) for pixel-perfect typography, flexbox,
 * badges, tables, and borders with zero baseline drift.
 */
export async function renderReactElementToPng(
  element: ReactElement,
  filename: string
): Promise<void> {
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-12000px';
  host.style.top = '0';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '-1';
  document.body.appendChild(host);

  const root = createRoot(host);

  try {
    root.render(element);
    await nextPaint();

    const target = (host.firstElementChild as HTMLElement) ?? host;
    const dataUrl = await toPng(target, {
      pixelRatio: 2.5,
      backgroundColor: '#ffffff',
      cacheBust: true,
    });

    const pngName = filename.endsWith('.png') ? filename : `${filename}.png`;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = pngName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    root.unmount();
    host.remove();
  }
}
