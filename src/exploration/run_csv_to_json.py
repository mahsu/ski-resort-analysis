"""
Export resort runs from runs.csv to per-resort JSON files.

Requires a filtered ski-areas CSV (--ski-areas). Filters runs to North America, downhill,
runs whose ski_area_ids are in the allowed set, applies malformed-run filters, then
groups by ski_area_names and writes one JSON array per resort with more than one run.
Geometry is omitted.
"""

import argparse
import json
import re
from pathlib import Path

import pandas as pd


OUTPUT_DIR = Path("data/resorts")
INVALID_FILENAME_CHARS = re.compile(r'[/\\:*?"<>|]')
NA_COUNTRIES = ("United States", "Canada", "Mexico")


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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "csv_path",
        nargs="?",
        default="runs.csv",
        help="Path to runs.csv (default: runs.csv)",
    )
    parser.add_argument(
        "--ski-areas",
        type=Path,
        required=True,
        help="Path to filtered ski_areas CSV (required); only runs for these areas are kept",
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

    # Only runs belonging to allowed ski areas
    df = df.loc[df.apply(lambda row: run_has_allowed_id(row, allowed_ids), axis=1)]

    # Require non-empty ski_area_names
    df = df.loc[df["ski_area_names"].notna() & (df["ski_area_names"].str.strip() != "")]

    # Malformed run filters
    avg_pitch = pd.to_numeric(df["average_pitch_%"], errors="coerce")
    max_pitch = pd.to_numeric(df["max_pitch_%"], errors="coerce")
    df = df.loc[
        avg_pitch.notna() & max_pitch.notna() & (avg_pitch <= 1) & (max_pitch <= 1)
    ]
    df = df.loc[df["name"].notna() & (df["name"].astype(str).str.strip() != "")]
    difficulty = df["difficulty"].fillna("").astype(str).str.strip().str.lower()
    df = df.loc[difficulty != "freeride"]

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
        records = records_for_json(group)
        with open(out_path, "w") as f:
            json.dump(records, f, indent=2)
        written += 1

    print(f"Wrote {written} resort JSON files to {args.output_dir.absolute()}")


if __name__ == "__main__":
    main()
