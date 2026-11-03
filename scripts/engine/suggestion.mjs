/** Small pure helpers for presenting suggestions. */

/** One-line text for the slim strip. */
export function stripText(suggestion, { noEnemies = false } = {}) {
  if (!suggestion) return noEnemies ? "No enemies to target" : "No suggestion";
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
  const adjusted = (suggestion.adjustments ?? []).map((a) => `Adjusted: ${a}`);
  return [rule, ...conditions.map((c) => `\u2713 ${c}`), ...target, ...adjusted];
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

// ---- the plan, one step highlighted ----------------------------------------------------------------

/**
 * The plan's steps for display. The first is the action to do now ("current"); the rest follow ("next").
 * Falls back to the plain action list for suggestions without steps.
 */
export function stepRows(suggestion) {
  if (!suggestion) return [];
  const steps = suggestion.steps?.length ? suggestion.steps : (suggestion.actions ?? []).map((label) => ({ label, note: "", added: false }));
  return steps.map((st, i) => ({ index: i + 1, label: st.label, note: st.note ?? "", added: !!st.added, state: i === 0 ? "current" : "next" }));
}

/** Parts of the one-line strip: the action to do now, the target, and what follows. */
export function stripParts(suggestion) {
  const rows = stepRows(suggestion);
  if (!rows.length) return null;
  return { current: rows[0].label, target: suggestion.target ?? null, then: rows.slice(1).map((r) => r.label).join(", ") };
}

/** Adjustments the planner made, as lines for the card and the "why" text. */
export function adjustmentLines(suggestion) {
  return suggestion?.adjustments ?? [];
}
