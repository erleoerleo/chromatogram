/** Rounds range / desiredTicks up to 1, 2, 5 or 10 × a power of ten. */
export function niceStep(range: number, desiredTicks: number): number {
  if (!(range > 0) || !Number.isFinite(range)) return 1;
  const raw = range / desiredTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / magnitude;
  const nice = r > 5 ? 10 : r > 2 ? 5 : r > 1 ? 2 : 1;
  return nice * magnitude;
}

/** Multiples of step inside [min, max]. */
export function ticks(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  const first = Math.ceil(min / step - 1e-9) * step;
  for (let v = first; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

/** Formats a tick value with just enough decimals for the step. */
export function formatTick(value: number, step: number): string {
  return value.toFixed(countDecimals(step));
}

/** Power-of-1000 factor used to shorten large axis values (e.g. 1e6 for 9 600 000). */
export function axisFactor(maxAbs: number): number {
  if (!(maxAbs >= 1e5) || !Number.isFinite(maxAbs)) return 1;
  return Math.pow(10, 3 * Math.floor(Math.log10(maxAbs) / 3));
}

function countDecimals(step: number): number {
  if (step >= 1) return 0;
  return Math.min(10, Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)));
}

export interface LinearScale {
  (v: number): number;
  invert(px: number): number;
  domain: [number, number];
  range: [number, number];
}

export function linearScale(d0: number, d1: number, r0: number, r1: number): LinearScale {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const f = ((v: number) => r0 + (v - d0) * k) as LinearScale;
  f.invert = (px: number) => (k === 0 ? d0 : d0 + (px - r0) / k);
  f.domain = [d0, d1];
  f.range = [r0, r1];
  return f;
}
