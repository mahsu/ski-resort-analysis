export const BIN_WIDTH = 5;
export const MAX_PITCH = 90;

export const RESORT_COLORS = { A: "#22d3ee", B: "#fb923c" };

export const COLORS = ["green", "blue", "black", "grey", "orange"];

export const COLOR_LABELS = {
  green: "Easy/Novice",
  blue: "Intermediate",
  black: "Advanced/Expert",
  grey: "Extreme/Other",
  orange: "Other",
};

export const PITCH_FIELDS = {
  average_pitch: "average_pitch_%",
  max_pitch: "max_pitch_%",
};

// Single source of truth for difficulty color hex values (used by both the
// d3 color scale and the legend swatches, previously duplicated as SWATCH).
export const COLOR_HEX = {
  green: "#22c55e",
  blue: "#3b82f6",
  black: "#1e293b",
  grey: "#64748b",
  orange: "#f97316",
};
