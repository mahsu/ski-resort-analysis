import { BIN_WIDTH, RESORT_COLORS } from "./constants.js";
import { buildStackedBarLayers, renderStackedBarLayers } from "./chart-primitives.js";
import { showRunModal } from "./run-modal.js";
import { getMetricMeta } from "./metric-meta.js";
import { appendAxesAndLabels, drawAggregateLine, renderCenteredMessage } from "./chart-layout.js";
import { buildMultiBinHtml, buildSingleBinHtml, hideTooltip, makeBinLabel, moveTooltip, showTooltip } from "./chart-tooltips.js";

function buildBinLookup(bins) {
  return new Map(bins.map((b) => [`${b.lo}-${b.hi}`, b]));
}

function renderStackedBarsWithTooltip({
  group,
  bins,
  total,
  seriesKey,
  resortLabel,
  runs,
  metric,
  aggregate,
  state,
  tooltipEl,
  xScale,
  yScale,
  colorScale,
  barWidth,
  fillOpacity = 1,
  stroke = "none",
  strokeWidth = 1,
}) {
  if (!bins.length) return;
  const normalizeFactor = state.normalizeY && total ? 100 / total : 1;
  const layers = buildStackedBarLayers(bins, normalizeFactor);
  const binsByRange = buildBinLookup(bins);
  const prefix = seriesKey ? `bar-${seriesKey}-` : "bar-";

  renderStackedBarLayers({
    group,
    layers,
    classPrefix: prefix,
    dataKey: (d, layerKey) => `${prefix}${layerKey}-${d.lo}-${d.hi}`,
    xScale,
    yScale,
    barWidth,
    colorScale,
    fillOpacity,
    stroke,
    strokeWidth,
    onMouseEnter: (event, d) => {
      const bin = binsByRange.get(`${d.lo}-${d.hi}`);
      if (!bin) return;
      showTooltip(tooltipEl, event, buildSingleBinHtml(makeBinLabel(d.lo, d.hi), resortLabel, bin));
    },
    onMouseMove: (event) => moveTooltip(tooltipEl, event),
    onMouseLeave: () => hideTooltip(tooltipEl),
    onClick: (_event, d) => {
      hideTooltip(tooltipEl);
      if (runs && resortLabel) showRunModal(runs, d.lo, d.hi, metric, resortLabel, aggregate);
    },
  });
}

function renderResortAreaSeries(group, bins, total, seriesKey, state, xScale, yScale, innerHeight) {
  if (!bins.length) return;
  const normalizeFactor = state.normalizeY && total ? 100 / total : 1;
  const color = RESORT_COLORS[seriesKey];
  const points = bins.map((b) => ({ x: (b.lo + b.hi) / 2, y: b.total * normalizeFactor }));

  const areaGen = d3
    .area()
    .x((d) => xScale(d.x))
    .y0(innerHeight)
    .y1((d) => yScale(d.y))
    .curve(d3.curveMonotoneX);
  const lineGen = d3
    .line()
    .x((d) => xScale(d.x))
    .y((d) => yScale(d.y))
    .curve(d3.curveMonotoneX);

  group
    .append("path")
    .datum(points)
    .attr("class", `area-${seriesKey}-fill`)
    .attr("fill", color)
    .attr("fill-opacity", seriesKey === "B" ? 0.14 : 0.18)
    .attr("d", areaGen);

  group
    .append("path")
    .datum(points)
    .attr("class", `area-${seriesKey}-line`)
    .attr("fill", "none")
    .attr("stroke", color)
    .attr("stroke-width", 2.5)
    .attr("d", lineGen);
}

function renderLinesBinTooltipOverlays(group, dataA, dataB, labels, tooltipEl, xScale, innerHeight) {
  const binMap = new Map();
  const addBins = (data, key) => {
    if (!data) return;
    data.bins.forEach((b) => {
      const entry = binMap.get(b.lo) || { lo: b.lo, hi: b.hi };
      entry[key] = b;
      binMap.set(b.lo, entry);
    });
  };
  addBins(dataA, "A");
  addBins(dataB, "B");

  const totalBinPx = xScale(BIN_WIDTH) - xScale(0);
  binMap.forEach(({ lo, hi, A: binA, B: binB }) => {
    group
      .append("rect")
      .attr("x", xScale(lo))
      .attr("width", totalBinPx)
      .attr("y", 0)
      .attr("height", innerHeight)
      .attr("fill", "transparent")
      .attr("cursor", "crosshair")
      .on("mouseenter", (event) => {
        const entries = [
          { key: "A", bin: binA, name: labels.resortA },
          { key: "B", bin: binB, name: labels.resortB },
        ];
        showTooltip(tooltipEl, event, buildMultiBinHtml(makeBinLabel(lo, hi), entries));
      })
      .on("mousemove", (event) => moveTooltip(tooltipEl, event))
      .on("mouseleave", () => hideTooltip(tooltipEl));
  });
}

