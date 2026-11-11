# Chromatogram viewer

View Agilent ChemStation chromatograms in the browser. Load a `.ch` (FID/detector signal) or
`.ms` (GC/MS) file and, if you have one, a `.prc` peak label file. The chromatogram is drawn
with peak labels and can be exported as SVG or PNG. Everything runs in the browser; files never
leave your machine.

**[Open the viewer](https://erleoerleo.github.io/chromatogram/)**

The code is split into reusable npm packages plus the demo site:

| Path | Package | |
| --- | --- | --- |
| `packages/core` | [`chromatogram-core`](packages/core/README.md) | Parsers, trace selection, SVG renderer, SVG/PNG export helpers. No dependencies, no framework. |
| `packages/react` | [`chromatogram-react`](packages/react/README.md) | `<Chromatogram data={…} labels={…} />` component with a ref for SVG/PNG export. |
| `apps/site` | (private) | The viewer page, built with the React component and deployed to GitHub Pages. |

Using the component in another React project:

```tsx
import { Chromatogram } from 'chromatogram-react';

<Chromatogram data="/data/synthetic-fid.ch" labels="/data/synthetic-fid.prc" timeRange={[2, 58]} />;
```

## Getting started

Requires Node.js 20 or later. This is an npm workspaces repo; run everything from the root.

```sh
npm install      # install dependencies for all workspaces
npm run dev      # build the packages, then start the site dev server (http://localhost:5173)
npm run build    # build both packages and the site (apps/site/dist)
npm run preview  # serve the production site locally
npm test         # run the core and React tests (Vitest)
npm run typecheck
```

`npm run dev` serves the packages from their `dist/` builds. After changing a package, run
`npm run build:packages` (the dev server picks up the new build).

To try the viewer without your own data, click **FID** or **MS** under *Examples*, or open
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

The format knowledge came from studying an existing Java implementation. This is an
independent TypeScript implementation.

The example and test files are synthetic: `node scripts/generate-samples.mjs` writes Gaussian
peaks into `.ch` (v81 and v179), `.ms` and `.prc` files under `packages/core/test/fixtures` and
`apps/site/public/samples`. Do not commit real sample data.

## Project layout

```
packages/core/src/parsers/   ch.ts, ms.ts, prc.ts – binary/text parsers
packages/core/src/model.ts   data types, TIC/EIC extraction, peak filtering
packages/core/src/render/    svg.ts (SVG plot builder, label layout), scale.ts (ticks, scales)
packages/core/src/plot.ts    format detection and plotChromatogram()
packages/core/src/export.ts  SVG/PNG blobs and downloads
packages/core/test/          Vitest suites; test/fixtures holds sample files
packages/react/src/          <Chromatogram> component
packages/react/test/         component tests (Testing Library + jsdom)
apps/site/                   the viewer page; public/samples has the example data
```

## Deploying to GitHub Pages

The site is plain static files. `apps/site/vite.config.ts` uses `base: './'`, so the build
works from any sub-path, such as `https://<user>.github.io/<repo>/`.

`.github/workflows/deploy.yml` tests, builds and publishes the site on every push to `main`.
Pages must be set to **Settings → Pages → Source: GitHub Actions**.

## Publishing the packages to npm

`.github/workflows/publish.yml` publishes both packages when you push a `v*` tag. It uses
`npm publish --provenance --access public` and skips versions that are already on npm.

1. Add an npm automation token from the npm account that will own `chromatogram-core` and
   `chromatogram-react` as the repository secret `NPM_TOKEN`.
2. Set the same version in `packages/core/package.json` and `packages/react/package.json`, and
   update the React package's dependency on core if needed, then run `npm install`.
3. Commit, then `git tag v0.1.0 && git push --tags`.

`npm pack --dry-run -w chromatogram-react` shows what would be published.
