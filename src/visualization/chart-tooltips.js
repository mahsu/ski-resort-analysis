import { MAX_PITCH, COLORS, COLOR_LABELS, RESORT_COLORS } from "./constants.js";
import { escapeHtml } from "./sanitize.js";

export function showTooltip(tooltipEl, event, html) {
  tooltipEl.innerHTML = html;
  tooltipEl.classList.add("visible");
  moveTooltip(tooltipEl, event);
}

export function moveTooltip(tooltipEl, event) {
  tooltipEl.style.left = event.clientX + 12 + "px";
  tooltipEl.style.top = event.clientY + 12 + "px";
}

export function hideTooltip(tooltipEl) {
  tooltipEl.classList.remove("visible");
}

export function makeBinLabel(lo, hi) {
  return lo >= MAX_PITCH ? `≥ ${MAX_PITCH}%` : `${lo}% – ${hi}%`;
}

function buildDifficultyRows(bin) {
  return COLORS
    .filter((c) => (bin.byColor[c] || 0) > 0)
    .map((c) => `${COLOR_LABELS[c]}: ${bin.byColor[c]}`);
}

// Builds tooltip HTML for a single resort bar (resort name → title → rows).
export function buildSingleBinHtml(binLabel, resortName, bin) {
  const parts = buildDifficultyRows(bin);
  const header = resortName ? `<div class="tip-resort">${escapeHtml(resortName)}</div>` : "";
  return header + `<div class="tip-title">${binLabel}</div>` + parts.map((p) => `<div class="tip-row">${p}</div>`).join("");
}

// Builds tooltip HTML for the lines-mode overlay (title first, then per-resort rows with color).
export function buildMultiBinHtml(binLabel, entries) {
  let html = `<div class="tip-title">${binLabel}</div>`;
  entries.forEach(({ key, bin, name }, idx) => {
    if (!bin) return;
    const parts = buildDifficultyRows(bin);
    if (!parts.length) return;
    const spacerClass = idx > 0 ? " tip-resort-spaced" : "";
    html += `<div class="tip-resort${spacerClass}" style="color:${RESORT_COLORS[key]}">${escapeHtml(name || "Resort " + key)}</div>`;
    html += parts.map((p) => `<div class="tip-row">${p}</div>`).join("");
  });
  return html;
}
