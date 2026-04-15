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

/** Pick two different resort names; null if fewer than two resorts exist. */
function pickTwoDistinctResorts(names) {
  const n = names.length;
  if (n < 2) return null;
  const i = Math.floor(Math.random() * n);
  const j = Math.floor(Math.random() * (n - 1));
  const j2 = j < i ? j : j + 1;
  return [names[i], names[j2]];
}

/** Prefer a new (A,B) when possible so repeat clicks feel responsive. */
function pickRandomPairForUi(names, prevA, prevB) {
  const pair = pickTwoDistinctResorts(names);
  if (!pair) return null;
  let [a, b] = pair;
  if (names.length <= 2) return [a, b];
  for (let attempt = 0; attempt < 32; attempt++) {
    if (a !== prevA || b !== prevB) break;
    const next = pickTwoDistinctResorts(names);
    if (!next) break;
    [a, b] = next;
  }
  return [a, b];
}

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

let resizeTimer = null;

function handleResize() {
  if (!aggregate) return;
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => update(), 120);
}

function init() {
  window.addEventListener("resize", handleResize);

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

      const randomBtn = $("random-pair-btn");
      const setRandomEnabled = () => {
        const ok = data.resort_names.length >= 2;
        randomBtn.disabled = !ok;
        randomBtn.title = ok ? "" : "Need at least two resorts in the dataset";
      };
      setRandomEnabled();
      randomBtn.addEventListener("click", () => {
        const names = data.resort_names;
        const picked = pickRandomPairForUi(names, state.resortA, state.resortB);
        if (!picked) return;
        const [nameA, nameB] = picked;
        comboA.select(nameA);
        comboB.select(nameB);
      });
    })
    .catch((err) => {
      console.error(err);
      const chartEl = $("chart");
      if (chartEl) chartEl.innerHTML = "<p>Load data/aggregate_stats.json (serve this app from repo root, e.g. python -m http.server)</p>";
    });
}

init();
