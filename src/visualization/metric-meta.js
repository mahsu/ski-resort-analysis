export const METRIC_META = {
  average_pitch: {
    histogramKey: "average_pitch",
    shortLabel: "Avg Pitch",
    axisLabel: "Avg Pitch (%)",
    distributionTitle: "Average Pitch Distribution",
    urlValue: null,
  },
  max_pitch: {
    histogramKey: "max_pitch",
    shortLabel: "Max Pitch",
    axisLabel: "Max Pitch (%)",
    distributionTitle: "Max Pitch Distribution",
    urlValue: "max",
  },
};

export function getMetricMeta(metric) {
  return METRIC_META[metric] || METRIC_META.average_pitch;
}

export function metricToUrlValue(metric) {
  return getMetricMeta(metric).urlValue;
}

export function metricFromUrlValue(rawValue) {
  if (rawValue === "max") return "max_pitch";
  return "average_pitch";
}
