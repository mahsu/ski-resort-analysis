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

export function renderStatCard(elId, resortName, runs, state) {
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
  el.innerHTML =
    `<div class="stat-card-header">` +
    `<span class="stat-card-name">${resortName}</span>` +
    `<span class="stat-card-badge ${badge}">${label}</span>` +
    `</div>` +
    `<div class="stat-card-body">` +
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

export function renderInsights(aggregate, state) {
  const container = $("insights");
  if (!container || !aggregate) return;
  container.innerHTML = "";

  const medians = aggregate.resort_medians_by_color || {};
  const { resortA, resortB, metric } = state;
  const key = metric === "average_pitch" ? "average_pitch" : "max_pitch";

  function addInsight(text) {
    const card = document.createElement("div");
    card.className = "insight-card";
    card.textContent = text;
    container.appendChild(card);
  }

  if (resortA && medians[resortA]) {
    const m = medians[resortA][key];
    if (m && m.blue != null) {
      const allBlue = aggregate.resort_names
        .map((n) => medians[n] && medians[n][key] && medians[n][key].blue)
        .filter((v) => v != null)
        .sort((a, b) => a - b);
      const rank = percentileRank(allBlue, m.blue);
      if (rank != null) {
        addInsight(
          `Intermediate (blue) runs at ${resortA} are steeper than ${rank}% of US resorts (median ${m.blue.toFixed(1)}% pitch).`
        );
      }
    }
  }

  if (resortB && medians[resortB]) {
    const m = medians[resortB][key];
    if (m && m.black != null) {
      const allBlack = aggregate.resort_names
        .map((n) => medians[n] && medians[n][key] && medians[n][key].black)
        .filter((v) => v != null)
        .sort((a, b) => a - b);
      const rank = percentileRank(allBlack, m.black);
      if (rank != null) {
        addInsight(
          `Advanced (black) runs at ${resortB} are steeper than ${rank}% of US resorts (median ${m.black.toFixed(1)}% pitch).`
        );
      }
    }
  }

  if (resortA && resortB && medians[resortA] && medians[resortB]) {
    const mA = medians[resortA][key];
    const mB = medians[resortB][key];
    if (mA && mB && mA.blue != null && mB.blue != null) {
      const diff = (mB.blue - mA.blue).toFixed(1);
      const steeper = mA.blue > mB.blue ? resortA : resortB;
      addInsight(
        `${steeper} has steeper intermediate runs; blue median differs by ${Math.abs(diff)}% pitch.`
      );
    }
  }

  if (!container.children.length) {
    addInsight("Select one or two resorts to see comparative insights.");
  }
}
