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
 * Every rule names its own target. Movement rules name who the creature is moving relative to
 * (e.g. the nearest enemy it is fleeing from), so a suggestion never has a blank target.
 *
 * The built-in actions (action-catalog.mjs) need no binding, so every style can use them: Trip, Grapple,
 * Shove, Demoralize, Feint, Create a Diversion, Raise a Shield, Take Cover, Step, Hide and the rest. Three
 * ideas run through the rules that use them:
 *   - Variety by rotation. A trick has a cooldown, so a creature alternates (trip, then its power attack,
 *     then trip again) instead of repeating itself, and a mob of the same template drifts out of step
 *     because its members start from different positions.
 *   - Tricks set tricks up. Trip leaves a creature prone, Grapple leaves it grabbed. A trick rule asks for a
 *     target that is NOT already prone, and a pile-on rule asks for one that is, so the next goon
 *     exploits what the last one did, with no new engine concept (the existing enemy-has-condition).
 *   - The order of a bundle matters. Take Cover ends when its user attacks, so cover comes after the
 *     attacks; a Step comes before a cast (it triggers no reaction); Raise a Shield goes last.
 * Rules that need a shield are held back on a creature without one (evaluate.mjs), and say so.
 *
 * Shipped default rules a template can switch off: break-free-grabbed, break-free-restrained, last-stand,
 * punish-prone, opening-signature, close-in, seek-the-hidden, fallback-strikes.
 */

