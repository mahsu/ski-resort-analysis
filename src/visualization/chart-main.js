import { BIN_WIDTH, MAX_PITCH, COLORS, COLOR_HEX } from "./constants.js";
import { capAggregateBins, binRuns } from "./data.js";
import { getMetricMeta } from "./metric-meta.js";
import { buildLayoutConstants } from "./chart-layout.js";
import { renderBarsSmallMultiples, renderSingleChartMode } from "./chart-renderers.js";

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

export function drawChart(aggregate, resortCache, state) {
  const chartEl = document.getElementById("chart");
  const tooltipEl = document.getElementById("tooltip");
  if (!chartEl || !aggregate) return;

  const metric = state.metric;
  const runsA = state.resortA ? resortCache[state.resortA] : null;
  const runsB = state.resortB ? resortCache[state.resortB] : null;
  const labels = {
    resortA: state.resortA || "Resort A",
    resortB: state.resortB || "Resort B",
  };

  const aggBins = capAggregateBins(aggregate.overall_histogram[getMetricMeta(metric).histogramKey] || []);

  let dataA = null;
  let dataB = null;
  let totalA = 0;
  let totalB = 0;
  if (runsA && Array.isArray(runsA)) {
    dataA = binRuns(runsA, metric);
    totalA = dataA.total;
  }
  if (runsB && Array.isArray(runsB)) {
    dataB = binRuns(runsB, metric);
    totalB = dataB.total;
  }

  const { maxVal, normalizedMax, hasResortData } = computeScaleBounds(
    dataA,
    dataB,
    aggBins,
    totalA,
    totalB,
    state,
    aggregate
  );

  const useSmallMultiples = state.chartMode === "bars";
  const isLinesMode = state.chartMode === "lines";

  d3.select(chartEl).selectAll("*").remove();
  const chartWrap = chartEl.closest(".chart-wrap");
  if (chartWrap) chartWrap.classList.toggle("lines-mode", isLinesMode);

  const constants = buildLayoutConstants(chartEl, useSmallMultiples, isLinesMode);
  const { width, margin, innerWidth, innerHeight, svgHeight, xTickStep, isCompact, chartHeight } = constants;

  chartEl.style.height = useSmallMultiples ? `${svgHeight}px` : isLinesMode ? `${chartHeight}px` : "";
  chartEl.classList.toggle("compact-chart", isCompact);

  const svg = d3
    .select(chartEl)
    .append("svg")
    .attr("width", width)
    .attr("height", svgHeight)
    .attr("viewBox", [0, 0, width, svgHeight]);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const xScale = d3.scaleLinear().domain([0, MAX_PITCH + BIN_WIDTH]).range([0, innerWidth]);
  const yDomain = state.normalizeY ? [0, normalizedMax * 1.05] : [0, maxVal * 1.05];
  const yScale = d3.scaleLinear().domain(yDomain).range([innerHeight, 0]);
  const colorScale = d3.scaleOrdinal().domain(COLORS).range(COLORS.map((c) => COLOR_HEX[c]));
  const sharedXAxis = d3
    .axisBottom(xScale)
    .tickValues(d3.range(0, MAX_PITCH + 1, xTickStep))
    .tickFormat((d) => (d === MAX_PITCH ? `${d}%+` : `${d}%`));

  if (useSmallMultiples) {
    renderBarsSmallMultiples({
      svg,
      margin,
      constants,
      state,
      aggregate,
      metric,
      labels,
      dataA,
      dataB,
      totalA,
      totalB,
      runsA,
      runsB,
      aggBins,
      maxVal,
      normalizedMax,
      xScale,
      sharedXAxis,
      colorScale,
      tooltipEl,
    });
    return;
  }

  renderSingleChartMode({
    group: g,
    constants,
    state,
    aggregate,
    metric,
    labels,
    hasResortData,
    dataA,
    dataB,
    totalA,
    totalB,
    runsA,
    runsB,
    aggBins,
    xScale,
    yScale,
    sharedXAxis,
    colorScale,
    tooltipEl,
  });
}
