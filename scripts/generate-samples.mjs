#!/usr/bin/env node
// Writes synthetic ChemStation sample files (no real data) for tests and the demo site.
// Deterministic: the same script always produces the same bytes.
//
//   node scripts/generate-samples.mjs
//
// Outputs (packages/core/test/fixtures and apps/site/public/samples):
//   synthetic-fid.ch       .ch v81  (legacy header, double-delta int16), 0–60 min at 5 Hz
//   synthetic-fid.prc      labels for synthetic-fid.ch (ion 0)
//   synthetic-fid-v179.ch  .ch v179 (modern header, float64 LE), 0–45 min at 5 Hz   (fixtures only)
//   synthetic.ms           .ms v2, 10–90 min, 1 scan/s, 8 ions incl. m/z 191 and 217
//   synthetic-ms.prc       labels for synthetic.ms (ions 191 and 217)

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(root, 'packages/core/test/fixtures');
const SAMPLES = join(root, 'apps/site/public/samples');

function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(next() || 1e-12)) * Math.cos(2 * Math.PI * next());
  return { next, gauss };
}

const gaussian = (t, rt, height, sigma) => height * Math.exp(-0.5 * ((t - rt) / sigma) ** 2);

function range(start, end, step) {
  const n = Math.round((end - start) / step) + 1;
  return Array.from({ length: n }, (_, i) => start + i * step);
}

// ---------------------------------------------------------------- FID

function fidPeaks(runEnd, seed) {
  const r = rng(seed);
  const named = [];
  for (let n = 6; n <= 30; n++) {
    named.push({ name: `nC${n}`, rt: 3 + (n - 6) * 2.3, height: 15 + 140 * Math.exp(-((n - 13) ** 2) / 60) });
  }
  named.push(
    { name: 'Benzene', rt: 3.9, height: 35 },
    { name: 'Toluene', rt: 6.4, height: 60 },
    { name: 'm-Xylene', rt: 9.1, height: 45 },
    { name: 'ISTD', rt: 11.7, height: 150 },
    { name: 'Pristane', rt: 3 + 11 * 2.3 + 0.45, height: 70 },
    { name: 'Phytane', rt: 3 + 12 * 2.3 + 0.5, height: 40 },
  );
  const minor = [];
  for (let i = 0; i < 60; i++) minor.push({ name: '', rt: 2.5 + r.next() * 55, height: 2 + r.next() * 18 });
  return [...named, ...minor]
    .filter((p) => p.rt < runEnd - 0.5)
    .map((p) => ({ ...p, sigma: 0.022 + 0.0006 * p.rt }))
    .sort((a, b) => a.rt - b.rt);
}

const fidBase = (t) => 2 + 0.03 * t;

function fidSignal(times, peaks, seed) {
  const r = rng(seed);
  return times.map((t) => {
    let v = fidBase(t) + gaussian(t, 1.4, 900, 0.12) + 0.04 * r.gauss();
    for (const p of peaks) if (Math.abs(t - p.rt) < 8 * p.sigma) v += gaussian(t, p.rt, p.height, p.sigma);
    return v;
  });
}

// ---------------------------------------------------------------- binary helpers

function pascal(buf, off, s) {
  buf[off] = s.length;
  for (let i = 0; i < s.length; i++) buf[off + 1 + i] = s.charCodeAt(i);
}

function widePascal(buf, off, s) {
  buf[off] = s.length;
  for (let i = 0; i < s.length; i++) {
    buf[off + 1 + i * 2] = s.charCodeAt(i) & 0xff;
    buf[off + 2 + i * 2] = s.charCodeAt(i) >> 8;
  }
}

function writeRunWindow(view, times) {
  view.setFloat32(0x11a, times[0] * 60000, false);
  view.setFloat32(0x11e, times[times.length - 1] * 60000, false);
}

