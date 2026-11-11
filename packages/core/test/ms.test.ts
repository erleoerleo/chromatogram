import { describe, expect, it } from 'vitest';
import { parseMs } from '../src/parsers/ms.js';
import { filterPeaks, parseIonList, sumIons, totalIonChromatogram } from '../src/model.js';
import { fixture } from './helpers.js';

function abundanceNear(scan: { mz: Float64Array; abundance: Float64Array }, mz: number): number {
  let s = 0;
  scan.mz.forEach((m, i) => {
    if (Math.abs(m - mz) <= 0.5) s += scan.abundance[i];
  });
  return s;
}

describe('parseMs', () => {
  it('parses header and scans of data.ms', () => {
    const ms = parseMs(fixture('data.ms'));
    expect(ms.operator).toBe('operator');
    expect(ms.instrument).toBe('MSD');
    expect(ms.scans.length).toBe(3807);
    expect(ms.scans[0].rt).toBeCloseTo(9.0351, 3);
    expect(ms.scans[ms.scans.length - 1].rt).toBeCloseTo(74.9915, 2);
    expect(abundanceNear(ms.scans[0], 105)).toBe(467);
    expect(abundanceNear(ms.scans[0], 192)).toBe(104);
    for (let i = 1; i < ms.scans.length; i++) {
      expect(ms.scans[i].rt).toBeGreaterThanOrEqual(ms.scans[i - 1].rt);
    }
  });

  it('builds TIC and EIC traces', () => {
    const ms = parseMs(fixture('realdata/data.ms'));
    expect(ms.scans.length).toBe(10_981);
    const tic = totalIonChromatogram(ms);
    expect(tic.times.length).toBe(ms.scans.length);
    expect(tic.signal.every((v) => v >= 0)).toBe(true);
    const eic = sumIons(ms, [191]);
    expect(eic.times.length).toBe(ms.scans.length);
    expect(Math.max(...eic.signal)).toBeGreaterThan(0);
    const both = sumIons(ms, [191, 217]);
    for (let i = 0; i < both.signal.length; i += 500) {
      expect(both.signal[i]).toBeGreaterThanOrEqual(eic.signal[i]);
    }
  });

  it('rejects non-MS input', () => {
    expect(() => parseMs(fixture('fid1a.ch'))).toThrow(/Unsupported .ms version/);
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
