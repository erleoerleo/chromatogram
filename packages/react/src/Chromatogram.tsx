import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  decodePrc,
  downloadBlob,
  parseDataFile,
  plotChromatogram,
  safeFileName,
  svgToBlob,
  svgToPngBlob,
  type ChromatogramPlot,
  type DataFile,
  type PlotOptions,
  type PlotRequest,
  type PngOptions,
  type PrcFile,
} from '@erleoerleo/chromatogram-core';

/** File contents (ArrayBuffer, Uint8Array, Blob/File) or a URL to fetch them from. */
export type FileSource = ArrayBuffer | Uint8Array | Blob | string | URL;

export interface ChromatogramProps extends Partial<PlotOptions> {
  /** The `.ch` or `.ms` file. Nothing is rendered while this is null/undefined. */
  data: FileSource | null | undefined;
  /** Optional `.prc` peak label file. */
  labels?: FileSource | null;
  /**
   * File name of `data`, used to pick the parser and in the default subtitle. Inferred from
   * `File.name` or the URL; the format is detected from the file header when there is none.
   */
  dataFileName?: string;
  /** `.ms` only: ions to plot, e.g. `[191]`, `"191+217"`. Empty/undefined = total ion chromatogram. */
  ions?: number[] | string;
  /** Convenience for `[timeStart, timeEnd]` in minutes; null = start/end of the run. */
  timeRange?: readonly [number | null, number | null];
  /** Passed to `fetch` when `data`/`labels` are URLs. */
  fetchInit?: RequestInit;
  /** Scale the SVG to the container width (default true). Exports always use the `width`/`height` size. */
  responsive?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Shown while files are loading. Default: nothing. */
  loading?: ReactNode;
  /** Rendered when loading or parsing fails. Default: a short `role="alert"` message. */
  renderError?: (error: Error) => ReactNode;
  onError?: (error: Error) => void;
  /** Called after every successful render with the parsed files, SVG and warnings. */
  onRender?: (result: ChromatogramResult) => void;
}

export interface ChromatogramResult extends ChromatogramPlot {
  data: DataFile;
  labels: PrcFile | null;
  dataFileName: string | undefined;
}

export interface ChromatogramHandle {
  /** The current plot, or null if nothing is rendered. */
  getResult(): ChromatogramResult | null;
  /** The current plot as a standalone SVG string. */
  getSvg(): string | null;
  toSvgBlob(): Blob | null;
  /** Rasterised PNG; default 2× scale on white. */
  toPngBlob(options?: PngOptions): Promise<Blob | null>;
  /** Downloads `<fileName>.svg` (default: title or sample ID). Returns false if nothing is rendered. */
  exportSvg(fileName?: string): boolean;
  /** Downloads `<fileName>.png`. Resolves false if nothing is rendered. */
  exportPng(fileName?: string, options?: PngOptions): Promise<boolean>;
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: DataFile; labels: PrcFile | null; dataFileName: string | undefined }
  | { status: 'error'; error: Error };