// .ch v81: legacy header, data at 0x400, big-endian double-delta int16 with 0x7FFF resets.
function chV81(meta, times, signal, multiplier) {
  const counts = signal.map((v) => Math.round(v / multiplier));
  const words = [];
  let value = 0;
  let slope = 0;
  counts.forEach((c, i) => {
    const raw = c - value - slope;
    // Absolute reset at the start, every 4096 samples and whenever the delta overflows int16.
    if (i % 4096 === 0 || raw < -32768 || raw >= 0x7fff) {
      words.push(0x7fff, Math.floor(c / 4294967296) & 0xffff, (c >>> 16) & 0xffff, c & 0xffff);
      value = c;
      slope = 0;
    } else {
      words.push(raw & 0xffff);
      slope += raw;
      value += slope;
    }
  });
  const buf = new Uint8Array(0x400 + words.length * 2);
  const view = new DataView(buf.buffer);
  pascal(buf, 0, '81');
  pascal(buf, 0x18, meta.sampleId);
  pascal(buf, 0x94, meta.operator);
  pascal(buf, 0xb2, meta.date);
  pascal(buf, 0xd0, meta.instrument);
  pascal(buf, 0xe4, meta.method);
  writeRunWindow(view, times);
  view.setFloat64(0x284, multiplier, false);
  words.forEach((w, i) => view.setUint16(0x400 + i * 2, w, false));
  return buf;
}

// .ch v179: modern header with UTF-16 strings, data at 0x1800, float64 little-endian.
function chV179(meta, times, signal) {
  const buf = new Uint8Array(0x1800 + signal.length * 8);
  const view = new DataView(buf.buffer);
  pascal(buf, 0, '179');
  widePascal(buf, 0x35a, meta.sampleId);
  widePascal(buf, 0x758, meta.operator);
  widePascal(buf, 0x957, meta.date);
  widePascal(buf, 0x9bc, meta.instrument);
  widePascal(buf, 0xa0e, meta.method);
  writeRunWindow(view, times);
  view.setFloat64(0x127c, 1, false);
  signal.forEach((v, i) => view.setFloat64(0x1800 + i * 8, v, true));
  return buf;
}

// ---------------------------------------------------------------- .prc

function prc(sampleId, rows) {
  const lines = [
    `SAMPLE_ID , ${sampleId}`,
    'Ret.,Ion,Peakname,Area,Height,Area_c,Hght_c,Xstrt,Xend,Ystrt,Yend,Yhigh,IntType,Window',
  ];
  const totalArea = rows.reduce((s, p) => s + p.area, 0);
  const totalHeight = rows.reduce((s, p) => s + p.height, 0);
  for (const p of rows) {
    lines.push(
      [
        p.rt.toFixed(3),
        p.ion,
        p.name,
        Math.round(p.area),
        Math.round(p.height),
        ((100 * p.area) / totalArea).toFixed(3),
        ((100 * p.height) / totalHeight).toFixed(3),
        (p.rt - 4 * p.sigma).toFixed(3),
        (p.rt + 4 * p.sigma).toFixed(3),
        `${Math.round(p.yStart)}.`,
        `${Math.round(p.yEnd)}.`,
        Math.round(p.yHigh),
        1,
        0,
      ].join(','),
    );
  }
  return new TextEncoder().encode(lines.join('\r\n') + '\r\n');
}

function peakRow(p, ion, baseAt) {
  return {
    rt: p.rt,
    ion,
    name: p.name,
    sigma: p.sigma,
    height: p.height,
    area: p.height * p.sigma * Math.sqrt(2 * Math.PI) * 60,
    yStart: baseAt(p.rt - 4 * p.sigma),
    yEnd: baseAt(p.rt + 4 * p.sigma),
    yHigh: baseAt(p.rt) + p.height,
  };
}

// ---------------------------------------------------------------- .ms

const MS_IONS = [57, 71, 85, 105, 191, 217, 218, 231];
const FRAGMENTS = {
  57: { 57: 1, 71: 0.6, 85: 0.35 },
  191: { 191: 1, 105: 0.15 },
  217: { 217: 1, 218: 0.45, 231: 0.05 },
};
const msBase = (ion, t) => 40 + (ion % 7) * 5 + 0.6 * t;

