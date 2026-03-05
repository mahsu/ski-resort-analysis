import { COLORS, COLOR_LABELS, COLOR_HEX, RESORT_COLORS } from "./constants.js";
import { getRunsWithPitch } from "./data.js";

const $ = (id) => document.getElementById(id);

export function renderLegend() {
  const container = $("legend");
  if (!container) return;
  container.innerHTML = COLORS.map(
    (c) =>
      `<div class="legend-item"><span class="legend-swatch" style="background:${COLOR_HEX[c]}"></span>${COLOR_LABELS[c]}</div>`
  ).join("");
}

export function renderResortLegend(state) {
  const wrap = $("resort-legend-wrap");
  const container = $("resort-legend");
  const diffNote = $("difficulty-legend-note");

  if (state.chartMode === "lines") {
    if (wrap) wrap.style.display = "";
    if (diffNote) diffNote.textContent = "(tooltip)";
    if (!container) return;
    const entries = [["A", state.resortA], ["B", state.resortB]].filter(([, name]) => name);
    container.innerHTML = entries
      .map(
        ([key, name]) =>
          `<div class="legend-item resort-legend-item">` +
          `<span class="legend-swatch resort-swatch" style="background:${RESORT_COLORS[key]};opacity:0.85"></span>` +
          `<span class="resort-label-key">Resort ${key}</span> ${name}` +
          `</div>`
      )
      .join("");
  } else {
    if (wrap) wrap.style.display = "none";
    if (diffNote) diffNote.textContent = "";
  }
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return (s[(n - 1) >> 1] + s[n >> 1]) / 2;
}

function pctRunsAbove(runs, metric, thresholdPct) {
  const withPitch = getRunsWithPitch(runs, metric);
  if (!withPitch.length) return null;
  const above = withPitch.filter((r) => r.pitchPct >= thresholdPct).length;
  return Math.round((above / withPitch.length) * 100);
}

export function renderStatCard(elId, resortName, runs, state, aggregate) {
  const el = $(elId);
  if (!el) return;
  const badge = elId === "stats-a" ? "a" : "b";
  const label = badge === "a" ? "A" : "B";
  if (!resortName || !runs || !runs.length) {
    el.innerHTML =
      `<div class="stat-card-header">` +
      `<span class="stat-card-name stat-empty">${resortName || "Select a resort"}</span>` +
      `<span class="stat-card-badge ${badge}">${label}</span>` +
      `</div>`;
    return;
  }
  const { metric } = state;
  const pitches = getRunsWithPitch(runs, metric).map((r) => r.pitchPct);
  const med = median(pitches);
  const pct40 = pctRunsAbove(runs, metric, 40);
  const byColor = {};
  COLORS.forEach((c) => {
    byColor[c] = runs.filter((r) => (r.color || "").toLowerCase() === c).length;
  });
  const metricLabel = metric === "average_pitch" ? "Avg pitch (median)" : "Max pitch (median)";
  const diffItems = COLORS.map((c) =>
    `<div class="stat-diff-item">` +
    `<span class="stat-diff-dot" style="background:${COLOR_HEX[c]}"></span>` +
    `<span>${COLOR_LABELS[c]}</span>` +
    `<span class="stat-diff-count">${byColor[c] || 0}</span>` +
    `</div>`
  ).join("");

  const steepnessScore = aggregate && aggregate.resort_steepness && resortName
    ? aggregate.resort_steepness[resortName]
    : null;
  const steepnessHtml = steepnessScore != null
    ? `<div class="stat-row steepness-row">` +
      `<span class="stat-label">Steepness index</span>` +
      `<span class="stat-value steepness-score">${steepnessScore}<span class="steepness-denom"> / 100</span></span>` +
      `</div>` +
      `<div class="steepness-track">` +
      `<div class="steepness-fill" style="width:${steepnessScore}%"></div>` +
      `</div>`
    : "";

  el.innerHTML =
    `<div class="stat-card-header">` +
    `<span class="stat-card-name">${resortName}</span>` +
    `<span class="stat-card-badge ${badge}">${label}</span>` +
    `</div>` +
    `<div class="stat-card-body">` +
    steepnessHtml +
    `<div class="stat-row"><span class="stat-label">${metricLabel}</span><span class="stat-value">${med != null ? med.toFixed(1) + "%" : "—"}</span></div>` +
    `<div class="stat-row"><span class="stat-label">Runs ≥ 40% pitch</span><span class="stat-value">${pct40 != null ? pct40 + "%" : "—"}</span></div>` +
    `<div class="stat-row"><span class="stat-label">By difficulty</span></div>` +
    `<div class="stat-difficulty-grid">${diffItems}</div>` +
    `</div>`;
}

