/**
 * Target selection (brief section 7). Pure.
 *
 * A selector is an ordered list of preferences. Each entry ranks enemies, and entries are applied
 * lexicographically: the first entry decides, later entries break ties, then original order.
 *   "role:<tag>"  enemies with the tag first          "lowest-hp" / "highest-hp"  by HP percent
 *   "in-reach"    enemies within my attack reach first (melee rules: pick someone you can hit)
 *   "nearest" / "farthest"  by distance (unknown distances sort last)
 * So ["role:caster", "lowest-hp"] is "casters first, then lowest HP"; ["lowest-hp", "role:caster"]
 * is "lowest HP, casters win ties". Unknown entries are ignored (and flagged by validate()).
 */

/** Suggested role tags ([OPEN] in the brief). Tags are free-form strings; this list is only a hint for UIs. */
export const SUGGESTED_ROLES = ["caster", "healer", "squishy", "frontliner", "ranged", "support"];

/** Used by any rule that does not say who it is aimed at: someone in reach first, then the weakest. */
export const DEFAULT_SELECTOR = ["in-reach", "lowest-hp"];

const RANKERS = {
  "in-reach": (e) => (e.inReach === true ? 0 : 1),
  "lowest-hp": (e) => e.hpPercent,
  "highest-hp": (e) => -e.hpPercent,
  nearest: (e) => e.distance ?? Infinity,
  farthest: (e) => (e.distance == null ? Infinity : -e.distance),
};

const LABELS = { "in-reach": "in reach", "lowest-hp": "lowest HP", "highest-hp": "highest HP", nearest: "nearest", farthest: "farthest" };

const roleOf = (entry) => (typeof entry === "string" && entry.startsWith("role:") ? entry.slice(5).trim().toLowerCase() : null);

/** A ranking function for one entry, or null if the entry is not understood. */
function rankerFor(entry) {
  const tag = roleOf(entry);
  if (tag !== null) return tag ? (e) => ((e.roles ?? []).includes(tag) ? 0 : 1) : null;
  return RANKERS[entry] ?? null;
}

/** Entries this module does not understand, for validation. */
export function unknownSelectorEntries(selector = []) {
  return selector.filter((entry) => rankerFor(entry) === null);
}

/** All enemies, best first for the selector (ties keep original order). */
export function rankTargets(enemies, selector = DEFAULT_SELECTOR) {
  if (!enemies?.length) return [];
  const rankers = selector.map(rankerFor).filter(Boolean);
  return enemies
    .map((enemy, index) => ({ enemy, index }))
    .sort((a, b) => {
      for (const rank of rankers) {
        const d = rank(a.enemy) - rank(b.enemy); // NaN (Infinity - Infinity) is falsy: a tie
        if (d) return d;
      }
      return a.index - b.index;
    })
    .map((x) => x.enemy);
}

/** Best enemy for the selector, or null when there are no enemies. */
export function pickTarget(enemies, selector = DEFAULT_SELECTOR) {
  return rankTargets(enemies, selector)[0] ?? null;
}

/** "prefer caster, then lowest HP" */
export function describeSelector(selector = DEFAULT_SELECTOR) {
  const parts = selector
    .map((entry) => {
      const tag = roleOf(entry);
      if (tag) return `prefer ${tag}`;
      return LABELS[entry] ?? null;
    })
    .filter(Boolean);
  return parts.join(", then ");
}

/** Lowercase, trim, dedupe; tolerate junk. */
export function normaliseRoles(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))];
}

/** Role layering: a per-encounter override replaces the campaign default (an empty list clears it). */
export function resolveRoles(defaults, override) {
  return override == null ? normaliseRoles(defaults) : normaliseRoles(override);
}
