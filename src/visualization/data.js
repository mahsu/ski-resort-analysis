import { BIN_WIDTH, MAX_PITCH, COLORS, PITCH_FIELDS } from "./constants.js";

const DATA_BASE = "../../data/";

export function pitchToPct(run, metric) {
  const key = PITCH_FIELDS[metric];
  const v = run[key];
  if (v == null || typeof v !== "number") return null;
  return v * 100;
}

export function getRunsWithPitch(runs, metric) {
  return runs
    .map((r) => ({
      ...r,
      pitchPct: pitchToPct(r, metric),
      color: (r.color || "grey").toLowerCase(),
    }))
    .filter((r) => r.pitchPct != null && COLORS.includes(r.color));
}

export function capAggregateBins(aggBins) {
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

export function binRuns(runs, metric) {
  const withPitch = getRunsWithPitch(runs, metric);
  const clamped = withPitch.map((r) => ({ ...r, pitchPct: Math.min(r.pitchPct, MAX_PITCH) }));
  const bins = d3.bin()
    .domain([0, MAX_PITCH + BIN_WIDTH])
    .thresholds(d3.range(0, MAX_PITCH + BIN_WIDTH, BIN_WIDTH))
    .value((r) => r.pitchPct)(clamped);

  const byBin = new Map();
  bins.forEach((bin) => {
    const lo = bin.x0;
    const hi = bin.x1;
    const byColor = { green: 0, blue: 0, black: 0, grey: 0, orange: 0 };
    bin.forEach((r) => {
      if (byColor[r.color] !== undefined) byColor[r.color] += 1;
    });
    byBin.set(`${lo}-${hi}`, { lo, hi, total: bin.length, byColor });
  });

  return { bins: Array.from(byBin.values()), total: withPitch.length };
}

export function loadAggregate() {
  return fetch(DATA_BASE + "aggregate_stats.json").then((r) => r.json());
}

export function loadResort(name, cache) {
  if (cache[name]) return Promise.resolve(cache[name]);
  const path = "resorts/" + encodeURIComponent(name) + ".json";
  return fetch(DATA_BASE + path)
    .then((r) => {
      if (!r.ok) throw new Error("Resort not found");
      return r.json();
    })
    .then((runs) => {
      if (Array.isArray(runs)) cache[name] = runs;
      return runs;
    });
}

export function fillResortSelect(selectId, resortNames) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = "";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "— Select resort —";
  sel.appendChild(blank);
  resortNames.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
}
