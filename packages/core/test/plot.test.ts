import { describe, expect, it } from 'vitest';
import { decodePrc, detectFormat, parseDataFile, plotChromatogram, safeFileName } from '../src/index.js';
import { fixture } from './helpers.js';

describe('detectFormat / parseDataFile', () => {
  it('detects .ms and .ch from the header when there is no file name', () => {
    expect(detectFormat(fixture('synthetic.ms'))).toBe('ms');
    expect(detectFormat(fixture('synthetic-fid.ch'))).toBe('ch');
    expect(detectFormat(fixture('synthetic-fid-v179.ch'))).toBe('ch');
    expect(parseDataFile(fixture('synthetic.ms')).kind).toBe('ms');
  });

  it('prefers the file extension when given', () => {
    expect(() => parseDataFile(fixture('synthetic-fid.ch'), 'oops.ms')).toThrow(/\.ms version/);
  });
});

describe('plotChromatogram', () => {
  it('defaults the title to the sample ID and uses ion-0 peaks for FID', () => {
    const plot = plotChromatogram(parseDataFile(fixture('synthetic-fid.ch')), decodePrc(fixture('synthetic-fid.prc')), {
      fileName: 'synthetic-fid.ch',
    });
    expect(plot.svg).toContain('>SYNTHETIC-FID-1<');
    expect(plot.svg).toContain('synthetic-fid.ch');
    expect(plot.peaks.length).toBe(31);
    expect(plot.warnings).toEqual([]);
  });

  it('plots an extracted ion chromatogram and keeps an explicit empty title', () => {
    const ms = parseDataFile(fixture('synthetic.ms'));
    const plot = plotChromatogram(ms, decodePrc(fixture('synthetic-ms.prc')), { ions: '191', title: '' });
    expect(plot.trace.ions).toEqual([191]);
    expect(plot.peaks.map((p) => p.name)).toContain('H30');
    expect(plot.peaks.every((p) => p.ion === 191)).toBe(true);
    expect(plot.trace.label).toBe('Ion Mass: 191');
    expect(plot.svg).not.toContain(`>${ms.sampleId}<`);
  });

  it('warns when the label file belongs to another sample', () => {
    const plot = plotChromatogram(parseDataFile(fixture('synthetic-fid.ch')), { sampleId: 'something else', peaks: [] });
    expect(plot.warnings.join()).toMatch(/differs/);
  });
});

describe('safeFileName', () => {
  it('replaces unsafe characters', () => {
    expect(safeFileName('Sample A/1, run 2')).toBe('Sample_A_1_run_2');
    expect(safeFileName('  ')).toBe('chromatogram');
  });
});
