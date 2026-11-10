import { describe, expect, it } from 'vitest';
import { parseCh } from '../src/parsers/ch';
import { fixture } from './helpers';

function median(a: Float64Array): number {
  const s = Array.from(a).sort((x, y) => x - y);
  return s[s.length >> 1];
}

function assertAscending(times: Float64Array) {
  for (let i = 1; i < times.length; i++) {
    if (!(times[i] > times[i - 1])) throw new Error(`times not ascending at ${i}`);
  }
}

describe('parseCh', () => {
  it('parses a v81 legacy double-delta FID file', () => {
    const c = parseCh(fixture('fid1a.ch'));
    expect(c.version).toBe('81');
    expect(c.unverified).toBe(false);
    expect(c.sampleId).toBe('SAMPLE-1');
    expect(c.operator).toBe('operator');
    expect(c.times.length).toBe(104_402);
    expect(c.signal.length).toBe(104_402);
    expect(c.times[0]).toBeGreaterThanOrEqual(0);
    expect(c.times[0]).toBeLessThan(0.01);
    expect(c.times[c.times.length - 1]).toBeGreaterThan(170);
    expect(c.times[c.times.length - 1]).toBeLessThan(180);
    assertAscending(c.times);
    const base = median(c.signal);
    expect(base).toBeGreaterThan(1);
    expect(base).toBeLessThan(10);
    expect(Math.max(...c.signal)).toBeGreaterThan(500);
  });

  it('parses a v179 modern float64 FID file', () => {
    const c = parseCh(fixture('fid1a_v179.ch'));
    expect(c.version).toBe('179');
    expect(c.sampleId).toBe('SAMPLE-2');
    expect(c.operator).toBe('operator');
    expect(c.times.length).toBe(72_987);
    const last = c.times[c.times.length - 1];
    expect(last).toBeGreaterThan(120);
    expect(last).toBeLessThan(125);
    assertAscending(c.times);
    const base = median(c.signal);
    expect(base).toBeGreaterThan(1000);
    expect(base).toBeLessThan(100_000);
    expect(c.signal.every(Number.isFinite)).toBe(true);
  });

  it('parses the real-data v179 file', () => {
    const c = parseCh(fixture('realdata/fid1a.ch'));
    expect(c.version).toBe('179');
    expect(c.sampleId).toBe('SAMPLE-3');
    expect(c.times[c.times.length - 1]).toBeCloseTo(113.985, 2);
  });

  it('rejects unknown versions and truncated files', () => {
    const bad = new Uint8Array(2048);
    bad[0] = 2;
    bad[1] = '9'.charCodeAt(0);
    bad[2] = '9'.charCodeAt(0);
    expect(() => parseCh(bad)).toThrow(/Unsupported .ch version '99'/);
    expect(() => parseCh(fixture('fid1a.ch').slice(0, 100))).toThrow(/too short/);
  });

  it('decodes single-delta streams with absolute resets', () => {
    // Synthetic v30 file: legacy layout, data at 0x400, delta encoding.
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
