# Plan 05: Insights Panel Expansion and Narrowing

## Overview

Expand the insights panel with additional insight types (percentiles, spread, comparisons) while preventing overcrowding via a cap, context-based rules, and optional relevance thresholds. All logic stays in [src/visualization/ui.js](src/visualization/ui.js) in `renderInsights` using current [data/aggregate_stats.json](data/aggregate_stats.json). No pipeline or aggregate-stats schema changes required.

## Current state

- **Location:** [src/visualization/ui.js](src/visualization/ui.js) — `renderInsights(aggregate, state)`.
- **Data:** [data/aggregate_stats.json](data/aggregate_stats.json) — `resort_medians_by_color`, `by_difficulty` (p10–p90 per color), `resort_names`, `total_runs`.
- **Existing insights:** (1) Blue percentile for resort A, (2) Black percentile for resort B, (3) Blue comparison when A and B selected, (4) Fallback message when none selected.

---

## Part 1: Additional insight types to support

All of these use only `aggregate` and `state` (no new API or pipeline changes).

Insight text must reference **difficulty only** (e.g. "intermediate", "advanced"), not color names (e.g. no "blue", "black").

- **Beginner percentile** — `resort_medians_by_color[name][key].green` + percentile rank vs all resorts. When: 1 resort selected.
- **Advanced comparison (A vs B)** — Same as intermediate comparison but for advanced (black) median. When: 2 resorts selected.
- **Same-resort spread** — beginner-to-advanced median spread at one resort (e.g. "Advanced runs are X% steeper than easy runs"). When: 1 resort selected.
- **Two-resort variety** — Compare beginner-to-advanced spread for A vs B. When: 2 resorts selected.
- **National distribution band** — Compare resort median to `by_difficulty[key][color].p25/p50/p75` (e.g. "around the national 75th percentile for intermediate runs"). When: 1 resort selected.
- **Metric note** — Clarify "Showing max pitch" / "Showing average pitch" with one stat. When: any selection.
- **Combined comparison line** — One sentence for both intermediate and advanced (e.g. "A steeper on intermediate runs; B steeper on advanced runs"). When: 2 resorts selected; can replace two separate cards.

Optional later (require more data or signature change):

- Run count per resort (needs per-resort count in aggregate or passing `resortCache` into `renderInsights`).
- Share of runs ≥ 40% pitch (would need resort runs passed in).
- Black vs national orange (expert) steepness using `by_difficulty.orange`.

---

## Part 2: Narrowing strategy (prevent overcrowding)

### 2.1 Cap total cards

- **Max 4 insight cards** (configurable constant, e.g. `MAX_INSIGHT_CARDS = 4`).
- Build an array of candidate insight strings, then render only the first `MAX_INSIGHT_CARDS`.

### 2.2 Context-based rules

- **0 resorts:** Show only the fallback message (1 card). Do not add any other insights.
- **1 resort:** Only single-resort insights (percentiles, spread, national band). No comparison text.
- **2 resorts:** Only comparison insights (intermediate diff, advanced diff, variety, or one combined comparison line). No single-resort percentile cards for A or B (or at most one "headline" if desired).

### 2.3 One insight per type

- At most **one** percentile insight per resort (e.g. choose beginner, intermediate, or advanced by most extreme percentile rank).
- At most **one** spread per resort.
- For comparisons: either one intermediate + one advanced card, or **one combined sentence** for both.

### 2.4 Optional "interesting" filter

- **Percentile:** Only add if rank &lt; 25 or &gt; 75 (or 33/66).
- **Comparison:** Only add if median difference ≥ 2% (or 3%) pitch.
- **Variety:** Only add if spread difference between two resorts is above a threshold (e.g. 5% pitch).

### 2.5 Priority order when capping

When more than `MAX_INSIGHT_CARDS` candidates exist:

1. **2 resorts:** Combined comparison (intermediate + advanced) → variety (if above threshold).
2. **1 resort:** Single "best" percentile (most extreme) → spread → national band.

---

## Part 3: Implementation approach

**File to change:** [src/visualization/ui.js](src/visualization/ui.js).

1. **Refactor `renderInsights`** — Build an array of insight strings (e.g. `candidates = []`) instead of calling `addInsight(...)` immediately. Keep a helper that pushes to `candidates`; at the end, render only `candidates.slice(0, MAX_INSIGHT_CARDS)` (or show fallback if empty).

2. **Add new insight builders** — Each appends to `candidates` when applicable: beginner percentile (1 resort), advanced A vs B (2 resorts), same-resort spread (1 resort), two-resort variety (2 resorts). Optionally: national band from `by_difficulty`, metric note, combined comparison line. Do not add a "steepest difficulty" insight (most difficult runs are typically steepest). Use difficulty labels only in copy (e.g. "intermediate", "advanced"), not color names.

3. **Apply context rules** — Based on `state.resortA` / `state.resortB`, only run the builders that match (single-resort vs comparison).

4. **Apply "one per type" and optional interesting filter** — When pushing to `candidates`, enforce one percentile per resort and optional thresholds (percentile 25/75, diff ≥ 2%, etc.).

5. **Constants** — Define `MAX_INSIGHT_CARDS = 4`, and optionally `MIN_DIFF_PCT = 2`, `EXTREME_PERCENTILE_LO = 25`, `EXTREME_PERCENTILE_HI = 75` for the interesting filter.

No changes to [data/aggregate_stats.json](data/aggregate_stats.json) or to the Python pipeline are required; `by_difficulty` and `resort_medians_by_color` already exist.

---

## Optional future enhancements

- **Progressive disclosure:** Default to 2–3 insights with a "More insights" control that expands to show more.
- **Run count / % steep:** Add per-resort run count to `aggregate_stats.json` (or pass resort runs into `renderInsights`) and add one card for run count or % runs ≥ 40%.
