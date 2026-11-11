# @erleoerleo/chromatogram-react

A React component that draws Agilent ChemStation chromatograms (`.ch` FID/detector files and
`.ms` GC/MS files) with peak labels from a `.prc` file, and exports the plot as SVG or PNG.
Parsing and rendering happen in the browser; nothing is uploaded.

[Live demo](https://erleoerleo.github.io/chromatogram/) · built on
[`@erleoerleo/chromatogram-core`](https://www.npmjs.com/package/@erleoerleo/chromatogram-core)

```sh
npm install @erleoerleo/chromatogram-react
```

Requires React 18 or later. The package is ESM with TypeScript types and works in Vite,
Next.js and other modern bundlers without extra configuration.

## Usage

Pass the files as URLs, `File`/`Blob` objects (for example from an `<input type="file">`),
or `ArrayBuffer`/`Uint8Array` bytes:

```tsx
import { Chromatogram } from '@erleoerleo/chromatogram-react';

export function Sample() {
  return <Chromatogram data="/data/fid1a.ch" labels="/data/fid1a.prc" timeRange={[5, 105]} />;
}
```

In a Vite app you can import the files as asset URLs:

```tsx
import dataUrl from './samples/data.ms?url';
import labelsUrl from './samples/data.prc?url';

<Chromatogram data={dataUrl} labels={labelsUrl} ions="191" />;
```

The SVG scales to the width of its container. Wrap it in an element with the size you want.

### Exporting SVG and PNG

Use a ref to export what is currently shown:

```tsx
import { useRef } from 'react';
import { Chromatogram, type ChromatogramHandle } from '@erleoerleo/chromatogram-react';

export function Viewer({ file }: { file: File }) {
  const plot = useRef<ChromatogramHandle>(null);
  return (
    <>
      <button onClick={() => plot.current?.exportSvg()}>Download SVG</button>
      <button onClick={() => plot.current?.exportPng()}>Download PNG</button>
      <Chromatogram ref={plot} data={file} />
    </>
  );
}
```

| Method | Returns |
| --- | --- |
| `exportSvg(fileName?)` | Downloads `<fileName>.svg`. The default name comes from the title or sample ID. Returns `false` if nothing is rendered yet. |
| `exportPng(fileName?, { scale, background }?)` | Downloads `<fileName>.png`, by default at 2× size on white. Resolves `false` if nothing is rendered yet. |
| `toSvgBlob()` / `toPngBlob(options?)` | The image as a `Blob` (or `null`), for uploading or custom handling. |
| `getSvg()` | The SVG markup as a string. |
| `getResult()` | Parsed files, plotted trace, peaks used, warnings and SVG. |

### Loading and errors

Files load asynchronously. While loading, the component shows `loading` (nothing by default).
If a file can't be fetched or parsed, it calls `onError` and shows `renderError(error)` (a short
`role="alert"` message by default). After each successful render, `onRender` receives the
`ChromatogramResult`, including `warnings` such as a label file that belongs to another sample.

```tsx
<Chromatogram
  data={url}
  loading={<Spinner />}
  renderError={(e) => <p className="error">{e.message}</p>}
  onRender={(r) => console.log(r.data.sampleId, r.peaks.length, r.warnings)}
/>
```

The wrapper `<div>` has `data-status="idle" | "loading" | "ready" | "error"` for styling.

## Props

| Prop | Type | Default | |
| --- | --- | --- | --- |
| `data` | `ArrayBuffer \| Uint8Array \| Blob \| string \| URL \| null` | — | `.ch` or `.ms` file. |
| `labels` | same, optional | — | `.prc` peak label file. |
| `dataFileName` | `string` | from `File.name`/URL | Picks the parser and appears in the subtitle. Without one, the format is detected from the header. |
| `ions` | `number[] \| string` | TIC | `.ms` only. `[191]`, `"191"` or `"191+217"` (summed, ±0.5 m/z). |
| `timeRange` | `[number \| null, number \| null]` | whole run | Minutes. Same as `timeStart`/`timeEnd`. |
| `title` / `subtitle` | `string` | sample ID / date · file · trace | Pass `""` to hide. |
| `showLabels` | `boolean` | `true` | Peak labels. |
| `showRetentionTimes` | `boolean` | `false` | Adds the retention time to each label. |
| `showBaselines` | `boolean` | `false` | Draws each peak's integration baseline. |
| `showGrid` | `boolean` | `true` | |
| `labelFontSize` | `number` | `11` | px. |
| `lineWidth` | `number` | `1` | |
| `width` / `height` | `number` | `1200` / `750` | SVG size and export size. |
| `responsive` | `boolean` | `true` | Scale the on-screen SVG to the container width. |
| `fetchInit` | `RequestInit` | — | Passed to `fetch` for URL sources (headers, credentials). |
| `className` / `style` | | | Applied to the wrapper `<div>`. |
| `loading`, `renderError`, `onError`, `onRender` | | | See above. |

Files are re-read when `data`, `labels` or `dataFileName` change identity. If you build
`Uint8Array`s during render, wrap them in `useMemo`. Changing plot options only re-renders the
SVG.

## Labels

FID plots use the `.prc` peaks with ion 0. MS plots use the peaks whose ion matches the plotted
m/z. If no peak matches, all peaks are drawn. Labels sit above the highest point of each peak
and are lifted to avoid each other; the y-axis grows to fit them.

## License

MIT
