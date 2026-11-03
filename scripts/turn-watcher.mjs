import { MODULE_ID } from "./constants.mjs";
import { MonsterBrainStrip } from "./panel.mjs";
import { buildContext } from "./adapter.mjs";
import { evaluate } from "./engine/evaluate.mjs";
import { DEFAULT_RULES } from "./engine/default-rules.mjs";
import { isMonsterAlliance } from "./engine/suggestion.mjs";

/**
 * Called when a turn starts. Shows the strip on a monster's turn.
 * (Hiding at turn end and on combat deletion is wired in main.mjs.)
 */
export async function onTurnChange(combat, startedCombatant = null) {
  const combatant = startedCombatant ?? combat?.combatant;
  if (!combatant?.actor || !isMonsterAlliance(combatant.actor.alliance)) {
    return MonsterBrainStrip.hide();
  }
  const ctx = buildContext(combatant, combat);
  const { suggestions, held } = evaluate(DEFAULT_RULES, ctx);
  console.debug(`${MODULE_ID} | ${combatant.name} r${combat.round}`, { ctx, suggestions, held });
  return MonsterBrainStrip.show(combatant, suggestions[0] ?? null);
}
