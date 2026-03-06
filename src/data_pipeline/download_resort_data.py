"""
Download initial resort data from OpenSkiMap into data/ for the pipeline.

Fetches ski_areas.csv and runs.csv from tiles.openskimap.org and writes them to
configurable paths (default: data/ski_areas.csv, data/runs.csv). Used as step 0
before filter_ski_areas → run_csv_to_json → compute_aggregate_stats.
"""

import argparse
import sys
import urllib.request
from pathlib import Path


SKI_AREAS_URL = "https://tiles.openskimap.org/csv/ski_areas.csv"
RUNS_URL = "https://tiles.openskimap.org/csv/runs.csv"
DEFAULT_SKI_AREAS_OUT = Path("data/ski_areas.csv")
DEFAULT_RUNS_OUT = Path("data/runs.csv")


USER_AGENT = "SkiResortAnalysis/1.0"


def download_to_path(url: str, out_path: Path) -> None:
    """Stream URL to out_path; create parent dirs. Exit on HTTP error."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req) as resp:
            if resp.status >= 400:
                print(f"HTTP {resp.status} for {url}", file=sys.stderr)
                sys.exit(1)
            with open(out_path, "wb") as f:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    f.write(chunk)
    except urllib.error.HTTPError as e:
        print(f"HTTP error {e.code} for {url}: {e.reason}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"URL error for {url}: {e.reason}", file=sys.stderr)
        sys.exit(1)
    print(f"Downloaded {out_path} from {url}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--ski-areas-out",
        type=Path,
        default=DEFAULT_SKI_AREAS_OUT,
        help=f"Output path for ski_areas CSV (default: {DEFAULT_SKI_AREAS_OUT})",
    )
    parser.add_argument(
        "--runs-out",
        type=Path,
        default=DEFAULT_RUNS_OUT,
        help=f"Output path for runs CSV (default: {DEFAULT_RUNS_OUT})",
    )
    args = parser.parse_args()

    download_to_path(SKI_AREAS_URL, args.ski_areas_out)
    download_to_path(RUNS_URL, args.runs_out)


if __name__ == "__main__":
    main()
