import { describe, expect, it } from 'vitest';
import { decodePrc, parsePrc } from '../src/parsers/prc.js';
import { fixture } from './helpers.js';

describe('parsePrc', () => {
  it('parses FID labels', () => {
    const prc = decodePrc(fixture('synthetic-fid.prc'));
    expect(prc.sampleId).toBe('SYNTHETIC-FID-1');
    expect(prc.peaks.length).toBe(31);
    expect(prc.peaks[0]).toMatchObject({ rt: 3, ion: 0, name: 'nC6', height: 77, yStart: 2, yEnd: 2 });
    expect(prc.peaks[0].xStart).toBeCloseTo(2.905, 3);
    expect(prc.peaks[0].xEnd).toBeCloseTo(3.095, 3);
    expect(prc.peaks.filter((p) => p.name === 'nC13').length).toBe(1);
    expect(prc.peaks.find((p) => p.name === 'ISTD')?.rt).toBe(11.7);
    expect(prc.peaks.every((p) => p.ion === 0 && p.area > 0 && p.height > 0)).toBe(true);
  });

  it('parses MS ion peaks', () => {
    const prc = decodePrc(fixture('synthetic-ms.prc'));
    expect(prc.sampleId).toBe('SYNTHETIC-MS-1');
    expect(prc.peaks.length).toBe(16);
    expect(prc.peaks[0]).toMatchObject({ rt: 52, ion: 217, name: 'D27S' });
    expect(prc.peaks.filter((p) => p.ion === 191).length).toBe(10);
    expect(prc.peaks.find((p) => p.name === 'H30')).toMatchObject({ rt: 67.1, ion: 191, height: 6000 });
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
