import type { ChFile, Chromatogram, MsFile, Peak, PrcFile } from './model.js';
import { filterPeaks, parseIonList, sumIons, totalIonChromatogram } from './model.js';
import { parseCh } from './parsers/ch.js';
import { pascalString, toBytes } from './parsers/binary.js';
import { parseMs } from './parsers/ms.js';
import { renderSvg, type PlotOptions } from './render/svg.js';

export type DataFile = ChFile | MsFile;
export type DataFormat = DataFile['kind'];

/**
 * Works out whether bytes are a `.ch` or `.ms` file. The file name extension wins when it is
 * `.ch` or `.ms`; otherwise the header version string decides (`.ms` files are version "2").
 */
export function detectFormat(input: ArrayBuffer | Uint8Array, fileName?: string): DataFormat {
  const ext = fileName?.split('.').pop()?.toLowerCase();
  if (ext === 'ch' || ext === 'ms') return ext;
  const bytes = toBytes(input);
  return bytes.length > 0 && pascalString(bytes, 0) === '2' ? 'ms' : 'ch';
}

/** Parses an Agilent `.ch` or `.ms` file. Throws an Error with a readable message on bad input. */
export function parseDataFile(input: ArrayBuffer | Uint8Array, fileName?: string): DataFile {
  return detectFormat(input, fileName) === 'ms' ? parseMs(input) : parseCh(input);
}

export interface Trace {
  chrom: Chromatogram;
  /** Ions summed for an `.ms` trace; empty for `.ch` files and for the TIC. */
  ions: number[];
  /** Short description, e.g. "Ion Mass: 191" or "Total Ion Chromatogram". */
  label: string;
}

/**
 * Picks the signal to plot. `.ch` files have one signal. For `.ms` files, `ions` selects an
 * extracted ion chromatogram (summed within ±0.5 m/z); none gives the total ion chromatogram.
 */
export function selectTrace(file: DataFile, ions?: number[] | string): Trace {
  if (file.kind === 'ch') return { chrom: file, ions: [], label: file.instrument ? `Detector: ${file.instrument}` : '' };
  const list = typeof ions === 'string' ? parseIonList(ions) : (ions ?? []);
  return list.length
    ? { chrom: sumIons(file, list), ions: list, label: `Ion Mass: ${list.join(', ')}` }
    : { chrom: totalIonChromatogram(file), ions: list, label: 'Total Ion Chromatogram' };
}

export interface PlotRequest extends Partial<PlotOptions> {
  /** `.ms` only: ions to plot, as numbers or text such as "191+217". Blank = TIC. */
  ions?: number[] | string;
  /** Shown in the default subtitle. */
  fileName?: string;
}

export interface ChromatogramPlot {
  /** Standalone SVG document (no XML prolog). */
  svg: string;
  trace: Trace;
  /** Label file peaks drawn on this trace. */
  peaks: Peak[];
  /** Non-fatal problems worth showing to the user. */
  warnings: string[];
}

/**
 * Renders a parsed data file and optional label file to SVG. When `title` or `subtitle` is
 * undefined, a default is derived from the file (sample ID; date · file name · trace).
 */
export function plotChromatogram(file: DataFile, labels?: PrcFile | null, request: PlotRequest = {}): ChromatogramPlot {
  const { ions, fileName, ...options } = request;
  const trace = selectTrace(file, ions);
  const peaks = labels ? filterPeaks(labels.peaks, trace.ions) : [];
  const title = options.title ?? file.sampleId;
  const subtitle = options.subtitle ?? [trace.chrom.date, fileName, trace.label].filter(Boolean).join('  ·  ');
  const svg = renderSvg(trace.chrom, peaks, { ...stripUndefined(options), title, subtitle });

  const warnings: string[] = [];
  if (file.kind === 'ch' && file.unverified) {
    warnings.push(
      `.ch version ${file.version} is decoded from the format description but has not been checked against a real file — verify the trace looks right.`,
    );
  }
  if (labels?.sampleId && file.sampleId && norm(labels.sampleId) !== norm(file.sampleId)) {
    warnings.push(`Label file sample "${labels.sampleId}" differs from data file sample "${file.sampleId}".`);
  }
  return { svg, trace, peaks, warnings };
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}
