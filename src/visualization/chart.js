import { BIN_WIDTH, MAX_PITCH, COLORS, COLOR_LABELS, RESORT_COLORS, COLOR_HEX, PITCH_FIELDS, RUN_STEEPNESS_INDEX_TOOLTIP } from "./constants.js";
import { capAggregateBins, binRuns } from "./data.js";

// ── Tooltip helpers ──────────────────────────────────────────────────────────

function showTooltip(tooltipEl, event, html) {
  tooltipEl.innerHTML = html;
  tooltipEl.classList.add("visible");
  moveTooltip(tooltipEl, event);
}

function moveTooltip(tooltipEl, event) {
  tooltipEl.style.left = event.clientX + 12 + "px";
  tooltipEl.style.top = event.clientY + 12 + "px";
}

function hideTooltip(tooltipEl) {
  tooltipEl.classList.remove("visible");
}

function makeBinLabel(lo, hi) {
  return lo >= MAX_PITCH ? `≥ ${MAX_PITCH}%` : `${lo}% – ${hi}%`;
}

// Builds tooltip HTML for a single resort bar (resort name → title → rows).
function buildSingleBinHtml(binLabel, resortName, bin) {
  const parts = COLORS.filter((c) => (bin.byColor[c] || 0) > 0)
    .map((c) => `${COLOR_LABELS[c]}: ${bin.byColor[c]}`);
  const header = resortName ? `<div class="tip-resort">${resortName}</div>` : "";
  return (
    header +
    `<div class="tip-title">${binLabel}</div>` +
    parts.map((p) => `<div class="tip-row">${p}</div>`).join("")
  );
}

// Builds tooltip HTML for the lines-mode overlay (title first, then per-resort rows with color).
function buildMultiBinHtml(binLabel, entries) {
  let html = `<div class="tip-title">${binLabel}</div>`;
  entries.forEach(({ key, bin, name }, idx) => {
    if (!bin) return;
    const parts = COLORS.filter((c) => (bin.byColor[c] || 0) > 0)
      .map((c) => `${COLOR_LABELS[c]}: ${bin.byColor[c]}`);
    if (!parts.length) return;
    const spacerClass = idx > 0 ? " tip-resort-spaced" : "";
    html += `<div class="tip-resort${spacerClass}" style="color:${RESORT_COLORS[key]}">${name || "Resort " + key}</div>`;
    html += parts.map((p) => `<div class="tip-row">${p}</div>`).join("");
  });
  return html;
}

// ── Run detail modal ─────────────────────────────────────────────────────────

// Numeric rank for difficulty sort: easiest → hardest
const DIFFICULTY_RANK = { green: 0, blue: 1, black: 2, grey: 3, orange: 4 };

// Binary search into the 101-element percentile breakpoints array to map a
// raw steepness value to a 0-100 percentile score.
function runSteepnessPercentile(raw, breakpoints) {
  if (!breakpoints || breakpoints.length < 2) return null;
  if (raw <= breakpoints[0]) return 0;
  if (raw >= breakpoints[100]) return 100;
  let lo = 0, hi = 100;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (breakpoints[mid] <= raw) lo = mid;
    else hi = mid;
  }
  const t = (raw - breakpoints[lo]) / (breakpoints[hi] - breakpoints[lo]);
  return Math.round(lo + t);
}

const MODAL_COLUMNS = [
  {
    key: "name",
    label: "Run",
    defaultDir: 1,
    isDefault: false,
    sortValue: (r) => r.name.toLowerCase(),
  },
  {
    key: "pitch",
    label: null,
    defaultDir: -1,
    isDefault: true,
    sortValue: (r) => r.pitch,
  },
  {
    key: "difficulty",
    label: "Difficulty",
    defaultDir: 1,
    isDefault: false,
    sortValue: (r) => {
      const rank = DIFFICULTY_RANK[r.color] ?? 99;
      return rank * 1e6 - r.pitch;
    },
  },
  {
    key: "steepness",
    label: "Steepness",
    defaultDir: -1,
    isDefault: false,
    sortValue: (r) => r.steepnessIdx ?? -1,
  },
];