export const Chromatogram = forwardRef<ChromatogramHandle, ChromatogramProps>(function Chromatogram(props, ref) {
  const {
    data,
    labels,
    dataFileName,
    ions,
    timeRange,
    fetchInit,
    responsive = true,
    className,
    style,
    loading,
    renderError = defaultError,
    onError,
    onRender,
    ...options
  } = props;

  const [load, setLoad] = useState<LoadState>({ status: 'idle' });
  const fetchInitRef = useRef(fetchInit);
  fetchInitRef.current = fetchInit;

  useEffect(() => {
    if (data == null) {
      setLoad({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    const init = { ...fetchInitRef.current, signal: controller.signal };
    setLoad({ status: 'loading' });
    (async () => {
      const [dataBytes, labelBytes] = await Promise.all([readSource(data, init), labels ? readSource(labels, init) : null]);
      const name = dataFileName ?? sourceName(data);
      const file = parseDataFile(dataBytes, name);
      const prc = labelBytes ? decodePrc(labelBytes) : null;
      return { status: 'ready', data: file, labels: prc, dataFileName: name } as const;
    })().then(
      (next) => !controller.signal.aborted && setLoad(next),
      (e: unknown) => !controller.signal.aborted && setLoad({ status: 'error', error: toError(e) }),
    );
    return () => controller.abort();
  }, [data, labels, dataFileName]);

  // Re-render only when an option value actually changes, not on every new props object.
  const request: PlotRequest = { ...options, ions };
  if (timeRange) {
    request.timeStart = timeRange[0];
    request.timeEnd = timeRange[1];
  }
  const requestKey = JSON.stringify(request);

  const plotted = useMemo((): { result: ChromatogramResult } | { error: Error } | null => {
    if (load.status !== 'ready') return null;
    try {
      const plot = plotChromatogram(load.data, load.labels, { ...request, fileName: load.dataFileName });
      return { result: { ...plot, data: load.data, labels: load.labels, dataFileName: load.dataFileName } };
    } catch (e) {
      return { error: toError(e) };
    }
  }, [load, requestKey]);

  const result = plotted && 'result' in plotted ? plotted.result : null;
  const error = load.status === 'error' ? load.error : plotted && 'error' in plotted ? plotted.error : null;

  const onRenderRef = useRef(onRender);
  const onErrorRef = useRef(onError);
  onRenderRef.current = onRender;
  onErrorRef.current = onError;
  useEffect(() => {
    if (result) onRenderRef.current?.(result);
  }, [result]);
  useEffect(() => {
    if (error) onErrorRef.current?.(error);
  }, [error]);

  const resultRef = useRef(result);
  resultRef.current = result;
  useImperativeHandle(
    ref,
    () => {
      const svg = () => resultRef.current?.svg ?? null;
      const stem = (fileName?: string) => {
        const r = resultRef.current;
        const fallback = r ? (r.dataFileName?.replace(/\.[^.]+$/, '') ?? '') : '';
        return safeFileName(fileName ?? (props.title || r?.data.sampleId || fallback));
      };
      return {
        getResult: () => resultRef.current,
        getSvg: svg,
        toSvgBlob: () => {
          const s = svg();
          return s ? svgToBlob(s) : null;
        },
        toPngBlob: async (opts) => {
          const s = svg();
          return s ? svgToPngBlob(s, opts) : null;
        },
        exportSvg: (fileName) => {
          const s = svg();
          if (!s) return false;
          downloadBlob(svgToBlob(s), `${stem(fileName)}.svg`);
          return true;
        },
        exportPng: async (fileName, opts) => {
          const s = svg();
          if (!s) return false;
          downloadBlob(await svgToPngBlob(s, opts), `${stem(fileName)}.png`);
          return true;
        },
      };
    },
    [props.title],
  );

  // Inline SVGs share one id namespace per document, so give each instance its own clip id.
  const uid = 'chromatogram-' + useId().replace(/[^\w-]/g, '');
  const html = useMemo(() => {
    if (!result) return '';
    let s = result.svg.replaceAll('plot-area', `${uid}-plot-area`);
    if (responsive) s = s.replace('<svg ', '<svg style="display:block;width:100%;height:auto" ');
    return s;
  }, [result, uid, responsive]);

  const status = error ? 'error' : result ? 'ready' : load.status;
  return (
    <div className={className} style={style} data-status={status}>
      {error ? renderError(error) : result ? <div dangerouslySetInnerHTML={{ __html: html }} /> : status === 'loading' ? loading : null}
    </div>
  );
});

function defaultError(error: Error): ReactNode {
  return <div role="alert">Could not load chromatogram: {error.message}</div>;
}

async function readSource(source: FileSource, init: RequestInit): Promise<ArrayBuffer | Uint8Array> {
  if (source instanceof ArrayBuffer || source instanceof Uint8Array) return source;
  if (typeof Blob !== 'undefined' && source instanceof Blob) return source.arrayBuffer();
  const url = String(source);
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.arrayBuffer();
}

function sourceName(source: FileSource): string | undefined {
  if (typeof File !== 'undefined' && source instanceof File) return source.name;
  if (typeof source === 'string' || source instanceof URL) {
    const path = String(source).split(/[?#]/)[0];
    const last = decodeURIComponent(path.split('/').pop() ?? '');
    return last || undefined;
  }
  return undefined;
}

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}
