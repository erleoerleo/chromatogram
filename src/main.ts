import './style.css';
import type { ChFile, Chromatogram, MsFile, PrcFile } from './model';
import { filterPeaks, parseIonList, sumIons, totalIonChromatogram } from './model';
import { parseCh } from './parsers/ch';
import { parseMs } from './parsers/ms';
import { decodePrc } from './parsers/prc';
import { DEFAULT_OPTIONS, renderSvg, type PlotOptions } from './render/svg';

interface State {
  data: ChFile | MsFile | null;
  dataName: string;
  prc: PrcFile | null;
  prcName: string;
  /** Title auto-filled from the sample ID until the user edits it. */
  titleEdited: boolean;
  svg: string;
}

const state: State = { data: null, dataName: '', prc: null, prcName: '', titleEdited: false, svg: '' };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = {
  dataFile: $<HTMLInputElement>('data-file'),
  prcFile: $<HTMLInputElement>('prc-file'),
  clearPrc: $<HTMLButtonElement>('clear-prc'),
  tStart: $<HTMLInputElement>('t-start'),
  tEnd: $<HTMLInputElement>('t-end'),
  resetWindow: $<HTMLButtonElement>('reset-window'),
  ions: $<HTMLInputElement>('ions'),
  ionsField: $<HTMLLabelElement>('ions-field'),
  title: $<HTMLInputElement>('title'),
  showLabels: $<HTMLInputElement>('show-labels'),
  showRt: $<HTMLInputElement>('show-rt'),
  showBaselines: $<HTMLInputElement>('show-baselines'),
  showGrid: $<HTMLInputElement>('show-grid'),
  fontSize: $<HTMLInputElement>('font-size'),
  lineWidth: $<HTMLInputElement>('line-width'),
  width: $<HTMLInputElement>('width'),
  height: $<HTMLInputElement>('height'),
  exportBtn: $<HTMLButtonElement>('export'),
  plot: $<HTMLDivElement>('plot'),
  messages: $<HTMLDivElement>('messages'),
  meta: $<HTMLDListElement>('meta'),
};

const EXAMPLES: Record<string, { data: string; prc: string; start: number; end: number; ions: string }> = {
  fid: { data: 'fid1a.ch', prc: 'fid1a.prc', start: 5, end: 105, ions: '' },
  ms: { data: 'data.ms', prc: 'data.prc', start: 40, end: 110, ions: '191' },
};

// ── Loading ────────────────────────────────────────────────────────────────────

function loadData(name: string, bytes: ArrayBuffer): void {
  const ext = extension(name);
  try {
    if (ext === 'ch') state.data = parseCh(bytes);
    else if (ext === 'ms') state.data = parseMs(bytes);
    else throw new Error(`Unsupported file type '.${ext}' (expected .ch or .ms)`);
  } catch (e) {
    state.data = null;
    state.dataName = '';
    render();
    showMessages([{ kind: 'error', text: `Could not read ${name}: ${(e as Error).message}` }]);
    return;
  }
  state.dataName = name;
  if (!state.titleEdited) el.title.value = state.data.sampleId;
  el.ionsField.hidden = state.data.kind !== 'ms';
  render();
}

function loadPrc(name: string, bytes: ArrayBuffer): void {
  try {
    state.prc = decodePrc(bytes);
    state.prcName = name;
  } catch (e) {
    state.prc = null;
    state.prcName = '';
    render();
    showMessages([{ kind: 'error', text: `Could not read ${name}: ${(e as Error).message}` }]);
    return;
  }
  render();
}

async function loadFiles(files: Iterable<File>): Promise<void> {
  const list = [...files];
  // Load the data file first so the label file is matched against it.
  list.sort((a, b) => Number(extension(a.name) === 'prc') - Number(extension(b.name) === 'prc'));
  for (const f of list) {
    const bytes = await f.arrayBuffer();
    if (extension(f.name) === 'prc') loadPrc(f.name, bytes);
    else loadData(f.name, bytes);
  }
}

async function loadExample(key: string): Promise<void> {
  const ex = EXAMPLES[key];
  const base = import.meta.env.BASE_URL;
  try {
    const [data, prc] = await Promise.all(
      [ex.data, ex.prc].map(async (f) => {
        const res = await fetch(`${base}samples/${f}`);
        if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
        return res.arrayBuffer();
      }),
    );
    el.tStart.value = String(ex.start);
    el.tEnd.value = String(ex.end);
    el.ions.value = ex.ions;
    state.titleEdited = false;
    state.prc = null;
    loadData(ex.data, data);
    loadPrc(ex.prc, prc);
  } catch (e) {
    showMessages([{ kind: 'error', text: `Could not load example: ${(e as Error).message}` }]);
  }
}

// ── Rendering ──────────────────────────────────────────────────────────────────

function currentTrace(): { chrom: Chromatogram; ions: number[]; label: string } | null {
  const data = state.data;
  if (!data) return null;
  if (data.kind === 'ch') return { chrom: data, ions: [], label: data.instrument ? `Detector: ${data.instrument}` : '' };
  const ions = parseIonList(el.ions.value);
  return ions.length
    ? { chrom: sumIons(data, ions), ions, label: `Ion Mass: ${ions.join(', ')}` }
    : { chrom: totalIonChromatogram(data), ions, label: 'Total Ion Chromatogram' };
}

