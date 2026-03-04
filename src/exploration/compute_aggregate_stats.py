"""
Pre-compute aggregate pitch statistics across all US resort runs for the steepness viz.

Reads all data/resorts/*.json files, computes:
- Overall histogram of average_pitch and max_pitch (5% bins).
- Per-color (difficulty) percentiles: p10, p25, p50, p75, p90 for run-level pitch.
- Per-resort per-color medians (average and max pitch) for percentile-rank insights.

Writes data/aggregate_stats.json. Run from repo root; activate venv first.
"""

import json
from pathlib import Path

RESORTS_DIR = Path("data/resorts")
OUTPUT_PATH = Path("data/aggregate_stats.json")
BIN_WIDTH = 5  # percent
PITCH_KEYS = ("average_pitch_%", "max_pitch_%")
COLORS = ("green", "blue", "black", "grey", "orange")


def pct(v: float | None) -> float | None:
    """Convert ratio to percent; None stays None."""
    if v is None:
        return None
    return round(v * 100, 2)


def main() -> None:
    resorts_dir = Path(__file__).resolve().parents[2] / "data" / "resorts"
    if not resorts_dir.exists():
        raise SystemExit(f"Resorts directory not found: {resorts_dir}")

    all_runs: list[dict] = []
    by_color: dict[str, list[float]] = {c: [] for c in COLORS}
    by_color_max: dict[str, list[float]] = {c: [] for c in COLORS}
    hist_avg: dict[tuple[float, float], int] = {}
    hist_max: dict[tuple[float, float], int] = {}
    resort_medians: dict[str, dict] = {}

    for path in sorted(resorts_dir.glob("*.json")):
        resort_name = path.stem
        try:
            with open(path, encoding="utf-8") as f:
                runs = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            print(f"Warning: skip {path.name}: {e}")
            continue

        if not isinstance(runs, list):
            continue

        resort_avg_by_color: dict[str, list[float]] = {c: [] for c in COLORS}
        resort_max_by_color: dict[str, list[float]] = {c: [] for c in COLORS}

        for r in runs:
            if not isinstance(r, dict):
                continue
            avg = r.get("average_pitch_%")
            max_p = r.get("max_pitch_%")
            color = (r.get("color") or "").strip().lower()
            if color not in COLORS:
                color = "grey"

            if avg is not None and isinstance(avg, (int, float)):
                all_runs.append(r)
                by_color[color].append(avg * 100)
                resort_avg_by_color[color].append(avg * 100)
                bin_lo = (int(avg * 100) // BIN_WIDTH) * BIN_WIDTH
                bin_hi = bin_lo + BIN_WIDTH
                hist_avg[(bin_lo, bin_hi)] = hist_avg.get((bin_lo, bin_hi), 0) + 1
            if max_p is not None and isinstance(max_p, (int, float)):
                by_color_max[color].append(max_p * 100)
                resort_max_by_color[color].append(max_p * 100)
                bin_lo = (int(max_p * 100) // BIN_WIDTH) * BIN_WIDTH
                bin_hi = bin_lo + BIN_WIDTH
                hist_max[(bin_lo, bin_hi)] = hist_max.get((bin_lo, bin_hi), 0) + 1

        def median(xs: list[float]) -> float | None:
            if not xs:
                return None
            s = sorted(xs)
            n = len(s)
            return (s[(n - 1) // 2] + s[n // 2]) / 2

        resort_medians[resort_name] = {
            "average_pitch": {c: median(resort_avg_by_color[c]) for c in COLORS},
            "max_pitch": {c: median(resort_max_by_color[c]) for c in COLORS},
        }

    def percentiles(xs: list[float], ps: tuple[float, ...]) -> dict[str, float]:
        if not xs:
            return {f"p{int(p)}": 0 for p in ps}
        s = sorted(xs)
        n = len(s)
        out = {}
        for p in ps:
            idx = (p / 100) * (n - 1) if n > 1 else 0
            i, frac = int(idx), idx % 1
            val = s[i] + frac * (s[min(i + 1, n - 1)] - s[i])
            out[f"p{int(p)}"] = round(val, 2)
        return out

    by_color_percentiles_avg = {
        c: percentiles(by_color[c], (10, 25, 50, 75, 90)) for c in COLORS
    }
    by_color_percentiles_max = {
        c: percentiles(by_color_max[c], (10, 25, 50, 75, 90)) for c in COLORS
    }

    def hist_to_list(h: dict[tuple[float, float], int]) -> list[dict]:
        return [
            {"bin_start": lo, "bin_end": hi, "count": h.get((lo, hi), 0)}
            for lo, hi in sorted(h.keys())
        ]

    # Fill missing bins with 0 so frontend has a full range
    all_bins = set()
    for (lo, hi) in list(hist_avg.keys()) + list(hist_max.keys()):
        all_bins.add((lo, hi))
    for lo in range(0, 100, BIN_WIDTH):
        all_bins.add((lo, lo + BIN_WIDTH))
    hist_avg_filled = {k: hist_avg.get(k, 0) for k in sorted(all_bins)}
    hist_max_filled = {k: hist_max.get(k, 0) for k in sorted(all_bins)}

    payload = {
        "resort_names": sorted(resort_medians.keys()),
        "by_difficulty": {
            "average_pitch": by_color_percentiles_avg,
            "max_pitch": by_color_percentiles_max,
        },
        "overall_histogram": {
            "average_pitch": hist_to_list(hist_avg_filled),
            "max_pitch": hist_to_list(hist_max_filled),
        },
        "resort_medians_by_color": resort_medians,
        "total_runs": len(all_runs),
    }

    out_path = Path(__file__).resolve().parents[2] / "data" / "aggregate_stats.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    print(f"Wrote {out_path} ({payload['total_runs']} runs, {len(payload['resort_names'])} resorts)")


if __name__ == "__main__":
    main()
