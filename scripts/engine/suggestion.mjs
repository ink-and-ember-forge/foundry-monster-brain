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

/** Action pips: filled for actions left, hollow for spent. */
export function pipsText(remaining, budget) {
  const left = Math.max(0, Math.min(remaining, budget));
  return "\u25CF".repeat(left) + "\u25CB".repeat(Math.max(0, budget - left));
}

/** "Why this one" lines for the expanded card. */
export function whyLines(suggestion) {
  if (!suggestion) return [];
  const rule = `Rule: ${suggestion.label}${suggestion.source ? ` (${suggestion.source} layer)` : ""}`;
  const conditions = suggestion.why?.length ? suggestion.why : ["no conditions (always applies)"];
  const target = suggestion.target && suggestion.targetWhy ? [`Target: ${suggestion.target} (${suggestion.targetWhy})`] : [];
  return [rule, ...conditions.map((c) => `\u2713 ${c}`), ...target];
}

/** Held-back lines: what was not suggested and why. */
export function heldLines(held = []) {
  return held.map((h) => `${h.label ?? h.id}: ${h.reasons.join("; ")}`);
}

export function warningLines(warnings = []) {
  return warnings.map((w) => (w.ruleId ? `${w.ruleId}: ${w.message}` : w.message));
}

/** Next suggestion index for "Something else", wrapping round. */
export function nextIndex(index, count) {
  return count > 1 ? (index + 1) % count : 0;
}

/** The alternative shown under the primary: the next one along, if any. */
export function alternativeOf(suggestions, index) {
  return suggestions.length > 1 ? suggestions[nextIndex(index, suggestions.length)] : null;
}
