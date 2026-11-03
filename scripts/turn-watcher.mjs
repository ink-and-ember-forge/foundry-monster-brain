import { MODULE_ID } from "./constants.mjs";
import { MonsterBrainStrip } from "./panel.mjs";
import { buildContext } from "./adapter.mjs";
import { evaluate } from "./engine/evaluate.mjs";
import { isMonsterAlliance } from "./engine/suggestion.mjs";
import { turnActions } from "./engine/history.mjs";
import { readHistory, panelHandlers } from "./tracker.mjs";
import { resolveFor } from "./profiles.mjs";

/** Everything the pipeline produces for a combatant right now. Also backs the console `explain` API. */
export function compute(combat, combatant) {
  const history = readHistory(combat);
  const { resolved, binding, warnings } = resolveFor(combatant);
  const ctx = {
    ...buildContext(combatant, combat, history),
    slots: { bound: binding.bound, unbound: binding.unbound },
  };
  const result = evaluate(resolved.rules, ctx, { policies: resolved.policies });
  return { history, ctx, result, resolved, binding, warnings };
}

/**
 * Evaluate and show (or hide) the strip for the given combatant.
 * Runs at turn start and again whenever tracked history changes.
 */
export async function refresh(combat, combatant = combat?.combatant) {
  if (!combatant?.actor || !isMonsterAlliance(combatant.actor.alliance)) {
    return MonsterBrainStrip.hide();
  }
  const { history, ctx, result, warnings } = compute(combat, combatant);
  const suggestion = result.suggestions[0] ?? null;
  console.debug(`${MODULE_ID} | ${combatant.name} r${combat.round}`, { ctx, ...result, warnings });
  const view = {
    suggestion,
    turn: {
      budget: ctx.turn.budget,
      remaining: ctx.turn.remaining,
      actions: turnActions(history, combat.round, combatant.id),
    },
  };
  return MonsterBrainStrip.show(combatant, view, panelHandlers(combat, combatant, suggestion));
}

/** Console helper: what would the module say for the current combatant, and why. */
export function explain() {
  const combat = game.combat;
  const combatant = combat?.combatant;
  if (!combatant?.actor) return null;
  const { ctx, result, resolved, binding, warnings } = compute(combat, combatant);
  return { combatant: combatant.name, ctx, ...result, rules: resolved.rules, policies: resolved.policies, binding, warnings };
}
