/**
 * The built-in action catalog. Pure.
 *
 * These are PF2e's basic actions and the skill actions a creature can do without any item: they need no
 * binding (unlike a Strike or a signature), so a rule can use them on any creature. For each one the catalog
 * holds what the rest of the module needs:
 *   label / cost / group   shown in the editor and the panel
 *   summary / needs        the one-line tooltip (our own wording; the full rules come from PF2e itself)
 *   compendium             the entry's name in PF2e's own `pf2e.actionspf2e` pack, which the rules popout opens
 *   use                    what the planner (world.mjs) must know about it: how it relates to distance
 *   requires / unless      conditions on the creature that make it possible or pointless
 *   needsShield            Raise a Shield needs a shield in hand
 *   skills                 the statistics shown next to it on the card (athletics, intimidation, ...)
 *
 * Verified against foundryvtt/pf2e `v13-dev` @ f38e9796 (packs/pf2e/actions): names, costs and rules facts.
 * No skill action here needs training in that version, so nothing checks proficiency. The slugs are PF2e's
 * own action slugs, so a rolled skill action (`action:<slug>` in the card's options) is recognised as the
 * same action (engine/detect.mjs).
 *
 * `use.kind`:
 *   "melee"        the target must be within the creature's reach        (Trip, Grapple, Shove, ...)
 *   "within"       the target must be within `feet`                      (Demoralize: 30 ft)
 *   "move-toward"  closes distance by Speed (or `fraction` of it)       (Stride, Tumble Through)
 *   "move-away"    opens distance by Speed                              (Stride away)
 *   "step"         opens distance by 5 ft, Speed 10 ft or more needed    (Step)
 *   "stand" | "drop-prone" | "free"
 */

export const ACTION_GROUPS = [
  ["movement", "Movement"],
  ["tricks", "Dirty tricks"],
  ["nerve", "Morale and nerve"],
  ["defence", "Defence"],
  ["stealth", "Stealth and senses"],
  ["support", "Support"],
];

const FREE_HAND = "a free hand";
const SIZE = "target no more than one size larger";

