import type { Peak, PrcFile } from '../model';

/*
 * ChemStation .prc peak/label files (plain text, comma separated):
 *   line 1: SAMPLE_ID , <sample name>
 *   line 2: Ret.,Ion,Peakname,Area,Height,Area_c,Hght_c,Xstrt,Xend,Ystrt,Yend,Yhigh,IntType,Window
 *   line 3+: one row per peak. Numbers may carry a trailing '.' (e.g. "23402.").
 * Malformed rows are skipped.
 */

export function parsePrc(text: string): PrcFile {
  const lines = text.split(/\r?\n/);
  const first = lines[0] ?? '';
  const comma = first.indexOf(',');
  const sampleId = /^\s*SAMPLE_ID\b/i.test(first) && comma >= 0 ? first.slice(comma + 1).trim() : '';

  const peaks: Peak[] = [];
  for (const raw of lines.slice(2)) {
    const peak = parseRow(raw.trim());
    if (peak) peaks.push(peak);
  }
  return { sampleId, peaks };
}

/** .prc files are ISO-8859-1; decode bytes accordingly. */
export function decodePrc(bytes: ArrayBuffer | Uint8Array): PrcFile {
  return parsePrc(new TextDecoder('iso-8859-1').decode(bytes));
}

function parseRow(line: string): Peak | null {
  if (!line) return null;
  const f = line.split(',');
  if (f.length < 14) return null;
  const n = f.map(num);
  const nums = [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  if (nums.some((i) => !Number.isFinite(n[i]))) return null;
  return {
    rt: n[0],
    ion: Math.trunc(n[1]),
    name: f[2].trim(),
    area: n[3],
    height: n[4],
    areaPercent: n[5],
    heightPercent: n[6],
    xStart: n[7],
    xEnd: n[8],
    yStart: n[9],
    yEnd: n[10],
    yHigh: n[11],
    intType: Math.trunc(n[12]),
    window: Math.trunc(n[13]),
  };
}

function num(s: string): number {
  const t = s.trim().replace(/\.$/, '');
  return t === '' ? NaN : Number(t);
}
