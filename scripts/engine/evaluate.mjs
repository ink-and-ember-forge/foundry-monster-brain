/**
 * Rule evaluator (brief section 5, steps 3 to 6). Pure.
 *
 * Pipeline per rule: conditions, then rule limits, then global policies, then rank.
 * The bundle is trimmed to the actions left this turn.
 *
 * Optional context: ctx.turn = { remaining, taken: [{ key }] } and ctx.ruleUses = [{ ruleId, round }].
 * Absent, the monster is treated as having a full budget and no history.
 *
 * Optional ctx.slots = { bound: { slot: { label } }, unbound: [slot] }. When given:
 *   - a strike slot with nothing to bind to means the creature lacks that attack, so the rule is held back;
 *   - other unbound slots (e.g. "signature") only warn: the rule stays, shown by its generic label;
 *   - a bound slot is labelled with its item, e.g. "Ranged strike (Shortbow)".
 *
 * Feasibility: each rule's action list is planned against the preferred target (world.mjs). The
 * plan may add Strides a Strike needs, skip a Stride that is not needed, or be rejected with a
 * reason; the first target the plan works against is used. `slugs`/`steps` are the plan, not the
 * authored list, and `adjustments` says what changed.
 *
 * Targets: enemy conditions narrow the eligible enemies, then the rule's `target` selector (see
 * targets.mjs) picks one; a rule with no selector uses DEFAULT_SELECTOR. EVERY suggestion names a
 * target (a deliberate change from brief section 7, which allowed action-only suggestions): a rule
 * with no enemy to pick is held back as "no valid target", so with no enemies there is no suggestion.
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

/** Slot checks. Returns reason strings for strike slots with no item to bind to. */
function checkSlots(bundle, ctx) {
  const unbound = ctx.slots?.unbound ?? [];
  return [...new Set(bundle)]
    .filter((slug) => slug in STRIKE_SLOTS && unbound.includes(slug))
    .map((slug) => `slot: this creature has no ${STRIKE_SLOTS[slug]} attack for "${actionLabel(slug)}"`);
}

function slotLabel(slug, ctx) {
  return labelWithItem(slug, ctx.slots?.bound?.[slug]);
}

/**
 * Movement is never capped: closing a gap can take several Strides, and the repeat cap exists to
 * stop "Strike, Strike, Strike", not to forbid crossing a room.
 */
const UNCAPPED = new Set(["stride", "stand"]);

/** Global policies. Returns reason strings. */
function checkPolicies(bundle, ctx, policies) {
  const cap = policies?.maxSameActionPerTurn;
  if (cap == null) return [];
  const counts = new Map();
  for (const a of ctx.turn?.taken ?? []) if (!UNCAPPED.has(a.key)) counts.set(a.key, (counts.get(a.key) ?? 0) + 1);
  for (const slug of bundle) {
    const k = actionKey(slug);
    if (!UNCAPPED.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, n]) => n > cap)
    .map(([k, n]) => `policy: ${actionLabel(k)} would be used ${n} times this turn (max ${cap})`);
}
import { CONDITIONS, describeCondition } from "./conditions.mjs";
import { actionLabel, actionKey } from "./actions.mjs";
import { STRIKE_SLOTS } from "./slots.mjs";
import { rankTargets, describeSelector, DEFAULT_SELECTOR } from "./targets.mjs";
import { planBundle } from "./world.mjs";
import { remainingBundle } from "./taken.mjs";
import { labelWithItem } from "./actions.mjs";

export { actionLabel };

/** Evaluate one rule. Returns { ok, enemies, failed: string[] }. */
function checkRule(rule, ctx) {
  let enemies = ctx.enemies;
  const failed = [];
  for (const cond of rule.when ?? []) {
    const def = CONDITIONS[cond.type];
    if (!def) {
      failed.push(describeCondition(cond));
      continue;
    }
    const want = !cond.not;
    if (def.scope === "enemy") {
      enemies = enemies.filter((e) => {
        const r = def.test(cond, ctx, e);
        return r !== null && r === want;
      });
      if (enemies.length === 0) failed.push(`${describeCondition(cond)} (no enemy matches)`);
    } else if (def.test(cond, ctx) !== want) {
      failed.push(describeCondition(cond));
    }
  }
  return { ok: failed.length === 0, enemies, failed };
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
 * @typedef {{ id: string, label: string, actions: string[], slugs: string[], target: string,
 *   steps: { slug: string, label: string, note: string, added: boolean }[], adjustments: string[],
 *   why: string[], source: string|null, hint: string|null }} Suggestion
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
    // What is still to do: the rule's actions minus what was already done this turn, so recording an
    // action advances the plan instead of regenerating it.
    const todo = remainingBundle(rule.do ?? [], ctx.turn?.taken ?? []);
    if ((rule.do ?? []).length > 0 && todo.length === 0) {
      held.push({ id: rule.id, label: rule.label, reasons: ["already done this turn"] });
      return;
    }
    const blocked = [...checkLimits(rule, ctx), ...checkSlots(todo, ctx)];
    if (blocked.length > 0) {
      held.push({ id: rule.id, label: rule.label, reasons: blocked });
      return;
    }
    // Every suggestion names a target: the rule's own preferences, or the default if it has none.
    const own = rule.target?.length > 0;
    const selector = own ? rule.target : DEFAULT_SELECTOR;
    const ranked = rankTargets(result.enemies, selector);
    if (ranked.length === 0) {
      held.push({ id: rule.id, label: rule.label, reasons: ["no valid target"] });
      return;
    }
    // Take the most-preferred target the plan can actually be carried out against (world.mjs):
    // a melee Strike needs reach, a Stride needs to be allowed, and so on.
    let chosen = null;
    let whyNot = null;
    for (const enemy of ranked) {
      const plan = planBundle({ bundle: todo, ctx, target: enemy, remaining });
      if (!plan.ok) {
        whyNot ??= [plan.reason];
        continue;
      }
      const policyBlocked = checkPolicies(plan.slugs, ctx, policies);
      if (policyBlocked.length > 0) {
        whyNot ??= policyBlocked;
        continue;
      }
      chosen = { enemy, plan };
      break;
    }
    if (!chosen) {
      held.push({ id: rule.id, label: rule.label, reasons: whyNot });
      return;
    }
    const targetWhy = describeSelector(selector) + (own ? "" : " (default)");
    candidates.push({ rule, index, target: chosen.enemy, targetWhy, plan: chosen.plan });
  });
  candidates.sort(compareCandidates);
  const suggestions = candidates.slice(0, max).map(({ rule, target, targetWhy, plan }) => ({
    id: rule.id,
    label: rule.label ?? rule.id,
    slugs: plan.slugs,
    actions: plan.slugs.map((slug) => slotLabel(slug, ctx)),
    // The plan step by step. The first step is the action to do now; later ones follow.
    steps: plan.steps.map((st) => ({ slug: st.slug, label: slotLabel(st.slug, ctx), note: st.note, added: st.added })),
    adjustments: plan.adjustments,
    why: (rule.when ?? []).map(describeCondition),
    source: rule.source ?? null,
    hint: rule.hint ?? null,
    target: target.name,
    targetDistance: Number.isFinite(target.distance) ? target.distance : null,
    targetWhy,
  }));
  return { suggestions, held, remaining };
}