function percentileRank(sortedArr, value) {
  if (!sortedArr.length || value == null) return null;
  let count = 0;
  for (let i = 0; i < sortedArr.length; i++) {
    if (sortedArr[i] < value) count++;
  }
  return Math.round((count / sortedArr.length) * 100);
}

/** Max number of insight cards to show in the insights panel. */
const MAX_INSIGHT_CARDS = 4;
/** Min median pitch difference (percentage points) to mention in comparison insights. */
const MIN_DIFF_PCT = 2;
/** Percentile below which a resort is considered "low" for single-resort percentile insight. */
const EXTREME_PERCENTILE_LO = 25;
/** Percentile above which a resort is considered "high" for single-resort percentile insight. */
const EXTREME_PERCENTILE_HI = 75;
/** Min difference in (black − green) spread between two resorts to mention variety insight. */
const MIN_VARIETY_DIFF_PCT = 5;

/** Difficulty colors/labels used when picking the "most extreme" percentile for single-resort insight. */
const PERCENTILE_COLOR_CONFIG = [
  { color: "green", label: "Beginner" },
  { color: "blue", label: "Intermediate" },
  { color: "black", label: "Advanced" },
];

function getAllResortValuesForColor(aggregate, medians, key, color) {
  return (aggregate.resort_names || [])
    .map((n) => medians[n] && medians[n][key] && medians[n][key][color])
    .filter((v) => v != null)
    .sort((a, b) => a - b);
}

function addInsightCard(container, text) {
  const card = document.createElement("div");
  card.className = "insight-card";
  card.textContent = text;
  container.appendChild(card);
}

