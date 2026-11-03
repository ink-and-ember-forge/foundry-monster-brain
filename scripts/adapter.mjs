import { actionBudget } from "./engine/budget.mjs";
import { turnActions, ruleUsesFor } from "./engine/history.mjs";

/**
 * Foundry/PF2e to plain-context adapter. The only place the rules pipeline touches game data.
 * Data paths verified in docs/decisions.md (V2).
 */

function hpPercent(actor) {
  const hp = actor.system?.attributes?.hp;
  if (!hp || !(hp.max > 0)) return 100;
  return (hp.value / hp.max) * 100;
}

function conditionSlugs(actor) {
  return actor.conditions.active.map((c) => c.slug);
}

/**
 * Distance (ft) and reach check between two combatants' tokens. Null when unknown:
 * canvas not showing this scene, or a token is not on the canvas.
 * Reach test mirrors PF2e's own TokenPF2e#canFlank: reach >= distanceTo(target, { reach }).
 */
function measure(combat, selfCombatant, other) {
  try {
    if (!canvas?.ready || combat.scene?.id !== canvas.scene?.id) return { distance: null, inReach: null };
    const a = selfCombatant.token?.object;
    const b = other.token?.object;
    if (!a || !b) return { distance: null, inReach: null };
    const reach = selfCombatant.actor.getReach({ action: "attack" });
    const distance = a.distanceTo(b);
    const reachDistance = a.distanceTo(b, { reach });
    if (Number.isNaN(distance) || Number.isNaN(reachDistance)) return { distance: null, inReach: null };
    return { distance, inReach: reach >= reachDistance };
  } catch (err) {
    console.warn("monster-brain | distance measurement failed", err);
    return { distance: null, inReach: null };
  }
}

/** Condition slug to badge value (1 when the condition has no badge). */
function conditionValues(actor) {
  return Object.fromEntries(actor.conditions.active.map((c) => [c.slug, c.value ?? 1]));
}

/**
 * @param combatant the monster whose turn it is
 * @param combat the encounter
 * @param history this combat's tracked history (see engine/history.mjs)
 */
export function buildContext(combatant, combat, history) {
  const actor = combatant.actor;
  const enemies = combat.combatants
    .filter((c) => c.actor && !c.isDefeated && c.id !== combatant.id && actor.isEnemyOf(c.actor))
    .map((c) => ({
      id: c.id,
      name: c.name,
      hpPercent: hpPercent(c.actor),
      conditions: conditionSlugs(c.actor),
      ...measure(combat, combatant, c),
    }));
  const budget = actionBudget(conditionValues(actor));
  const taken = turnActions(history, combat.round, combatant.id);
  return {
    round: combat.round,
    self: { name: combatant.name, hpPercent: hpPercent(actor), conditions: conditionSlugs(actor) },
    enemies,
    turn: { budget, remaining: Math.max(0, budget - taken.length), taken },
    ruleUses: ruleUsesFor(history, combatant.id),
  };
}
