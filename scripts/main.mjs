/**
 * Monster Brain: entry point.
 * Build step 1 (see docs/design-brief.md section 14): skeleton + turn hook.
 * The rules engine lives in scripts/engine/ and must stay free of Foundry
 * globals so it can be unit tested with plain Node.
 */
import { onTurnChange } from "./turn-watcher.mjs";

export const MODULE_ID = "monster-brain";

Hooks.once("init", () => {
  if (game.system.id !== "pf2e") {
    console.warn(`${MODULE_ID} | Requires the pf2e system; not initialising.`);
    return;
  }
  console.log(`${MODULE_ID} | init`);
});

Hooks.once("ready", () => {
  if (game.system.id !== "pf2e" || !game.user.isGM) return; // GM client only
  Hooks.on("combatStart", (combat) => onTurnChange(combat));
  Hooks.on("combatRound", (combat) => onTurnChange(combat));
  Hooks.on("combatTurn", (combat) => onTurnChange(combat));
  console.log(`${MODULE_ID} | ready (GM)`);
});