function msPeaks() {
  const hopaneHeights = [1800, 1500, 4200, 6000, 2600, 2100, 1700, 1300, 900, 700];
  const hopanes = ['Ts', 'Tm', 'H29', 'H30', 'H31S', 'H31R', 'H32S', 'H32R', 'H33S', 'H33R'].map((name, i) => ({
    name,
    ion: 191,
    rt: 62 + i * 1.6 + (i % 2 ? 0.3 : 0),
    height: hopaneHeights[i],
  }));
  const steraneHeights = [1100, 800, 2200, 1700, 2500, 2000];
  const steranes = ['D27S', 'D27R', 'S27', 'S28', 'S29S', 'S29R'].map((name, i) => ({
    name,
    ion: 217,
    rt: 52 + i * 1.9,
    height: steraneHeights[i],
  }));
  const alkanes = [];
  for (let n = 12; n <= 35; n++) {
    alkanes.push({ name: `nC${n}`, ion: 57, rt: 14 + (n - 12) * 3.1, height: 9000 * Math.exp(-((n - 20) ** 2) / 90) + 800 });
  }
  return [...hopanes, ...steranes, ...alkanes].map((p) => ({ ...p, sigma: 0.05 }));
}

function ms(meta) {
  const r = rng(1234);
  const peaks = msPeaks();
  const times = range(10, 90, 1 / 60);
  const recordBytes = 14 + MS_IONS.length * 4;
  const dataStart = 0x200;
  const buf = new Uint8Array(dataStart + times.length * recordBytes);
  const view = new DataView(buf.buffer);
  pascal(buf, 0, '2');
  pascal(buf, 0x18, meta.sampleId);
  pascal(buf, 0x94, meta.operator);
  pascal(buf, 0xb2, meta.date);
  pascal(buf, 0xd0, meta.instrument);
  view.setUint32(0x108, dataStart / 2 + 1, false);
  view.setUint16(0x118, times.length, false);
  times.forEach((t, s) => {
    const pos = dataStart + s * recordBytes;
    view.setUint16(pos, recordBytes / 2, false);
    view.setUint32(pos + 2, Math.round(t * 60000), false);
    view.setUint16(pos + 12, MS_IONS.length, false);
    MS_IONS.forEach((ion, k) => {
      let v = msBase(ion, t) + 4 * r.gauss();
      for (const p of peaks) {
        const f = FRAGMENTS[p.ion][ion];
        if (f && Math.abs(t - p.rt) < 8 * p.sigma) v += f * gaussian(t, p.rt, p.height, p.sigma);
      }
      view.setUint16(pos + 14 + k * 4, ion * 20, false);
      view.setUint16(pos + 16 + k * 4, Math.max(0, Math.min(65535, Math.round(v))), false);
    });
  });
  const labels = peaks
    .filter((p) => p.ion !== 57)
    .map((p) => peakRow(p, p.ion, (x) => msBase(p.ion, x)))
    .sort((a, b) => a.rt - b.rt);
  return { data: buf, labels: prc(meta.sampleId, labels) };
}

// ---------------------------------------------------------------- write

const fidMeta = {
  sampleId: 'SYNTHETIC-FID-1',
  operator: 'synthetic',
  date: '01 Jan 2024  10:00:00',
  instrument: 'Synthetic GC',
  method: 'SYNTH.M',
};
const fidTimes = range(0, 60, 0.2 / 60);
const fid = fidPeaks(60, 7);
const fidCh = chV81(fidMeta, fidTimes, fidSignal(fidTimes, fid, 11), 0.01);
const fidPrc = prc(fidMeta.sampleId, fid.filter((p) => p.name).map((p) => peakRow(p, 0, fidBase)));

const v179Meta = { ...fidMeta, sampleId: 'SYNTHETIC-FID-2', method: 'SYNTH179.M' };
const v179Times = range(0, 45, 0.2 / 60);
const v179 = chV179(v179Meta, v179Times, fidSignal(v179Times, fidPeaks(45, 8), 12).map((v) => v * 1000));

const msOut = ms({ sampleId: 'SYNTHETIC-MS-1', operator: 'synthetic', date: '02 Jan 2024  11:00:00', instrument: 'MSD' });

const outputs = [
  ['synthetic-fid.ch', fidCh, true],
  ['synthetic-fid.prc', fidPrc, true],
  ['synthetic-fid-v179.ch', v179, false],
  ['synthetic.ms', msOut.data, true],
  ['synthetic-ms.prc', msOut.labels, true],
];
mkdirSync(FIXTURES, { recursive: true });
mkdirSync(SAMPLES, { recursive: true });
for (const [name, bytes, site] of outputs) {
  writeFileSync(join(FIXTURES, name), bytes);
  if (site) writeFileSync(join(SAMPLES, name), bytes);
  console.log(`${name.padEnd(24)} ${bytes.length} bytes${site ? ' (+ site)' : ''}`);
}
