"""
Export resort runs from runs.csv to per-resort JSON files.

Requires a filtered ski-areas CSV (--ski-areas). Filters runs to North America, downhill,
runs whose ski_area_ids are in the allowed set, applies malformed-run filters, then
groups by ski_area_names and writes one JSON array per resort with more than one run.
Geometry is omitted.

Runs with no ski area tag (missing or empty ski_area_ids/ski_area_names) are assigned
to a resort when their (lat, lng) falls inside that resort's bounding box (computed
from runs that do have the resort tag). This recovers runs like "The Wall" at Kirkwood
that exist in OSM at the resort but were not linked to the resort relation.
"""

import argparse
import json
import re
from pathlib import Path

import pandas as pd


OUTPUT_DIR = Path("data/resorts")
INVALID_FILENAME_CHARS = re.compile(r'[/\\:*?"<>|]')
NA_COUNTRIES = ("United States", "Canada", "Mexico")
# Buffer (degrees) added to resort bbox when assigning orphan runs by location
BBOX_BUFFER = 0.005

# Columns to omit from output JSON (still used for filtering/grouping where needed)
COLUMNS_TO_STRIP = {
    "ref",
    "localities",
    "ski_area_names",
    "oneway",
    "lit",
    "patrolled",
    "uses",
    "wikidata_id",
    "websites",
    "id",
    "lat",
    "lng",
    "ski_area_ids",
    "sources",
    "description",
}


def load_allowed_ski_area_ids(ski_areas_path: Path) -> set[str]:
    """Load set of ski area id values from filtered ski_areas CSV."""
    df = pd.read_csv(ski_areas_path)
    if "id" not in df.columns:
        raise SystemExit(f"CSV at {ski_areas_path} has no 'id' column")
    ids = set()
    for v in df["id"].dropna().astype(str):
        v = v.strip()
        if v:
            ids.add(v)
    return ids


def sanitize_filename(resort_name: str) -> str:
    """Make resort name safe for use as a filename."""
    safe = INVALID_FILENAME_CHARS.sub("_", resort_name).strip()
    return safe or "unnamed"


def records_for_json(df: pd.DataFrame) -> list[dict]:
    """Convert DataFrame to list of dicts with NaN replaced by None for JSON."""
    records = df.to_dict(orient="records")
    for r in records:
        for k, v in r.items():
            if isinstance(v, float) and pd.isna(v):
                r[k] = None
    return records


def run_has_allowed_id(row: pd.Series, allowed_ids: set[str]) -> bool:
    """True if this run's ski_area_ids contains any id in allowed_ids."""
    raw = row.get("ski_area_ids")
    if pd.isna(raw) or not str(raw).strip():
        return False
    for part in str(raw).replace(",", ";").split(";"):
        if part.strip() in allowed_ids:
            return True
    return False


def build_resort_bboxes(tagged: pd.DataFrame) -> dict[str, tuple[float, float, float, float]]:
    """From runs with a resort tag, compute (min_lat, max_lat, min_lng, max_lng) per resort, with buffer."""
    lat = pd.to_numeric(tagged["lat"], errors="coerce")
    lng = pd.to_numeric(tagged["lng"], errors="coerce")
    mask = lat.notna() & lng.notna()
    tagged = tagged.loc[mask].copy()
    tagged["_lat"] = lat.loc[mask].values
    tagged["_lng"] = lng.loc[mask].values
    agg = tagged.groupby("ski_area_names", sort=False).agg(
        min_lat=("_lat", "min"),
        max_lat=("_lat", "max"),
        min_lng=("_lng", "min"),
        max_lng=("_lng", "max"),
    )
    bboxes = {}
    for resort_name, row in agg.iterrows():
        bboxes[resort_name] = (
            row["min_lat"] - BBOX_BUFFER,
            row["max_lat"] + BBOX_BUFFER,
            row["min_lng"] - BBOX_BUFFER,
            row["max_lng"] + BBOX_BUFFER,
        )
    return bboxes


