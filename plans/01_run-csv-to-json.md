---
name: US resort runs to JSON
overview: A Python script will read runs.csv, filter to US rows and downhill runs only, group by resort (ski_area_names), and write one JSON file per resort that has more than one run—filename = sanitized resort name—each containing an array of run metadata objects.
todos: []
isProject: false
---

# US Resort Runs to JSON Script

## Data summary (from [runs.csv](runs.csv))

- **Columns**: `name`, `ref`, `countries`, `regions`, `localities`, `ski_area_names`, `difficulty`, `color`, `oneway`, `lit`, `gladed`, `patrolled`, `grooming`, `uses`, `inclined_length_m`, `descent_m`, `ascent_m`, `average_pitch_%`, `max_pitch_%`, `min_elevation_m`, `max_elevation_m`, `difficulty_convention`, `wikidata_id`, `websites`, `openskimap`, `id`, `geometry`, `lat`, `lng`, `ski_area_ids`, `sources`, `description`.
- **Filter**: `countries == "United States"` (column index 2).
- **Resort name**: `ski_area_names` (column index 5). Some US rows have empty `ski_area_names` (e.g. backcountry or unnamed areas).
- **Scale**: ~41k+ US rows; many distinct resorts.

## Behavior

1. **Read** `runs.csv` with **pandas** (`pd.read_csv`) so quoted fields and commas are handled; pandas also sets up clean filtering and groupby for later aggregation.
2. **Filter** rows where `countries == "United States"`.
3. **Filter** rows where `uses == "downhill"` (exclude nordic, backcountry, connection, etc.).
4. **Empty resort name**: Exclude rows with empty or whitespace-only `ski_area_names` altogether.
5. **Group** remaining rows by `ski_area_names` (resort name).
6. **Resorts with one run**: Exclude resorts that have only one run (do not write a JSON file for them).
7. **Output directory**: `data/resorts` (script creates it if missing).
8. **Filenames**: Sanitize resort name for the filesystem:

- Replace characters invalid in filenames (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`) with `_` (or use a slug: lowercase, spaces → `-`, strip/simplify).
- Append `.json`.
- If two resorts sanitize to the same name (e.g. different punctuation), either merge their runs into one array or make names unique (e.g. append `ski_area_ids` or index).

1. **JSON content**: Each file is a single JSON array. Each element is an object with **run metadata**:

- Include all CSV columns that describe the run (name, ref, difficulty, color, lengths, elevations, lat, lng, etc.) **except** `geometry`.

1. **Numeric fields**: Parse numeric columns (e.g. `inclined_length_m`, `descent_m`, `lat`, `lng`) as numbers in JSON where possible; leave empty as `null` or omit.

## Implementation sketch

- **Dependencies**: **pandas** (for read, filter, groupby; supports future aggregation); standard library for `json`, `re`/`unicodedata` (filename sanitization), `pathlib`.
- **Flow**:
  - `df = pd.read_csv(csv_path)`.
  - Filter: `df["countries"] == "United States"` and `df["uses"] == "downhill"`; drop rows where `ski_area_names` is null or whitespace.
  - Drop `geometry` column from df.
  - Group by `ski_area_names`. For each group, skip if `len(group) <= 1` (resort has only one run).
  - For each remaining resort: sanitize resort_name → filename; convert group to records (NaN → null); write JSON to `data/resorts/<resort>.json`.
- **Edge cases**:
  - Collisions after sanitization → merge runs into one file (same logical resort).
  - pandas may read some numerics as float; use sensible JSON serialization (e.g. replace NaN with null).

## Deliverable

- Script at **[src/exploration/run_csv_to_json.py](src/exploration/run_csv_to_json.py)** that uses **pandas** to read, filter (US + `uses == "downhill"` only), and group; writes one JSON file per US resort with **more than one run** under **`data/resorts/`** (create directory if needed); excludes rows without `ski_area_names` and excludes `geometry` from each run object.
- **requirements.txt** at project root with `pandas` (pinned version optional) so future aggregation work can rely on the same dependency.

## Setup and run (virtualenv)

Use a project virtualenv so dependencies are not installed globally:

```bash
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
python src/exploration/run_csv_to_json.py runs.csv
```

Output is written to `data/resorts/`.
