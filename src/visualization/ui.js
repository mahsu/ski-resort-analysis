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
  if (!resortName || !runs || !runs.length) {
    el.innerHTML = resortName ? "<p>No pitch data</p>" : "<p>Select a resort</p>";
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
  el.innerHTML =
    `<h3>${resortName}</h3>` +
    `<dl><dt>Median ${metric === "average_pitch" ? "avg" : "max"} pitch</dt><dd>${med != null ? med.toFixed(1) + "%" : "—"}</dd>` +
    `<dt>% runs ≥ 40%</dt><dd>${pct40 != null ? pct40 + "%" : "—"}</dd>` +
    `<dt>By difficulty</dt><dd>${COLORS.map((c) => `${COLOR_LABELS[c]}: ${byColor[c] || 0}`).join(", ")}</dd></dl>`;
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
          `Expert/advanced (black) runs at ${resortB} are steeper than ${rank}% of US resorts (median ${m.black.toFixed(1)}% pitch).`
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
