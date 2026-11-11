import { describe, expect, it } from 'vitest';
import { parseCh } from '../src/parsers/ch.js';
import { parseMs } from '../src/parsers/ms.js';
import { decodePrc } from '../src/parsers/prc.js';
import { filterPeaks, sumIons } from '../src/model.js';
import { renderSvg } from '../src/render/svg.js';
import { formatTick, niceStep, ticks } from '../src/render/scale.js';
import { fixture } from './helpers.js';

describe('scale helpers', () => {
  it('picks nice steps', () => {
    expect(niceStep(100, 10)).toBe(10);
    expect(niceStep(97, 10)).toBe(10);
    expect(niceStep(0.37, 10)).toBe(0.05);
    expect(niceStep(2400, 10)).toBe(500);
  });
  it('generates ticks and formats them', () => {
    expect(ticks(5, 105, 10)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(formatTick(0.15, 0.05)).toBe('0.15');
    expect(formatTick(40, 10)).toBe('40');
  });
});

describe('renderSvg', () => {
  it('renders an FID chromatogram with peak labels', () => {
    const chrom = parseCh(fixture('synthetic-fid.ch'));
    const prc = decodePrc(fixture('synthetic-fid.prc'));
    const svg = renderSvg(chrom, filterPeaks(prc.peaks, []), { timeStart: 2, timeEnd: 58, title: chrom.sampleId });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('>nC13</text>');
    expect(svg).toContain('Retention Time (min)');
    // One trace path, downsampled well below the raw point count.
    const trace = svg.match(/<path d="(M[^"]+)" fill="none" stroke="#000" stroke-width="1" stroke-linejoin/);
    expect(trace).not.toBeNull();
    const points = trace![1].split(/[ML]/).length;
    expect(points).toBeLessThan(10_000);
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  it('keeps every label inside the plot area', () => {
    const chrom = parseCh(fixture('synthetic-fid.ch'));
    const prc = decodePrc(fixture('synthetic-fid.prc'));
    const svg = renderSvg(chrom, prc.peaks, { timeStart: 2, timeEnd: 58, title: 'x' });
    const ys = [...svg.matchAll(/translate\(([\d.]+) ([\d.-]+)\) rotate\(-90\)" dy/g)].map((m) => Number(m[2]));
    // 31 labels; nC30 (58.2 min) is outside the window.
    expect(ys.length).toBe(30);
    for (const y of ys) expect(y).toBeGreaterThan(0);
  });

  it('renders an EIC from an .ms file and escapes text', () => {
    const ms = parseMs(fixture('synthetic.ms'));
    const prc = decodePrc(fixture('synthetic-ms.prc'));
    const svg = renderSvg(sumIons(ms, [191]), filterPeaks(prc.peaks, [191]), {
      timeStart: 45,
      timeEnd: 90,
      title: '<A & B>',
      subtitle: 'Ion Mass: 191',
    });
    expect(svg).toContain('>H30</text>');
    expect(svg).toContain('&lt;A &amp; B&gt;');
    expect(svg).toContain('Ion Mass: 191');
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  it('handles an empty time window', () => {
    const chrom = parseCh(fixture('synthetic-fid.ch'));
    const svg = renderSvg(chrom, [], { timeStart: 500, timeEnd: 600 });
    expect(svg).toContain('No data in the selected time window');
  });
});
