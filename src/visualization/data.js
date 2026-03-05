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

export function setupResortCombobox(inputId, resortNames, onChange) {
  const input = document.getElementById(inputId);
  const wrap = input.closest(".resort-combobox");
  const clearBtn = wrap.querySelector(".resort-clear");
  const dropdown = wrap.querySelector(".resort-dropdown");
  let selectedName = null;
  let activeIndex = -1;

  function getMatches(query) {
    if (!query) return [];
    const q = query.toLowerCase();
    return resortNames.filter((n) => n.toLowerCase().startsWith(q));
  }

  function setActiveIndex(idx, items) {
    activeIndex = idx;
    items.forEach((li, i) => li.classList.toggle("active", i === activeIndex));
    if (activeIndex >= 0) items[activeIndex].scrollIntoView({ block: "nearest" });
  }

  function renderDropdown(matches) {
    dropdown.innerHTML = "";
    activeIndex = -1;
    if (!matches.length) {
      const empty = document.createElement("li");
      empty.className = "resort-dropdown-empty";
      empty.textContent = "No resorts found";
      dropdown.appendChild(empty);
    } else {
      matches.forEach((name) => {
        const li = document.createElement("li");
        li.textContent = name;
        li.setAttribute("role", "option");
        li.dataset.value = name;
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          selectResort(name);
        });
        dropdown.appendChild(li);
      });
    }
    dropdown.hidden = false;
  }

  function selectResort(name) {
    selectedName = name;
    input.value = name;
    dropdown.hidden = true;
    clearBtn.hidden = false;
    input.blur();
    onChange(name);
  }

  function clearResort() {
    selectedName = null;
    input.value = "";
    clearBtn.hidden = true;
    dropdown.hidden = true;
    onChange(null);
    input.focus();
  }

  input.addEventListener("input", () => {
    if (selectedName && input.value !== selectedName) {
      selectedName = null;
      clearBtn.hidden = true;
      onChange(null);
    }
    if (input.value) {
      renderDropdown(getMatches(input.value));
    } else {
      dropdown.hidden = true;
    }
  });

  input.addEventListener("keydown", (e) => {
    const items = [...dropdown.querySelectorAll("li[data-value]")];
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(Math.min(activeIndex + 1, items.length - 1), items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(Math.max(activeIndex - 1, 0), items);
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && items[activeIndex]) {
        selectResort(items[activeIndex].dataset.value);
      }
    } else if (e.key === "Escape") {
      dropdown.hidden = true;
      input.blur();
    }
  });

  input.addEventListener("focus", () => {
    if (!selectedName && input.value) {
      renderDropdown(getMatches(input.value));
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(() => { dropdown.hidden = true; }, 150);
  });

  clearBtn.addEventListener("click", clearResort);
}
