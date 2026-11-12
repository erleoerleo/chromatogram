import type { Chromatogram, Peak } from '../model.js';
import { indexAtOrAfter, indexAtOrBefore } from '../model.js';
import { axisFactor, formatTick, linearScale, niceStep, ticks, type LinearScale } from './scale.js';

export interface PlotOptions {
  /** Window start in minutes; null = start of data. */
  timeStart: number | null;
  /** Window end in minutes; null = end of data. */
  timeEnd: number | null;
  showLabels: boolean;
  /**
   * `'apex'` puts every label straight above its own peak apex (labels may overlap);
   * `'stacked'` lifts labels above taller neighbours and stacks them to avoid overlaps.
   */
  labelLayout: LabelLayout;
  showRetentionTimes: boolean;
  showBaselines: boolean;
  showGrid: boolean;
  /** Peak label font size in px. */
  labelFontSize: number;
  lineWidth: number;
  width: number;
  height: number;
  title: string;
  subtitle: string;
}

export type LabelLayout = 'apex' | 'stacked';

export const DEFAULT_OPTIONS: PlotOptions = {
  timeStart: null,
  timeEnd: null,
  showLabels: true,
  labelLayout: 'apex',
  showRetentionTimes: false,
  showBaselines: false,
  showGrid: true,
  labelFontSize: 11,
  lineWidth: 1,
  width: 1200,
  height: 750,
  title: '',
  subtitle: '',
};

const FONT = 'Helvetica, Arial, sans-serif';
/** Average glyph advance relative to font size, used to size labels without a DOM. */
const CHAR_WIDTH = 0.62;
const LABEL_GAP_PX = 5;

export interface PlacedLabel {
  peak: Peak;
  text: string;
  x: number;
  /** Pixel y of the label's start (bottom end once rotated). */
  bottom: number;
  top: number;
}

/** Index of the tallest plotted sample inside the peak's integration window. */
export function apexIndex(chrom: Chromatogram, peak: Peak, t0: number, t1: number): number {
  const usable = peak.xStart > 0 && peak.xEnd > peak.xStart && peak.xStart <= peak.rt && peak.rt <= peak.xEnd;
  const from = Math.max(usable ? peak.xStart : peak.rt, t0);
  const to = Math.min(usable ? peak.xEnd : peak.rt, t1);
  const n = chrom.times.length;
  let lo = Math.min(indexAtOrAfter(chrom.times, from), n - 1);
  const hi = Math.max(indexAtOrBefore(chrom.times, to), lo);
  if (lo > hi) lo = hi;
  let apex = lo;
  for (let i = lo + 1; i <= hi && i < n; i++) if (chrom.signal[i] > chrom.signal[apex]) apex = i;
  return apex;
}

export function labelText(peak: Peak, withRt: boolean): string {
  return withRt ? `${peak.rt.toFixed(3)}  ${peak.name}` : peak.name;
}

type LabelItem = { peak: Peak; text: string; time: number; value: number };

/** Places each rotated label straight above its own apex, ignoring neighbours (labels may overlap). */
export function layoutLabelsAtApex(items: LabelItem[], xs: LinearScale, ys: LinearScale, fontSize: number): PlacedLabel[] {
  return items.map((item) => {
    const bottom = ys(item.value) - LABEL_GAP_PX;
    const length = item.text.length * fontSize * CHAR_WIDTH;
    return { peak: item.peak, text: item.text, x: xs(item.time), bottom, top: bottom - length };
  });
}

/**
 * Places rotated labels rising from each apex. A label starts above the highest point of the
 * trace across its own thickness (so it never cuts through a neighbouring taller peak) and is
 * lifted above any nearby label whose vertical band it would overlap.
 *
 * @param traceTop optional pixel y of the highest trace point between two pixel x positions
 */
export function layoutLabels(
  items: LabelItem[],
  xs: LinearScale,
  ys: LinearScale,
  fontSize: number,
  traceTop?: (xFrom: number, xTo: number) => number,
): PlacedLabel[] {
  const lineHeight = fontSize * 1.2;
  const minSeparation = lineHeight * 1.05;
  const placed: PlacedLabel[] = [];
  for (const item of items) {
    const x = xs(item.time);
    const length = item.text.length * fontSize * CHAR_WIDTH;
    let base = ys(item.value);
    if (traceTop) base = Math.min(base, traceTop(x - lineHeight / 2, x + lineHeight / 2));
    let bottom = base - LABEL_GAP_PX;
    // Items arrive sorted by x, so only the tail of `placed` can be close enough to collide.
    const near: PlacedLabel[] = [];
    for (let k = placed.length - 1; k >= 0 && x - placed[k].x < minSeparation; k--) near.push(placed[k]);
    // Only ever moves up, and each neighbour can push at most once, so this terminates.
    for (let moved = true; moved; ) {
      moved = false;
      for (const other of near) {
        if (bottom > other.top - LABEL_GAP_PX + 0.01 && bottom - length < other.bottom + LABEL_GAP_PX - 0.01) {
          bottom = other.top - LABEL_GAP_PX;
          moved = true;
        }
      }
    }
    placed.push({ peak: item.peak, text: item.text, x, bottom, top: bottom - length });
  }
  return placed;
}