export function renderInsights(aggregate, state) {
  const container = $("insights");
  if (!container || !aggregate) return;
  container.innerHTML = "";

  const medians = aggregate.resort_medians_by_color || {};
  const byDifficulty = aggregate.by_difficulty || {};
  const { resortA, resortB, metric } = state;
  const key = metric === "average_pitch" ? "average_pitch" : "max_pitch";
  const candidates = [];
  const push = (text) => {
    if (text) candidates.push(text);
  };

  // 0 resorts: fallback only
  if (!resortA && !resortB) {
    addInsightCard(container, "Select one or two resorts to see comparative insights.");
    return;
  }

  if (resortA && resortB) {
    // 2 resorts: comparison insights only (combined comparison, then variety)
    const mA = medians[resortA] && medians[resortA][key];
    const mB = medians[resortB] && medians[resortB][key];
    if (mA && mB) {
      const blueDiff = mA.blue != null && mB.blue != null ? mB.blue - mA.blue : null;
      const blackDiff = mA.black != null && mB.black != null ? mB.black - mA.black : null;
      const blueAbs = blueDiff != null ? Math.abs(blueDiff) : 0;
      const blackAbs = blackDiff != null ? Math.abs(blackDiff) : 0;
      if ((blueAbs >= MIN_DIFF_PCT || blackAbs >= MIN_DIFF_PCT) && (blueDiff != null || blackDiff != null)) {
        const steeperBlue = blueDiff != null && blueAbs >= MIN_DIFF_PCT ? (mA.blue > mB.blue ? resortA : resortB) : null;
        const steeperBlack = blackDiff != null && blackAbs >= MIN_DIFF_PCT ? (mA.black > mB.black ? resortA : resortB) : null;
        if (steeperBlue && steeperBlack && steeperBlue === steeperBlack) {
          push(`${steeperBlue} has steeper intermediate and advanced runs (${blueAbs.toFixed(1)}% and ${blackAbs.toFixed(1)}% median pitch difference).`);
        } else {
          const parts = [];
          if (steeperBlue) parts.push(`${steeperBlue} has steeper intermediate runs (${blueAbs.toFixed(1)}% median pitch difference)`);
          if (steeperBlack) parts.push(`${steeperBlack} has steeper advanced runs (${blackAbs.toFixed(1)}% median pitch difference)`);
          if (parts.length) push(parts.join("; ") + ".");
        }
      }
      // Variety: compare (black - green) spread
      const spreadA = mA.black != null && mA.green != null ? mA.black - mA.green : null;
      const spreadB = mB.black != null && mB.green != null ? mB.black - mB.green : null;
      if (spreadA != null && spreadB != null) {
        const varietyDiff = Math.abs(spreadA - spreadB);
        if (varietyDiff >= MIN_VARIETY_DIFF_PCT) {
          const wider = spreadA > spreadB ? resortA : resortB;
          push(`${wider} has a wider difficulty range from beginner to advanced (${varietyDiff.toFixed(1)}% median pitch difference).`);
        }
      }
    }
  } else {
    // 1 resort: single-resort insights only (one percentile, spread, distribution band)
    const resort = resortA || resortB;
    const m = medians[resort] && medians[resort][key];
    if (!m) {
      addInsightCard(container, "Select one or two resorts to see comparative insights.");
      return;
    }

    // One percentile: pick color with most extreme rank (only add if rank < 25 or > 75)
    let bestRank = null;
    let bestColorConfig = null;
    let bestMedian = null;
    for (const { color, label } of PERCENTILE_COLOR_CONFIG) {
      const val = m[color];
      if (val == null) continue;
      const all = getAllResortValuesForColor(aggregate, medians, key, color);
      const rank = percentileRank(all, val);
      if (rank != null && (bestRank == null || Math.abs(rank - 50) > Math.abs(bestRank - 50))) {
        bestRank = rank;
        bestColorConfig = label;
        bestMedian = val;
      }
    }
    if (bestRank != null && bestColorConfig != null && (bestRank < EXTREME_PERCENTILE_LO || bestRank > EXTREME_PERCENTILE_HI)) {
      push(
        `${bestColorConfig} runs at ${resort} are steeper than ${bestRank}% of tracked resorts (median ${bestMedian.toFixed(1)}% pitch).`
      );
    }

    // Same-resort spread: black - green
    if (m.black != null && m.green != null) {
      const spread = (m.black - m.green).toFixed(1);
      push(`At ${resort}, advanced runs have a ${spread}% higher median pitch than beginner runs.`);
    }

    // Distribution band (where resort sits vs by_difficulty across tracked resorts)
    const bandColors = ["blue", "black"];
    for (const bandColor of bandColors) {
      const resortMedian = m[bandColor];
      const percentiles = byDifficulty[key] && byDifficulty[key][bandColor];
      if (resortMedian == null || !percentiles || percentiles.p25 == null) continue;
      const p25 = percentiles.p25;
      const p50 = percentiles.p50;
      const p75 = percentiles.p75;
      let band = null;
      if (resortMedian <= p25) band = "below the 25th percentile across tracked resorts";
      else if (resortMedian >= p75) band = "above the 75th percentile across tracked resorts";
      else if (Math.abs(resortMedian - p50) <= 3) band = "near the median across tracked resorts";
      if (band) {
        push(
          `At ${resort}, ${COLOR_LABELS[bandColor].toLowerCase()} runs (median ${resortMedian.toFixed(1)}% pitch) are ${band}.`
        );
        break;
      }
    }
  }

  const fallbackMessage = (resortA || resortB)
    ? "No standout comparative insights for this pair with the current metric."
    : "Select one or two resorts to see comparative insights.";
  const toShow = candidates.length ? candidates.slice(0, MAX_INSIGHT_CARDS) : [fallbackMessage];
  toShow.forEach((text) => addInsightCard(container, text));
}
