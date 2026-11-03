/**
 * Starter templates (brief section 12): a starting point to tweak, not finished behaviour.
 * They use only the v1 vocabulary. Each template's rules rank ahead of the shipped defaults
 * (see cascade.mjs), and templates may replace a default by reusing its id or switch one off
 * with `disable`. Strike slots auto-bind; `signature` must be bound per creature.
 *
 * Melee rules aim at `in-reach` targets so they never name someone the creature cannot hit.
 * The hints are movement suggestions only (never destinations; brief section 11).
 */

export const STARTER_TEMPLATES = {
  brute: {
    name: "Brute",
    description: "Closes the distance and hits hard. Prefers whoever is in reach, then the weakest.",
    slots: ["melee-strike", "signature"],
    rules: [
      {
        id: "brute-power-attack",
        label: "Power attack",
        when: [{ type: "enemy-in-reach" }, { type: "round", op: ">=", value: 2 }],
        do: ["signature", "melee-strike"],
        target: ["in-reach", "lowest-hp"],
        limits: { cooldownRounds: 2 },
      },
      {
        id: "brute-smash",
        label: "Smash",
        when: [{ type: "enemy-in-reach" }],
        do: ["melee-strike", "melee-strike"],
        target: ["in-reach", "lowest-hp"],
      },
      {
        id: "brute-charge",
        label: "Charge",
        when: [{ type: "enemy-in-reach", not: true }, { type: "enemy-within", feet: 40 }],
        do: ["stride", "melee-strike", "melee-strike"],
        target: ["nearest", "lowest-hp"],
      },
    ],
  },

  skirmisher: {
    name: "Skirmisher",
    description: "Mobile melee. Darts in on soft targets, strikes, and slips away.",
    slots: ["melee-strike"],
    rules: [
      {
        id: "skirmisher-strike-and-fade",
        label: "Strike and fade",
        when: [{ type: "enemy-in-reach" }],
        do: ["melee-strike", "stride-away"],
        target: ["in-reach", "role:squishy", "lowest-hp"],
        hint: "Back off to at least 10 ft",
        limits: { maxPerTurn: 1 },
      },
      {
        id: "skirmisher-dart-in",
        label: "Dart in",
        when: [{ type: "enemy-in-reach", not: true }, { type: "enemy-within", feet: 50 }],
        do: ["stride", "stride", "melee-strike"],
        target: ["role:squishy", "role:caster", "lowest-hp"],
      },
    ],
  },

  archer: {
    name: "Archer",
    description: "Shoots from range. Backs away when engaged, and prefers casters.",
    slots: ["ranged-strike"],
    rules: [
      {
        id: "archer-retreat-and-shoot",
        label: "Retreat and shoot",
        when: [{ type: "enemy-in-reach" }],
        do: ["stride-away", "ranged-strike"],
        target: ["role:caster", "lowest-hp"],
        hint: "Back off to at least 15 ft",
        limits: { maxPerTurn: 1, cooldownRounds: 2 },
      },
      {
        id: "archer-volley",
        label: "Volley",
        when: [{ type: "enemy-in-reach", not: true }, { type: "enemy-within", feet: 60 }],
        do: ["ranged-strike", "ranged-strike"],
        target: ["role:caster", "lowest-hp"],
      },
    ],
    // Archers do not close to melee unless nothing else applies.
    disable: ["close-in"],
  },

  caster: {
    name: "Caster",
    description: "Stays out of melee and leads with its main spell (bind it to `signature`).",
    slots: ["signature"],
    rules: [
      {
        id: "caster-keep-distance",
        label: "Keep distance, then cast",
        when: [{ type: "enemy-in-reach" }],
        do: ["stride-away", "signature"],
        target: ["lowest-hp"],
        hint: "Back off, then cast",
        limits: { maxPerTurn: 1 },
      },
      {
        id: "caster-cast",
        label: "Cast",
        when: [{ type: "enemy-in-reach", not: true }],
        do: ["signature", "signature"],
        target: ["role:squishy", "lowest-hp"],
      },
      // Replaces the shipped opening rule (same id): lead with spells, not a melee Strike.
      {
        id: "opening-signature",
        label: "Open with signature",
        when: [{ type: "round", op: "==", value: 1 }],
        do: ["signature", "signature"],
      },
    ],
    disable: ["punish-prone", "close-in"],
  },

  skittish: {
    name: "Skittish",
    description: "A coward. Runs when hurt or frightened and only pokes when cornered.",
    slots: ["melee-strike"],
    rules: [
      {
        id: "skittish-flee",
        label: "Flee",
        when: [{ type: "self-hp-below", percent: 50 }],
        do: ["stride-away", "stride-away"],
        hint: "Get out of reach and keep going",
      },
      {
        id: "skittish-panic",
        label: "Panic",
        when: [{ type: "self-has-condition", slug: "frightened" }],
        do: ["stride-away", "stride-away"],
        hint: "Run from the source of fear",
      },
      {
        id: "skittish-poke",
        label: "Poke and run",
        when: [{ type: "enemy-in-reach" }],
        do: ["melee-strike", "stride-away"],
        target: ["in-reach", "lowest-hp"],
        hint: "Back off to at least 10 ft",
        limits: { maxPerTurn: 1 },
      },
    ],
    disable: ["last-stand"],
  },
};

/** Ids in a stable display order. */
export const STARTER_TEMPLATE_IDS = Object.keys(STARTER_TEMPLATES);