export function renderSvg(chrom: Chromatogram, peaks: Peak[], options: Partial<PlotOptions> = {}): string {
  const o: PlotOptions = { ...DEFAULT_OPTIONS, ...options };
  const { width: W, height: H } = o;
  const n = chrom.times.length;

  const dataStart = n > 0 ? chrom.times[0] : 0;
  const dataEnd = n > 0 ? chrom.times[n - 1] : 1;
  let t0 = o.timeStart ?? dataStart;
  let t1 = o.timeEnd ?? dataEnd;
  if (!(t1 > t0)) [t0, t1] = [dataStart, dataEnd > dataStart ? dataEnd : dataStart + 1];

  const i0 = indexAtOrAfter(chrom.times, t0);
  const i1 = indexAtOrBefore(chrom.times, t1);
  const hasData = n > 0 && i1 >= i0;

  let sMin = Infinity;
  let sMax = -Infinity;
  for (let i = i0; i <= i1; i++) {
    const v = chrom.signal[i];
    if (v < sMin) sMin = v;
    if (v > sMax) sMax = v;
  }
  if (!hasData) [sMin, sMax] = [0, 1];
  if (sMax === sMin) [sMin, sMax] = [sMin - 1, sMax + 1];
  const range = sMax - sMin;

  const top = o.title ? (o.subtitle ? 64 : 44) : o.subtitle ? 34 : 16;
  const left = 78;
  const right = 20;
  const bottom = 56;
  const plotW = W - left - right;
  const plotH = H - top - bottom;

  const xs = linearScale(t0, t1, left, left + plotW);
  const yLow = sMin - range * 0.03;
  let yHigh = sMax + range * 0.05;
  let ys = linearScale(yLow, yHigh, top + plotH, top);

  let labels: PlacedLabel[] = [];
  if (o.showLabels && hasData) {
    const items = peaks
      .filter((p) => p.rt >= t0 && p.rt <= t1)
      .map((peak) => {
        const idx = apexIndex(chrom, peak, t0, t1);
        return { peak, text: labelText(peak, o.showRetentionTimes), time: chrom.times[idx], value: chrom.signal[idx] };
      })
      .sort((a, b) => a.time - b.time);

    // Widen the y-axis until the highest label fits inside the plot area.
    const traceTop = (xFrom: number, xTo: number) => {
      const a = Math.max(indexAtOrAfter(chrom.times, xs.invert(xFrom)), i0);
      const b = Math.min(indexAtOrBefore(chrom.times, xs.invert(xTo)), i1);
      let max = -Infinity;
      for (let i = a; i <= b; i++) if (chrom.signal[i] > max) max = chrom.signal[i];
      return max === -Infinity ? Infinity : ys(max);
    };
    for (let iter = 0; iter < 16; iter++) {
      labels =
        o.labelLayout === 'stacked'
          ? layoutLabels(items, xs, ys, o.labelFontSize, traceTop)
          : layoutLabelsAtApex(items, xs, ys, o.labelFontSize);
      const minTop = labels.reduce((m, l) => Math.min(m, l.top), Infinity);
      const deficit = top + 4 - minTop;
      if (!(deficit > 0.5) || yHigh - yLow > range * 50) break;
      yHigh += (deficit / plotH) * (yHigh - yLow) * 1.1;
      ys = linearScale(yLow, yHigh, top + plotH, top);
    }
  }

  const xStep = niceStep(t1 - t0, 10);
  const factor = axisFactor(Math.max(Math.abs(yLow), Math.abs(yHigh)));
  const yStep = niceStep((yHigh - yLow) / factor, 10) * factor;
  const xTicks = ticks(t0, t1, xStep);
  const yTicks = ticks(yLow, yHigh, yStep);

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`,
  );
  out.push(`<title>${esc(o.title || 'Chromatogram')}</title>`);
  out.push(`<rect width="${W}" height="${H}" fill="#fff"/>`);
  out.push(`<defs><clipPath id="plot-area"><rect x="${left}" y="${top}" width="${plotW}" height="${plotH}"/></clipPath></defs>`);

  if (o.title) out.push(`<text x="${W / 2}" y="28" font-size="20" text-anchor="middle">${esc(o.title)}</text>`);
  if (o.subtitle)
    out.push(`<text x="${W / 2}" y="${o.title ? 50 : 22}" font-size="13" fill="#444" text-anchor="middle">${esc(o.subtitle)}</text>`);

  // Grid and ticks
  const grid: string[] = [];
  const tickMarks: string[] = [];
  const tickLabels: string[] = [];
  for (const t of xTicks) {
    const x = r(xs(t));
    if (o.showGrid) grid.push(`M${x} ${top}V${top + plotH}`);
    tickMarks.push(`M${x} ${top + plotH}v5`);
    tickLabels.push(`<text x="${x}" y="${top + plotH + 19}" text-anchor="middle">${formatTick(t, xStep)}</text>`);
  }
  for (const v of yTicks) {
    const y = r(ys(v));
    if (o.showGrid) grid.push(`M${left} ${y}H${left + plotW}`);
    tickMarks.push(`M${left} ${y}h-5`);
    tickLabels.push(`<text x="${left - 8}" y="${y}" dy="0.35em" text-anchor="end">${formatTick(v / factor, yStep / factor)}</text>`);
  }
  if (grid.length) out.push(`<path d="${grid.join('')}" stroke="#dcdcdc" stroke-width="1" fill="none"/>`);
  out.push(`<path d="${tickMarks.join('')}" stroke="#000" stroke-width="1" fill="none"/>`);
  out.push(`<g font-size="12" fill="#000">${tickLabels.join('')}</g>`);

  const yTitle = factor === 1 ? 'Signal' : `Signal (×10${superscript(Math.round(Math.log10(factor)))})`;
  out.push(
    `<text x="${left + plotW / 2}" y="${H - 12}" font-size="14" text-anchor="middle">Retention Time (min)</text>`,
    `<text transform="translate(18 ${top + plotH / 2}) rotate(-90)" font-size="14" text-anchor="middle">${yTitle}</text>`,
  );

  // Trace
  if (hasData) {
    out.push(
      `<path d="${tracePath(chrom, i0, i1, xs, ys, plotW)}" fill="none" stroke="#000" stroke-width="${o.lineWidth}" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#plot-area)"/>`,
    );
  } else {
    out.push(`<text x="${left + plotW / 2}" y="${top + plotH / 2}" font-size="16" fill="#888" text-anchor="middle">No data in the selected time window</text>`);
  }

  // Baselines
  if (o.showBaselines && hasData) {
    const segs: string[] = [];
    for (const p of peaks) {
      if (p.rt < t0 || p.rt > t1) continue;
      const a = clampIndex(chrom, Math.max(p.xStart, t0), i0, i1);
      const b = clampIndex(chrom, Math.min(p.xEnd, t1), i0, i1);
      segs.push(`M${r(xs(chrom.times[a]))} ${r(ys(chrom.signal[a]))}L${r(xs(chrom.times[b]))} ${r(ys(chrom.signal[b]))}`);
    }
    if (segs.length)
      out.push(`<path d="${segs.join('')}" stroke="#888" stroke-width="0.8" fill="none" clip-path="url(#plot-area)"/>`);
  }

  // Peak labels
  if (labels.length) {
    out.push(`<g font-size="${o.labelFontSize}" fill="#000">`);
    for (const l of labels) {
      out.push(`<text transform="translate(${r(l.x)} ${r(l.bottom)}) rotate(-90)" dy="0.35em">${esc(l.text)}</text>`);
    }
    out.push('</g>');
  }

  out.push(`<rect x="${left}" y="${top}" width="${plotW}" height="${plotH}" fill="none" stroke="#000" stroke-width="1"/>`);
  out.push('</svg>');
  return out.join('\n');
}