def assign_orphan_to_resort(
    lat: float, lng: float, bboxes: dict[str, tuple[float, float, float, float]]
) -> str | None:
    """If (lat, lng) lies in one or more resort bboxes, return resort with smallest bbox; else None."""
    containing = []
    for resort_name, (min_lat, max_lat, min_lng, max_lng) in bboxes.items():
        if min_lat <= lat <= max_lat and min_lng <= lng <= max_lng:
            area = (max_lat - min_lat) * (max_lng - min_lng)
            containing.append((resort_name, area))
    if not containing:
        return None
    containing.sort(key=lambda x: x[1])
    return containing[0][0]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "csv_path",
        nargs="?",
        default="data/runs.csv",
        help="Path to runs.csv (default: data/runs.csv)",
    )
    parser.add_argument(
        "--ski-areas",
        type=Path,
        default=Path("data/filtered_ski_areas.csv"),
        help="Path to filtered ski_areas CSV (default: data/filtered_ski_areas.csv); only runs for these areas are kept",
    )
    parser.add_argument(
        "-o",
        "--output-dir",
        type=Path,
        default=OUTPUT_DIR,
        help=f"Output directory for JSON files (default: {OUTPUT_DIR})",
    )
    args = parser.parse_args()

    csv_path = Path(args.csv_path)
    if not csv_path.exists():
        raise SystemExit(f"Input file not found: {csv_path}")
    if not args.ski_areas.exists():
        raise SystemExit(f"Ski areas file not found: {args.ski_areas}")

    allowed_ids = load_allowed_ski_area_ids(args.ski_areas)
    if not allowed_ids:
        raise SystemExit(f"No ski area ids found in {args.ski_areas}")

    df = pd.read_csv(csv_path)

    # North America, downhill only
    df = df.loc[df["countries"].isin(NA_COUNTRIES)].copy()
    df = df.loc[df["uses"] == "downhill"]

    # Malformed run filters (apply to all runs before splitting tagged vs orphan)
    avg_pitch = pd.to_numeric(df["average_pitch_%"], errors="coerce")
    max_pitch = pd.to_numeric(df["max_pitch_%"], errors="coerce")
    df = df.loc[avg_pitch.notna() & max_pitch.notna()]
    df = df.loc[df["name"].notna() & (df["name"].astype(str).str.strip() != "")]
    difficulty = df["difficulty"].fillna("").astype(str).str.strip().str.lower()
    df = df.loc[(difficulty != "freeride") & (difficulty != "")]

    # Normalize color for app difficulty labels. Source data (OpenSkiMap/OSM) mapping:
    # - advanced -> black (correct; app "Advanced") — no change
    # - extreme -> orange (correct; app "Extreme") — no change
    # - expert -> black in source, but app uses grey for "Expert"; remap so Expert shows data
    df = df.copy()
    df.loc[difficulty == "expert", "color"] = "grey"

    # Tagged: runs that belong to an allowed ski area and have a resort name
    has_allowed_id = df.apply(lambda row: run_has_allowed_id(row, allowed_ids), axis=1)
    has_resort_name = df["ski_area_names"].notna() & (df["ski_area_names"].astype(str).str.strip() != "")
    tagged_mask = has_allowed_id & has_resort_name
    df_tagged = df.loc[tagged_mask].copy()

    # Orphan runs (no resort tag): assign to a resort when (lat, lng) falls inside that resort's bbox
    bboxes = build_resort_bboxes(df_tagged)
    df_orphans = df.loc[~tagged_mask].copy()
    lat_n = pd.to_numeric(df_orphans["lat"], errors="coerce")
    lng_n = pd.to_numeric(df_orphans["lng"], errors="coerce")
    df_orphans = df_orphans.loc[lat_n.notna() & lng_n.notna()].copy()
    assigned = df_orphans.apply(
        lambda row: assign_orphan_to_resort(float(row["lat"]), float(row["lng"]), bboxes),
        axis=1,
    )
    df_orphans = df_orphans.loc[assigned.notna()].copy()
    df_orphans["ski_area_names"] = assigned.loc[assigned.notna()]

    # Combine tagged runs and geographically assigned orphans, then group by resort
    df = pd.concat([df_tagged, df_orphans], ignore_index=True)

    # Drop geometry column
    if "geometry" in df.columns:
        df = df.drop(columns=["geometry"])

    args.output_dir.mkdir(parents=True, exist_ok=True)
    for existing in args.output_dir.glob("*.json"):
        existing.unlink()

    written = 0
    for resort_name, group in df.groupby("ski_area_names", sort=False):
        if len(group) <= 1:
            continue
        resort_name = resort_name.strip()
        filename = sanitize_filename(resort_name) + ".json"
        out_path = args.output_dir / filename
        out_cols = [c for c in group.columns if c not in COLUMNS_TO_STRIP]
        records = records_for_json(group[out_cols])
        with open(out_path, "w") as f:
            json.dump(records, f, indent=2)
        written += 1

    print(f"Wrote {written} resort JSON files to {args.output_dir.absolute()}")


if __name__ == "__main__":
    main()