/** Built-in actions: no binding needed. */
export const ACTIONS = {
  // ---- movement ----
  stride: {
    label: "Stride",
    group: "movement",
    cost: 1,
    compendium: "Stride",
    summary: "Move up to your Speed.",
    use: { kind: "move-toward" },
  },
  "stride-away": {
    label: "Stride away",
    group: "movement",
    cost: 1,
    compendium: "Stride",
    summary: "Stride, but away from the target. Leaving a square can provoke Reactive Strike.",
    use: { kind: "move-away" },
  },
  step: {
    label: "Step",
    group: "movement",
    cost: 1,
    compendium: "Step",
    summary: "Move 5 ft without triggering reactions. Not into difficult terrain.",
    needs: ["Speed 10 ft or more"],
    use: { kind: "step" },
  },
  stand: {
    label: "Stand up",
    group: "movement",
    cost: 1,
    compendium: "Stand",
    summary: "Get up from prone.",
    use: { kind: "stand" },
  },
  "drop-prone": {
    label: "Drop prone",
    group: "movement",
    cost: 1,
    compendium: "Drop Prone",
    summary: "Fall prone. It costs an action to Stand up again.",
    use: { kind: "drop-prone" },
  },
  crawl: {
    label: "Crawl",
    group: "movement",
    cost: 1,
    compendium: "Crawl",
    summary: "Move 5 ft while staying prone.",
    needs: ["prone", "Speed 10 ft or more"],
    requires: { self: ["prone"] },
    use: { kind: "free" },
  },
  leap: {
    label: "Leap",
    group: "movement",
    cost: 1,
    compendium: "Leap",
    summary: "A short jump: 10 ft across with Speed 15+, 15 ft with Speed 30+, or a short hop up.",
    use: { kind: "free" },
  },

  // ---- dirty tricks (Athletics, no training needed) ----
  trip: {
    label: "Trip",
    group: "tricks",
    cost: 1,
    compendium: "Trip",
    summary: "Athletics vs Reflex DC. On a success the target falls prone; on a critical it also takes 1d6 bludgeoning.",
    needs: [FREE_HAND, SIZE],
    skills: ["athletics"],
    use: { kind: "melee" },
  },
  grapple: {
    label: "Grapple",
    group: "tricks",
    cost: 1,
    compendium: "Grapple",
    summary: "Athletics vs Fortitude DC. Success: target is grabbed until the end of your next turn; critical: restrained.",
    needs: [FREE_HAND, SIZE],
    skills: ["athletics"],
    use: { kind: "melee" },
  },
  shove: {
    label: "Shove",
    group: "tricks",
    cost: 1,
    compendium: "Shove",
    summary: "Athletics vs Fortitude DC. Push the target 5 ft away (10 ft on a critical); you may Stride after it.",
    needs: [FREE_HAND, SIZE],
    skills: ["athletics"],
    use: { kind: "melee" },
  },
  reposition: {
    label: "Reposition",
    group: "tricks",
    cost: 1,
    compendium: "Reposition",
    summary: "Athletics vs Fortitude DC. Move the target 5 ft (10 ft on a critical), keeping it within your reach.",
    needs: ["a free hand, or the target already grabbed", SIZE],
    skills: ["athletics"],
    use: { kind: "melee" },
  },
  disarm: {
    label: "Disarm",
    group: "tricks",
    cost: 1,
    compendium: "Disarm",
    summary: "Athletics vs Reflex DC. A critical knocks the item away; a success makes it harder to hold and use.",
    needs: [FREE_HAND, SIZE],
    skills: ["athletics"],
    use: { kind: "melee" },
  },

  // ---- morale and nerve ----
  demoralize: {
    label: "Demoralize",
    group: "nerve",
    cost: 1,
    compendium: "Demoralize",
    summary: "Intimidation vs Will DC, target within 30 ft. Frightened 1 (2 on a critical). Each target is immune to your Demoralize for 10 minutes.",
    needs: ["a language the target understands, or a -4 penalty"],
    skills: ["intimidation"],
    use: { kind: "within", feet: 30 },
  },
  feint: {
    label: "Feint",
    group: "nerve",
    cost: 1,
    compendium: "Feint",
    summary: "Deception vs Perception DC. Success: the target is off-guard to your next melee attack this turn. A critical failure leaves you off-guard instead.",
    needs: ["target within your melee reach"],
    skills: ["deception"],
    use: { kind: "melee" },
  },
  "create-a-diversion": {
    label: "Create a diversion",
    group: "nerve",
    cost: 1,
    compendium: "Create a Diversion",
    summary: "Deception vs Perception DC. Success: you are hidden from the creatures you fooled until you act, and a Strike you then make catches the target off-guard.",
    skills: ["deception"],
    use: { kind: "free" },
  },

  // ---- defence ----
  "raise-a-shield": {
    label: "Raise a shield",
    group: "defence",
    cost: 1,
    compendium: "Raise a Shield",
    summary: "Gain the shield's circumstance bonus to AC until the start of your next turn.",
    needs: ["a shield in hand"],
    needsShield: true,
    use: { kind: "free" },
  },
  "take-cover": {
    label: "Take cover",
    group: "defence",
    cost: 1,
    compendium: "Take Cover",
    summary: "Standard cover becomes greater cover (+4 instead of +2). Ends if you move or attack.",
    needs: ["cover or a feature to take cover behind, or be prone: you judge this"],
    use: { kind: "free" },
  },
  escape: {
    label: "Escape",
    group: "defence",
    cost: 1,
    compendium: "Escape",
    summary: "Break free of grabbed, immobilized or restrained. Roll your unarmed attack, Athletics or Acrobatics against the DC of whatever holds you.",
    needs: ["grabbed, immobilized or restrained"],
    requires: { self: ["grabbed", "immobilized", "restrained"] },
    skills: ["athletics", "acrobatics"],
    use: { kind: "free" },
  },

  // ---- stealth and senses ----
  hide: {
    label: "Hide",
    group: "stealth",
    cost: 1,
    compendium: "Hide",
    summary: "Stealth vs Perception DC (GM rolls in secret). Become hidden from creatures you have cover or concealment against.",
    needs: ["cover or concealment: you judge this"],
    skills: ["stealth"],
    use: { kind: "free" },
  },
  sneak: {
    label: "Sneak",
    group: "stealth",
    cost: 1,
    compendium: "Sneak",
    summary: "Stride up to half your Speed while hidden or undetected. Stealth is checked at the end of the move.",
    needs: ["hidden or undetected to start: you judge this"],
    skills: ["stealth"],
    // No direction: a Sneak may be toward a target or away from one, so the planner models no distance change.
    use: { kind: "free" },
  },
  "tumble-through": {
    label: "Tumble through",
    group: "stealth",
    cost: 1,
    compendium: "Tumble Through",
    summary: "Stride up to your Speed, trying to pass through one enemy's space. Acrobatics vs its Reflex DC; on a failure your move ends.",
    skills: ["acrobatics"],
    use: { kind: "move-toward", noSkip: true },
  },
  seek: {
    label: "Seek",
    group: "stealth",
    cost: 1,
    compendium: "Seek",
    summary: "Scan an area (usually within 30 ft) for hidden or undetected creatures and objects. The GM rolls Perception in secret.",
    skills: ["perception"],
    use: { kind: "free" },
  },
  "point-out": {
    label: "Point out",
    group: "stealth",
    cost: 1,
    compendium: "Point Out",
    summary: "Show allies where a creature you can see is, so it is hidden to them rather than undetected.",
    needs: ["a creature your allies can't detect but you can"],
    use: { kind: "free" },
  },

  // ---- support ----
  aid: {
    label: "Aid",
    group: "support",
    cost: 1,
    compendium: "Aid",
    summary: "Spend this action to prepare, then use your reaction to help an ally's skill check or attack roll.",
    needs: ["a willing ally, and your reaction later"],
    use: { kind: "free" },
  },
  ready: {
    label: "Ready",
    group: "support",
    cost: 2,
    compendium: "Ready",
    summary: "Two actions: choose an action and a trigger. Your turn ends; if the trigger happens you use that action as a reaction.",
    use: { kind: "free", endsTurn: true },
  },
  interact: {
    label: "Interact",
    group: "support",
    cost: 1,
    compendium: "Interact",
    summary: "Use a hand to grab, draw, open or otherwise handle an object.",
    use: { kind: "free" },
  },
};