function readOptions(trace: { chrom: Chromatogram; label: string }): PlotOptions {
  const subtitle = [trace.chrom.date, state.dataName, trace.label].filter(Boolean).join('  ·  ');
  return {
    timeStart: numberOrNull(el.tStart.value),
    timeEnd: numberOrNull(el.tEnd.value),
    showLabels: el.showLabels.checked,
    showRetentionTimes: el.showRt.checked,
    showBaselines: el.showBaselines.checked,
    showGrid: el.showGrid.checked,
    labelFontSize: clamp(numberOrNull(el.fontSize.value) ?? DEFAULT_OPTIONS.labelFontSize, 4, 60),
    lineWidth: clamp(numberOrNull(el.lineWidth.value) ?? DEFAULT_OPTIONS.lineWidth, 0.1, 20),
    width: clamp(numberOrNull(el.width.value) ?? DEFAULT_OPTIONS.width, 300, 8000),
    height: clamp(numberOrNull(el.height.value) ?? DEFAULT_OPTIONS.height, 200, 8000),
    title: el.title.value.trim(),
    subtitle,
  };
}

function render(): void {
  const trace = currentTrace();
  el.exportBtn.disabled = !trace;
  if (!trace) {
    state.svg = '';
    el.plot.className = 'empty';
    el.plot.textContent = 'No chromatogram loaded.';
    el.meta.replaceChildren();
    return;
  }

  const peaks = state.prc ? filterPeaks(state.prc.peaks, trace.ions) : [];
  state.svg = renderSvg(trace.chrom, peaks, readOptions(trace));
  el.plot.className = '';
  el.plot.innerHTML = state.svg;

  const messages: Message[] = [];
  const data = state.data!;
  if (data.kind === 'ch' && data.unverified) {
    messages.push({
      kind: 'warn',
      text: `.ch version ${data.version} is decoded from the format description but has not been checked against a real file — verify the trace looks right.`,
    });
  }
  if (state.prc && state.prc.sampleId && data.sampleId && norm(state.prc.sampleId) !== norm(data.sampleId)) {
    messages.push({
      kind: 'warn',
      text: `Label file sample "${state.prc.sampleId}" differs from data file sample "${data.sampleId}".`,
    });
  }
  showMessages(messages);

  const t = trace.chrom.times;
  const n = t.length;
  setMeta([
    ['Data file', state.dataName + (data.kind === 'ch' ? ` (v${data.version})` : ` (${data.scans.length} scans)`)],
    ['Sample', data.sampleId],
    ['Date', data.date],
    ['Operator', data.operator],
    ['Instrument', data.instrument],
    ['Method', data.kind === 'ch' ? data.method : ''],
    ['Run', n ? `${t[0].toFixed(2)} – ${t[n - 1].toFixed(2)} min, ${n.toLocaleString()} points` : 'empty'],
    ['Labels', state.prc ? `${state.prcName}: ${peaks.length} of ${state.prc.peaks.length} peaks used` : 'none'],
  ]);
}

function exportSvg(): void {
  if (!state.svg) return;
  const base = (el.title.value.trim() || state.dataName.replace(/\.[^.]+$/, '') || 'chromatogram')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${state.svg}\n`], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${base || 'chromatogram'}.svg`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── UI helpers ─────────────────────────────────────────────────────────────────

interface Message {
  kind: 'error' | 'warn';
  text: string;
}

function showMessages(messages: Message[]): void {
  el.messages.replaceChildren(
    ...messages.map((m) => {
      const div = document.createElement('div');
      div.className = m.kind;
      div.textContent = m.text;
      return div;
    }),
  );
}

function setMeta(rows: [string, string][]): void {
  el.meta.replaceChildren(
    ...rows
      .filter(([, v]) => v)
      .flatMap(([k, v]) => {
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = v;
        return [dt, dd];
      }),
  );
}

function extension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function numberOrNull(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

// ── Wiring ─────────────────────────────────────────────────────────────────────

el.ionsField.hidden = true;

el.dataFile.addEventListener('change', () => {
  if (el.dataFile.files?.length) void loadFiles(el.dataFile.files);
  el.dataFile.value = '';
});
el.prcFile.addEventListener('change', () => {
  if (el.prcFile.files?.length) void loadFiles(el.prcFile.files);
  el.prcFile.value = '';
});
el.clearPrc.addEventListener('click', () => {
  state.prc = null;
  state.prcName = '';
  render();
});
el.resetWindow.addEventListener('click', () => {
  el.tStart.value = '';
  el.tEnd.value = '';
  render();
});
el.title.addEventListener('input', () => {
  state.titleEdited = true;
});
for (const input of [
  el.tStart, el.tEnd, el.ions, el.title, el.showLabels, el.showRt, el.showBaselines,
  el.showGrid, el.fontSize, el.lineWidth, el.width, el.height,
]) {
  input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', render);
}
el.exportBtn.addEventListener('click', exportSvg);
document.querySelectorAll<HTMLButtonElement>('[data-example]').forEach((b) =>
  b.addEventListener('click', () => void loadExample(b.dataset.example!)),
);

// Deep link: ?example=fid or ?example=ms loads a bundled example on start.
const initialExample = new URLSearchParams(location.search).get('example');
if (initialExample && initialExample in EXAMPLES) void loadExample(initialExample);

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  document.body.classList.add('dragging');
});
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    document.body.classList.remove('dragging');
  }
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  if (e.dataTransfer?.files.length) void loadFiles(e.dataTransfer.files);
});
