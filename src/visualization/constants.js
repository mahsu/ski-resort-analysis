export const BIN_WIDTH = 5;
export const MAX_PITCH = 70;

export const RESORT_COLORS = { A: "#0891b2", B: "#ea580c" };

export const COLORS = ["green", "blue", "black", "grey", "orange"];

export const COLOR_LABELS = {
  green: "Easy",
  blue: "Intermediate",
  black: "Advanced",
  grey: "Expert",
  orange: "Extreme",
};

export const PITCH_FIELDS = {
  average_pitch: "average_pitch_%",
  max_pitch: "max_pitch_%",
};

// Single source of truth for difficulty color hex values (used by both the
// d3 color scale and the legend swatches, previously duplicated as SWATCH).
// Advanced (black diamond) is a dark slate; theme backgrounds are lightened so it has contrast.
export const COLOR_HEX = {
  green: "#16a34a",
  blue: "#2563eb",
  black: "#1e293b",
  grey: "#64748b",
  orange: "#ea580c",
};
