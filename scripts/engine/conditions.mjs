/**
 * Condition library (brief section 6). Pure: tests read a plain context, never Foundry objects.
 *
 * Context shape (built by scripts/adapter.mjs):
 *   { round: number,
 *     self:    { name, hpPercent, conditions: string[] },
 *     enemies: [{ id, name, hpPercent, conditions: string[], roles: string[],
 *                 distance: number|null,   // feet between tokens; null if unknown (no canvas/token)
 *                 inReach: boolean|null }] // within my attack reach; null if unknown
 *   }
 *
 * scope "self": a yes/no about the monster or the encounter.
 * scope "enemy": a yes/no about one candidate target; it narrows the eligible targets.
 *   An enemy test may return null for "unknown": that enemy is excluded whether or not the
 *   condition is negated.
 */

const OPS = {
  "<": (a, b) => a < b,
  "<=": (a, b) => a <= b,
  "==": (a, b) => a === b,
  ">=": (a, b) => a >= b,
  ">": (a, b) => a > b,
};

export const CONDITIONS = {
  "self-hp-below": {
    scope: "self",
    test: (c, ctx) => ctx.self.hpPercent < c.percent,
    describe: (c) => `my HP is below ${c.percent}%`,
  },
  "self-has-condition": {
    scope: "self",
    test: (c, ctx) => ctx.self.conditions.includes(c.slug),
    describe: (c) => `I am ${c.slug}`,
  },
  "enemy-has-condition": {
    scope: "enemy",
    test: (c, _ctx, enemy) => enemy.conditions.includes(c.slug),
    describe: (c) => `an enemy is ${c.slug}`,
  },
  // Global "is anyone in reach": negated, it means NO enemy is in reach (brief's `volley` rule).
  "enemy-in-reach": {
    scope: "self",
    test: (_c, ctx) => ctx.enemies.some((e) => e.inReach === true),
    describe: () => "an enemy is within my reach",
  },
  // Per-target: narrows eligible targets to those within the distance.
  "enemy-within": {
    scope: "enemy",
    test: (c, _ctx, enemy) => (enemy.distance == null ? null : enemy.distance <= c.feet),
    describe: (c) => `an enemy is within ${c.feet} ft`,
  },
  round: {
    scope: "self",
    test: (c, ctx) => (OPS[c.op ?? "=="] ?? OPS["=="])(ctx.round, c.value),
    describe: (c) => `round ${c.op ?? "=="} ${c.value}`,
  },
};

/** Human description of a condition instance, honouring negation. */
export function describeCondition(cond) {
  const def = CONDITIONS[cond.type];
  const text = def ? def.describe(cond) : `unknown condition "${cond.type}"`;
  return cond.not ? `NOT (${text})` : text;
}
