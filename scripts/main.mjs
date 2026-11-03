/**
 * Monster Brain: entry point. See docs/design-brief.md section 14 for the build order.
 * The rules engine lives in scripts/engine/ and must stay free of Foundry globals so it can be
 * unit tested with plain Node.
 */
import { MODULE_ID } from "./constants.mjs";
import { MonsterBrainStrip } from "./panel.mjs";
import { refresh } from "./turn-watcher.mjs";
import { onCreateChatMessage, onUpdateToken } from "./tracker.mjs";

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
  Hooks.on("pf2e.startTurn", (combatant, encounter) => refresh(encounter, combatant));
  // At turn end combat.combatant is still the finishing combatant, so just hide;
  // the next pf2e.startTurn shows the strip again if that turn is a monster's.
  Hooks.on("pf2e.endTurn", () => MonsterBrainStrip.hide());
  Hooks.on("deleteCombat", () => MonsterBrainStrip.hide());

  // Action tracking: detected actions and corrections change a Combat flag, which re-evaluates.
  Hooks.on("createChatMessage", onCreateChatMessage);
  Hooks.on("updateToken", onUpdateToken);
  Hooks.on("updateCombat", (combat, changes) => {
    if (!changes.flags?.[MODULE_ID] || !game.users.activeGM?.isSelf) return;
    if (combat.id === game.combat?.id) refresh(combat);
  });
  console.log(`${MODULE_ID} | ready (GM)`);
});