/** Strike slots are bound to real items, so they are not built-in, but they have rules text to look up. */
export const SLOT_INFO = {
  "melee-strike": { label: "Melee strike", cost: 1, compendium: "Strike", summary: "Attack with a melee weapon or natural attack." },
  "ranged-strike": { label: "Ranged strike", cost: 1, compendium: "Strike", summary: "Attack with a ranged weapon." },
};

/** Slugs that need no binding to an item (everything in ACTIONS). */
export const BUILTIN_SLUGS = Object.keys(ACTIONS);

export const isBuiltin = (slug) => Object.hasOwn(ACTIONS, slug);

/** Catalog entry (built-in or strike slot) or null. */
export function actionInfo(slug) {
  if (Object.hasOwn(ACTIONS, slug)) return ACTIONS[slug];
  if (Object.hasOwn(SLOT_INFO, slug)) return SLOT_INFO[slug];
  return null;
}

/** Actions it costs. Anything not in the catalog (a signature, a spell, a custom slot) is one action. */
export const actionCost = (slug) => actionInfo(slug)?.cost ?? 1;

const costText = (n) => `${n} action${n === 1 ? "" : "s"}`;

/** Multi-line plain text for a `title` tooltip. Null for an action with nothing to say. */
export function actionTooltip(slug) {
  const info = actionInfo(slug);
  if (!info?.summary) return null;
  const lines = [`${info.label} (${costText(info.cost)})`, info.summary];
  if (info.needs?.length) lines.push(`Needs: ${info.needs.join("; ")}`);
  lines.push("Open the ? button for the full PF2e rules.");
  return lines.join("\n");
}

/**
 * Actions a turn has spent. Each recorded action costs what the catalog says (Ready is two), not one.
 * The key stands in for a slug when an old record has none.
 */
export function turnCost(taken = []) {
  return taken.reduce((sum, a) => sum + actionCost(a.slug ?? a.key), 0);
}

/**
 * The statistics worth showing beside an action, as "Athletics +7". `skills` is { slug: modifier }.
 * With several candidates (Escape), the best one. Nothing when the modifiers are not known.
 */
export function skillNote(slug, skills = {}) {
  const wanted = actionInfo(slug)?.skills ?? [];
  const known = wanted.filter((s) => Number.isFinite(skills[s]));
  if (known.length === 0) return "";
  const best = known.reduce((a, b) => (skills[b] > skills[a] ? b : a));
  const mod = skills[best];
  const name = best.charAt(0).toUpperCase() + best.slice(1);
  return `${name} ${mod >= 0 ? "+" : "−"}${Math.abs(mod)}`;
}
