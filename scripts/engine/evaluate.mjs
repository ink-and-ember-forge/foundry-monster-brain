/**
 * Rule evaluator (brief section 5, steps 3 to 6). Pure.
 *
 * Pipeline per rule: conditions, then rule limits, then global policies, then rank.
 * The bundle is trimmed to the actions left this turn.
 *
 * Optional context: ctx.turn = { remaining, taken: [{ key }] } and ctx.ruleUses = [{ ruleId, round }].
 * Absent, the monster is treated as having a full budget and no history.
 *
 * Not yet implemented, by design: role-tag target selectors (step 4), slot binding (step 3).
 * Targeting is a stub: enemy conditions narrow the eligible targets, then lowest HP is picked.
 */

export const DEFAULT_REMAINING = 3;

/** Rule limits (brief section 4). Returns reason strings for each limit that blocks the rule. */
function checkLimits(rule, ctx) {
  const limits = rule.limits;
  if (!limits) return [];
  const uses = (ctx.ruleUses ?? []).filter((u) => u.ruleId === rule.id);
  const reasons = [];
  if (limits.oncePerEncounter && uses.length > 0) reasons.push("limit: once per encounter, already used");
  if (limits.maxPerTurn != null) {
    const thisTurn = uses.filter((u) => u.round === ctx.round).length;
    if (thisTurn >= limits.maxPerTurn) reasons.push(`limit: max ${limits.maxPerTurn} per turn reached`);
  }
  if (limits.cooldownRounds != null && uses.length > 0) {
    const last = Math.max(...uses.map((u) => u.round));
    const left = limits.cooldownRounds - (ctx.round - last);
    if (left > 0) reasons.push(`limit: on cooldown for ${left} more round${left === 1 ? "" : "s"}`);
  }
  return reasons;
}

/** Global policies. Returns reason strings. */
function checkPolicies(bundle, ctx, policies) {
  const cap = policies?.maxSameActionPerTurn;
  if (cap == null) return [];
  const counts = new Map();
  for (const a of ctx.turn?.taken ?? []) counts.set(a.key, (counts.get(a.key) ?? 0) + 1);
  for (const slug of bundle) {
    const k = actionKey(slug);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, n]) => n > cap)
    .map(([k, n]) => `policy: ${actionLabel(k)} would be used ${n} times this turn (max ${cap})`);
}
import { CONDITIONS, describeCondition } from "./conditions.mjs";
import { actionLabel, actionKey } from "./actions.mjs";

export { actionLabel };

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
      enemies = enemies.filter((e) => {
        const r = def.test(cond, ctx, e);
        return r !== null && r === want;
      });
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
 * @returns {{ suggestions: Suggestion[], held: { id: string, label: string, reasons: string[] }[], remaining: number }}
 * @typedef {{ id: string, label: string, actions: string[], slugs: string[], target: string|null }} Suggestion
 */
export function evaluate(rules, ctx, { max = 2, policies = {} } = {}) {
  const remaining = ctx.turn?.remaining ?? DEFAULT_REMAINING;
  const candidates = [];
  const held = [];
  if (remaining <= 0) return { suggestions: [], held, remaining };
  rules.forEach((rule, index) => {
    if (rule.enabled === false) return;
    const result = checkRule(rule, ctx);
    if (!result.ok) {
      held.push({ id: rule.id, label: rule.label, reasons: result.failed });
      return;
    }
    const blocked = checkLimits(rule, ctx);
    const bundle = (rule.do ?? []).slice(0, remaining);
    blocked.push(...checkPolicies(bundle, ctx, policies));
    if (blocked.length > 0) {
      held.push({ id: rule.id, label: rule.label, reasons: blocked });
      return;
    }
    const wantsTarget = result.narrowed || (rule.target?.length ?? 0) > 0;
    const target = wantsTarget ? lowestHp(result.enemies) : null;
    candidates.push({ rule, index, target, bundle });
  });
  candidates.sort(compareCandidates);
  const suggestions = candidates.slice(0, max).map(({ rule, target, bundle }) => ({
    id: rule.id,
    label: rule.label ?? rule.id,
    slugs: bundle,
    actions: bundle.map(actionLabel),
    target: target?.name ?? null,
  }));
  return { suggestions, held, remaining };
}
