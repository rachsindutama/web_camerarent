import html2pdf from 'html2pdf.js';

export function escapeHtml(raw: string | number | null | undefined): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renders an explicit-hex, A4-proportioned HTML document to a crisp
 * Retina-scaled A4 PDF download using html2pdf.js.
 */
export async function renderHtmlToA4Pdf(htmlMarkup: string, filename: string): Promise<void> {
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = htmlMarkup.trim();
  const target = (wrapper.firstElementChild as HTMLElement) ?? wrapper;

  const options = {
    margin: [0, 0, 0, 0] as [number, number, number, number],
    filename,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: {
      scale: 2.5,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
    },
    jsPDF: {
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait' as const,
    },
    pagebreak: {
      mode: ['css', 'legacy'],
      avoid: ['.pdf-avoid-break', 'tr'],
    },
  };

  const worker = html2pdf();
  await worker
    .set(options as unknown as Parameters<typeof worker.set>[0])
    .from(target)
    .save();
}
