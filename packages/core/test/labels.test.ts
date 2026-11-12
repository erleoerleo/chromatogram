import { describe, expect, it } from 'vitest';
import type { Chromatogram, Peak } from '../src/model.js';
import { layoutLabels, layoutLabelsAtApex, renderSvg } from '../src/render/svg.js';
import { linearScale } from '../src/render/scale.js';

describe('layoutLabelsAtApex', () => {
  it('puts each label just above its own apex in a dense cluster, without stacking', () => {
    const xs = linearScale(0, 100, 0, 1000);
    const ys = linearScale(0, 100, 500, 0);
    const item = (time: number, value: number, text: string) => ({ peak: {} as Peak, text, time, value });
    const placed = layoutLabelsAtApex([item(10, 20, 'AAAA'), item(10.05, 60, 'BBBB'), item(10.1, 20, 'CCCC')], xs, ys, 10);
    expect(placed.map((l) => l.bottom)).toEqual([ys(20) - 5, ys(60) - 5, ys(20) - 5]);
  });
});

describe('renderSvg label layout', () => {
  // Five equal, overlapping peaks 0.02 min apart: dense enough that the stacked layout lifts them.
  const times = Float64Array.from({ length: 2001 }, (_, i) => i * 0.01);
  const rts = [10, 10.02, 10.04, 10.06, 10.08];
  const signal = times.map((t) => 1 + rts.reduce((s, rt) => s + 100 * Math.exp(-((t - rt) ** 2) / 2e-6), 0));
  const chrom: Chromatogram = { times, signal } as unknown as Chromatogram;
  const peaks = rts.map((rt, i) => ({ rt, name: `P${i}`, ion: 0, xStart: rt - 0.005, xEnd: rt + 0.005 }) as Peak);
  const labelYs = (svg: string) => [...svg.matchAll(/translate\(([\d.]+) ([\d.]+)\) rotate\(-90\)" dy="0\.35em">P\d/g)].map((m) => Number(m[2]));

  it('defaults to apex labels at the same height for equal peaks', () => {
    const ys = labelYs(renderSvg(chrom, peaks));
    expect(ys).toHaveLength(5);
    expect(new Set(ys).size).toBe(1);
  });

  it('stacks labels when labelLayout is "stacked"', () => {
    const ys = labelYs(renderSvg(chrom, peaks, { labelLayout: 'stacked' }));
    expect(new Set(ys).size).toBeGreaterThan(1);
  });
});

describe('layoutLabels', () => {
  it('stacks labels that would overlap and leaves distant ones alone', () => {
    const xs = linearScale(0, 100, 0, 1000);
    const ys = linearScale(0, 100, 500, 0);
    const item = (time: number, value: number, text: string) => ({ peak: {} as Peak, text, time, value });
    const placed = layoutLabels(
      [item(10, 20, 'AAAA'), item(10.05, 20, 'BBBB'), item(10.1, 20, 'CCCC'), item(50, 20, 'DDDD')],
      xs,
      ys,
      10,
    );
    const [a, b, c, d] = placed;
    expect(b.bottom).toBeLessThan(a.top);
    expect(c.bottom).toBeLessThan(b.top);
    expect(d.bottom).toBe(a.bottom);
  });
});
