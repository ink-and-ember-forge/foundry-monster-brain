/** Action vocabulary: display labels and canonical keys. Pure. The built-in actions live in action-catalog.mjs. */
import { ACTIONS, ACTION_GROUPS, SLOT_INFO } from "./action-catalog.mjs";

/** Labels for the actions that are slots, not catalog entries. */
const SLOT_LABELS = {
  spell: "Cast a spell",
  signature: "Signature action",
  other: "Other action",
};

/**
 * Slugs that count as the same action for repeat policies and tracking. Movement shares one key, so a token
 * drag after a clicked "Did this" is merged into one move (tracker.mjs) and the repeat cap never limits
 * crossing a room. Sneak and Tumble Through are NOT here: a rolled one is detected from its chat card, and
 * the drag that follows is then a separate record the GM can remove.
 */
const ALIASES = { "stride-away": "stride", step: "stride", leap: "stride", crawl: "stride" };

export function actionLabel(slug) {
  if (Object.hasOwn(ACTIONS, slug)) return ACTIONS[slug].label;
  if (Object.hasOwn(SLOT_INFO, slug)) return SLOT_INFO[slug].label;
  if (Object.hasOwn(SLOT_LABELS, slug)) return SLOT_LABELS[slug];
  const text = String(slug).replaceAll("-", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function actionKey(slug) {
  return ALIASES[slug] ?? slug;
}

/** The first group of keys in the "add action" correction menu: what a creature does most. */
const CORE_MANUAL_KEYS = ["melee-strike", "ranged-strike", "spell", "other"];

/**
 * Everything the "add action" correction menu offers, in groups: the core keys, then every catalog action
 * by group. A move recorded as Step is still one movement for tracking (see ALIASES).
 * @returns {{ label: string, keys: string[] }[]}
 */
export function manualActionGroups() {
  return [
    { label: "Attacks", keys: CORE_MANUAL_KEYS },
    ...ACTION_GROUPS.map(([id, label]) => ({ label, keys: Object.keys(ACTIONS).filter((k) => ACTIONS[k].group === id) })),
  ].filter((g) => g.keys.length > 0);
}

/** Flat list of the keys above. */
export const MANUAL_ACTION_KEYS = manualActionGroups().flatMap((g) => g.keys);

/** "Signature action (Fire Bolt)" when the slot is bound to an item, else the plain label. */
export function labelWithItem(slug, boundEntry) {
  return boundEntry?.label ? `${actionLabel(slug)} (${boundEntry.label})` : actionLabel(slug);
}
