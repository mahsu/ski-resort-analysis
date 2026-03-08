# Ski Resort Run Steepness Visualization

D3.js single-page app that compares run steepness (pitch) between two ski resorts and against aggregate statistics across all tracked resorts. Histograms show run count by pitch bucket, stacked by difficulty level.

## What you need

- A local web server (browsers block `file://` requests for JSON).
- Data: `data/aggregate_stats.json` and `data/resorts/*.json` (see below).

## Run the app

1. From the **repository root** (not from `src/visualization/`), start a server, for example:

   ```bash
   python3 -m http.server 8765
   ```

2. Open in a browser:

   ```
   http://localhost:8765/src/visualization/index.html
   ```

3. Use the controls to explore:
   - **Resort A / Resort B** — typeahead comboboxes; select one or both resorts.
   - **Pitch metric** toggle — Average or Max pitch per run.
   - **Chart style** toggle — Stacked Bars or Smooth Lines.
   - **All-resorts aggregate** checkbox — overlay the aggregate histogram.
   - **Normalize to % of runs** checkbox — switch the y-axis from run count to percentage.

   Current selections (resorts, metric, chart style, aggregate toggle) are persisted in the URL so the view can be bookmarked or shared.

## Sidebar panels

**Stats** — For each selected resort: median pitch, % of runs ≥ 40% pitch, and run counts by difficulty level.

**Insights** — Up to 4 auto-generated cards contextual to the current selection:

- _1 resort:_ percentile rank vs all tracked resorts (most extreme difficulty level), beginner-to-advanced pitch spread, and national distribution band (vs p25/p50/p75).
- _2 resorts:_ combined intermediate/advanced steepness comparison and difficulty-range variety comparison.
- _0 resorts:_ fallback prompt.

## Regenerate aggregate stats

After adding or changing resort data in `data/resorts/`, rebuild the aggregate file from the repo root:

```bash
./venv/bin/python src/data_pipeline/compute_aggregate_stats.py
```

This overwrites `data/aggregate_stats.json`. Reload the visualization page to use the new data.

## Files

| File           | Purpose                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `index.html`   | Page structure, controls, chart container, sidebar                       |
| `style.css`    | Dark theme, difficulty colors, layout                                    |
| `app.js`       | App init, state management, URL param sync, event wiring                 |
| `chart.js`     | D3 histogram and smooth-lines chart, tooltips                            |
| `data.js`      | Data loading, pitch binning, resort combobox setup                       |
| `ui.js`        | Legend, stat cards, insights panel rendering                             |
| `constants.js` | Shared constants: bin width, pitch range, colors, labels                 |
| `config.js`    | Data base path for fetch (dev: `../../data/`; build overwrites for dist) |

Data is loaded from the repo `data/` directory using paths relative to the page URL, so the app must be served from the repo root (as in the steps above).

## Deploy / dist build

To build a minified bundle for deployment (e.g. to a subfolder on another site):

1. From the repository root, run:

   ```bash
   npm run build:viz
   ```

2. Copy the **contents** of `dist/` (not the `dist` folder itself) into your target subfolder (e.g. `ski/`). You should get `index.html`, `style.css`, `app.js`, and `data/` at the root of that subfolder.

3. The built app uses `DATA_BASE = "data/"` so fetch paths resolve correctly when served from the subfolder. No server config is required beyond serving static files.

### Umami (optional)

To inject the Umami analytics script into the built `index.html`, use **one** of:

- **Config file** (gitignored): Create `config/deploy.json` and set `"umamiWebsiteId": "your-website-id"`. The build reads this and injects the Umami script when present.
- **Environment variable**: Set `UMAMI_WEBSITE_ID=your-website-id` when running the build (e.g. in CI). Env overrides the config file.

If neither is set, the build completes with no analytics snippet (dev-friendly). The website ID is never hardcoded in source.
