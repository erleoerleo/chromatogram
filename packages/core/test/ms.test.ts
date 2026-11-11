import { describe, expect, it } from 'vitest';
import { parseMs } from '../src/parsers/ms.js';
import { filterPeaks, parseIonList, sumIons, totalIonChromatogram } from '../src/model.js';
import { fixture } from './helpers.js';

// synthetic.ms (scripts/generate-samples.mjs): 10–90 min, one scan per second, 8 ions per scan.
// m/z 191 has its largest peak (H30, height 6000) at 67.1 min.

const argmax = (a: Float64Array) => a.reduce((best, v, i) => (v > a[best] ? i : best), 0);

describe('parseMs', () => {
  it('parses the header and scans', () => {
    const ms = parseMs(fixture('synthetic.ms'));
    expect(ms).toMatchObject({ sampleId: 'SYNTHETIC-MS-1', operator: 'synthetic', instrument: 'MSD' });
    expect(ms.scans.length).toBe(4801);
    expect(ms.scans[0].rt).toBe(10);
    expect(ms.scans[ms.scans.length - 1].rt).toBeCloseTo(90, 6);
    expect(Array.from(ms.scans[0].mz)).toEqual([57, 71, 85, 105, 191, 217, 218, 231]);
    for (let i = 1; i < ms.scans.length; i++) {
      expect(ms.scans[i].rt).toBeGreaterThan(ms.scans[i - 1].rt);
    }
  });

  it('builds TIC and EIC traces', () => {
    const ms = parseMs(fixture('synthetic.ms'));
    const tic = totalIonChromatogram(ms);
    expect(tic.times.length).toBe(ms.scans.length);
    expect(tic.signal[0]).toBe(ms.scans[0].abundance.reduce((s, v) => s + v, 0));

    const eic = sumIons(ms, [191]);
    const top = argmax(eic.signal);
    expect(eic.times[top]).toBeCloseTo(67.1, 1);
    expect(eic.signal[top]).toBeGreaterThan(6000);
    expect(eic.signal[top]).toBeLessThan(6100);

    const both = sumIons(ms, [191, 217]);
    const steranes = sumIons(ms, [217]);
    for (let i = 0; i < both.signal.length; i += 250) {
      expect(both.signal[i]).toBe(eic.signal[i] + steranes.signal[i]);
    }
  });

  it('rejects non-MS input', () => {
    expect(() => parseMs(fixture('synthetic-fid.ch'))).toThrow(/Unsupported .ms version/);
    expect(() => parseMs(new Uint8Array(10))).toThrow(/too short/);
  });
});

describe('ion helpers', () => {
  it('parses ion lists', () => {
    expect(parseIonList('')).toEqual([]);
    expect(parseIonList('191')).toEqual([191]);
    expect(parseIonList('191+217, 218')).toEqual([191, 217, 218]);
  });

  it('filters peaks by ion with fallback', () => {
    const p = (ion: number) => ({ ion }) as Parameters<typeof filterPeaks>[0][number];
    const peaks = [p(0), p(191), p(217)];
    expect(filterPeaks(peaks, []).map((x) => x.ion)).toEqual([0]);
    expect(filterPeaks(peaks, [191]).map((x) => x.ion)).toEqual([191]);
    expect(filterPeaks(peaks, [999]).length).toBe(3);
  });
});
