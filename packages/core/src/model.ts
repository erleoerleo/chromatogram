/** A single detector trace: evenly or unevenly spaced points in minutes. */
export interface Chromatogram {
  sampleId: string;
  operator: string;
  date: string;
  instrument: string;
  method: string;
  /** Retention times in minutes, ascending. */
  times: Float64Array;
  signal: Float64Array;
}

export interface ChFile extends Chromatogram {
  kind: 'ch';
  version: string;
  /** True for format versions that have never been checked against a real file. */
  unverified: boolean;
}

export interface MsScan {
  /** Retention time in minutes. */
  rt: number;
  mz: Float64Array;
  abundance: Float64Array;
}

export interface MsFile {
  kind: 'ms';
  sampleId: string;
  operator: string;
  date: string;
  instrument: string;
  scans: MsScan[];
}

export interface Peak {
  rt: number;
  /** 0 = FID peak, > 0 = MS selected-ion peak at that m/z. */
  ion: number;
  name: string;
  area: number;
  height: number;
  areaPercent: number;
  heightPercent: number;
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
  yHigh: number;
  intType: number;
  window: number;
}

export interface PrcFile {
  sampleId: string;
  peaks: Peak[];
}

const MZ_TOLERANCE = 0.5;

/** Total ion chromatogram: sum of every ion's abundance per scan. */
export function totalIonChromatogram(ms: MsFile): Chromatogram {
  return toChromatogram(ms, (scan) => {
    let sum = 0;
    for (let i = 0; i < scan.abundance.length; i++) sum += scan.abundance[i];
    return sum;
  });
}

/** Extracted ion chromatogram summing abundances within ±0.5 of each requested m/z. */
export function sumIons(ms: MsFile, ions: number[]): Chromatogram {
  return toChromatogram(ms, (scan) => {
    let sum = 0;
    for (const target of ions) {
      for (let i = 0; i < scan.mz.length; i++) {
        if (Math.abs(scan.mz[i] - target) <= MZ_TOLERANCE) sum += scan.abundance[i];
      }
    }
    return sum;
  });
}

function toChromatogram(ms: MsFile, value: (scan: MsScan) => number): Chromatogram {
  const n = ms.scans.length;
  const times = new Float64Array(n);
  const signal = new Float64Array(n);
  ms.scans.forEach((scan, i) => {
    times[i] = scan.rt;
    signal[i] = value(scan);
  });
  return {
    sampleId: ms.sampleId,
    operator: ms.operator,
    date: ms.date,
    instrument: ms.instrument,
    method: '',
    times,
    signal,
  };
}

/** Parses an ion list such as "191", "191+217" or "191, 217". Empty → []. */
export function parseIonList(text: string): number[] {
  return text
    .split(/[+,;/|\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * FID plot → ion-0 peaks; ion plot → peaks whose ion matches a requested m/z.
 * Falls back to every peak when the filter leaves nothing.
 */
export function filterPeaks(peaks: Peak[], ions: number[]): Peak[] {
  if (peaks.length === 0) return peaks;
  const wanted = ions.map((i) => Math.round(i));
  const filtered =
    wanted.length === 0 ? peaks.filter((p) => p.ion === 0) : peaks.filter((p) => wanted.includes(p.ion));
  return filtered.length === 0 ? peaks : filtered;
}

/** First index whose time is >= t (n when none). Times must be ascending. */
export function indexAtOrAfter(times: ArrayLike<number>, t: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Last index whose time is <= t (-1 when none). */
export function indexAtOrBefore(times: ArrayLike<number>, t: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (times[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}
