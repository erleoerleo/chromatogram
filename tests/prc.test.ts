import { describe, expect, it } from 'vitest';
import { decodePrc, parsePrc } from '../src/parsers/prc';
import { fixture } from './helpers';

describe('parsePrc', () => {
  it('parses fid1a.prc', () => {
    const prc = decodePrc(fixture('fid1a.prc'));
    expect(prc.sampleId).toBe('SAMPLE-1');
    expect(prc.peaks.length).toBe(77);
    const first = prc.peaks[0];
    expect(first.name).toBe('iC8(ISTD)/224tm-C5');
    expect(first.rt).toBeCloseTo(16.988, 3);
    expect(first.ion).toBe(0);
    expect(first.yStart).toBe(23402);
    expect(first.xStart).toBeCloseTo(16.864, 3);
    expect(first.xEnd).toBeCloseTo(17.68, 3);
    expect(prc.peaks.filter((p) => p.name === 'nC7').length).toBe(1);
    expect(prc.peaks.filter((p) => p.rt >= 3.5 && p.rt <= 13).length).toBeGreaterThan(3);
    for (const p of prc.peaks) {
      expect(p.area).toBeGreaterThanOrEqual(0);
      expect(p.height).toBeGreaterThanOrEqual(0);
    }
  });

  it('parses MS ion peaks', () => {
    const prc = decodePrc(fixture('realdata/data.prc'));
    expect(prc.sampleId).toBe('SAMPLE-MS');
    expect(prc.peaks.length).toBe(70);
    expect(prc.peaks[0]).toMatchObject({ rt: 69.849, ion: 217, name: '24baa' });
    expect(prc.peaks.every((p) => p.ion > 0)).toBe(true);
  });

  it('skips malformed rows and blank lines', () => {
    const text = [
      'SAMPLE_ID , x',
      'Ret.,Ion,Peakname,Area,Height,Area_c,Hght_c,Xstrt,Xend,Ystrt,Yend,Yhigh,IntType,Window',
      '1.5,0,A,10,10,1,1,1.4,1.6,5.,5.,15,1,0',
      'garbage',
      '',
      'abc,0,B,10,10,1,1,1.4,1.6,5.,5.,15,1,0',
      '2.5,0,C,1e3,1e3,1,1,2.4,2.6,5.,5.,15,1,0',
    ].join('\r\n');
    const prc = parsePrc(text);
    expect(prc.peaks.map((p) => p.name)).toEqual(['A', 'C']);
    expect(prc.peaks[1].area).toBe(1000);
  });
});
