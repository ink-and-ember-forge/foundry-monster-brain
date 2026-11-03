/**
 * Condition library (brief section 6). Pure: tests read a plain context, never Foundry objects.
 *
 * Context shape (built by scripts/adapter.mjs):
 *   { round: number,
 *     self:    { name, hpPercent, conditions: string[] },
 *     enemies: [{ id, name, hpPercent, conditions: string[] }] }
 *
 * scope "self": a yes/no about the monster or the encounter.
 * scope "enemy": a yes/no about one candidate target; it narrows the eligible targets.
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
