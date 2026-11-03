/**
 * Starter templates (brief section 12): ten fighting styles to start from and tweak, named for
 * HOW the creature fights rather than the job it has in the encounter. They use only the v1
 * vocabulary. Each template's rules rank ahead of the shipped defaults (see cascade.mjs), and a
 * template may replace a default by reusing its id or switch one off with `disable`.
 *
 * Strike slots (`melee-strike`, `ranged-strike`) bind automatically; `signature` is the creature's
 * one special move and must be bound per creature (the description of each template says what to
 * bind, or that it needs none). Melee rules prefer `in-reach` targets so they never name someone the
 * creature cannot hit. Hints are movement suggestions only, never destinations (brief section 11).
 *
 * Shipped default rules a template can switch off: last-stand, punish-prone, opening-signature,
 * close-in, fallback-strikes.
 */

export const STARTER_TEMPLATES = {
  brawler: {
    name: "Brawler",
    description:
      "Fights toe-to-toe. Charges anyone within 40 ft, hits the weakest enemy in reach, and throws a power attack every other round. Needs a melee Strike; bind `signature` to its power attack.",
    slots: ["melee-strike", "signature"],
    rules: [
      {
        id: "brawler-power-attack",
        label: "Power attack",
        when: [{ type: "enemy-in-reach" }, { type: "round", op: ">=", value: 2 }],
        do: ["signature", "melee-strike"],
        target: ["in-reach", "lowest-hp"],
        limits: { cooldownRounds: 2 },
      },
      {
        id: "brawler-smash",
        label: "Smash",
        when: [{ type: "enemy-in-reach" }],
        do: ["melee-strike", "melee-strike"],
        target: ["in-reach", "lowest-hp"],
      },
      {
        id: "brawler-charge",
        label: "Charge",
        when: [{ type: "enemy-in-reach", not: true }, { type: "enemy-within", feet: 40 }],
        do: ["stride", "melee-strike", "melee-strike"],
        target: ["nearest", "lowest-hp"],
      },
    ],
  },

  berserker: {
    name: "Berserker",
    description:
      "Reckless and relentless. Chases anyone within 60 ft, and goes all-in once badly hurt instead of backing off. Needs a melee Strike; bind `signature` to its rage attack.",
    slots: ["melee-strike", "signature"],
    rules: [
      {
        id: "berserker-frenzy",
        label: "Frenzy",
        when: [{ type: "self-hp-below", percent: 50 }, { type: "enemy-in-reach" }],
        do: ["melee-strike", "signature", "melee-strike"],
        target: ["in-reach", "lowest-hp"],
        hint: "Hurt and furious: all-in",
      },
      {
        id: "berserker-pummel",
        label: "Pummel",
        when: [{ type: "enemy-in-reach" }],
        do: ["melee-strike", "melee-strike"],
        target: ["in-reach", "lowest-hp"],
      },
      {
        id: "berserker-rampage",
        label: "Rampage",
        when: [{ type: "enemy-in-reach", not: true }, { type: "enemy-within", feet: 60 }],
        do: ["stride", "stride", "melee-strike"],
        target: ["nearest", "lowest-hp"],
      },
    ],
    // The frenzy rule already covers the desperate case.
    disable: ["last-stand"],
  },

  duelist: {
    name: "Duelist",
    description:
      "Patient and precise. Exploits enemies who are off-guard or prone, uses its special move on a cooldown, and only steps in when a foe is within 25 ft. Needs a melee Strike; bind `signature` to a feint or precise strike.",
    slots: ["melee-strike", "signature"],
    rules: [
      {
        id: "duelist-exploit-opening",
        label: "Exploit the opening",
        when: [{ type: "enemy-in-reach" }, { type: "enemy-has-condition", slug: "off-guard" }],
        do: ["melee-strike", "melee-strike"],
        target: ["in-reach", "lowest-hp"],
      },
      {
        id: "duelist-feint",
        label: "Feint, then strike",
        when: [{ type: "enemy-in-reach" }],
        do: ["signature", "melee-strike"],
        target: ["in-reach", "lowest-hp"],
        limits: { cooldownRounds: 2 },
      },
      {
        id: "duelist-measured-strikes",
        label: "Measured strikes",
        when: [{ type: "enemy-in-reach" }],
        do: ["melee-strike", "melee-strike"],
        target: ["in-reach", "lowest-hp"],
      },
      {
        id: "duelist-step-in",
        label: "Step in",
        when: [{ type: "enemy-in-reach", not: true }, { type: "enemy-within", feet: 25 }],
        do: ["stride", "melee-strike"],
        target: ["nearest", "lowest-hp"],
      },
    ],
    // It does not chase across the map.
    disable: ["close-in"],
  },

  skirmisher: {
    name: "Skirmisher",
    description:
      "Mobile melee. Darts in on soft targets, strikes, and slips away. Needs a melee Strike; no special move required.",
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

  ambusher: {
    name: "Ambusher",
    description:
      "Opens with a devastating first strike on a soft target, then hits and vanishes. Needs a melee Strike; bind `signature` to its opening attack (e.g. a sneak attack).",
    slots: ["melee-strike", "signature"],
    rules: [
      {
        id: "ambusher-opening-strike",
        label: "Opening strike",
        when: [{ type: "enemy-within", feet: 60 }],
        do: ["stride", "signature", "melee-strike"],
        target: ["role:squishy", "role:caster", "lowest-hp"],
        hint: "Strike from hiding if you can",
        limits: { oncePerEncounter: true },
      },
      {
        id: "ambusher-strike-and-vanish",
        label: "Strike and vanish",
        when: [{ type: "enemy-in-reach" }],
        do: ["melee-strike", "stride-away"],
        target: ["in-reach", "role:squishy", "lowest-hp"],
        hint: "Back off and look for cover",
        limits: { maxPerTurn: 1 },
      },
      {
        id: "ambusher-stalk",
        label: "Stalk",
        when: [{ type: "enemy-in-reach", not: true }, { type: "enemy-within", feet: 60 }],
        do: ["stride", "stride", "melee-strike"],
        target: ["role:squishy", "role:caster", "nearest"],
      },
    ],
  },

  sniper: {
    name: "Sniper",
    description:
      "Shoots from range. Backs away when engaged and prefers casters. Needs a ranged Strike; no special move required.",
    slots: ["ranged-strike"],
    rules: [
      {
        id: "sniper-retreat-and-shoot",
        label: "Retreat and shoot",
        when: [{ type: "enemy-in-reach" }],
        do: ["stride-away", "ranged-strike"],
        target: ["role:caster", "lowest-hp"],
        hint: "Back off to at least 15 ft",
        limits: { maxPerTurn: 1, cooldownRounds: 2 },
      },
      {
        id: "sniper-volley",
        label: "Volley",
        when: [{ type: "enemy-in-reach", not: true }, { type: "enemy-within", feet: 60 }],
        do: ["ranged-strike", "ranged-strike"],
        target: ["role:caster", "lowest-hp"],
      },
    ],
    // Snipers do not close to melee unless nothing else applies.
    disable: ["close-in"],
  },

  spellslinger: {
    name: "Spellslinger",
    description:
      "Stays out of melee and leads with its main spell. Bind `signature` to that spell (or its best attack action).",
    slots: ["signature"],
    rules: [
      {
        id: "spellslinger-keep-distance",
        label: "Keep distance, then cast",
        when: [{ type: "enemy-in-reach" }],
        do: ["stride-away", "signature"],
        target: ["lowest-hp"],
        hint: "Back off, then cast",
        limits: { maxPerTurn: 1 },
      },
      {
        id: "spellslinger-cast",
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

  hexer: {
    name: "Hexer",
    description:
      "Weakens enemies before damaging them. Casts its debuff on anyone not already afflicted, preferring the toughest. Bind `signature` to the debuff, and edit the condition in the first rule to match what it inflicts (it assumes frightened).",
    slots: ["signature"],
    rules: [
      {
        id: "hexer-hex",
        label: "Hex the unafflicted",
        when: [{ type: "enemy-has-condition", slug: "frightened", not: true }],
        do: ["signature", "signature"],
        target: ["role:frontliner", "highest-hp"],
        hint: "Edit this rule's condition to match what your signature inflicts",
        limits: { maxPerTurn: 1 },
      },
      {
        id: "hexer-keep-away",
        label: "Back off and hex",
        when: [{ type: "enemy-in-reach" }],
        do: ["stride-away", "signature"],
        target: ["lowest-hp"],
        hint: "Back off, then cast",
        limits: { maxPerTurn: 1 },
      },
      {
        id: "hexer-harass",
        label: "Harass",
        when: [{ type: "enemy-in-reach", not: true }],
        do: ["signature", "signature"],
        target: ["lowest-hp"],
      },
    ],
    disable: ["punish-prone", "close-in"],
  },

  coward: {
    name: "Coward",
    description:
      "Runs when hurt or frightened and only pokes when cornered. Needs a melee Strike; no special move required.",
    slots: ["melee-strike"],
    rules: [
      {
        id: "coward-flee",
        label: "Flee",
        when: [{ type: "self-hp-below", percent: 50 }],
        do: ["stride-away", "stride-away"],
        hint: "Get out of reach and keep going",
      },
      {
        id: "coward-panic",
        label: "Panic",
        when: [{ type: "self-has-condition", slug: "frightened" }],
        do: ["stride-away", "stride-away"],
        hint: "Run from the source of fear",
      },
      {
        id: "coward-poke",
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

  swarmer: {
    name: "Swarmer",
    description:
      "Mindless minions: rush the nearest enemy and attack it, no tactics, no special moves. Needs a melee Strike only, so it asks for nothing to be bound. Good for large groups of weak creatures.",
    slots: ["melee-strike"],
    rules: [
      {
        id: "swarmer-bite",
        label: "Bite",
        when: [{ type: "enemy-in-reach" }],
        do: ["melee-strike", "melee-strike"],
        target: ["in-reach", "nearest"],
      },
      {
        id: "swarmer-rush",
        label: "Rush",
        when: [{ type: "enemy-in-reach", not: true }, { type: "enemy-within", feet: 60 }],
        do: ["stride", "stride", "melee-strike"],
        target: ["nearest"],
      },
    ],
    // No tactics: no last stand, no special opener, no picking on the prone.
    disable: ["last-stand", "punish-prone", "opening-signature"],
  },
};

/** Ids in a stable display order. */
export const STARTER_TEMPLATE_IDS = Object.keys(STARTER_TEMPLATES);

/**
 * Starters renamed from a role to a fighting style. The old ids keep working so tokens configured
 * with them are not broken.
 */
export const STARTER_ALIASES = {
  brute: "brawler",
  archer: "sniper",
  caster: "spellslinger",
  skittish: "coward",
};

/** The current id for a starter id that may be an old alias; other ids pass through unchanged. */
export const canonicalTemplateId = (id) => STARTER_ALIASES[id] ?? id;
