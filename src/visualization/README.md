# Ski Resort Run Steepness Visualization

D3.js single-page app that compares run steepness (pitch) between two ski resorts and against aggregate statistics across all US resorts. Histograms show run count by pitch bucket, stacked by difficulty (green / blue / black / grey / orange).

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

3. Choose **Resort A** and optionally **Resort B** from the dropdowns. Use the pitch toggle (Average / Max), the “Compare against all-resorts aggregate” checkbox, and “Normalize y-axis to % of runs” as needed.

## Regenerate aggregate stats

After adding or changing resort data in `data/resorts/`, rebuild the aggregate file from the repo root:

```bash
./venv/bin/python src/exploration/compute_aggregate_stats.py
```

This overwrites `data/aggregate_stats.json`. Reload the visualization page to use the new data.

## Files

| File        | Purpose                                              |
|------------|--------------------------------------------------------|
| `index.html` | Page structure, controls, chart container, sidebar   |
| `style.css`  | Dark theme, difficulty colors, layout                  |
| `app.js`     | Data loading, D3 histogram, tooltips, insights       |

Data is loaded from the repo `data/` directory using paths relative to the page URL, so the app must be served from the repo root (as in the steps above).
