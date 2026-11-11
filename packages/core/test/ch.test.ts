import { describe, expect, it } from 'vitest';
import { parseCh } from '../src/parsers/ch.js';
import { fixture } from './helpers.js';

// Fixtures come from scripts/generate-samples.mjs: Gaussian peaks on a baseline of 2 + 0.03·t.

function assertAscending(times: Float64Array) {
  for (let i = 1; i < times.length; i++) {
    if (!(times[i] > times[i - 1])) throw new Error(`times not ascending at ${i}`);
  }
}

function valueAt(c: { times: Float64Array; signal: Float64Array }, t: number): number {
  let best = 0;
  c.times.forEach((x, i) => {
    if (Math.abs(x - t) < Math.abs(c.times[best] - t)) best = i;
  });
  return c.signal[best];
}

describe('parseCh', () => {
  it('parses a v81 legacy double-delta FID file', () => {
    const c = parseCh(fixture('synthetic-fid.ch'));
    expect(c).toMatchObject({
      version: '81',
      unverified: false,
      sampleId: 'SYNTHETIC-FID-1',
      operator: 'synthetic',
      date: '01 Jan 2024  10:00:00',
      instrument: 'Synthetic GC',
      method: 'SYNTH.M',
    });
    // 0–60 min at 5 Hz.
    expect(c.times.length).toBe(18_001);
    expect(c.signal.length).toBe(18_001);
    expect(c.times[0]).toBe(0);
    expect(c.times[c.times.length - 1]).toBeCloseTo(60, 6);
    assertAscending(c.times);
    // Baseline before the first peak, solvent peak (900) and nC13 apex (155 above baseline).
    expect(valueAt(c, 0.5)).toBeCloseTo(2.015, 0);
    expect(Math.max(...c.signal)).toBeCloseTo(902, -1);
    expect(valueAt(c, 19.1)).toBeCloseTo(155 + 2 + 0.03 * 19.1, -1);
  });

  it('parses a v179 modern float64 FID file', () => {
    const c = parseCh(fixture('synthetic-fid-v179.ch'));
    expect(c).toMatchObject({ version: '179', unverified: false, sampleId: 'SYNTHETIC-FID-2', method: 'SYNTH179.M' });
    expect(c.times.length).toBe(13_501);
    expect(c.times[c.times.length - 1]).toBeCloseTo(45, 6);
    assertAscending(c.times);
    expect(valueAt(c, 0.5)).toBeGreaterThan(1850);
    expect(valueAt(c, 0.5)).toBeLessThan(2200);
    expect(c.signal.every(Number.isFinite)).toBe(true);
  });

  it('rejects unknown versions and truncated files', () => {
    const bad = new Uint8Array(2048);
    bad[0] = 2;
    bad[1] = '9'.charCodeAt(0);
    bad[2] = '9'.charCodeAt(0);
    expect(() => parseCh(bad)).toThrow(/Unsupported .ch version '99'/);
    expect(() => parseCh(fixture('synthetic-fid.ch').slice(0, 100))).toThrow(/too short/);
  });

  it('decodes single-delta streams with absolute resets', () => {
    // Minimal v30 file: legacy layout, data at 0x400, delta encoding.
    const buf = new Uint8Array(0x400 + 14);
    const view = new DataView(buf.buffer);
    buf[0] = 2;
    buf[1] = '3'.charCodeAt(0);
    buf[2] = '0'.charCodeAt(0);
    view.setFloat32(0x11a, 0, false);
    view.setFloat32(0x11e, 120_000, false);
    view.setFloat64(0x284, 2, false);
    view.setInt16(0x400, 0x7fff, false); // reset to 100
    view.setInt16(0x402, 0, false);
    view.setUint32(0x404, 100, false);
    view.setInt16(0x408, 5, false); // 105
    view.setInt16(0x40a, -10, false); // 95
    view.setInt16(0x40c, 1, false); // 96
    const c = parseCh(buf);
    expect(c.unverified).toBe(true);
    expect(Array.from(c.signal)).toEqual([200, 210, 190, 192]);
    expect(c.times[0]).toBe(0);
    expect(c.times[3]).toBeCloseTo(2, 10);
  });
});
