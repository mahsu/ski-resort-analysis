"""
Filter ski_areas.csv to North America, operating, downhill areas with required numerics.

Reads ski_areas.csv, applies: countries in (US, Canada, Mexico), status=operating,
has_downhill=yes, non-empty name, and numeric thresholds (vertical_m >= 50, lift_count >= 1,
downhill_distance_km > 0). Rows with missing or invalid vertical_m, lift_count, or
downhill_distance_km are dropped. Writes filtered rows to data/filtered_ski_areas.csv.
"""

import argparse
import csv
from pathlib import Path


NA_COUNTRIES = ("United States", "Canada", "Mexico")
DEFAULT_OUTPUT = Path("data/filtered_ski_areas.csv")


def parse_float(s: str | None) -> float | None:
    if s is None or not str(s).strip():
        return None
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "csv_path",
        nargs="?",
        default="ski_areas.csv",
        help="Path to ski_areas.csv (default: ski_areas.csv)",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Output path for filtered CSV (default: {DEFAULT_OUTPUT})",
    )
    args = parser.parse_args()

    input_path = Path(args.csv_path)
    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")

    rows_in = 0
    rows_out = 0
    fieldnames = None

    args.output.parent.mkdir(parents=True, exist_ok=True)

    with open(input_path, encoding="utf-8", newline="") as fin:
        reader = csv.DictReader(fin)
        fieldnames = reader.fieldnames
        if not fieldnames:
            raise SystemExit("Input CSV has no header row")

        with open(args.output, "w", encoding="utf-8", newline="") as fout:
            writer = csv.DictWriter(fout, fieldnames=fieldnames)
            writer.writeheader()

            for row in reader:
                rows_in += 1
                if row.get("countries") not in NA_COUNTRIES:
                    continue
                if (row.get("status") or "").strip() != "operating":
                    continue
                if (row.get("has_downhill") or "").strip().lower() != "yes":
                    continue
                if not (row.get("name") or "").strip():
                    continue

                vertical = parse_float(row.get("vertical_m"))
                lift_count = parse_float(row.get("lift_count"))
                distance = parse_float(row.get("downhill_distance_km"))
                if vertical is None or lift_count is None or distance is None:
                    continue
                if vertical < 50 or lift_count < 1 or distance <= 0:
                    continue

                writer.writerow(row)
                rows_out += 1

    print(f"Kept {rows_out} of {rows_in} rows → {args.output.absolute()}")


if __name__ == "__main__":
    main()
