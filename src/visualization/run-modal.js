import { MAX_PITCH, COLOR_HEX, COLOR_LABELS, PITCH_FIELDS, RUN_STEEPNESS_INDEX_TOOLTIP } from "./constants.js";
import { steepnessInfoTriggerHtml } from "./steepness-info-trigger.js";
import { escapeHtml } from "./sanitize.js";
import { getMetricMeta } from "./metric-meta.js";
import { interpolatePercentile } from "./stats.js";

/** Fills the run modal steepness column header (shared tooltip markup). Safe to call once at startup. */
export function initRunModalSteepnessHeader() {
  const steepnessTh = document.getElementById("modal-steepness-th");
  if (steepnessTh) {
    steepnessTh.innerHTML = `Steepness ${steepnessInfoTriggerHtml(RUN_STEEPNESS_INDEX_TOOLTIP)}`;
  }
}

// Numeric rank for difficulty sort: easiest → hardest
const DIFFICULTY_RANK = { green: 0, blue: 1, black: 2, grey: 3, orange: 4 };

const MODAL_COLUMNS = [
  {
    key: "name",
    label: "Run",
    defaultDir: 1,
    isDefault: false,
    sortValue: (r) => r.name.toLowerCase(),
  },
  {
    key: "pitch",
    label: null,
    defaultDir: -1,
    isDefault: true,
    sortValue: (r) => r.pitch,
  },
  {
    key: "difficulty",
    label: "Difficulty",
    defaultDir: 1,
    isDefault: false,
    sortValue: (r) => {
      const rank = DIFFICULTY_RANK[r.color] ?? 99;
      return rank * 1e6 - r.pitch;
    },
  },
  {
    key: "steepness",
    label: "Steepness",
    defaultDir: -1,
    isDefault: false,
    sortValue: (r) => r.steepnessIdx ?? -1,
  },
];

function getDefaultSort() {
  const defaultCol = MODAL_COLUMNS.find((c) => c.isDefault);
  return { col: defaultCol.key, dir: defaultCol.defaultDir };
}

const modalState = {
  initialized: false,
  rows: [],
  searchQuery: "",
  sort: getDefaultSort(),
};

function renderModalTable(state) {
  const tbody = document.getElementById("modal-tbody");
  if (!tbody) return;

  document.querySelectorAll(".modal-table th[data-sort-col]").forEach((th) => {
    const col = th.dataset.sortCol;
    const isActive = col === state.sort.col;
    th.classList.toggle("sort-active", isActive);
    th.dataset.sortDir = isActive ? (state.sort.dir === 1 ? "asc" : "desc") : "";
  });

  const q = state.searchQuery.trim().toLowerCase();
  const filtered = q
    ? state.rows.filter((r) => (r.name || "").toLowerCase().includes(q))
    : state.rows;

  const col = MODAL_COLUMNS.find((c) => c.key === state.sort.col);
  const sorted = [...filtered].sort((a, b) => {
    const av = col.sortValue(a);
    const bv = col.sortValue(b);
    return state.sort.dir * (av < bv ? -1 : av > bv ? 1 : 0);
  });

  tbody.innerHTML = "";
  if (sorted.length === 0 && state.rows.length > 0 && q) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" class="modal-empty">No runs match your search.</td>`;
    tbody.appendChild(tr);
    return;
  }

  sorted.forEach((r) => {
    const tr = document.createElement("tr");
    const hex = COLOR_HEX[r.color] || COLOR_HEX.grey;
    const steepnessCell = r.steepnessIdx != null
      ? `<td class="modal-steepness-cell">` +
        `<span class="modal-steepness-score">${r.steepnessIdx}</span>` +
        `<div class="steepness-track modal-steepness-track"><div class="steepness-fill" style="width:${r.steepnessIdx}%"></div></div>` +
        `</td>`
      : `<td>—</td>`;

    tr.innerHTML =
      `<td>${escapeHtml(r.name)}</td>` +
      `<td>${r.pitch.toFixed(1)}%</td>` +
      `<td><span class="modal-difficulty"><span class="modal-diff-dot" style="background:${hex}"></span><span class="modal-diff-label">${escapeHtml(COLOR_LABELS[r.color] || r.difficulty)}</span></span></td>` +
      steepnessCell;
    tbody.appendChild(tr);
  });
}

function initModal(state) {
  const overlay = document.getElementById("run-modal");
  const closeBtn = document.getElementById("modal-close");
  if (!overlay || !closeBtn) return;

  function close() {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("modal-open");
  }

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("is-open")) close();
  });

  const searchInput = document.getElementById("modal-run-search");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      state.searchQuery = searchInput.value;
      renderModalTable(state);
    });
  }

  document.querySelectorAll(".modal-table th[data-sort-col]").forEach((th) => {
    th.addEventListener("click", () => {
      const clickedKey = th.dataset.sortCol;
      if (state.sort.col === clickedKey) {
        state.sort.dir *= -1;
      } else {
        const col = MODAL_COLUMNS.find((c) => c.key === clickedKey);
        state.sort = { col: clickedKey, dir: col.defaultDir };
      }
      renderModalTable(state);
    });
  });
}

export function showRunModal(runs, binLo, binHi, metric, resortName, aggregate, initialSort) {
  if (!modalState.initialized) {
    initModal(modalState);
    modalState.initialized = true;
  }

  const overlay = document.getElementById("run-modal");
  const titleEl = document.getElementById("modal-title");
  const pitchHeader = document.getElementById("modal-pitch-header");
  const modalBody = document.querySelector(".modal-body");
  if (!overlay || !titleEl || !pitchHeader || !modalBody) return;

  const field = PITCH_FIELDS[metric];
  const breakpoints = aggregate?.run_steepness_percentiles ?? null;
  modalState.rows = runs
    .filter((r) => {
      const v = r[field];
      if (v == null || typeof v !== "number") return false;
      const pct = Math.min(v * 100, MAX_PITCH);
      return pct >= binLo && pct < binHi;
    })
    .map((r) => {
      const avg = r["average_pitch_%"] ?? null;
      const max = r["max_pitch_%"] ?? null;
      const rawSteepness = avg != null && max != null ? 0.6 * avg + 0.4 * max : null;
      return {
        name: r.name,
        pitch: r[field] * 100,
        color: (r.color || "grey").toLowerCase(),
        difficulty: r.difficulty || "unknown",
        steepnessIdx: rawSteepness != null ? interpolatePercentile(rawSteepness, breakpoints) : null,
      };
    });

  if (initialSort) {
    modalState.sort = initialSort;
  } else {
    modalState.sort = getDefaultSort();
  }

  const metricMeta = getMetricMeta(metric);
  const binLabel = binHi === Infinity
    ? null
    : binLo >= MAX_PITCH
      ? `≥ ${MAX_PITCH}%`
      : `${binLo}–${binHi}%`;
  titleEl.textContent = binLabel ? `${resortName} (${binLabel} ${metricMeta.shortLabel})` : resortName;
  pitchHeader.textContent = metricMeta.shortLabel;

  modalState.searchQuery = "";
  const searchEl = document.getElementById("modal-run-search");
  if (searchEl) searchEl.value = "";

  renderModalTable(modalState);

  modalBody.scrollTop = 0;
  overlay.setAttribute("aria-hidden", "false");
  overlay.classList.add("is-open");
  document.documentElement.classList.add("modal-open");
}
