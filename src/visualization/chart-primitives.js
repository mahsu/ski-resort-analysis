import { COLORS } from "./constants.js";

/** Convert per-bin difficulty counts into stacked bar layers. */
export function buildStackedBarLayers(bins, normalizeFactor) {
  const stacked = bins.map((b) => {
    let y0 = 0;
    const out = { lo: b.lo, hi: b.hi };
    COLORS.forEach((colorKey) => {
      const y1 = y0 + (b.byColor[colorKey] || 0) * normalizeFactor;
      out[colorKey] = { y0, y1 };
      y0 = y1;
    });
    return out;
  });

  return COLORS.map((colorKey) => ({
    key: colorKey,
    values: stacked.map((d) => ({
      lo: d.lo,
      hi: d.hi,
      y0: d[colorKey].y0,
      y1: d[colorKey].y1,
    })),
  }));
}

/** Shared D3 renderer for stacked bar layers. */
export function renderStackedBarLayers({
  group,
  layers,
  classPrefix,
  dataKey,
  xScale,
  yScale,
  barWidth,
  colorScale,
  fillOpacity = 1,
  stroke = "none",
  strokeWidth = 1,
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
  onClick,
}) {
  layers.forEach((layer) => {
    const selection = group
      .selectAll(`.${classPrefix}${layer.key}`)
      .data(layer.values, (d) => dataKey(d, layer.key))
      .join("rect")
      .attr("class", `${classPrefix}${layer.key}`)
      .attr("x", (d) => xScale(d.lo) + (xScale(d.hi) - xScale(d.lo) - barWidth) / 2)
      .attr("width", barWidth)
      .attr("y", (d) => yScale(d.y1))
      .attr("height", (d) => Math.max(0, yScale(d.y0) - yScale(d.y1)))
      .attr("fill", colorScale(layer.key))
      .style("cursor", "pointer");

    if (fillOpacity !== 1) selection.attr("fill-opacity", fillOpacity);
    if (stroke !== "none") selection.attr("stroke", stroke);
    if (strokeWidth !== 1 || stroke !== "none") selection.attr("stroke-width", strokeWidth);

    if (onMouseEnter) {
      selection.on("mouseenter", function (event, d) {
        onMouseEnter(event, d, layer.key);
      });
    }
    if (onMouseMove) selection.on("mousemove", onMouseMove);
    if (onMouseLeave) selection.on("mouseleave", onMouseLeave);
    if (onClick) selection.on("click", onClick);
  });
}
