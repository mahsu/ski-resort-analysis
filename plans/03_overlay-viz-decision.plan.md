# Two-Resort Overlay Visualization: Options & Decision Log

## Problem

The original implementation drew Resort B's stacked bars directly on top of Resort A's at 55% opacity with an orange stroke. With two resorts selected the overlapping colored segments were hard to distinguish, making it difficult to compare distributions at a glance.

---

## Options Considered

### Option 1: Side-by-side grouped bars

**Context:** Within each 5% pitch bin, Resort A's stack is placed on the left and Resort B's stack on the right, with a small gap between them. Both use full opacity. Each bar's width is halved to fit inside the same bin slot.

**Pros:**

- Preserves the full per-difficulty color breakdown visually in the chart
- Bin-by-bin comparison is direct and precise

**Cons:**

- Bars become narrow when both resorts are active, reducing legibility at small sizes
- The paired grouping can feel cluttered in bins with many difficulty segments

**Recommendation:** Best when the primary goal is exact per-bin comparison and the difficulty color breakdown must remain on the chart face.

**Implementation summary:** Added `seriesIndex` and `numSeries` parameters to `drawStackedBars`. Bar x-position offset by `seriesIndex * (barWidth + gap)`. Resort B given 78% fill-opacity and a white stroke to distinguish it from Resort A. Legend note updated to "Resort A: left bars · Resort B: right bars". _Implemented then replaced._

---

### Option 2: Outline-only for Resort B

**Context:** Resort A keeps its filled stacked bars. Resort B is drawn as unfilled bars with only a colored border outline, so the full-color bars beneath show through.

**Pros:**

- Visually simple — easy to infer heights for both resorts
- No bar narrowing; bins stay full width

**Cons:**

- The color fill of Resort B's bars is lost, so the difficulty breakdown for Resort B is invisible in the chart itself
- Outline bars can look empty and be hard to read at smaller heights

**Recommendation:** Useful as a quick overlay when only total heights matter and Resort B is secondary. Not ideal for equal-weight comparison.

**Implementation summary:** Not implemented.

---

### Option 3: Smooth lines / area charts

**Context:** Each resort is rendered as a filled area + stroke line using a resort-specific color (Resort A: cyan `#22d3ee`, Resort B: amber `#fb923c`). The difficulty color breakdown moves entirely to the hover tooltip. A single set of transparent overlay rects per bin fires a unified tooltip showing both resorts' difficulty data for that pitch range.

**Pros:**

- The cleanest visual for comparing distribution shape and peak location
- Two overlapping areas are far easier to parse than overlapping bars
- The aggregate dashed line integrates naturally alongside two area curves

**Cons:**

- The difficulty color breakdown (green/blue/black) is no longer visible directly in the chart — it requires hovering
- Smooth interpolation (`curveMonotoneX`) can imply continuity between bins that does not exist in the raw data

**Recommendation:** Best when the comparison question is "which resort skews steeper overall?" rather than "how many black runs are in the 30–35% bin?"

**Implementation summary:** Added `drawResortArea()` (area + line using `d3.area`/`d3.line` with `curveMonotoneX`) and `drawBinTooltipOverlays()` (transparent full-height rects with unified per-bin tooltip showing both resorts). Added `RESORT_COLORS` constant. Legend sidebar gains a "Resorts" section with colored swatches when lines mode is active; difficulty legend gets a "(tooltip)" note. _Implemented as an optional mode._

---

### Option 4: Small multiples

**Context:** When both resorts are selected, the chart splits into two vertically stacked panels sharing the same x-axis domain and chart width, one panel per resort. Each panel has its own free y-scale (so a resort with few runs fills its panel as fully as a resort with many runs). The aggregate dashed line appears in each panel, scaled to that panel's total run count. The resort name is printed inside the top-right corner of its panel.

**Pros:**

- Each distribution is immediately readable on its own terms
- No occlusion — bars never overlap
- Per-difficulty color breakdown is fully preserved in both panels
- Free y-scales make the shape of each distribution clear regardless of resort size difference

**Cons:**

- Precise bin-by-bin magnitude comparison requires moving eyes between panels
- Takes more vertical space (two panels vs. one)

**Recommendation:** Best default for the comparison use-case because it preserves all information (difficulty breakdown, aggregate reference) while completely eliminating overlap.

**Implementation summary:** `drawChart` was restructured to compute data before SVG creation so `useSmallMultiples` (`chartMode === "bars" && dataA && dataB`) can determine SVG height upfront. When true, two `<g>` panel groups are created at y-offsets `margin.top` and `margin.top + SUB_H + SUB_GAP` (`SUB_H = 165px`, `SUB_GAP = 24px`). Each panel computes its own `panelYScale`, draws axes (x-label only on bottom panel, y-axis with 4 ticks), renders full-opacity stacked bars, and draws its own aggregate line. The single-chart path (≤1 resort, or lines mode) is unchanged and reached via early `return` after the small multiples block. _Implemented as the default "Stacked Bars" behavior._

---

## What Was Implemented

The final state of [`src/visualization/app.js`](../src/visualization/app.js) and [`src/visualization/index.html`](../src/visualization/index.html) provides two selectable chart styles via a "Chart style" toggle in the controls bar:

- **Stacked Bars** (`state.chartMode = "bars"`, default)
  - 0 or 1 resort: single chart, full-width stacked bars
  - 2 resorts: small multiples (Option 4) — two vertically stacked panels, free y-scales, shared x-axis
- **Smooth Lines** (`state.chartMode = "lines"`)
  - Any number of resorts: single chart with area+line curves per resort (Option 3), resort-colored (cyan / amber), unified bin tooltip

Options 1 and 2 were explored but are not present in the final code.
