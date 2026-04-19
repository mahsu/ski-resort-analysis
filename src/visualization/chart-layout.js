export function renderCenteredMessage(group, width, height, text) {
  group
    .append("text")
    .attr("x", width / 2)
    .attr("y", height / 2)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("fill", "#94a3b8")
    .attr("font-size", "14px")
    .text(text);
}

export function appendAxesAndLabels({
  group,
  sharedXAxis,
  yScale,
  innerWidth,
  innerHeight,
  axisLabelYOffset,
  yAxisLabelOffset,
  metricAxisLabel,
  normalizeY,
  yTicks,
}) {
  group
    .append("g")
    .attr("class", "axis x-axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(sharedXAxis);

  const yAxis = d3.axisLeft(yScale);
  if (yTicks != null) yAxis.ticks(yTicks);
  group.append("g").attr("class", "axis y-axis").call(yAxis);

  group
    .append("text")
    .attr("class", "axis-label")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + axisLabelYOffset)
    .attr("text-anchor", "middle")
    .text(metricAxisLabel);

  group
    .append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerHeight / 2)
    .attr("y", yAxisLabelOffset)
    .attr("text-anchor", "middle")
    .text(normalizeY ? "% of runs" : "Number of runs");
}

export function drawAggregateLine(group, pathData, xScale, yForCount) {
  if (!pathData.length) return;
  group
    .append("path")
    .datum(pathData)
    .attr("fill", "none")
    .attr("stroke", "#94a3b8")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "6,4")
    .attr(
      "d",
      d3
        .line()
        .x((d) => xScale((d.bin_start + d.bin_end) / 2))
        .y((d) => yForCount(d.count))
    );
}

export function buildLayoutConstants(chartEl, useSmallMultiples, isLinesMode) {
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

  const chartWrap = chartEl.closest(".chart-wrap");
  const chartHeight = isLinesMode && chartWrap
    ? Math.max(CHART_HEIGHT, chartEl.offsetHeight || CHART_HEIGHT)
    : CHART_HEIGHT;
  const svgHeight = useSmallMultiples ? margin.top + SUB_H * 2 + SUB_GAP + margin.bottom : chartHeight;
  const innerHeight = useSmallMultiples ? SUB_H : chartHeight - margin.top - margin.bottom;

  return {
    width,
    isCompact,
    margin,
    innerWidth,
    chartHeight,
    svgHeight,
    innerHeight,
    SUB_H,
    SUB_GAP,
    SUB_TITLE_OFFSET,
    axisLabelYOffset,
    yAxisLabelOffset,
    xTickStep,
  };
}
