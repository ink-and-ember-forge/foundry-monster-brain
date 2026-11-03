/**
 * Built-in rules used until the data model and cascade exist (build step 3).
 * Uses only conditions implemented so far. Limits (e.g. once per encounter) arrive in step 6,
 * so "last-stand" will currently be suggested every turn while its conditions hold.
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
  },
  {
    id: "punish-prone",
    label: "Punish the prone",
    when: [{ type: "enemy-has-condition", slug: "prone" }],
    do: ["melee-strike", "melee-strike"],
  },
  {
    id: "opening-signature",
    label: "Open with signature",
    when: [{ type: "round", op: "==", value: 1 }],
    do: ["signature", "melee-strike"],
  },
  {
    id: "fallback-strikes",
    label: "Strike, strike",
    when: [],
    do: ["melee-strike", "melee-strike"],
  },
];
