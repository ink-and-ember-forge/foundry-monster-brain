/** Small pure helpers for presenting suggestions. */

/** One-line text for the slim strip. */
export function stripText(suggestion) {
  if (!suggestion) return "No suggestion";
  return suggestion.target ? `${suggestion.label} → ${suggestion.target}` : suggestion.label;
}

/** Tooltip text: the action sequence. */
export function actionsText(suggestion) {
  return suggestion?.actions?.join(" → ") ?? "";
}

/** A monster, from the module's point of view, is an opposition-aligned actor (PF2e alliance). */
export function isMonsterAlliance(alliance) {
  return alliance === "opposition";
}