/** Polyline through the window, reduced to min/max per pixel column for dense traces. */
function tracePath(
  chrom: Chromatogram,
  i0: number,
  i1: number,
  xs: LinearScale,
  ys: LinearScale,
  plotW: number,
): string {
  const parts: string[] = [];
  const push = (i: number) => parts.push(`${parts.length ? 'L' : 'M'}${r(xs(chrom.times[i]))} ${r(ys(chrom.signal[i]))}`);
  const count = i1 - i0 + 1;
  if (count <= plotW * 4) {
    for (let i = i0; i <= i1; i++) push(i);
    return parts.join('');
  }
  const columns = Math.ceil(plotW * 2);
  const x0 = xs(chrom.times[i0]);
  const span = xs(chrom.times[i1]) - x0 || 1;
  let col = -1;
  let minI = i0;
  let maxI = i0;
  let firstI = i0;
  let lastI = i0;
  const flush = () => {
    const ordered = [...new Set([firstI, minI, maxI, lastI])].sort((a, b) => a - b);
    ordered.forEach(push);
  };
  for (let i = i0; i <= i1; i++) {
    const c = Math.min(columns - 1, Math.floor(((xs(chrom.times[i]) - x0) / span) * columns));
    if (c !== col) {
      if (col >= 0) flush();
      col = c;
      minI = maxI = firstI = lastI = i;
    } else {
      if (chrom.signal[i] < chrom.signal[minI]) minI = i;
      if (chrom.signal[i] > chrom.signal[maxI]) maxI = i;
      lastI = i;
    }
  }
  flush();
  return parts.join('');
}

function clampIndex(chrom: Chromatogram, minute: number, lo: number, hi: number): number {
  return Math.min(Math.max(indexAtOrAfter(chrom.times, minute), lo), hi);
}

function r(v: number): number {
  return Math.round(v * 100) / 100;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

function superscript(n: number): string {
  const map: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  return String(n)
    .split('')
    .map((c) => map[c] ?? c)
    .join('');
}
