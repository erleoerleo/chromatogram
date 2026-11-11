/** Wraps an SVG string from `renderSvg`/`plotChromatogram` in an `image/svg+xml` Blob. */
export function svgToBlob(svg: string): Blob {
  return new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`], { type: 'image/svg+xml' });
}

export interface PngOptions {
  /** Pixel ratio relative to the SVG size. Default 2. Reduced automatically for very large images. */
  scale?: number;
  /** Fill colour behind the plot; null for transparent. Default white. */
  background?: string | null;
}

// Stay well inside browser canvas limits (max side ~32k, area ~268M px in Chromium; less elsewhere).
const PNG_MAX_SIDE = 16384;
const PNG_MAX_AREA = 64e6;

/** Rasterises an SVG string to a PNG Blob. Browser only (needs `Image` and `<canvas>`). */
export async function svgToPngBlob(svg: string, options: PngOptions = {}): Promise<Blob> {
  const { scale: wanted = 2, background = '#fff' } = options;
  const url = URL.createObjectURL(svgToBlob(svg));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) throw new Error('SVG has no intrinsic size');
    const scale = Math.min(wanted, PNG_MAX_SIDE / Math.max(w, h), Math.sqrt(PNG_MAX_AREA / (w * h)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('PNG encoding failed');
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Triggers a browser download of a Blob. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Turns a title or sample ID into a safe file name stem, e.g. "Sample A/1, run 2" → "Sample_A_1_run_2". */
export function safeFileName(name: string, fallback = 'chromatogram'): string {
  const stem = name
    .trim()
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return stem || fallback;
}
