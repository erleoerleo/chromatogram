# chromatogram-core

Framework-free TypeScript for Agilent ChemStation chromatograms: parsers for `.ch`
(FID/detector) and `.ms` (GC/MS) files and `.prc` peak label files, plus a renderer that turns
them into a labelled SVG plot. No dependencies. Parsing and SVG rendering work in browsers and
Node; PNG export and downloads need a browser.

For React, use [`chromatogram-react`](https://www.npmjs.com/package/chromatogram-react).

```sh
npm install chromatogram-core
```

## Usage

```ts
import { decodePrc, parseDataFile, plotChromatogram } from 'chromatogram-core';

const data = new Uint8Array(await (await fetch('/data/synthetic-fid.ch')).arrayBuffer());
const labels = new Uint8Array(await (await fetch('/data/synthetic-fid.prc')).arrayBuffer());

const plot = plotChromatogram(parseDataFile(data, 'synthetic-fid.ch'), decodePrc(labels), {
  timeStart: 5,
  timeEnd: 105,
  fileName: 'synthetic-fid.ch',
});

document.querySelector('#plot')!.innerHTML = plot.svg;
console.log(plot.peaks.length, plot.warnings);
```

For an `.ms` file, choose ions with `ions: [191]` or `ions: '191+217'`. Without ions you get
the total ion chromatogram.

In Node:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { parseDataFile, plotChromatogram } from 'chromatogram-core';

const plot = plotChromatogram(parseDataFile(readFileSync('synthetic.ms')), null, { ions: '191' });
writeFileSync('synthetic-191.svg', plot.svg);
```

### Export (browser)

```ts
import { downloadBlob, safeFileName, svgToBlob, svgToPngBlob } from 'chromatogram-core';

downloadBlob(svgToBlob(plot.svg), `${safeFileName(file.sampleId)}.svg`);
downloadBlob(await svgToPngBlob(plot.svg, { scale: 2, background: '#fff' }), 'plot.png');
```

`svgToPngBlob` reduces the scale for very large images to stay within browser canvas limits.

## API

| Export | |
| --- | --- |
| `parseDataFile(bytes, fileName?)` | Parses `.ch` or `.ms`. Uses the extension if given, otherwise the header. |
| `parseCh(bytes)`, `parseMs(bytes)` | Format-specific parsers. |
| `decodePrc(bytes)`, `parsePrc(text)` | `.prc` label files (ISO-8859-1 bytes or decoded text). |
| `plotChromatogram(file, labels?, request?)` | Selects the trace, filters labels and renders. Returns `{ svg, trace, peaks, warnings }`. |
| `selectTrace(file, ions?)` | The `Chromatogram` to plot: the `.ch` signal, an ion sum or the TIC. |
| `renderSvg(chromatogram, peaks, options?)` | Low-level renderer. See `PlotOptions` and `DEFAULT_OPTIONS`. |
| `totalIonChromatogram`, `sumIons`, `parseIonList`, `filterPeaks` | Building blocks. |
| `svgToBlob`, `svgToPngBlob`, `downloadBlob`, `safeFileName` | Export helpers. |

Every parser accepts an `ArrayBuffer` or `Uint8Array` (including a Node `Buffer`) and throws an
`Error` with a readable message when the file isn't valid.

## Supported formats

| File | Details |
| --- | --- |
| `.ch` | Versions 81 and 179 are checked against real files. Versions 8, 30, 130 and 181 are decoded from the format description; `ChFile.unverified` is `true` for them and `plotChromatogram` adds a warning. |
| `.ms` | ChemStation MSD files, version 2 (full scan or SIM). |
| `.prc` | ChemStation peak exports: a `SAMPLE_ID` line, a header line, then one comma-separated row per peak. |

## License

MIT
