/**
 * Rule evaluator (brief section 5, steps 3 to 6). Pure.
 *
 * Not yet implemented, by design: rule limits and global policies (build step 6),
 * role-tag target selectors (step 4), slot binding (step 3). Targeting is a stub:
 * enemy conditions narrow the eligible targets, then the lowest-HP enemy is picked.
 */
import { CONDITIONS, describeCondition } from "./conditions.mjs";

const ACTION_LABELS = {
  "melee-strike": "Melee strike",
  "ranged-strike": "Ranged strike",
  "stride-away": "Stride away",
  signature: "Signature action",
};

export function actionLabel(slug) {
  if (ACTION_LABELS[slug]) return ACTION_LABELS[slug];
  const text = String(slug).replaceAll("-", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function lowestHp(enemies) {
  return enemies.reduce((best, e) => (best === null || e.hpPercent < best.hpPercent ? e : best), null);
}

/** Evaluate one rule. Returns { ok, enemies, narrowed, failed: string[] }. */
function checkRule(rule, ctx) {
  let enemies = ctx.enemies;
  let narrowed = false;
  const failed = [];
  for (const cond of rule.when ?? []) {
    const def = CONDITIONS[cond.type];
    if (!def) {
      failed.push(describeCondition(cond));
      continue;
    }
    const want = !cond.not;
    if (def.scope === "enemy") {
      narrowed = true;
      enemies = enemies.filter((e) => def.test(cond, ctx, e) === want);
      if (enemies.length === 0) failed.push(`${describeCondition(cond)} (no enemy matches)`);
    } else if (def.test(cond, ctx) !== want) {
      failed.push(describeCondition(cond));
    }
  }
  return { ok: failed.length === 0, enemies, narrowed, failed };
}

/**
 * Rank: explicit `priority` (lower first) or array position, then higher `weight`, then array position.
 * "Rule order is priority, weight breaks ties" (decided in docs/decisions.md).
 */
function compareCandidates(a, b) {
  const pa = a.rule.priority ?? a.index;
  const pb = b.rule.priority ?? b.index;
  return pa - pb || (b.rule.weight ?? 0) - (a.rule.weight ?? 0) || a.index - b.index;
}

/**
 * @returns {{ suggestions: Suggestion[], held: { id: string, label: string, reasons: string[] }[] }}
 * @typedef {{ id: string, label: string, actions: string[], target: string|null }} Suggestion
 */
export function evaluate(rules, ctx, { max = 2 } = {}) {
  const candidates = [];
  const held = [];
  rules.forEach((rule, index) => {
    if (rule.enabled === false) return;
    const result = checkRule(rule, ctx);
    if (!result.ok) {
      held.push({ id: rule.id, label: rule.label, reasons: result.failed });
      return;
    }
    const wantsTarget = result.narrowed || (rule.target?.length ?? 0) > 0;
    const target = wantsTarget ? lowestHp(result.enemies) : null;
    candidates.push({ rule, index, target });
  });
  candidates.sort(compareCandidates);
  const suggestions = candidates.slice(0, max).map(({ rule, target }) => ({
    id: rule.id,
    label: rule.label ?? rule.id,
    actions: (rule.do ?? []).map(actionLabel),
    target: target?.name ?? null,
  }));
  return { suggestions, held };
}
