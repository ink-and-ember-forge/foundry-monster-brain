import { MODULE_ID } from "./constants.mjs";
import { MonsterBrainStrip } from "./panel.mjs";
import { buildContext } from "./adapter.mjs";
import { evaluate } from "./engine/evaluate.mjs";
import { DEFAULT_RULES, DEFAULT_POLICIES } from "./engine/default-rules.mjs";
import { isMonsterAlliance } from "./engine/suggestion.mjs";
import { turnActions } from "./engine/history.mjs";
import { readHistory, panelHandlers } from "./tracker.mjs";

/**
 * Evaluate and show (or hide) the strip for the given combatant.
 * Runs at turn start and again whenever tracked history changes.
 */
export async function refresh(combat, combatant = combat?.combatant) {
  if (!combatant?.actor || !isMonsterAlliance(combatant.actor.alliance)) {
    return MonsterBrainStrip.hide();
  }
  const history = readHistory(combat);
  const ctx = buildContext(combatant, combat, history);
  const { suggestions, held } = evaluate(DEFAULT_RULES, ctx, { policies: DEFAULT_POLICIES });
  const suggestion = suggestions[0] ?? null;
  console.debug(`${MODULE_ID} | ${combatant.name} r${combat.round}`, { ctx, suggestions, held });
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
