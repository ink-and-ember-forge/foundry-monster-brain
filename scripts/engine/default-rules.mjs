/**
 * Every rule names its own target preference: a suggestion always has a target (see evaluate.mjs),
 * and a rule that leaned on the default would hide what it is aimed at.
 *
 * The shipped (lowest) cascade layer: rules every template and creature builds on. A template can
 * replace one by reusing its id, or switch it off with `disable`.
 */
export const DEFAULT_RULES = [
  {
    id: "last-stand",
    label: "Desperate last stand",
    when: [
      { type: "self-hp-below", percent: 25 },
      { type: "self-has-condition", slug: "frightened", not: true },
    ],
    do: ["melee-strike", "signature"],
    target: ["in-reach", "lowest-hp"],
    limits: { oncePerEncounter: true },
  },
  {
    id: "punish-prone",
    label: "Punish the prone",
    when: [{ type: "enemy-has-condition", slug: "prone" }],
    do: ["melee-strike", "melee-strike"],
    target: ["in-reach", "lowest-hp"],
  },
  {
    id: "opening-signature",
    label: "Open with signature",
    when: [{ type: "round", op: "==", value: 1 }],
    do: ["signature", "melee-strike"],
    target: ["in-reach", "nearest"],
  },
  {
    id: "close-in",
    label: "Close the distance",
    when: [
      { type: "enemy-in-reach", not: true },
      { type: "enemy-within", feet: 60 },
    ],
    do: ["stride", "melee-strike"],
    target: ["role:caster", "lowest-hp"],
  },
  {
    id: "fallback-strikes",
    label: "Attack the nearest",
    when: [],
    do: ["melee-strike", "melee-strike"],
    target: ["in-reach", "nearest"],
  },
];

/**
 * Global policies. Defaults are provisional ([OPEN] in the brief): at most two of the same action
 * per turn, which discourages "Strike, Strike, Strike".
 */
export const DEFAULT_POLICIES = { maxSameActionPerTurn: 2 };

/** The shipped (lowest) cascade layer. */
export const SYSTEM_LAYER = { rules: DEFAULT_RULES, policies: DEFAULT_POLICIES };
