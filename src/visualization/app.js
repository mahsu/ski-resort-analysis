import { loadAggregate, loadResort, setupResortCombobox } from "./data.js";
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
  renderStatCard("stats-a", state.resortA, state.resortA ? resortCache[state.resortA] : null, state, aggregate);
  renderStatCard("stats-b", state.resortB, state.resortB ? resortCache[state.resortB] : null, state, aggregate);
  renderInsights(aggregate, state);
}

function syncUrlParams() {
  const params = new URLSearchParams();
  if (state.resortA) params.set("a", state.resortA);
  if (state.resortB) params.set("b", state.resortB);
  if (state.metric !== "average_pitch") params.set("metric", "max");
  if (state.chartMode !== "bars") params.set("chart", "lines");
  if (!state.showAggregate) params.set("aggregate", "0");
  history.replaceState(null, "", params.toString() ? "?" + params.toString() : location.pathname);
}

function onResortChange(which, name) {
  if (which === "a") state.resortA = name;
  else state.resortB = name;
  syncUrlParams();
  if (!name) { update(); return; }
  loadResort(name, resortCache).then(update).catch(() => update());
}

function init() {
  loadAggregate()
    .then((data) => {
      aggregate = data;
      const validNames = new Set(data.resort_names);
      const params = new URLSearchParams(location.search);
      const paramA = params.get("a");
      const paramB = params.get("b");

      const comboA = setupResortCombobox("resort-a", data.resort_names, (name) => onResortChange("a", name));
      const comboB = setupResortCombobox("resort-b", data.resort_names, (name) => onResortChange("b", name));
      renderLegend();

      if (params.get("metric") === "max") {
        state.metric = "max_pitch";
        $("metric-avg").classList.remove("active");
        $("metric-max").classList.add("active");
      }

      if (params.get("chart") === "lines") {
        state.chartMode = "lines";
        $("chart-bars").classList.remove("active");
        $("chart-lines").classList.add("active");
      }

      bindToggle(
        "metric-avg", "metric-max",
        () => { state.metric = "average_pitch"; syncUrlParams(); },
        () => { state.metric = "max_pitch"; syncUrlParams(); },
        update
      );

      bindToggle(
        "chart-bars", "chart-lines",
        () => { state.chartMode = "bars"; syncUrlParams(); },
        () => { state.chartMode = "lines"; syncUrlParams(); },
        update
      );

      if (params.get("aggregate") === "0") {
        state.showAggregate = false;
        $("show-aggregate").checked = false;
      }

      $("show-aggregate").addEventListener("change", (e) => {
        state.showAggregate = e.target.checked;
        syncUrlParams();
        update();
      });
      $("normalize-y").addEventListener("change", (e) => {
        state.normalizeY = e.target.checked;
        update();
      });

      const hasPreselect = (paramA && validNames.has(paramA)) || (paramB && validNames.has(paramB));
      if (paramA && validNames.has(paramA)) comboA.select(paramA);
      if (paramB && validNames.has(paramB)) comboB.select(paramB);
      if (!hasPreselect) update();
    })
    .catch((err) => {
      console.error(err);
      const chartEl = $("chart");
      if (chartEl) chartEl.innerHTML = "<p>Load data/aggregate_stats.json (serve this app from repo root, e.g. python -m http.server)</p>";
    });
}

init();