export function renderBarsSmallMultiples({
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
}) {
  const { innerWidth, SUB_H, SUB_GAP, SUB_TITLE_OFFSET, axisLabelYOffset, yAxisLabelOffset } = constants;
  const barWidth = Math.max(2, (xScale(BIN_WIDTH) - xScale(0)) * 0.85);
  const panelYDomain = state.normalizeY ? [0, normalizedMax * 1.05] : [0, maxVal * 1.05];
  const aggRawMax = d3.max(aggBins, (d) => d.count) || 1;
  const aggIndepScale = d3.scaleLinear().domain([0, aggRawMax]).range([SUB_H, 0]);
  const aggNormFactor = aggregate.total_runs ? 100 / aggregate.total_runs : 1;
  const pathData = aggBins.filter((d) => d.count > 0);

  const panels = [
    { data: dataA, total: totalA, key: "A", name: labels.resortA, runs: runsA, offsetY: margin.top },
    { data: dataB, total: totalB, key: "B", name: labels.resortB, runs: runsB, offsetY: margin.top + SUB_H + SUB_GAP },
  ];

  panels.forEach(({ data, total, key, name, runs, offsetY }) => {
    const panelGroup = svg.append("g").attr("transform", `translate(${margin.left},${offsetY})`);
    const panelYScale = d3.scaleLinear().domain(panelYDomain).range([SUB_H, 0]);

    appendAxesAndLabels({
      group: panelGroup,
      sharedXAxis,
      yScale: panelYScale,
      innerWidth,
      innerHeight: SUB_H,
      axisLabelYOffset,
      yAxisLabelOffset,
      metricAxisLabel: getMetricMeta(metric).axisLabel,
      normalizeY: state.normalizeY,
      yTicks: 4,
    });

    panelGroup
      .append("text")
      .attr("class", "panel-resort-label")
      .attr("x", 0)
      .attr("y", SUB_TITLE_OFFSET)
      .attr("text-anchor", "start")
      .text(name);

    if (!data) {
      renderCenteredMessage(panelGroup, innerWidth, SUB_H, "Select a resort above");
      return;
    }

    renderStackedBarsWithTooltip({
      group: panelGroup,
      bins: data.bins,
      total,
      seriesKey: key,
      resortLabel: name,
      runs,
      metric,
      aggregate,
      state,
      tooltipEl,
      xScale,
      yScale: panelYScale,
      colorScale,
      barWidth,
    });

    if (state.showAggregate && pathData.length) {
      const yForCount = state.normalizeY
        ? (count) => panelYScale(count * aggNormFactor)
        : (count) => aggIndepScale(count);
      drawAggregateLine(panelGroup, pathData, xScale, yForCount);
    }
  });
}

export function renderSingleChartMode({
  group,
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
}) {
  const { innerWidth, innerHeight, axisLabelYOffset, yAxisLabelOffset, SUB_TITLE_OFFSET } = constants;

  appendAxesAndLabels({
    group,
    sharedXAxis,
    yScale,
    innerWidth,
    innerHeight,
    axisLabelYOffset,
    yAxisLabelOffset,
    metricAxisLabel: getMetricMeta(metric).axisLabel,
    normalizeY: state.normalizeY,
  });

  if (state.chartMode === "lines") {
    group
      .append("text")
      .attr("class", "panel-resort-label")
      .attr("x", 0)
      .attr("y", SUB_TITLE_OFFSET)
      .attr("text-anchor", "start")
      .text(getMetricMeta(metric).distributionTitle);
  }

  const barWidth = Math.max(2, (xScale(BIN_WIDTH) - xScale(0)) * 0.85);

  if (state.chartMode === "lines") {
    if (!hasResortData) {
      renderCenteredMessage(group, innerWidth, innerHeight, "Select a resort above");
    } else {
      if (dataA) renderResortAreaSeries(group, dataA.bins, totalA, "A", state, xScale, yScale, innerHeight);
      if (dataB) renderResortAreaSeries(group, dataB.bins, totalB, "B", state, xScale, yScale, innerHeight);
      renderLinesBinTooltipOverlays(group, dataA, dataB, labels, tooltipEl, xScale, innerHeight);
    }
  } else {
    if (dataA) {
      renderStackedBarsWithTooltip({
        group,
        bins: dataA.bins,
        total: totalA,
        seriesKey: "A",
        resortLabel: labels.resortA,
        runs: runsA,
        metric,
        aggregate,
        state,
        tooltipEl,
        xScale,
        yScale,
        colorScale,
        barWidth,
      });
    }
    if (dataB) {
      renderStackedBarsWithTooltip({
        group,
        bins: dataB.bins,
        total: totalB,
        seriesKey: "B",
        resortLabel: labels.resortB,
        runs: runsB,
        metric,
        aggregate,
        state,
        tooltipEl,
        xScale,
        yScale,
        colorScale,
        barWidth,
        fillOpacity: 0.55,
        stroke: "#f97316",
      });
    }
  }

  if (state.showAggregate && aggBins.length && (state.chartMode !== "lines" || hasResortData)) {
    const totalForScale = Math.max(totalA || 0, totalB || 0);
    const aggNormalize = state.normalizeY && aggregate.total_runs
      ? 100 / aggregate.total_runs
      : hasResortData && totalForScale && aggregate.total_runs
        ? totalForScale / aggregate.total_runs
        : 1;
    const pathData = aggBins.filter((d) => d.count > 0);
    drawAggregateLine(group, pathData, xScale, (count) => yScale(count * aggNormalize));
  }
}
