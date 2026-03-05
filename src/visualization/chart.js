import { BIN_WIDTH, MAX_PITCH, COLORS, COLOR_LABELS, RESORT_COLORS, COLOR_HEX } from "./constants.js";
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
  entries.forEach(({ key, bin, name }) => {
    if (!bin) return;
    const parts = COLORS.filter((c) => (bin.byColor[c] || 0) > 0)
      .map((c) => `${COLOR_LABELS[c]}: ${bin.byColor[c]}`);
    if (!parts.length) return;
    html += `<div class="tip-resort" style="color:${RESORT_COLORS[key]}">${name || "Resort " + key}</div>`;
    html += parts.map((p) => `<div class="tip-row">${p}</div>`).join("");
  });
  return html;
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

  const width = Math.max(chartEl.getBoundingClientRect().width || 0, chartEl.offsetWidth || 600);
  const margin = { top: 40, right: 20, bottom: 50, left: 50 };
  const innerWidth = width - margin.left - margin.right;

  const SUB_H = 165, SUB_GAP = 80, SUB_TITLE_OFFSET = -20;
  const svgHeight = useSmallMultiples ? margin.top + SUB_H * 2 + SUB_GAP + margin.bottom : 420;
  const innerHeight = useSmallMultiples ? SUB_H : 420 - margin.top - margin.bottom;

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
    .tickValues(d3.range(0, MAX_PITCH + 1, 10))
    .tickFormat((d) => d === MAX_PITCH ? d + "%+" : d + "%");

  // ── Small multiples (bars mode) ──────────────────────────────────────────
  if (useSmallMultiples) {
    const barWidth = Math.max(2, (xScale(BIN_WIDTH) - xScale(0)) * 0.85);
    const panels = [
      { data: dataA, total: totalA, key: "A", name: state.resortA || "Resort A", offsetY: margin.top },
      { data: dataB, total: totalB, key: "B", name: state.resortB || "Resort B", offsetY: margin.top + SUB_H + SUB_GAP },
    ];

    panels.forEach(({ data, total, key, name, offsetY }, idx) => {
      const isBottom = idx === panels.length - 1;
      const pg = svg.append("g").attr("transform", `translate(${margin.left},${offsetY})`);

      // Both panels share the same y-domain so their axes are always synced.
      const panelYDomain = state.normalizeY ? [0, normalizedMax * 1.05] : [0, maxVal * 1.05];
      const panelYScale = d3.scaleLinear().domain(panelYDomain).range([SUB_H, 0]);

      pg.append("g").attr("class", "axis x-axis")
        .attr("transform", `translate(0,${SUB_H})`).call(sharedXAxis);
      pg.append("g").attr("class", "axis y-axis").call(d3.axisLeft(panelYScale).ticks(4));

      if (isBottom) {
        pg.append("text").attr("class", "axis-label")
          .attr("x", innerWidth / 2).attr("y", SUB_H + 38)
          .attr("text-anchor", "middle").text("Pitch (%)");
      }

      pg.append("text").attr("class", "axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -SUB_H / 2).attr("y", -42)
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
            .on("mouseleave", () => hideTooltip(tooltipEl));
        });
      }

      if (data && state.showAggregate && aggBins.length) {
        const aggNorm = state.normalizeY && aggregate.total_runs
          ? 100 / aggregate.total_runs
          : (total && aggregate.total_runs ? total / aggregate.total_runs : 1);
        const pathData = aggBins.filter((d) => d.count > 0);
        if (pathData.length) {
          pg.append("path").datum(pathData)
            .attr("fill", "none").attr("stroke", "#94a3b8")
            .attr("stroke-width", 2).attr("stroke-dasharray", "6,4")
            .attr("d", d3.line()
              .x((d) => xScale((d.bin_start + d.bin_end) / 2))
              .y((d) => panelYScale(d.count * aggNorm)));
        }
      }
    });

    return;
  }

  // ── Single chart (lines mode or bars with ≤1 resort) ────────────────────
  g.append("g").attr("class", "axis x-axis")
    .attr("transform", `translate(0,${innerHeight})`).call(sharedXAxis);
  g.append("g").attr("class", "axis y-axis").call(d3.axisLeft(yScale));

  g.append("text").attr("class", "axis-label")
    .attr("x", innerWidth / 2).attr("y", innerHeight + 38)
    .attr("text-anchor", "middle").text("Pitch (%)");

  g.append("text").attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerHeight / 2).attr("y", -42)
    .attr("text-anchor", "middle")
    .text(state.normalizeY ? "% of runs" : "Number of runs");

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
        .on("mouseleave", () => hideTooltip(tooltipEl));
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
    if (dataA) drawResortArea(dataA.bins, totalA, "A");
    if (dataB) drawResortArea(dataB.bins, totalB, "B");
    if (hasResortData) drawBinTooltipOverlays();
  } else {
    if (dataA) drawStackedBars(dataA.bins, totalA, 1, "A");
    if (dataB) drawStackedBars(dataB.bins, totalB, 0.55, "B");
  }

  if (state.showAggregate && aggBins.length) {
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