let modalInitialized = false;
let modalRows = [];
let modalSort = (() => {
  const defaultCol = MODAL_COLUMNS.find((c) => c.isDefault);
  return { col: defaultCol.key, dir: defaultCol.defaultDir };
})();

function renderModalTable() {
  const tbody = document.getElementById("modal-tbody");
  if (!tbody) return;

  // Update header sort indicators
  document.querySelectorAll(".modal-table th[data-sort-col]").forEach((th) => {
    const col = th.dataset.sortCol;
    const isActive = col === modalSort.col;
    th.classList.toggle("sort-active", isActive);
    th.dataset.sortDir = isActive ? (modalSort.dir === 1 ? "asc" : "desc") : "";
  });

  const col = MODAL_COLUMNS.find((c) => c.key === modalSort.col);
  const sorted = [...modalRows].sort((a, b) => {
    const av = col.sortValue(a);
    const bv = col.sortValue(b);
    return modalSort.dir * (av < bv ? -1 : av > bv ? 1 : 0);
  });

  tbody.innerHTML = "";
  sorted.forEach((r) => {
    const tr = document.createElement("tr");
    const hex = COLOR_HEX[r.color] || COLOR_HEX.grey;
    const steepnessCell = r.steepnessIdx != null
      ? `<td class="modal-steepness-cell">` +
        `<span class="modal-steepness-score">${r.steepnessIdx}</span>` +
        `<div class="steepness-track modal-steepness-track"><div class="steepness-fill" style="width:${r.steepnessIdx}%"></div></div>` +
        `</td>`
      : `<td>—</td>`;
    tr.innerHTML =
      `<td>${r.name}</td>` +
      `<td>${r.pitch.toFixed(1)}%</td>` +
      `<td><span class="modal-difficulty"><span class="modal-diff-dot" style="background:${hex}"></span><span class="modal-diff-label">${COLOR_LABELS[r.color] || r.difficulty}</span></span></td>` +
      steepnessCell;
    tbody.appendChild(tr);
  });
}

function initModal() {
  const overlay = document.getElementById("run-modal");
  const closeBtn = document.getElementById("modal-close");
  if (!overlay) return;

  const tooltipEl = document.getElementById("run-steepness-tooltip");
  if (tooltipEl) tooltipEl.textContent = RUN_STEEPNESS_INDEX_TOOLTIP;

  function close() {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("modal-open");
  }

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("is-open")) close();
  });

  document.querySelectorAll(".modal-table th[data-sort-col]").forEach((th) => {
    th.addEventListener("click", () => {
      const clickedKey = th.dataset.sortCol;
      if (modalSort.col === clickedKey) {
        modalSort.dir *= -1;
      } else {
        const col = MODAL_COLUMNS.find((c) => c.key === clickedKey);
        modalSort = { col: clickedKey, dir: col.defaultDir };
      }
      renderModalTable();
    });
  });
}

function showRunModal(runs, binLo, binHi, metric, resortName, aggregate) {
  if (!modalInitialized) { initModal(); modalInitialized = true; }

  const overlay = document.getElementById("run-modal");
  const titleEl = document.getElementById("modal-title");
  const pitchHeader = document.getElementById("modal-pitch-header");

  const field = PITCH_FIELDS[metric];
  const breakpoints = aggregate?.run_steepness_percentiles ?? null;
  modalRows = runs
    .filter((r) => {
      const v = r[field];
      if (v == null || typeof v !== "number") return false;
      const pct = Math.min(v * 100, MAX_PITCH);
      return pct >= binLo && pct < binHi;
    })
    .map((r) => {
      const avg = r["average_pitch_%"] ?? null;
      const max = r["max_pitch_%"] ?? null;
      const rawSteepness = avg != null && max != null ? 0.6 * avg + 0.4 * max : null;
      return {
        name: r.name,
        pitch: r[field] * 100,
        color: (r.color || "grey").toLowerCase(),
        difficulty: r.difficulty || "unknown",
        steepnessIdx: rawSteepness != null ? runSteepnessPercentile(rawSteepness, breakpoints) : null,
      };
    });

  const defaultCol = MODAL_COLUMNS.find((c) => c.isDefault);
  modalSort = { col: defaultCol.key, dir: defaultCol.defaultDir };

  const isAvg = metric === "average_pitch";
  const binLabel = binLo >= MAX_PITCH ? `≥ ${MAX_PITCH}%` : `${binLo}–${binHi}%`;
  const pitchLabel = isAvg ? "Avg Pitch" : "Max Pitch";
  titleEl.textContent = `${resortName} (${binLabel} ${pitchLabel})`;
  pitchHeader.textContent = isAvg ? "Avg Pitch" : "Max Pitch";

  renderModalTable();

  document.querySelector(".modal-body").scrollTop = 0;
  overlay.setAttribute("aria-hidden", "false");
  overlay.classList.add("is-open");
  document.documentElement.classList.add("modal-open");
}

