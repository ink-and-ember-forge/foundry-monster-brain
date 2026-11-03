import { MODULE_ID } from "./main.mjs";

/** Called whenever the active combatant may have changed. */
export function onTurnChange(combat, startedCombatant = null) {
  const combatant = startedCombatant ?? combat?.combatant;
  if (!combatant) return;
  // TODO(step 1): if hostile to PCs, show the strip with a hardcoded suggestion.
  console.debug(`${MODULE_ID} | turn: ${combatant.name} (round ${combat.round})`);
}
