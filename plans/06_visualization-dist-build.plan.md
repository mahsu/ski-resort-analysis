# Node build: bundle, minify, and generated config

## Goals

- **Node.js build script** instead of Python.
- **Minify and combine** all visualization JS into one file (esbuild).
- **Minify** `index.html`, `style.css`, and **JSON data** in the build output (strip unnecessary whitespace/comments; dist contains minified HTML, CSS, JS, and data).
- **Generated config module** for `DATA_BASE`: no in-file substitution; dev uses a checked-in config, build injects the dist config into the bundle.

## Current setup (unchanged for dev)

- **App**: [src/visualization/](src/visualization/) — `index.html`, `style.css`, `app.js` (entry), `chart.js`, `data.js`, `ui.js`, `constants.js`. ES modules; D3 is global (loaded via script tag in HTML).
- **Data**: [data/aggregate_stats.json](data/aggregate_stats.json) and [data/resorts/](data/resorts/) `*.json`.
- **Paths**: [data.js](src/visualization/data.js) currently has `const DATA_BASE = "../../data/"`; this will move to a config module.

## Target layout

- **dist/** after build: minified **index.html**, minified **style.css**, **app.js** (single minified bundle), **data/** (minified `aggregate_stats.json` and `resorts/*.json`). No separate `chart.js`, `data.js`, etc.
- Deploy by copying the **contents** of `dist/` into your target subfolder (e.g. `ski/`).

## Implementation

### 1. Config module (dev + build)

- **Add** [src/visualization/config.js](src/visualization/config.js) (checked in) with `export const DATA_BASE = "../../data/";`
- **Change** [src/visualization/data.js](src/visualization/data.js): remove `const DATA_BASE = "../../data/";` and add `import { DATA_BASE } from "./config.js";`
- **Build**: Temp dir with copied JS and overwritten `config.js` with `export const DATA_BASE = "data/";`, then esbuild bundle from that dir.

### 2. Node build script and esbuild

- **Add** [package.json](package.json) at repo root: `"type": "module"`, devDependency `esbuild`, script `"build:viz": "node scripts/build-visualization-dist.js"`.
- **Add** [scripts/build-visualization-dist.js](scripts/build-visualization-dist.js) that:
  1. Creates `dist/` and `dist/data/resorts/`.
  2. Minify and write JSON data to `dist/data/`.
  3. Minify and write CSS to `dist/style.css`.
  4. Temp dir: copy viz JS, write dist `config.js`, esbuild bundle to `dist/app.js` (minified, ESM).
  5. Minify HTML (script already points to `app.js`; no substitution needed), write to `dist/index.html`.

### 3. Minified HTML, CSS, and JSON in dist

- **index.html**: Same structure (D3 + `app.js`), minified.
- **style.css**: Minified (strip comments, collapse whitespace).
- **JSON data**: Minified via `JSON.stringify(JSON.parse(content))`.

### 4. Docs

- Update [src/visualization/README.md](src/visualization/README.md): add "Deploy / dist build" — run `npm run build:viz`, copy contents of `dist/` to target subfolder.

## Files to add/change

| Action | File |
| ------ | ---- |
| Create | [package.json](package.json) — `build:viz` script, devDependency `esbuild`. |
| Create | [scripts/build-visualization-dist.js](scripts/build-visualization-dist.js) — Node script: dist dirs, minify JSON + CSS + HTML, temp dir + config, esbuild bundle. |
| Create | [src/visualization/config.js](src/visualization/config.js) — `export const DATA_BASE = "../../data/";` for dev. |
| Update | [src/visualization/data.js](src/visualization/data.js) — import DATA_BASE from config.js, remove hardcoded value. |
| Update | [src/visualization/README.md](src/visualization/README.md) — Deploy / dist build section. |

## Summary

- **Node script** uses **esbuild** for minified `dist/app.js`; minifies **index.html**, **style.css**, and **JSON data**; **generated config** supplies `DATA_BASE = "data/"` in the bundle (dev uses checked-in `config.js` with `"../../data/"`). No script-tag substitution: both dev and dist use `app.js`.
- Dist layout: minified index.html, style.css, app.js, minified data/. Deploy by copying **contents** of `dist/` into your target subfolder.
