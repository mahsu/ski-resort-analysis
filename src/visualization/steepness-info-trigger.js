/**
 * Shared markup for the steepness index "i" info tooltip (stat cards + run modal).
 */
export function steepnessInfoTriggerHtml(tooltipText) {
  return (
    `<span class="stat-info-trigger" tabindex="0" aria-label="What is steepness index?">` +
    `<span class="stat-info-icon" aria-hidden="true">i</span>` +
    `<span class="stat-info-bubble" role="tooltip">${tooltipText}</span>` +
    `</span>`
  );
}
