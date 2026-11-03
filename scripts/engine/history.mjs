/**
 * Per-encounter history (brief section 10). Pure and immutable: every function returns a new object.
 * Shape: { actions: [{ id, round, combatantId, key, label, source, ts }],
 *          ruleUses: [{ ruleId, round, combatantId }] }
 * source: "auto" (detected) | "manual" (GM added) | "suggestion" (Took suggestion).
 */

export const emptyHistory = () => ({ actions: [], ruleUses: [] });

const normalise = (h) => ({ actions: h?.actions ?? [], ruleUses: h?.ruleUses ?? [] });

export function turnActions(history, round, combatantId) {
  return normalise(history).actions.filter((a) => a.round === round && a.combatantId === combatantId);
}

export function ruleUsesFor(history, combatantId) {
  return normalise(history).ruleUses.filter((u) => u.combatantId === combatantId);
}

export function addAction(history, action) {
  const h = normalise(history);
  return { ...h, actions: [...h.actions, action] };
}

export function removeAction(history, id) {
  const h = normalise(history);
  return { ...h, actions: h.actions.filter((a) => a.id !== id) };
}

export function recordRuleUse(history, use) {
  const h = normalise(history);
  return { ...h, ruleUses: [...h.ruleUses, use] };
}

/**
 * Consecutive token moves are one Stride, not several: a drag often fires several updates.
 * Merge when the previous action this turn was an auto-detected Stride within the window.
 */
export function isSameMovement(previous, now, windowMs = 4000) {
  return !!previous && previous.key === "stride" && previous.source === "auto" && now - previous.ts <= windowMs;
}

/**
 * The same Stride reported twice from two directions: the GM clicks "Did this" AND drags the token
 * (in either order). The token drag is logged as "auto"; a click is "suggestion" or "manual".
 * A Stride from the other side, not already merged, within the window, counts as the same one.
 * (Two drags in a row are two Strides: once merged, a Stride is spent.)
 */
export function isDuplicateMovement(previous, incomingSource, now, windowMs = 60000) {
  if (!previous || previous.key !== "stride" || previous.merged) return false;
  const prevAuto = previous.source === "auto";
  const incomingAuto = incomingSource === "auto";
  return prevAuto !== incomingAuto && now - previous.ts <= windowMs;
}

export function markMerged(history, id) {
  const h = normalise(history);
  return { ...h, actions: h.actions.map((a) => (a.id === id ? { ...a, merged: true } : a)) };
}
