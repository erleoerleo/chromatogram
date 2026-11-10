import type { ChFile } from '../model';
import { pascalString, toBytes, viewOf, widePascalString } from './binary';

/*
 * Agilent ChemStation signal files (.ch).
 *
 * The version (Pascal string at offset 0) selects a header layout and a signal encoding:
 *
 *   version  layout  data @  encoding              verified
 *   8        legacy  0x400   double-delta int16    no
 *   30       legacy  0x400   delta int16           no
 *   81       legacy  0x400   double-delta int16    yes
 *   130      modern  0x1800  delta int16           no
 *   179      modern  0x1800  raw float64 LE        yes
 *   181      modern  0x1800  double-delta int16    no
 *
 * Run window: big-endian float32 milliseconds at 0x11A / 0x11E (samples evenly spaced).
 * Signal multiplier: big-endian float64 (0x284 legacy, 0x127C modern).
 * Delta streams are big-endian int16; 0x7FFF means "absolute reset": the next 6 bytes are
 * int16 high word + uint32 low word, which replace the running value (and reset the slope).
 */

type Encoding = 'delta' | 'double-delta' | 'float64le';

interface Layout {
  dataOffset: number;
  sampleId: number;
  operator: number;
  date: number;
  instrument: number;
  method: number;
  multiplier: number;
  wide: boolean;
}

const LEGACY: Layout = {
  dataOffset: 0x400,
  sampleId: 0x18,
  operator: 0x94,
  date: 0xb2,
  instrument: 0xd0,
  method: 0xe4,
  multiplier: 0x284,
  wide: false,
};

const MODERN: Layout = {
  dataOffset: 0x1800,
  sampleId: 0x35a,
  operator: 0x758,
  date: 0x957,
  instrument: 0x9bc,
  method: 0xa0e,
  multiplier: 0x127c,
  wide: true,
};

const VERSIONS: Record<string, { layout: Layout; encoding: Encoding; verified: boolean }> = {
  '8': { layout: LEGACY, encoding: 'double-delta', verified: false },
  '30': { layout: LEGACY, encoding: 'delta', verified: false },
  '81': { layout: LEGACY, encoding: 'double-delta', verified: true },
  '130': { layout: MODERN, encoding: 'delta', verified: false },
  '179': { layout: MODERN, encoding: 'float64le', verified: true },
  '181': { layout: MODERN, encoding: 'double-delta', verified: false },
};

const START_TIME_OFF = 0x11a;
const END_TIME_OFF = 0x11e;
const RESET = 0x7fff;
const HIGH_WORD = 4294967296;

export function parseCh(input: ArrayBuffer | Uint8Array): ChFile {
  const bytes = toBytes(input);
  const version = pascalString(bytes, 0);
  const spec = VERSIONS[version];
  if (!spec) {
    throw new Error(
      `Unsupported .ch version '${version}' (supported: ${Object.keys(VERSIONS).join(', ')})`,
    );
  }
  const { layout, encoding } = spec;
  const minimum = layout.dataOffset + (encoding === 'float64le' ? 8 : 2);
  if (bytes.length < minimum) {
    throw new Error(`File too short for a v${version} .ch file (${bytes.length} bytes, need ${minimum})`);
  }

  const view = viewOf(bytes);
  const counts =
    encoding === 'float64le'
      ? decodeFloat64Le(view, layout.dataOffset)
      : decodeDelta(view, layout.dataOffset, encoding === 'double-delta');

  const multiplier = view.getFloat64(layout.multiplier, false);
  if (multiplier !== 0 && Number.isFinite(multiplier)) {
    for (let i = 0; i < counts.length; i++) counts[i] *= multiplier;
  }

  const str = (off: number) => (layout.wide ? widePascalString(bytes, off) : pascalString(bytes, off));

  return {
    kind: 'ch',
    version,
    unverified: !spec.verified,
    sampleId: str(layout.sampleId),
    operator: str(layout.operator),
    date: str(layout.date),
    instrument: str(layout.instrument),
    method: str(layout.method),
    times: buildTimes(view, counts.length),
    signal: counts,
  };
}

function decodeDelta(view: DataView, offset: number, doubleDelta: boolean): Float64Array {
  const end = view.byteLength;
  const out = new Float64Array(Math.max(0, (end - offset) >> 1));
  let count = 0;
  let value = 0;
  let slope = 0;
  let pos = offset;
  while (pos + 2 <= end) {
    const raw = view.getInt16(pos, false);
    pos += 2;
    if (raw !== RESET) {
      if (doubleDelta) {
        slope += raw;
        value += slope;
      } else {
        value += raw;
      }
    } else {
      if (pos + 6 > end) break;
      value = view.getInt16(pos, false) * HIGH_WORD + view.getUint32(pos + 2, false);
      slope = 0;
      pos += 6;
    }
    out[count++] = value;
  }
  return out.slice(0, count);
}

function decodeFloat64Le(view: DataView, offset: number): Float64Array {
  const n = Math.floor((view.byteLength - offset) / 8);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = view.getFloat64(offset + i * 8, true);
  return out;
}

function buildTimes(view: DataView, n: number): Float64Array {
  const startMs = view.getFloat32(START_TIME_OFF, false);
  const endMs = view.getFloat32(END_TIME_OFF, false);
  const step = n > 1 ? (endMs - startMs) / (n - 1) : 0;
  const times = new Float64Array(n);
  for (let i = 0; i < n; i++) times[i] = (startMs + i * step) / 60000;
  return times;
}
