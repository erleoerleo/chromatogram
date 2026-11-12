import { StrictMode, useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Chromatogram,
  type ChromatogramHandle,
  type ChromatogramResult,
  type FileSource,
} from 'chromatogram-react';
import './style.css';

const EXAMPLES: Record<string, { data: string; prc: string; start: number; end: number; ions: string }> = {
  fid: { data: 'synthetic-fid.ch', prc: 'synthetic-fid.prc', start: 2, end: 58, ions: '' },
  ms: { data: 'synthetic.ms', prc: 'synthetic-ms.prc', start: 45, end: 90, ions: '191' },
};

interface Source {
  source: FileSource;
  name: string;
}

function App() {
  const [data, setData] = useState<Source | null>(null);
  const [labels, setLabels] = useState<Source | null>(null);
  const [tStart, setTStart] = useState('');
  const [tEnd, setTEnd] = useState('');
  const [ions, setIons] = useState('');
  const [title, setTitle] = useState<string | null>(null); // null = use the sample ID
  const [showLabels, setShowLabels] = useState(true);
  const [stackLabels, setStackLabels] = useState(false);
  const [showRt, setShowRt] = useState(false);
  const [showBaselines, setShowBaselines] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [fontSize, setFontSize] = useState('11');
  const [lineWidth, setLineWidth] = useState('1');
  const [width, setWidth] = useState('1200');
  const [height, setHeight] = useState('750');
  const [result, setResult] = useState<ChromatogramResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const plot = useRef<ChromatogramHandle>(null);

  function openFiles(files: Iterable<File>) {
    for (const f of files) {
      const source = { source: f, name: f.name };
      if (extension(f.name) === 'prc') setLabels(source);
      else if (['ch', 'ms'].includes(extension(f.name))) {
        setData(source);
        setResult(null);
      } else setError(`Unsupported file type: ${f.name} (expected .ch, .ms or .prc)`);
    }
  }

  function loadExample(key: string) {
    const ex = EXAMPLES[key];
    const base = `${import.meta.env.BASE_URL}samples/`;
    setTStart(String(ex.start));
    setTEnd(String(ex.end));
    setIons(ex.ions);
    setTitle(null);
    setResult(null);
    setData({ source: base + ex.data, name: ex.data });
    setLabels({ source: base + ex.prc, name: ex.prc });
  }

  useEffect(() => {
    // Deep link: ?example=fid or ?example=ms loads a bundled example on start.
    const initial = new URLSearchParams(location.search).get('example');
    if (initial && initial in EXAMPLES) loadExample(initial);
  }, []);

  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => {
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const leave = () => {
      if (--depth <= 0) {
        depth = 0;
        setDragging(false);
      }
    };
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (e.dataTransfer?.files.length) openFiles(e.dataTransfer.files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  const isMs = result?.data.kind === 'ms' || (!result && data?.name.toLowerCase().endsWith('.ms'));

  async function exportPng() {
    try {
      await plot.current?.exportPng();
    } catch (e) {
      setError(`Could not export PNG: ${(e as Error).message}`);
    }
  }

  const messages = [...(error ? [{ kind: 'error', text: error }] : []), ...(result?.warnings ?? []).map((text) => ({ kind: 'warn', text }))];

  return (
    <>
      <header>
        <h1>Chromatogram viewer</h1>
        <p className="hint">
          Open an Agilent <code>.ch</code> or <code>.ms</code> file and, optionally, a <code>.prc</code> label file.
          Everything runs in your browser; files are never uploaded.
        </p>
      </header>

      <main>
        <aside id="controls">
          <section>
            <h2>Files</h2>
            <FileInput label="Data file (.ch / .ms)" accept=".ch,.ms,.CH,.MS" onFiles={openFiles} />
            <FileInput label="Label file (.prc, optional)" accept=".prc,.PRC" onFiles={openFiles} />
            <button type="button" className="link" onClick={() => setLabels(null)}>
              Remove labels
            </button>
            <p className="hint">Or drop files anywhere on the page.</p>
            <div className="examples">
              Examples:
              <button type="button" onClick={() => loadExample('fid')}>FID (.ch + .prc)</button>
              <button type="button" onClick={() => loadExample('ms')}>MS (.ms + .prc)</button>
            </div>
          </section>

          <section>
            <h2>Window</h2>
            <div className="row">
              <Field label="From (min)"><input type="number" step="any" value={tStart} onChange={(e) => setTStart(e.target.value)} /></Field>
              <Field label="To (min)"><input type="number" step="any" value={tEnd} onChange={(e) => setTEnd(e.target.value)} /></Field>
            </div>
            <button type="button" className="link" onClick={() => { setTStart(''); setTEnd(''); }}>
              Full run
            </button>
            {isMs && (
              <Field label="Ions (m/z, blank = TIC)">
                <input type="text" placeholder="e.g. 191 or 191+217" value={ions} onChange={(e) => setIons(e.target.value)} />
              </Field>
            )}
          </section>

          <section>
            <h2>Display</h2>
            <Field label="Title">
              <input type="text" value={title ?? result?.data.sampleId ?? ''} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Check label="Peak labels" checked={showLabels} onChange={setShowLabels} />
            <Check label="Stack overlapping labels" checked={stackLabels} onChange={setStackLabels} />
            <Check label="Retention time in labels" checked={showRt} onChange={setShowRt} />
            <Check label="Peak baselines" checked={showBaselines} onChange={setShowBaselines} />
            <Check label="Grid" checked={showGrid} onChange={setShowGrid} />
            <div className="row">
              <Field label="Label size"><input type="number" min="6" max="40" step="1" value={fontSize} onChange={(e) => setFontSize(e.target.value)} /></Field>
              <Field label="Line width"><input type="number" min="0.2" max="10" step="0.1" value={lineWidth} onChange={(e) => setLineWidth(e.target.value)} /></Field>
            </div>
            <div className="row">
              <Field label="Width (px)"><input type="number" min="300" max="6000" step="10" value={width} onChange={(e) => setWidth(e.target.value)} /></Field>
              <Field label="Height (px)"><input type="number" min="200" max="6000" step="10" value={height} onChange={(e) => setHeight(e.target.value)} /></Field>
            </div>
          </section>

          <div className="export-buttons">
            <button type="button" className="primary" disabled={!result} onClick={() => plot.current?.exportSvg()}>
              Export SVG
            </button>
            <button type="button" className="primary" disabled={!result} onClick={() => void exportPng()}>
              Export PNG
            </button>
          </div>
        </aside>

        <section id="viewer">
          <div id="messages" role="status">
            {messages.map((m, i) => (
              <div key={i} className={m.kind}>{m.text}</div>
            ))}
          </div>
          <div id="plot" className={data ? (dragging ? 'dragging' : '') : `empty${dragging ? ' dragging' : ''}`}>
            {data ? (
              <Chromatogram
                ref={plot}
                data={data.source}
                dataFileName={data.name}
                labels={labels?.source}
                ions={ions}
                timeRange={[numberOrNull(tStart), numberOrNull(tEnd)]}
                title={title ?? undefined}
                showLabels={showLabels}
                labelLayout={stackLabels ? 'stacked' : 'apex'}
                showRetentionTimes={showRt}
                showBaselines={showBaselines}
                showGrid={showGrid}
                labelFontSize={clamp(numberOrNull(fontSize) ?? 11, 4, 60)}
                lineWidth={clamp(numberOrNull(lineWidth) ?? 1, 0.1, 20)}
                width={clamp(numberOrNull(width) ?? 1200, 300, 8000)}
                height={clamp(numberOrNull(height) ?? 750, 200, 8000)}
                loading={<p className="hint">Loading…</p>}
                renderError={(e) => <p className="hint">Could not read {data.name}: {e.message}</p>}
                onRender={(r) => {
                  setResult(r);
                  setError(null);
                }}
                onError={(e) => {
                  setResult(null);
                  setError(`Could not read ${data.name}${labels ? ` or ${labels.name}` : ''}: ${e.message}`);
                }}
              />
            ) : (
              'No chromatogram loaded.'
            )}
          </div>
          {result && <Meta result={result} labelsName={labels?.name} />}
        </section>
      </main>
    </>
  );
}

function Meta({ result, labelsName }: { result: ChromatogramResult; labelsName?: string }) {
  const { data, labels, trace, peaks } = result;
  const t = trace.chrom.times;
  const n = t.length;
  const rows: [string, string][] = [
    ['Data file', (result.dataFileName ?? '') + (data.kind === 'ch' ? ` (v${data.version})` : ` (${data.scans.length} scans)`)],
    ['Sample', data.sampleId],
    ['Date', data.date],
    ['Operator', data.operator],
    ['Instrument', data.instrument],
    ['Method', data.kind === 'ch' ? data.method : ''],
    ['Run', n ? `${t[0].toFixed(2)} – ${t[n - 1].toFixed(2)} min, ${n.toLocaleString()} points` : 'empty'],
    ['Labels', labels ? `${labelsName}: ${peaks.length} of ${labels.peaks.length} peaks used` : 'none'],
  ];
  return (
    <dl id="meta">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => [<dt key={`${k}-t`}>{k}</dt>, <dd key={`${k}-d`}>{v}</dd>])}
    </dl>
  );
}

function FileInput({ label, accept, onFiles }: { label: string; accept: string; onFiles: (files: File[]) => void }) {
  return (
    <label className="file">
      {label}
      <input
        type="file"
        accept={accept}
        onChange={(e) => {
          if (e.target.files?.length) onFiles([...e.target.files]);
          e.target.value = '';
        }}
      />
    </label>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      {label} {children}
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