// ── Scale bound computation ──────────────────────────────────────────────────

function computeScaleBounds(dataA, dataB, aggBins, totalA, totalB, state, aggregate) {
  const hasResortData = dataA != null || dataB != null;
  let maxVal = 1;
  let normalizedMax = 0;

  if (hasResortData) {
    [dataA, dataB].forEach((data) => {
      if (data) data.bins.forEach((b) => { if (b.total > maxVal) maxVal = b.total; });
    });
    if (state.showAggregate && aggBins.length && aggregate.total_runs) {
      const totalForScale = Math.max(totalA || 0, totalB || 0);
      if (totalForScale) {
        const aggScaledMax = d3.max(aggBins, (d) => d.count * (totalForScale / aggregate.total_runs)) || 0;
        if (aggScaledMax > maxVal) maxVal = aggScaledMax;
      }
    }
  } else {
    maxVal = d3.max(aggBins, (d) => d.count) || 1;
  }

  if (state.normalizeY) {
    if (hasResortData) {
      if (dataA && dataA.bins.length && totalA) {
        const aMax = d3.max(dataA.bins, (b) => b.total * (100 / totalA)) || 0;
        if (aMax > normalizedMax) normalizedMax = aMax;
      }
      if (dataB && dataB.bins.length && totalB) {
        const bMax = d3.max(dataB.bins, (b) => b.total * (100 / totalB)) || 0;
        if (bMax > normalizedMax) normalizedMax = bMax;
      }
      if (state.showAggregate && aggBins.length && aggregate.total_runs) {
        const aggMax = d3.max(aggBins, (d) => d.count * (100 / aggregate.total_runs)) || 0;
        if (aggMax > normalizedMax) normalizedMax = aggMax;
      }
    } else if (aggregate.total_runs && aggBins.length) {
      normalizedMax = d3.max(aggBins, (d) => d.count * (100 / aggregate.total_runs)) || 0;
    }
  }

  return { maxVal, normalizedMax, hasResortData };
}

// ── Toggle button helper ─────────────────────────────────────────────────────

export function bindToggle(idA, idB, onA, onB, onUpdate) {
  document.getElementById(idA).addEventListener("click", () => {
    onA();
    document.getElementById(idA).classList.add("active");
    document.getElementById(idB).classList.remove("active");
    onUpdate();
  });
  document.getElementById(idB).addEventListener("click", () => {
    onB();
    document.getElementById(idA).classList.remove("active");
    document.getElementById(idB).classList.add("active");
    onUpdate();
  });
}

// ── Main chart entry point ───────────────────────────────────────────────────

