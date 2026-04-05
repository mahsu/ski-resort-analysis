"""
Run the full ski-areas data pipeline: download → filter ski_areas → runs to JSON → aggregate stats.

Steps:
0. download_resort_data.py → data/ski_areas.csv, data/runs.csv
1. filter_ski_areas.py on data/ski_areas.csv → data/filtered_ski_areas.csv
2. run_csv_to_json.py on data/runs.csv with --ski-areas → data/resorts/*.json
3. compute_aggregate_stats.py → data/aggregate_stats.json

Run from repo root. Uses the same Python interpreter (e.g. venv) so dependencies apply.
"""

import argparse
import json
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent  # src/data_pipeline → repo root
DEPLOY_CONFIG = REPO_ROOT / "config" / "deploy.json"
DEFAULT_SKI_AREAS_CSV = Path("data/ski_areas.csv")
DEFAULT_RUNS_CSV = Path("data/runs.csv")
FILTERED_SKI_AREAS = Path("data/filtered_ski_areas.csv")
RESORTS_DIR = Path("data/resorts")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--ski-areas-csv",
        type=Path,
        default=DEFAULT_SKI_AREAS_CSV,
        help=f"Input ski_areas CSV (default: {DEFAULT_SKI_AREAS_CSV})",
    )
    parser.add_argument(
        "--runs-csv",
        type=Path,
        default=DEFAULT_RUNS_CSV,
        help=f"Input runs CSV (default: {DEFAULT_RUNS_CSV})",
    )
    parser.add_argument(
        "--skip-download",
        action="store_true",
        help="Skip step 0 (download); use existing CSVs in data/",
    )
    args = parser.parse_args()

    python = sys.executable

    # Step 0: download resort data to data/
    if not args.skip_download:
        download_script = SCRIPT_DIR / "download_resort_data.py"
        subprocess.run(
            [
                python,
                str(download_script),
                "--ski-areas-out",
                str(args.ski_areas_csv),
                "--runs-out",
                str(args.runs_csv),
            ],
            check=True,
        )
        # Record download date in config/deploy.json for the visualization footer
        deploy = {}
        if DEPLOY_CONFIG.exists():
            try:
                deploy = json.loads(DEPLOY_CONFIG.read_text())
            except (json.JSONDecodeError, OSError):
                pass
        deploy["dataRefreshedOn"] = datetime.now(timezone.utc).date().isoformat()
        DEPLOY_CONFIG.parent.mkdir(parents=True, exist_ok=True)
        DEPLOY_CONFIG.write_text(json.dumps(deploy, indent=2) + "\n")

    # Step 1: filter ski areas
    filter_script = SCRIPT_DIR / "filter_ski_areas.py"
    subprocess.run(
        [python, str(filter_script), str(args.ski_areas_csv), "-o", str(FILTERED_SKI_AREAS)],
        check=True,
    )

    # Step 2: runs to JSON (requires --ski-areas)
    run_csv_script = SCRIPT_DIR / "run_csv_to_json.py"
    subprocess.run(
        [
            python,
            str(run_csv_script),
            str(args.runs_csv),
            "--ski-areas",
            str(FILTERED_SKI_AREAS),
            "-o",
            str(RESORTS_DIR),
        ],
        check=True,
    )

    # Step 3: aggregate stats
    aggregate_script = SCRIPT_DIR / "compute_aggregate_stats.py"
    subprocess.run([python, str(aggregate_script)], check=True)

    print("Pipeline complete.")


if __name__ == "__main__":
    main()
