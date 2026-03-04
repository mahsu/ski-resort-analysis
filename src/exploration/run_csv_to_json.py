"""
Export US resort runs from runs.csv to per-resort JSON files.

Reads runs.csv, filters to United States and downhill runs only, groups by ski_area_names,
and writes one JSON array per resort that has more than one run under data/resorts/.
Rows without ski_area_names and resorts with only one run are excluded; geometry is omitted.
"""

import argparse
import json
import re
from pathlib import Path

import pandas as pd


OUTPUT_DIR = Path("data/resorts")
INVALID_FILENAME_CHARS = re.compile(r'[/\\:*?"<>|]')


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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "csv_path",
        nargs="?",
        default="runs.csv",
        help="Path to runs.csv (default: runs.csv)",
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

    df = pd.read_csv(csv_path)

    # US only, downhill runs only
    df = df.loc[df["countries"] == "United States"].copy()
    df = df.loc[df["uses"] == "downhill"]

    # Require non-empty ski_area_names
    df = df.loc[df["ski_area_names"].notna() & (df["ski_area_names"].str.strip() != "")]

    # Drop geometry column
    if "geometry" in df.columns:
        df = df.drop(columns=["geometry"])

    args.output_dir.mkdir(parents=True, exist_ok=True)

    # Remove existing JSON files in output dir before writing
    for existing in args.output_dir.glob("*.json"):
        existing.unlink()

    written = 0
    for resort_name, group in df.groupby("ski_area_names", sort=False):
        if len(group) <= 1:
            continue  # skip resorts with only one run
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
