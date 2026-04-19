/** Median of numeric values. Returns null for empty input. */
export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return (sorted[(n - 1) >> 1] + sorted[n >> 1]) / 2;
}

/** Percent of items strictly less than value (0-100). */
export function percentileRank(sortedValues, value) {
  if (!sortedValues.length || value == null) return null;
  let count = 0;
  for (let i = 0; i < sortedValues.length; i++) {
    if (sortedValues[i] < value) count++;
  }
  return Math.round((count / sortedValues.length) * 100);
}

/**
 * Binary-search percentile interpolation over a 101-point breakpoint array.
 * Returns null when breakpoints are missing.
 */
export function interpolatePercentile(rawValue, breakpoints) {
  if (!breakpoints || breakpoints.length < 2) return null;
  if (rawValue <= breakpoints[0]) return 0;
  if (rawValue >= breakpoints[100]) return 100;

  let lo = 0;
  let hi = 100;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (breakpoints[mid] <= rawValue) lo = mid;
    else hi = mid;
  }
  const t = (rawValue - breakpoints[lo]) / (breakpoints[hi] - breakpoints[lo]);
  return Math.round(lo + t);
}
