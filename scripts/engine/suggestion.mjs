/**
 * Step 1 stub: a hardcoded suggestion, shaped like the eventual engine output
 * (brief section 5, step 6) so the panel does not change when the engine arrives.
 * Pure: no Foundry globals.
 */

/** @typedef {{ id: string, label: string, actions: string[], target: string|null }} Suggestion */

/** @returns {Suggestion} */
export function hardcodedSuggestion() {
  return {
    id: "retreat-and-shoot",
    label: "Retreat and shoot",
    actions: ["Stride away", "Ranged strike"],
    target: null, // target selection arrives in build step 4
  };
}

/** One-line text for the slim strip. */
export function stripText(suggestion) {
  if (!suggestion) return "";
  return suggestion.target ? `${suggestion.label} → ${suggestion.target}` : suggestion.label;
}

/** A monster, from the module's point of view, is an opposition-aligned actor (PF2e alliance). */
export function isMonsterAlliance(alliance) {
  return alliance === "opposition";
}
