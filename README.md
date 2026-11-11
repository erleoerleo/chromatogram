# Chromatogram viewer

A static web page for viewing Agilent ChemStation chromatograms. Load a `.ch` (FID/detector
signal) or `.ms` (GC/MS) file and, if you have one, a `.prc` peak label file. The page draws the
chromatogram with peak labels. **Export SVG** downloads the plot as a vector image, and
**Export PNG** downloads it as a raster image.

Everything runs in the browser (TypeScript + Vite). There is no backend, and files never
leave your machine.

## Getting started

Requires Node.js 20 or later.

```sh
npm install      # install dependencies
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # type-check and build the static site into dist/
npm run preview  # serve the production build locally
npm test         # run the unit tests (Vitest)
```

To try it without your own data, click **FID** or **MS** under *Examples*, or open
`/?example=fid` or `/?example=ms`.

## Using the viewer

| Control | Effect |
| --- | --- |
| Data file | `.ch` or `.ms`. You can also drag and drop files onto the page. |
| Label file | Optional `.prc`. FID plots use ion 0 peaks. MS plots use peaks whose ion matches the selected m/z. If nothing matches, every peak is shown. |
| From / To | Time window in minutes. Leave both blank (or click **Full run**) to show the whole run. |
| Ions | Only for `.ms` files. Leave blank for the total ion chromatogram (TIC). `191` gives an extracted ion chromatogram. `191+217` sums several ions (±0.5 m/z). |
| Display | Title, peak labels, retention time in the labels, peak baselines, grid, label size, line width, and output size in pixels. |
| Export SVG | Downloads exactly what is on screen as a standalone SVG. Text stays as real `<text>` elements. |
| Export PNG | Rasterises the same SVG at 2× the output size (e.g. 2400×1500 for 1200×750) on a white background. Very large outputs are scaled down to stay within browser canvas limits. |

Peak labels are rotated and rise from the highest plotted point inside each peak's integration
window. Labels that would overlap a neighbouring label or cut through a taller nearby peak are
lifted. The y-axis is extended so that every label fits.

## Supported formats

| File | Details |
| --- | --- |
| `.ch` | ChemStation signal files, versions 81 and 179 (checked against real files). Versions 8, 30, 130 and 181 are decoded from the format description but have no sample file, so the page shows a warning when you open one. |
| `.ms` | ChemStation MSD files, version 2. These contain full-scan or SIM data. |
| `.prc` | ChemStation peak/label exports. These are comma-separated text: a `SAMPLE_ID` line, a header line, then one row per peak. |

The format knowledge came from studying an existing Java implementation. This is
an independent TypeScript implementation.

## Project layout

```
src/parsers/   ch.ts, ms.ts, prc.ts – binary/text parsers
src/model.ts   data types, TIC/EIC extraction, peak filtering
src/render/    svg.ts (SVG plot builder, label layout), scale.ts (ticks, scales)
src/main.ts    page wiring
public/samples example data used by the Examples buttons
tests/         Vitest suites; tests/fixtures holds sample files
```

## Deploying to GitHub Pages

The build is a plain static site. `vite.config.ts` uses `base: './'`, so `dist/` works from any
sub-path, such as `https://<user>.github.io/<repo>/`.

`.github/workflows/deploy.yml` builds and publishes the site on every push to `main`. To turn it
on, go to the repository's **Settings → Pages → Source** and select **GitHub Actions**.
