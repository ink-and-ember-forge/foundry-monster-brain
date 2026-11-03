import { MODULE_ID } from "./constants.mjs";
import { MonsterBrainStrip } from "./panel.mjs";
import { hardcodedSuggestion, isMonsterAlliance } from "./engine/suggestion.mjs";

/**
 * Called whenever the active combatant may have changed.
 * Shows the strip on a monster's turn, hides it on anyone else's.
 */
export async function onTurnChange(combat, startedCombatant = null) {
  const combatant = startedCombatant ?? combat?.combatant;
  if (!combatant?.actor || !isMonsterAlliance(combatant.actor.alliance)) {
    return MonsterBrainStrip.hide();
  }
  console.debug(`${MODULE_ID} | monster turn: ${combatant.name} (round ${combat.round})`);
  return MonsterBrainStrip.show(combatant, hardcodedSuggestion());
}
