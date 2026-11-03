/**
 * Monster Brain: entry point (build step 1, see docs/design-brief.md section 14).
 * The rules engine lives in scripts/engine/ and must stay free of Foundry
 * globals so it can be unit tested with plain Node.
 */
import { MODULE_ID } from "./constants.mjs";
import { MonsterBrainStrip } from "./panel.mjs";
import { onTurnChange } from "./turn-watcher.mjs";

Hooks.once("init", () => {
  if (game.system.id !== "pf2e") {
    console.warn(`${MODULE_ID} | Requires the pf2e system; not initialising.`);
    return;
  }
  game.settings.register(MODULE_ID, "stripPosition", {
    scope: "client",
    config: false,
    type: Object,
    default: null,
  });
  console.log(`${MODULE_ID} | init`);
});

Hooks.once("ready", () => {
  if (game.system.id !== "pf2e" || !game.user.isGM) return; // GM client only
  // PF2e fires these after its own turn-start effects have run (encounter/combatant.ts).
  Hooks.on("pf2e.startTurn", (combatant, encounter) => onTurnChange(encounter, combatant));
  // At turn end combat.combatant is still the finishing combatant, so just hide;
  // the next pf2e.startTurn shows the strip again if that turn is a monster's.
  Hooks.on("pf2e.endTurn", () => MonsterBrainStrip.hide());
  Hooks.on("deleteCombat", () => MonsterBrainStrip.hide());
  console.log(`${MODULE_ID} | ready (GM)`);
});
