(function () {
  "use strict";

  const BIN_WIDTH = 5;
  const MAX_PITCH = 90;
  const RESORT_COLORS = { A: "#22d3ee", B: "#fb923c" };
  const COLORS = ["green", "blue", "black", "grey", "orange"];
  const COLOR_LABELS = {
    green: "Easy/Novice",
    blue: "Intermediate",
    black: "Advanced/Expert",
    grey: "Extreme/Other",
    orange: "Other",
  };
  const PITCH_FIELDS = {
    average_pitch: "average_pitch_%",
    max_pitch: "max_pitch_%",
  };

  let aggregate = null;
  let resortCache = {};
  let state = {
    resortA: null,
    resortB: null,
    metric: "average_pitch",
    showAggregate: true,
    normalizeY: false,
    chartMode: "bars",
  };

  const $ = (id) => document.getElementById(id);
  const chartEl = $("chart");
  const tooltipEl = $("tooltip");

  function pitchToPct(run, metric) {
    const key = PITCH_FIELDS[metric];
    const v = run[key];
    if (v == null || typeof v !== "number") return null;
    return v * 100;
  }

  function getRunsWithPitch(runs, metric) {
    return runs
      .map((r) => ({
        ...r,
        pitchPct: pitchToPct(r, metric),
        color: (r.color || "grey").toLowerCase(),
      }))
      .filter((r) => r.pitchPct != null && COLORS.includes(r.color));
  }

  function capAggregateBins(aggBins) {
    const capped = aggBins.filter((d) => d.bin_start < MAX_PITCH);
    const overflow = aggBins.filter((d) => d.bin_start >= MAX_PITCH);
    if (overflow.length) {
      capped.push({
        bin_start: MAX_PITCH,
        bin_end: MAX_PITCH + BIN_WIDTH,
        count: overflow.reduce((s, d) => s + d.count, 0),
      });
    }
    return capped;
  }

  function binRuns(runs, metric) {
    const key = PITCH_FIELDS[metric];
    const withPitch = getRunsWithPitch(runs, metric);
    const clamped = withPitch.map((r) => ({ ...r, pitchPct: Math.min(r.pitchPct, MAX_PITCH) }));
    const bins = d3.bin()
      .domain([0, MAX_PITCH + BIN_WIDTH])
      .thresholds(d3.range(0, MAX_PITCH + BIN_WIDTH, BIN_WIDTH))
      .value((r) => r.pitchPct)(clamped);

    const byBin = new Map();
    bins.forEach((bin, i) => {
      const lo = bin.x0;
      const hi = bin.x1;
      const key = `${lo}-${hi}`;
      const byColor = { green: 0, blue: 0, black: 0, grey: 0, orange: 0 };
      bin.forEach((r) => {
        if (byColor[r.color] !== undefined) byColor[r.color] += 1;
      });
      byBin.set(key, { lo, hi, total: bin.length, byColor });
    });

    return { bins: Array.from(byBin.values()), total: withPitch.length };
  }

  const DATA_BASE = "../../data/";

  function loadAggregate() {
    return fetch(DATA_BASE + "aggregate_stats.json")
      .then((r) => r.json())
      .then((data) => {
        aggregate = data;
        return data;
      });
  }

  function loadResort(name) {
    if (resortCache[name]) return Promise.resolve(resortCache[name]);
    const path = "resorts/" + encodeURIComponent(name) + ".json";
    return fetch(DATA_BASE + path)
      .then((r) => {
        if (!r.ok) throw new Error("Resort not found");
        return r.json();
      })
      .then((runs) => {
        if (Array.isArray(runs)) resortCache[name] = runs;
        return runs;
      });
  }

  function fillResortSelect(selectId, resortNames) {
    const sel = $(selectId);
    sel.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Select resort —";
    sel.appendChild(opt0);
    resortNames.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  }

  function drawChart() {
    if (!chartEl || !aggregate) return;

    const metric = state.metric;
    const runsA = state.resortA ? resortCache[state.resortA] : null;
    const runsB = state.resortB ? resortCache[state.resortB] : null;

    // Compute data before layout so we know whether to use small multiples
    const histKey = metric === "average_pitch" ? "average_pitch" : "max_pitch";
    const aggBins = capAggregateBins(aggregate.overall_histogram[histKey] || []);
    const hasResortData = (runsA && Array.isArray(runsA)) || (runsB && Array.isArray(runsB));

    let dataA = null, dataB = null, totalA = 0, totalB = 0;
    if (runsA && Array.isArray(runsA)) { dataA = binRuns(runsA, metric); totalA = dataA.total; }
    if (runsB && Array.isArray(runsB)) { dataB = binRuns(runsB, metric); totalB = dataB.total; }

    const useSmallMultiples = state.chartMode === "bars" && dataA != null && dataB != null;

    d3.select(chartEl).selectAll("*").remove();

    const width = Math.max(chartEl.getBoundingClientRect().width || 0, chartEl.offsetWidth || 600);
    const margin = { top: 20, right: 20, bottom: 50, left: 50 };
    const innerWidth = width - margin.left - margin.right;

    // Layout dimensions — small multiples stacks two panels vertically
    const SUB_H = 165, SUB_GAP = 144, SUB_TITLE_OFFSET = -12;
    const svgHeight = useSmallMultiples
      ? margin.top + SUB_H * 2 + SUB_GAP + margin.bottom
      : 420;
    const innerHeight = useSmallMultiples ? SUB_H : 420 - margin.top - margin.bottom;

    const svg = d3.select(chartEl).append("svg")
      .attr("width", width).attr("height", svgHeight)
      .attr("viewBox", [0, 0, width, svgHeight]);

    // g is used by single-chart paths (lines mode, ≤1 resort bars)
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Global maxVal (used by single-chart modes for shared y-scale)
    let maxVal = 1;
    if (hasResortData) {
      [dataA, dataB].forEach((data) => {
        if (data && data.bins.length) {
          data.bins.forEach((b) => { if (b.total > maxVal) maxVal = b.total; });
        }
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

    let normalizedMax = 0;
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

    const xMax = MAX_PITCH + BIN_WIDTH;
    const xScale = d3.scaleLinear().domain([0, xMax]).range([0, innerWidth]);
    const yDomain = state.normalizeY ? [0, normalizedMax * 1.05] : [0, maxVal * 1.05];
    const yScale = d3.scaleLinear().domain(yDomain).range([innerHeight, 0]);

    const colorScale = d3.scaleOrdinal().domain(COLORS).range([
      "#22c55e", "#3b82f6", "#1e293b", "#64748b", "#f97316",
    ]);

    const sharedXAxis = d3.axisBottom(xScale)
      .tickValues(d3.range(0, MAX_PITCH + 1, 10))
      .tickFormat((d) => d === MAX_PITCH ? d + "%+" : d + "%");

    // ── Small multiples (bars mode, both resorts selected) ───────────────────
    if (useSmallMultiples) {
      const barWidth = Math.max(2, (xScale(BIN_WIDTH) - xScale(0)) * 0.85);
      const panels = [
        { data: dataA, total: totalA, key: "A", name: state.resortA || "Resort A", offsetY: margin.top },
        { data: dataB, total: totalB, key: "B", name: state.resortB || "Resort B", offsetY: margin.top + SUB_H + SUB_GAP },
      ];

      panels.forEach(({ data, total, key, name, offsetY }, idx) => {
        const isBottom = idx === panels.length - 1;
        const pg = svg.append("g").attr("transform", `translate(${margin.left},${offsetY})`);

        // Normalized: shared scale across panels (normalizedMax pre-computed from both resorts).
        // Raw counts: per-panel free scale so each resort's bars fill its panel.
        let panelMax = 1;
        if (!state.normalizeY) {
          if (data && data.bins.length) {
            data.bins.forEach((b) => { if (b.total > panelMax) panelMax = b.total; });
          }
          if (state.showAggregate && aggBins.length && aggregate.total_runs && total) {
            const s = d3.max(aggBins, (d) => d.count * (total / aggregate.total_runs)) || 0;
            if (s > panelMax) panelMax = s;
          }
        }
        const panelYDomain = state.normalizeY ? [0, normalizedMax * 1.05] : [0, panelMax * 1.05];
        const panelYScale = d3.scaleLinear().domain(panelYDomain).range([SUB_H, 0]);

        // Axes
        pg.append("g").attr("class", "axis x-axis")
          .attr("transform", `translate(0,${SUB_H})`).call(sharedXAxis);
        pg.append("g").attr("class", "axis y-axis").call(d3.axisLeft(panelYScale).ticks(4));

        // x-axis label only on bottom panel
        if (isBottom) {
          pg.append("text").attr("class", "axis-label")
            .attr("x", innerWidth / 2).attr("y", SUB_H + 38)
            .attr("text-anchor", "middle").text("Pitch (%)");
        }

        // y-axis label
        pg.append("text").attr("class", "axis-label")
          .attr("transform", "rotate(-90)")
          .attr("x", -SUB_H / 2).attr("y", -42)
          .attr("text-anchor", "middle")
          .text(state.normalizeY ? "% of runs" : "Number of runs");

        // Resort name tag above panel
        pg.append("text").attr("class", "panel-resort-label")
          .attr("x", 0).attr("y", SUB_TITLE_OFFSET)
          .attr("text-anchor", "start").text(name);

        // Stacked bars
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
                const parts = COLORS.filter((c) => (bin.byColor[c] || 0) > 0)
                  .map((c) => `${COLOR_LABELS[c]}: ${bin.byColor[c]}`);
                const binLabel = d.lo >= MAX_PITCH ? `≥ ${MAX_PITCH}%` : `${d.lo}% – ${d.hi}%`;
                tooltipEl.innerHTML =
                  `<div class="tip-resort">${name}</div>` +
                  `<div class="tip-title">${binLabel}</div>` +
                  parts.map((p) => `<div class="tip-row">${p}</div>`).join("");
                tooltipEl.classList.add("visible");
                tooltipEl.style.left = event.clientX + 12 + "px";
                tooltipEl.style.top = event.clientY + 12 + "px";
              })
              .on("mousemove", function (event) {
                tooltipEl.style.left = event.clientX + 12 + "px";
                tooltipEl.style.top = event.clientY + 12 + "px";
              })
              .on("mouseleave", () => tooltipEl.classList.remove("visible"));
          });
        }

        // Aggregate line scaled to this panel's total
        if (state.showAggregate && aggBins.length) {
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

      return; // small multiples done — skip single-chart path below
    }

    // ── Single chart (lines mode or bars with ≤1 resort) ────────────────────
    const xAxis = sharedXAxis;
    const yAxis = d3.axisLeft(yScale);

    g.append("g")
      .attr("class", "axis x-axis")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(xAxis);

    g.append("g").attr("class", "axis y-axis").call(yAxis);

    g.append("text")
      .attr("class", "axis-label")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 38)
      .attr("text-anchor", "middle")
      .text("Pitch (%)");

    g.append("text")
      .attr("class", "axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -42)
      .attr("text-anchor", "middle")
      .text(state.normalizeY ? "% of runs" : "Number of runs");

    const stackKeys = COLORS;

    function drawStackedBars(bins, total, opacity, seriesKey) {
      if (!bins.length) return;
      const prefix = seriesKey ? "bar-" + seriesKey + "-" : "bar-";
      const normalize = state.normalizeY && total ? 100 / total : 1;
      const stacked = bins.map((b) => {
        let y0 = 0;
        const out = { lo: b.lo, hi: b.hi };
        stackKeys.forEach((key) => {
          const y1 = y0 + (b.byColor[key] || 0) * normalize;
          out[key] = { y0, y1 };
          y0 = y1;
        });
        return out;
      });

      const layers = stackKeys.map((key) => ({
        key,
        values: stacked.map((d) => ({
          lo: d.lo,
          hi: d.hi,
          y0: d[key].y0,
          y1: d[key].y1,
        })),
      }));

      const barWidth = Math.max(2, (xScale(BIN_WIDTH) - xScale(0)) * 0.85);
      const resortLabel = seriesKey === "A"
        ? (state.resortA || "Resort A")
        : seriesKey === "B"
        ? (state.resortB || "Resort B")
        : null;

      layers.forEach((layer) => {
        const barClass = prefix + layer.key;
        const keyFn = (d) => `${prefix}${layer.key}-${d.lo}-${d.hi}`;
        g.selectAll("." + barClass)
          .data(layer.values, keyFn)
          .join("rect")
          .attr("class", barClass)
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
            const parts = COLORS.filter((c) => (bin.byColor[c] || 0) > 0)
              .map((c) => `${COLOR_LABELS[c]}: ${bin.byColor[c]}`);
            const binLabel = d.lo >= MAX_PITCH ? `≥ ${MAX_PITCH}%` : `${d.lo}% – ${d.hi}%`;
            const resortHeader = resortLabel ? `<div class="tip-resort">${resortLabel}</div>` : "";
            tooltipEl.innerHTML =
              resortHeader +
              `<div class="tip-title">${binLabel}</div>` +
              parts.map((p) => `<div class="tip-row">${p}</div>`).join("");
            tooltipEl.classList.add("visible");
            tooltipEl.style.left = event.clientX + 12 + "px";
            tooltipEl.style.top = event.clientY + 12 + "px";
          })
          .on("mousemove", function (event) {
            tooltipEl.style.left = event.clientX + 12 + "px";
            tooltipEl.style.top = event.clientY + 12 + "px";
          })
          .on("mouseleave", () => tooltipEl.classList.remove("visible"));
      });
    }

    function drawResortArea(bins, total, seriesKey) {
      if (!bins.length) return;
      const normalize = state.normalizeY && total ? 100 / total : 1;
      const color = RESORT_COLORS[seriesKey];

      const points = bins.map((b) => ({
        x: (b.lo + b.hi) / 2,
        y: b.total * normalize,
      }));

      const areaGen = d3.area()
        .x((d) => xScale(d.x))
        .y0(innerHeight)
        .y1((d) => yScale(d.y))
        .curve(d3.curveMonotoneX);

      const lineGen = d3.line()
        .x((d) => xScale(d.x))
        .y((d) => yScale(d.y))
        .curve(d3.curveMonotoneX);

      g.append("path")
        .datum(points)
        .attr("class", `area-${seriesKey}-fill`)
        .attr("fill", color)
        .attr("fill-opacity", seriesKey === "B" ? 0.14 : 0.18)
        .attr("d", areaGen);

      g.append("path")
        .datum(points)
        .attr("class", `area-${seriesKey}-line`)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 2.5)
        .attr("d", lineGen);
    }

    // Single set of full-height overlay rects for tooltips, showing data for both resorts
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
          .attr("x", xScale(lo))
          .attr("width", totalBinPx)
          .attr("y", 0)
          .attr("height", innerHeight)
          .attr("fill", "transparent")
          .attr("cursor", "crosshair")
          .on("mouseenter", function (event) {
            const binLabel = lo >= MAX_PITCH ? `≥ ${MAX_PITCH}%` : `${lo}% – ${hi}%`;
            let html = `<div class="tip-title">${binLabel}</div>`;
            [["A", binA, state.resortA], ["B", binB, state.resortB]].forEach(([key, bin, name]) => {
              if (!bin) return;
              const parts = COLORS.filter((c) => (bin.byColor[c] || 0) > 0)
                .map((c) => `${COLOR_LABELS[c]}: ${bin.byColor[c]}`);
              if (!parts.length) return;
              html += `<div class="tip-resort" style="color:${RESORT_COLORS[key]}">${name || "Resort " + key}</div>`;
              html += parts.map((p) => `<div class="tip-row">${p}</div>`).join("");
            });
            tooltipEl.innerHTML = html;
            tooltipEl.classList.add("visible");
            tooltipEl.style.left = event.clientX + 12 + "px";
            tooltipEl.style.top = event.clientY + 12 + "px";
          })
          .on("mousemove", function (event) {
            tooltipEl.style.left = event.clientX + 12 + "px";
            tooltipEl.style.top = event.clientY + 12 + "px";
          })
          .on("mouseleave", () => tooltipEl.classList.remove("visible"));
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
      const line = d3
        .line()
        .x((d) => xScale((d.bin_start + d.bin_end) / 2))
        .y((d) => yScale(d.count * aggNormalize));
      const pathData = aggBins.filter((d) => d.count > 0);
      if (pathData.length) {
        g.append("path")
          .datum(pathData)
          .attr("fill", "none")
          .attr("stroke", "#94a3b8")
          .attr("stroke-width", 2)
          .attr("stroke-dasharray", "6,4")
          .attr("d", line);
      }
    }
  }

  const SWATCH = { green: "#22c55e", blue: "#3b82f6", black: "#1e293b", grey: "#64748b", orange: "#f97316" };

  function renderLegend() {
    const container = $("legend");
    if (!container) return;
    container.innerHTML = COLORS.map(
      (c) =>
        `<div class="legend-item"><span class="legend-swatch" style="background:${SWATCH[c]}"></span>${COLOR_LABELS[c]}</div>`
    ).join("");
  }

  function renderResortLegend() {
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

  function renderStatCard(elId, resortName, runs) {
    const el = $(elId);
    if (!el) return;
    if (!resortName || !runs || !runs.length) {
      el.innerHTML = resortName ? "<p>No pitch data</p>" : "<p>Select a resort</p>";
      return;
    }
    const metric = state.metric;
    const pitches = getRunsWithPitch(runs, metric).map((r) => r.pitchPct);
    const med = median(pitches);
    const pct40 = pctRunsAbove(runs, metric, 40);
    const byColor = {};
    COLORS.forEach((c) => {
      const sub = runs.filter((r) => (r.color || "").toLowerCase() === c);
      byColor[c] = sub.length;
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

  function renderInsights() {
    const container = $("insights");
    if (!container || !aggregate) return;
    container.innerHTML = "";

    const medians = aggregate.resort_medians_by_color || {};
    const resortA = state.resortA;
    const resortB = state.resortB;
    const metric = state.metric;
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

  function update() {
    drawChart();
    renderResortLegend();
    renderStatCard("stats-a", state.resortA, state.resortA ? resortCache[state.resortA] : null);
    renderStatCard("stats-b", state.resortB, state.resortB ? resortCache[state.resortB] : null);
    renderInsights();
  }

  function onResortChange(which) {
    const sel = $(which === "a" ? "resort-a" : "resort-b");
    const name = sel.value || null;
    if (which === "a") state.resortA = name;
    else state.resortB = name;
    if (!name) {
      update();
      return;
    }
    loadResort(name).then(update).catch(() => update());
  }

  function init() {
    loadAggregate()
      .then((data) => {
        fillResortSelect("resort-a", data.resort_names);
        fillResortSelect("resort-b", data.resort_names);
        renderLegend();

        $("resort-a").addEventListener("change", () => onResortChange("a"));
        $("resort-b").addEventListener("change", () => onResortChange("b"));

        $("metric-avg").addEventListener("click", () => {
          state.metric = "average_pitch";
          $("metric-avg").classList.add("active");
          $("metric-max").classList.remove("active");
          update();
        });
        $("metric-max").addEventListener("click", () => {
          state.metric = "max_pitch";
          $("metric-max").classList.add("active");
          $("metric-avg").classList.remove("active");
          update();
        });

        $("chart-bars").addEventListener("click", () => {
          state.chartMode = "bars";
          $("chart-bars").classList.add("active");
          $("chart-lines").classList.remove("active");
          update();
        });
        $("chart-lines").addEventListener("click", () => {
          state.chartMode = "lines";
          $("chart-lines").classList.add("active");
          $("chart-bars").classList.remove("active");
          update();
        });

        $("show-aggregate").addEventListener("change", (e) => {
          state.showAggregate = e.target.checked;
          update();
        });
        $("normalize-y").addEventListener("change", (e) => {
          state.normalizeY = e.target.checked;
          update();
        });

        update();
      })
      .catch((err) => {
        console.error(err);
        if (chartEl) chartEl.innerHTML = "<p>Load data/aggregate_stats.json (serve this app from repo root, e.g. python -m http.server)</p>";
      });
  }

  init();
})();