export function drawChart(aggregate, resortCache, state) {
  const chartEl = document.getElementById("chart");
  const tooltipEl = document.getElementById("tooltip");
  if (!chartEl || !aggregate) return;

  const metric = state.metric;
  const runsA = state.resortA ? resortCache[state.resortA] : null;
  const runsB = state.resortB ? resortCache[state.resortB] : null;

  const histKey = metric === "average_pitch" ? "average_pitch" : "max_pitch";
  const aggBins = capAggregateBins(aggregate.overall_histogram[histKey] || []);

  let dataA = null, dataB = null, totalA = 0, totalB = 0;
  if (runsA && Array.isArray(runsA)) { dataA = binRuns(runsA, metric); totalA = dataA.total; }
  if (runsB && Array.isArray(runsB)) { dataB = binRuns(runsB, metric); totalB = dataB.total; }

  const { maxVal, normalizedMax, hasResortData } = computeScaleBounds(
    dataA, dataB, aggBins, totalA, totalB, state, aggregate
  );

  const useSmallMultiples = state.chartMode === "bars";

  d3.select(chartEl).selectAll("*").remove();

  const chartWrap = chartEl.closest(".chart-wrap");
  const isLinesMode = state.chartMode === "lines";
  if (chartWrap) {
    chartWrap.classList.toggle("lines-mode", isLinesMode);
  }

  const width = Math.max(chartEl.getBoundingClientRect().width || 0, chartEl.offsetWidth || 600);
  const isCompact = width < 560;
  const isVeryCompact = width < 420;
  const margin = isCompact
    ? { top: 28, right: 12, bottom: 42, left: 38 }
    : { top: 36, right: 20, bottom: 50, left: 50 };
  const innerWidth = width - margin.left - margin.right;

  const CHART_HEIGHT = isVeryCompact ? 240 : isCompact ? 280 : 340;
  const SUB_H = isVeryCompact ? 120 : isCompact ? 140 : 165;
  const SUB_GAP = isVeryCompact ? 56 : isCompact ? 64 : 80;
  const SUB_TITLE_OFFSET = isCompact ? -12 : -20;
  const axisLabelYOffset = isCompact ? 30 : 38;
  const yAxisLabelOffset = isCompact ? -30 : -42;
  const xTickStep = isVeryCompact ? 20 : 10;

  const chartHeight = isLinesMode && chartWrap
    ? Math.max(CHART_HEIGHT, chartEl.offsetHeight || CHART_HEIGHT)
    : CHART_HEIGHT;
  const svgHeight = useSmallMultiples ? margin.top + SUB_H * 2 + SUB_GAP + margin.bottom : chartHeight;
  const innerHeight = useSmallMultiples ? SUB_H : chartHeight - margin.top - margin.bottom;

  chartEl.style.height = useSmallMultiples ? `${svgHeight}px` : isLinesMode ? `${chartHeight}px` : "";
  chartEl.classList.toggle("compact-chart", isCompact);

  const svg = d3.select(chartEl).append("svg")
    .attr("width", width).attr("height", svgHeight)
    .attr("viewBox", [0, 0, width, svgHeight]);

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const xMax = MAX_PITCH + BIN_WIDTH;
  const xScale = d3.scaleLinear().domain([0, xMax]).range([0, innerWidth]);
  const yDomain = state.normalizeY ? [0, normalizedMax * 1.05] : [0, maxVal * 1.05];
  const yScale = d3.scaleLinear().domain(yDomain).range([innerHeight, 0]);

  const colorScale = d3.scaleOrdinal().domain(COLORS).range(COLORS.map((c) => COLOR_HEX[c]));

  const sharedXAxis = d3.axisBottom(xScale)
    .tickValues(d3.range(0, MAX_PITCH + 1, xTickStep))
    .tickFormat((d) => d === MAX_PITCH ? d + "%+" : d + "%");

  // ── Small multiples (bars mode) ──────────────────────────────────────────
  if (useSmallMultiples) {
    const barWidth = Math.max(2, (xScale(BIN_WIDTH) - xScale(0)) * 0.85);
    const panels = [
      { data: dataA, total: totalA, key: "A", name: state.resortA || "Resort A", offsetY: margin.top },
      { data: dataB, total: totalB, key: "B", name: state.resortB || "Resort B", offsetY: margin.top + SUB_H + SUB_GAP },
    ];

    const aggRawMax = d3.max(aggBins, (d) => d.count) || 1;
    const aggIndepScale = d3.scaleLinear().domain([0, aggRawMax]).range([SUB_H, 0]);
    const aggNormFactor = aggregate.total_runs ? 100 / aggregate.total_runs : 1;

    panels.forEach(({ data, total, key, name, offsetY }) => {
      const pg = svg.append("g").attr("transform", `translate(${margin.left},${offsetY})`);

      // Both panels share the same y-domain so their axes are always synced.
      const panelYDomain = state.normalizeY ? [0, normalizedMax * 1.05] : [0, maxVal * 1.05];
      const panelYScale = d3.scaleLinear().domain(panelYDomain).range([SUB_H, 0]);

      pg.append("g").attr("class", "axis x-axis")
        .attr("transform", `translate(0,${SUB_H})`).call(sharedXAxis);
      pg.append("g").attr("class", "axis y-axis").call(d3.axisLeft(panelYScale).ticks(4));

      const xAxisLabel = metric === "average_pitch" ? "Avg Pitch (%)" : "Max Pitch (%)";
      pg.append("text").attr("class", "axis-label")
        .attr("x", innerWidth / 2).attr("y", SUB_H + axisLabelYOffset)
        .attr("text-anchor", "middle").text(xAxisLabel);

      pg.append("text").attr("class", "axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -SUB_H / 2).attr("y", yAxisLabelOffset)
        .attr("text-anchor", "middle")
        .text(state.normalizeY ? "% of runs" : "Number of runs");

      pg.append("text").attr("class", "panel-resort-label")
        .attr("x", 0).attr("y", SUB_TITLE_OFFSET)
        .attr("text-anchor", "start").text(name);

      if (!data) {
        pg.append("text")
          .attr("x", innerWidth / 2).attr("y", SUB_H / 2)
          .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
          .attr("fill", "#94a3b8").attr("font-size", "14px")
          .text("Select a resort above");
      }

      if (data) {
        const normalize = state.normalizeY && total ? 100 / total : 1;
        const stacked = data.bins.map((b) => {
          let y0 = 0;
          const out = { lo: b.lo, hi: b.hi };
          COLORS.forEach((ck) => {
            const y1 = y0 + (b.byColor[ck] || 0) * normalize;
            out[ck] = { y0, y1 };
            y0 = y1;
          });
          return out;
        });

        COLORS.map((ck) => ({
          key: ck,
          values: stacked.map((d) => ({ lo: d.lo, hi: d.hi, y0: d[ck].y0, y1: d[ck].y1 })),
        })).forEach((layer) => {
          pg.selectAll(`.bar-${key}-${layer.key}`)
            .data(layer.values, (d) => `${d.lo}-${d.hi}`)
            .join("rect")
            .attr("class", `bar-${key}-${layer.key}`)
            .attr("x", (d) => xScale(d.lo) + (xScale(d.hi) - xScale(d.lo) - barWidth) / 2)
            .attr("width", barWidth)
            .attr("y", (d) => panelYScale(d.y1))
            .attr("height", (d) => Math.max(0, panelYScale(d.y0) - panelYScale(d.y1)))
            .attr("fill", colorScale(layer.key))
            .on("mouseenter", function (event, d) {
              const bin = data.bins.find((b) => b.lo === d.lo && b.hi === d.hi);
              if (!bin) return;
              showTooltip(tooltipEl, event, buildSingleBinHtml(makeBinLabel(d.lo, d.hi), name, bin));
            })
            .on("mousemove", (event) => moveTooltip(tooltipEl, event))
            .on("mouseleave", () => hideTooltip(tooltipEl))
            .on("click", (event, d) => {
              hideTooltip(tooltipEl);
              const runs = key === "A" ? runsA : runsB;
              if (runs) showRunModal(runs, d.lo, d.hi, metric, name, aggregate);
            })
            .style("cursor", "pointer");
        });
      }

      if (data && state.showAggregate && aggBins.length) {
        const pathData = aggBins.filter((d) => d.count > 0);
        if (pathData.length) {
          pg.append("path").datum(pathData)
            .attr("fill", "none").attr("stroke", "#94a3b8")
            .attr("stroke-width", 2).attr("stroke-dasharray", "6,4")
            .attr("d", d3.line()
              .x((d) => xScale((d.bin_start + d.bin_end) / 2))
              .y(state.normalizeY
                ? (d) => panelYScale(d.count * aggNormFactor)
                : (d) => aggIndepScale(d.count)));
        }
      }
    });

    return;
  }

  // ── Single chart (lines mode or bars with ≤1 resort) ────────────────────
  g.append("g").attr("class", "axis x-axis")
    .attr("transform", `translate(0,${innerHeight})`).call(sharedXAxis);
  g.append("g").attr("class", "axis y-axis").call(d3.axisLeft(yScale));

  const xAxisLabel = metric === "average_pitch" ? "Avg Pitch (%)" : "Max Pitch (%)";
  g.append("text").attr("class", "axis-label")
    .attr("x", innerWidth / 2).attr("y", innerHeight + axisLabelYOffset)
    .attr("text-anchor", "middle").text(xAxisLabel);

  g.append("text").attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerHeight / 2).attr("y", yAxisLabelOffset)
    .attr("text-anchor", "middle")
    .text(state.normalizeY ? "% of runs" : "Number of runs");

  if (state.chartMode === "lines") {
    const titleText = metric === "average_pitch" ? "Average Pitch Distribution" : "Max Pitch Distribution";
    g.append("text").attr("class", "panel-resort-label")
      .attr("x", 0).attr("y", SUB_TITLE_OFFSET)
      .attr("text-anchor", "start").text(titleText);
  }

  function drawStackedBars(bins, total, opacity, seriesKey) {
    if (!bins.length) return;
    const prefix = seriesKey ? "bar-" + seriesKey + "-" : "bar-";
    const normalize = state.normalizeY && total ? 100 / total : 1;
    const stacked = bins.map((b) => {
      let y0 = 0;
      const out = { lo: b.lo, hi: b.hi };
      COLORS.forEach((key) => {
        const y1 = y0 + (b.byColor[key] || 0) * normalize;
        out[key] = { y0, y1 };
        y0 = y1;
      });
      return out;
    });

    const layers = COLORS.map((key) => ({
      key,
      values: stacked.map((d) => ({ lo: d.lo, hi: d.hi, y0: d[key].y0, y1: d[key].y1 })),
    }));

    const barWidth = Math.max(2, (xScale(BIN_WIDTH) - xScale(0)) * 0.85);
    const resortLabel = seriesKey === "A"
      ? (state.resortA || "Resort A")
      : seriesKey === "B"
      ? (state.resortB || "Resort B")
      : null;

    layers.forEach((layer) => {
      g.selectAll("." + prefix + layer.key)
        .data(layer.values, (d) => `${prefix}${layer.key}-${d.lo}-${d.hi}`)
        .join("rect")
        .attr("class", prefix + layer.key)
        .attr("x", (d) => xScale(d.lo) + (xScale(d.hi) - xScale(d.lo) - barWidth) / 2)
        .attr("width", barWidth)
        .attr("y", (d) => yScale(d.y1))
        .attr("height", (d) => Math.max(0, yScale(d.y0) - yScale(d.y1)))
        .attr("fill", colorScale(layer.key))
        .attr("fill-opacity", opacity)
        .attr("stroke", opacity < 1 ? "#f97316" : "none")
        .attr("stroke-width", 1)
        .on("mouseenter", function (event, d) {
          const bin = bins.find((b) => b.lo === d.lo && b.hi === d.hi);
          if (!bin) return;
          showTooltip(tooltipEl, event, buildSingleBinHtml(makeBinLabel(d.lo, d.hi), resortLabel, bin));
        })
        .on("mousemove", (event) => moveTooltip(tooltipEl, event))
        .on("mouseleave", () => hideTooltip(tooltipEl))
        .on("click", (event, d) => {
          hideTooltip(tooltipEl);
          const runs = seriesKey === "A" ? runsA : runsB;
          if (runs && resortLabel) showRunModal(runs, d.lo, d.hi, metric, resortLabel, aggregate);
        })
        .style("cursor", "pointer");
    });
  }

  function drawResortArea(bins, total, seriesKey) {
    if (!bins.length) return;
    const normalize = state.normalizeY && total ? 100 / total : 1;
    const color = RESORT_COLORS[seriesKey];
    const points = bins.map((b) => ({ x: (b.lo + b.hi) / 2, y: b.total * normalize }));

    const areaGen = d3.area()
      .x((d) => xScale(d.x)).y0(innerHeight).y1((d) => yScale(d.y))
      .curve(d3.curveMonotoneX);
    const lineGen = d3.line()
      .x((d) => xScale(d.x)).y((d) => yScale(d.y))
      .curve(d3.curveMonotoneX);

    g.append("path").datum(points)
      .attr("class", `area-${seriesKey}-fill`)
      .attr("fill", color)
      .attr("fill-opacity", seriesKey === "B" ? 0.14 : 0.18)
      .attr("d", areaGen);

    g.append("path").datum(points)
      .attr("class", `area-${seriesKey}-line`)
      .attr("fill", "none").attr("stroke", color).attr("stroke-width", 2.5)
      .attr("d", lineGen);
  }

  // Full-height transparent overlays so lines mode shows a combined tooltip per bin.
  function drawBinTooltipOverlays() {
    const binMap = new Map();
    const addBin = (data, key) => {
      if (!data) return;
      data.bins.forEach((b) => {
        const entry = binMap.get(b.lo) || { lo: b.lo, hi: b.hi };
        entry[key] = b;
        binMap.set(b.lo, entry);
      });
    };
    addBin(dataA, "A");
    addBin(dataB, "B");

    const totalBinPx = xScale(BIN_WIDTH) - xScale(0);
    binMap.forEach(({ lo, hi, A: binA, B: binB }) => {
      g.append("rect")
        .attr("x", xScale(lo)).attr("width", totalBinPx)
        .attr("y", 0).attr("height", innerHeight)
        .attr("fill", "transparent").attr("cursor", "crosshair")
        .on("mouseenter", function (event) {
          const entries = [
            { key: "A", bin: binA, name: state.resortA || "Resort A" },
            { key: "B", bin: binB, name: state.resortB || "Resort B" },
          ];
          showTooltip(tooltipEl, event, buildMultiBinHtml(makeBinLabel(lo, hi), entries));
        })
        .on("mousemove", (event) => moveTooltip(tooltipEl, event))
        .on("mouseleave", () => hideTooltip(tooltipEl));
    });
  }

  if (state.chartMode === "lines") {
    if (!hasResortData) {
      g.append("text")
        .attr("x", innerWidth / 2).attr("y", innerHeight / 2)
        .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
        .attr("fill", "#94a3b8").attr("font-size", "14px")
        .text("Select a resort above");
    } else {
      if (dataA) drawResortArea(dataA.bins, totalA, "A");
      if (dataB) drawResortArea(dataB.bins, totalB, "B");
      drawBinTooltipOverlays();
    }
  } else {
    if (dataA) drawStackedBars(dataA.bins, totalA, 1, "A");
    if (dataB) drawStackedBars(dataB.bins, totalB, 0.55, "B");
  }

  // In lines mode show aggregate only when at least one resort is selected.
  if (state.showAggregate && aggBins.length && (state.chartMode !== "lines" || hasResortData)) {
    const totalForScale = Math.max(totalA || 0, totalB || 0);
    const aggNormalize = state.normalizeY && aggregate.total_runs
      ? (100 / aggregate.total_runs)
      : (hasResortData && totalForScale && aggregate.total_runs
          ? (totalForScale / aggregate.total_runs)
          : 1);
    const pathData = aggBins.filter((d) => d.count > 0);
    if (pathData.length) {
      g.append("path").datum(pathData)
        .attr("fill", "none").attr("stroke", "#94a3b8")
        .attr("stroke-width", 2).attr("stroke-dasharray", "6,4")
        .attr("d", d3.line()
          .x((d) => xScale((d.bin_start + d.bin_end) / 2))
          .y((d) => yScale(d.count * aggNormalize)));
    }
  }
}