export const STARTER_TEMPLATES = {
  brawler: {
    name: "Brawler",
    description:
      "Fights toe-to-toe. Charges anyone within 40 ft and hits the weakest enemy in reach, but rotates dirty tricks: trips the biggest threat, grabs a caster, and throws a power attack every other round. Braces behind a shield when hurt, if it has one. Needs a melee Strike; bind `signature` to its power attack.",
    slots: ["melee-strike", "signature"],
    rules: [
      {
        id: "brawler-brace",
        label: "Brace behind the shield",
        when: [{ type: "self-hp-below", percent: 50 }, { type: "enemy-in-reach" }],
        do: ["melee-strike", "raise-a-shield"],
        target: ["in-reach", "lowest-hp"],
        hint: "Needs a shield; otherwise this is held back",
      },
      {
        id: "brawler-power-attack",
        label: "Power attack",
        when: [{ type: "enemy-in-reach" }, { type: "round", op: ">=", value: 2 }],
        do: ["signature", "melee-strike"],
        target: ["in-reach", "lowest-hp"],
        limits: { cooldownRounds: 2 },
      },
      {
        id: "brawler-grab",
        label: "Grab the soft one",
        when: [{ type: "enemy-in-reach" }],
        do: ["grapple", "melee-strike", "melee-strike"],
        target: ["in-reach", "role:caster", "role:squishy", "lowest-hp"],
        hint: "A grabbed target is off-guard: hit it while it is held",
        limits: { cooldownRounds: 3 },
      },
      {
        id: "brawler-trip",
        label: "Knock 'em down",
        when: [{ type: "enemy-in-reach" }, { type: "enemy-has-condition", slug: "prone", not: true }],
        do: ["trip", "melee-strike", "melee-strike"],
        target: ["in-reach", "role:frontliner", "highest-hp"],
        hint: "Take down the biggest threat, then hit it while it is prone",
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
      "Reckless and relentless. Roars a battle cry once as it closes in, then chases anyone within 60 ft, and goes all-in once badly hurt instead of backing off. Needs a melee Strike; bind `signature` to its rage attack.",
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
        id: "berserker-battle-cry",
        label: "Battle cry",
        when: [{ type: "enemy-within", feet: 60 }],
        do: ["demoralize", "stride", "melee-strike"],
        target: ["role:caster", "role:squishy", "nearest"],
        hint: "Roar as you charge",
        limits: { oncePerEncounter: true },
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
      "Patient and precise. Exploits enemies who are off-guard or prone, feints to make its own openings, disarms the best-armed foe now and then, and guards with a shield when hurt, if it has one. Only steps in when a foe is within 25 ft. Needs a melee Strike; nothing to bind.",
    slots: ["melee-strike"],
    rules: [
      {
        id: "duelist-exploit-opening",
        label: "Exploit the opening",
        when: [{ type: "enemy-in-reach" }, { type: "enemy-has-condition", slug: "off-guard" }],
        do: ["melee-strike", "melee-strike"],
        target: ["in-reach", "lowest-hp"],
      },
      {
        id: "duelist-guard",
        label: "Guard",
        when: [{ type: "self-hp-below", percent: 60 }, { type: "enemy-in-reach" }],
        do: ["melee-strike", "raise-a-shield"],
        target: ["in-reach", "lowest-hp"],
        hint: "Needs a shield; otherwise this is held back",
      },
      {
        id: "duelist-feint",
        label: "Feint, then strike",
        when: [{ type: "enemy-in-reach" }],
        do: ["feint", "melee-strike"],
        target: ["in-reach", "lowest-hp"],
        hint: "A successful feint makes the target off-guard to your next melee attack this turn",
        limits: { cooldownRounds: 2 },
      },
      {
        id: "duelist-disarm",
        label: "Disarm",
        when: [{ type: "enemy-in-reach" }],
        do: ["disarm", "melee-strike"],
        target: ["in-reach", "role:frontliner", "highest-hp"],
        hint: "Go for the one with the best weapon",
        limits: { cooldownRounds: 3 },
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
      "Mobile melee. Taunts and tumbles past the front line to reach soft targets, strikes, and slips away. Needs a melee Strike; no special move required.",
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
        id: "skirmisher-tumble",
        label: "Tumble past",
        when: [{ type: "enemy-in-reach", not: true }, { type: "enemy-within", feet: 50 }],
        do: ["tumble-through", "melee-strike"],
        target: ["role:squishy", "role:caster", "lowest-hp"],
        hint: "Slip through a front-liner's space to reach the soft target",
        limits: { cooldownRounds: 2 },
      },
      {
        id: "skirmisher-taunt",
        label: "Taunt, then dart in",
        when: [{ type: "enemy-in-reach", not: true }, { type: "enemy-within", feet: 30 }],
        do: ["demoralize", "stride", "melee-strike"],
        target: ["role:squishy", "role:caster", "lowest-hp"],
        limits: { cooldownRounds: 3 },
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
      "Opens with a devastating first strike on a soft target, creates a diversion to set up the next one, then hits and vanishes. Waits in ambush while the party is far away, and goes to ground when hurt. Needs a melee Strike; bind `signature` to its opening attack (e.g. a sneak attack).",
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
        id: "ambusher-lie-in-wait",
        label: "Lie in wait",
        when: [{ type: "enemy-within", feet: 60, not: true }, { type: "round", op: "<=", value: 2 }],
        do: ["hide", "ready"],
        target: ["nearest"],
        hint: "Hide, then Ready a Strike for when someone comes into reach. After round 2 it stops waiting and hunts",
      },
      {
        id: "ambusher-lie-low",
        label: "Go to ground",
        when: [{ type: "self-hp-below", percent: 50 }],
        do: ["hide", "sneak"],
        target: ["nearest"],
        hint: "Only with cover or concealment to use; otherwise pick Something else",
        limits: { maxPerTurn: 1, cooldownRounds: 2 },
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
        id: "ambusher-diversion",
        label: "Create a diversion",
        when: [{ type: "enemy-in-reach", not: true }, { type: "enemy-within", feet: 40 }],
        do: ["create-a-diversion", "stride", "melee-strike"],
        target: ["role:squishy", "role:caster", "lowest-hp"],
        hint: "A strike made while hidden catches the target off-guard",
        limits: { cooldownRounds: 3 },
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
      "Shoots from range. Steps or runs back when engaged, takes cover when hurt, and prefers casters. Needs a ranged Strike; no special move required.",
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
        id: "sniper-sidestep",
        label: "Sidestep and shoot",
        when: [{ type: "enemy-in-reach" }],
        do: ["step", "ranged-strike", "ranged-strike"],
        target: ["role:caster", "lowest-hp"],
        hint: "A Step triggers no reactions, so there is no free swing at you",
        limits: { maxPerTurn: 1 },
      },
      {
        id: "sniper-take-cover",
        label: "Shoot, then take cover",
        when: [{ type: "self-hp-below", percent: 60 }, { type: "enemy-in-reach", not: true }],
        do: ["ranged-strike", "ranged-strike", "take-cover"],
        target: ["role:caster", "lowest-hp"],
        hint: "Take cover last: it ends if you attack afterwards. Only if there is cover to take",
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
      "Stays out of melee and leads with its main spell. Steps out of reach before casting, runs when hurt, and ducks behind cover. Bind `signature` to that spell (or its best attack action).",
    slots: ["signature"],
    rules: [
      {
        id: "spellslinger-retreat",
        label: "Retreat and cast",
        when: [{ type: "self-hp-below", percent: 50 }, { type: "enemy-in-reach" }],
        do: ["stride-away", "signature"],
        target: ["lowest-hp"],
        hint: "Hurt: put real distance between you and them",
        limits: { maxPerTurn: 1 },
      },
      {
        id: "spellslinger-keep-distance",
        label: "Step back, then cast",
        when: [{ type: "enemy-in-reach" }],
        do: ["step", "signature", "signature"],
        target: ["lowest-hp"],
        hint: "Back off, then cast: a Step triggers no reactions",
        limits: { maxPerTurn: 1 },
      },
      {
        id: "spellslinger-duck",
        label: "Cast, then take cover",
        when: [{ type: "self-hp-below", percent: 50 }, { type: "enemy-in-reach", not: true }],
        do: ["signature", "signature", "take-cover"],
        target: ["role:squishy", "lowest-hp"],
        hint: "Only if there is cover to take",
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
        target: ["role:squishy", "lowest-hp"],
      },
    ],
    disable: ["punish-prone", "close-in"],
  },

  hexer: {
    name: "Hexer",
    description:
      "Weakens enemies before damaging them. Casts its debuff on anyone not already afflicted, preferring the toughest, steps out of reach first, and takes cover when hurt. Bind `signature` to the debuff, and edit the condition in the first rule to match what it inflicts (it assumes frightened).",
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
        do: ["step", "signature"],
        target: ["lowest-hp"],
        hint: "Back off, then cast: a Step triggers no reactions",
        limits: { maxPerTurn: 1 },
      },
      {
        id: "hexer-duck",
        label: "Hex, then take cover",
        when: [{ type: "self-hp-below", percent: 50 }, { type: "enemy-in-reach", not: true }],
        do: ["signature", "take-cover"],
        target: ["lowest-hp"],
        hint: "Only if there is cover to take",
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
      "Runs when hurt or frightened, slipping away behind a diversion if it can, and only pokes when cornered. Needs a melee Strike; no special move required.",
    slots: ["melee-strike"],
    rules: [
      {
        id: "coward-slip-away",
        label: "Slip away",
        when: [{ type: "self-hp-below", percent: 50 }],
        do: ["create-a-diversion", "sneak"],
        target: ["nearest"],
        hint: "Needs cover or concealment to sneak into; if there is none, take Something else (Flee)",
        limits: { oncePerEncounter: true },
      },
      {
        id: "coward-flee",
        label: "Flee",
        when: [{ type: "self-hp-below", percent: 50 }],
        do: ["stride-away", "stride-away"],
        target: ["nearest"],
        hint: "Get away from the target and keep going",
      },
      {
        id: "coward-panic",
        label: "Panic",
        when: [{ type: "self-has-condition", slug: "frightened" }],
        do: ["stride-away", "stride-away"],
        target: ["nearest"],
        hint: "Run from the target, the nearest threat",
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
      "Rank-and-file goons. Rush the nearest enemy and attack it, ignoring HP, but mix in basic tricks on a rotation (trip, grab, jeer), pile onto anyone who is down or held, and fall back to help an ally when hurt. Needs a melee Strike only, so it asks for nothing to be bound. Good for large groups of weak creatures: the tricks set each other up, so a mob fights like a pack.",
    slots: ["melee-strike"],
    rules: [
      {
        id: "swarmer-pile-on",
        label: "Pile on the downed",
        when: [{ type: "enemy-in-reach" }, { type: "enemy-has-condition", slug: "prone" }],
        do: ["melee-strike", "melee-strike"],
        target: ["in-reach", "nearest"],
        hint: "A prone target is off-guard: everyone swings at it",
      },
      {
        id: "swarmer-pin-down",
        label: "Pile on the held",
        when: [{ type: "enemy-in-reach" }, { type: "enemy-has-condition", slug: "grabbed" }],
        do: ["melee-strike", "melee-strike"],
        target: ["in-reach", "nearest"],
        hint: "A grabbed target is off-guard: everyone swings at it",
      },
      {
        id: "swarmer-back-up",
        label: "Back up an ally",
        when: [{ type: "self-hp-below", percent: 50 }, { type: "enemy-in-reach" }],
        do: ["step", "aid"],
        target: ["nearest"],
        hint: "Prepare to Aid an ally who is fighting this enemy, and use your reaction on their roll",
        limits: { cooldownRounds: 2 },
      },
      {
        id: "swarmer-trip",
        label: "Trip",
        when: [{ type: "enemy-in-reach" }, { type: "enemy-has-condition", slug: "prone", not: true }],
        do: ["trip", "melee-strike"],
        target: ["in-reach", "nearest"],
        hint: "The next goon pounces on whoever goes down",
        limits: { cooldownRounds: 2 },
      },
      {
        id: "swarmer-grab",
        label: "Grab",
        when: [{ type: "enemy-in-reach" }, { type: "enemy-has-condition", slug: "grabbed", not: true }],
        do: ["grapple", "melee-strike"],
        target: ["in-reach", "role:caster", "role:squishy", "nearest"],
        hint: "The next goon pounces on whoever is held",
        limits: { cooldownRounds: 3 },
      },
      {
        id: "swarmer-jeer",
        label: "Jeer, then rush",
        when: [{ type: "enemy-in-reach", not: true }, { type: "enemy-within", feet: 30 }],
        do: ["demoralize", "stride", "melee-strike"],
        target: ["role:squishy", "role:caster", "nearest"],
        limits: { cooldownRounds: 3 },
      },
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
    // No last stand and no special opener. The shipped punish-prone is not needed: the pile-on rules above are
    // the same idea, ranked ahead of its position.
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
