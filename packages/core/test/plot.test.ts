import { describe, expect, it } from 'vitest';
import { decodePrc, detectFormat, parseDataFile, plotChromatogram, safeFileName } from '../src/index.js';
import { fixture } from './helpers.js';

describe('detectFormat / parseDataFile', () => {
  it('detects .ms and .ch from the header when there is no file name', () => {
    expect(detectFormat(fixture('data.ms'))).toBe('ms');
    expect(detectFormat(fixture('fid1a.ch'))).toBe('ch');
    expect(detectFormat(fixture('fid1a_v179.ch'))).toBe('ch');
    expect(parseDataFile(fixture('data.ms')).kind).toBe('ms');
  });

  it('prefers the file extension when given', () => {
    expect(() => parseDataFile(fixture('fid1a.ch'), 'oops.ms')).toThrow(/\.ms version/);
  });
});

describe('plotChromatogram', () => {
  it('defaults the title to the sample ID and uses ion-0 peaks for FID', () => {
    const plot = plotChromatogram(parseDataFile(fixture('fid1a.ch')), decodePrc(fixture('fid1a.prc')), {
      fileName: 'fid1a.ch',
    });
    expect(plot.svg).toContain('SAMPLE-1');
    expect(plot.svg).toContain('fid1a.ch');
    expect(plot.peaks.length).toBeGreaterThan(0);
    expect(plot.warnings).toEqual([]);
  });

  it('plots an extracted ion chromatogram and keeps an explicit empty title', () => {
    const ms = parseDataFile(fixture('realdata/data.ms'));
    const plot = plotChromatogram(ms, decodePrc(fixture('realdata/data.prc')), { ions: '191', title: '' });
    expect(plot.trace.ions).toEqual([191]);
    expect(plot.trace.label).toBe('Ion Mass: 191');
    expect(plot.svg).not.toContain(`>${ms.sampleId}<`);
  });

  it('warns when the label file belongs to another sample', () => {
    const plot = plotChromatogram(parseDataFile(fixture('fid1a.ch')), { sampleId: 'something else', peaks: [] });
    expect(plot.warnings.join()).toMatch(/differs/);
  });
});

describe('safeFileName', () => {
  it('replaces unsafe characters', () => {
    expect(safeFileName('SAMPLE-1')).toBe('SAMPLE-1');
    expect(safeFileName('  ')).toBe('chromatogram');
  });
});
