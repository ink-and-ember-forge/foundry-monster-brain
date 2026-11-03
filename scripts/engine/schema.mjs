/**
 * The vocabulary the editor offers (brief section 12: "generated from a schema of conditions,
 * targets and action slots, so model changes mean editing the schema, not rebuilding screens").
 * Pure data. tests/schema.test.mjs fails if a condition exists in conditions.mjs without an entry here.
 *
 * param kinds: "number" { min, max, step, default }, "select" { options: [[value, label]], default },
 *              "condition" (a PF2e condition slug, free text with suggestions)
 */

/** PF2e condition slugs (foundryvtt/pf2e src/module/item/condition/values.ts). */
export const CONDITION_SLUGS = [
  "blinded", "broken", "clumsy", "concealed", "confused", "controlled", "cursebound", "dazzled", "deafened",
  "doomed", "drained", "dying", "encumbered", "enfeebled", "fascinated", "fatigued", "fleeing", "friendly",
  "frightened", "grabbed", "helpful", "hidden", "hostile", "immobilized", "indifferent", "invisible",
  "malevolence", "observed", "off-guard", "paralyzed", "persistent-damage", "petrified", "prone", "quickened",
  "restrained", "sickened", "slowed", "stunned", "stupefied", "unconscious", "undetected", "unfriendly",
  "unnoticed", "wounded",
];

export const CONDITION_SCHEMA = {
  "self-hp-below": {
    label: "My HP is below",
    params: [{ key: "percent", kind: "number", unit: "%", min: 1, max: 100, step: 1, default: 25 }],
  },
  "self-has-condition": {
    label: "I am",
    params: [{ key: "slug", kind: "condition", default: "frightened" }],
  },
  "enemy-has-condition": {
    label: "An enemy is",
    params: [{ key: "slug", kind: "condition", default: "prone" }],
  },
  round: {
    label: "The round is",
    params: [
      { key: "op", kind: "select", default: ">=", options: [["==", "exactly"], [">=", "at least"], [">", "after"], ["<=", "at most"], ["<", "before"]] },
      { key: "value", kind: "number", min: 1, step: 1, default: 1 },
    ],
  },
  "enemy-in-reach": { label: "An enemy is within my reach", params: [] },
  "enemy-within": {
    label: "An enemy is within",
    params: [{ key: "feet", kind: "number", unit: "ft", min: 5, step: 5, default: 30 }],
  },
};

/** Built-in movement plus the standard slots. Anything else is a custom slot the GM names. */
export const ACTION_CHOICES = [
  ["melee-strike", "Melee strike"],
  ["ranged-strike", "Ranged strike"],
  ["stride", "Stride"],
  ["stride-away", "Stride away"],
  ["signature", "Signature action"],
];

export const TARGET_CHOICES = [
  ["lowest-hp", "Lowest HP"],
  ["highest-hp", "Highest HP"],
  ["nearest", "Nearest"],
  ["farthest", "Farthest"],
  ["in-reach", "In my reach"],
  ["role", "Has role…"],
];

export const LIMIT_FIELDS = [
  { key: "oncePerEncounter", kind: "boolean", label: "Only once per encounter" },
  { key: "maxPerTurn", kind: "number", min: 1, step: 1, label: "At most this many times per turn" },
  { key: "cooldownRounds", kind: "number", min: 1, step: 1, label: "Then wait this many rounds" },
];
