import { loadAggregate, loadResort, fillResortSelect } from "./data.js";
import { drawChart, bindToggle } from "./chart.js";
import { renderLegend, renderResortLegend, renderStatCard, renderInsights } from "./ui.js";

let aggregate = null;
const resortCache = {};

const state = {
  resortA: null,
  resortB: null,
  metric: "average_pitch",
  showAggregate: true,
  normalizeY: false,
  chartMode: "bars",
};

const $ = (id) => document.getElementById(id);

function update() {
  drawChart(aggregate, resortCache, state);
  renderResortLegend(state);
  renderStatCard("stats-a", state.resortA, state.resortA ? resortCache[state.resortA] : null, state);
  renderStatCard("stats-b", state.resortB, state.resortB ? resortCache[state.resortB] : null, state);
  renderInsights(aggregate, state);
}

function onResortChange(which) {
  const sel = $(which === "a" ? "resort-a" : "resort-b");
  const name = sel.value || null;
  if (which === "a") state.resortA = name;
  else state.resortB = name;
  if (!name) { update(); return; }
  loadResort(name, resortCache).then(update).catch(() => update());
}

function init() {
  loadAggregate()
    .then((data) => {
      aggregate = data;
      fillResortSelect("resort-a", data.resort_names);
      fillResortSelect("resort-b", data.resort_names);
      renderLegend();

      $("resort-a").addEventListener("change", () => onResortChange("a"));
      $("resort-b").addEventListener("change", () => onResortChange("b"));

      bindToggle(
        "metric-avg", "metric-max",
        () => { state.metric = "average_pitch"; },
        () => { state.metric = "max_pitch"; },
        update
      );

      bindToggle(
        "chart-bars", "chart-lines",
        () => { state.chartMode = "bars"; },
        () => { state.chartMode = "lines"; },
        update
      );

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
      const chartEl = $("chart");
      if (chartEl) chartEl.innerHTML = "<p>Load data/aggregate_stats.json (serve this app from repo root, e.g. python -m http.server)</p>";
    });
}

init();
