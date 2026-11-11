import type { MsFile, MsScan } from '../model.js';
import { pascalString, toBytes, viewOf } from './binary.js';

/*
 * Agilent ChemStation MSD files (.ms), version "2". All integers are big-endian.
 *
 *   0x0000  Pascal  version "2"
 *   0x0018  Pascal  sample name
 *   0x0094  Pascal  operator
 *   0x00B2  Pascal  date/time
 *   0x00D0  Pascal  instrument
 *   0x0108  uint32  word offset of the first scan's RT field → record starts at (v - 1) * 2
 *   0x0118  uint16  number of scans
 *
 * Scan record: uint16 size in words, uint32 RT (1/60000 min), 3 × uint16, uint16 ion count,
 * then ion count × (uint16 m/z × 20, uint16 abundance).
 */

export function parseMs(input: ArrayBuffer | Uint8Array): MsFile {
  const bytes = toBytes(input);
  if (bytes.length < 0x120) throw new Error('File too short to be a valid .ms file');

  const version = pascalString(bytes, 0);
  if (version !== '2') throw new Error(`Unsupported .ms version '${version}' (expected '2')`);

  const view = viewOf(bytes);
  const totalScans = view.getUint16(0x118, false);
  let pos = (view.getUint32(0x108, false) - 1) * 2;

  const scans: MsScan[] = [];
  for (let s = 0; s < totalScans; s++) {
    if (pos < 0 || pos + 14 > bytes.length) break;
    const sizeWords = view.getUint16(pos, false);
    if (sizeWords === 0) break;

    const rt = view.getUint32(pos + 2, false) / 60000;
    const numIons = view.getUint16(pos + 12, false);

    // Duplicate m/z readings: sum genuinely different readings, but an exact
    // (m/z, abundance) repeat is an acquisition artefact and counted once.
    const ions = new Map<number, number>();
    let ionPos = pos + 14;
    for (let i = 0; i < numIons && ionPos + 4 <= bytes.length; i++, ionPos += 4) {
      const mz = view.getUint16(ionPos, false) / 20;
      const abundance = view.getUint16(ionPos + 2, false);
      const existing = ions.get(mz);
      ions.set(mz, existing === undefined || existing === abundance ? abundance : existing + abundance);
    }

    scans.push({
      rt,
      mz: Float64Array.from(ions.keys()),
      abundance: Float64Array.from(ions.values()),
    });
    pos += sizeWords * 2;
  }

  return {
    kind: 'ms',
    sampleId: pascalString(bytes, 0x18),
    operator: pascalString(bytes, 0x94),
    date: pascalString(bytes, 0xb2),
    instrument: pascalString(bytes, 0xd0),
    scans,
  };
}
