/**
 * Monster Brain: entry point. See docs/design-brief.md section 14 for the build order.
 * The rules engine lives in scripts/engine/ and must stay free of Foundry globals so it can be
 * unit tested with plain Node.
 */
import { MODULE_ID } from "./constants.mjs";
import { MonsterBrainStrip } from "./panel.mjs";
import { refresh, explain } from "./turn-watcher.mjs";
import * as profiles from "./profiles.mjs";
import * as roles from "./roles.mjs";
import { dryRun } from "./dryrun.mjs";
import { MonsterBrainDialog } from "./profile-dialog.mjs";
import { MonsterBrainRolesDialog } from "./roles-dialog.mjs";
import { registerTokenHud } from "./hud.mjs";
import { SUGGESTED_ROLES } from "./engine/targets.mjs";
import { onCreateChatMessage, onUpdateToken } from "./tracker.mjs";

/** Open the configure dialog for a token (default: the first controlled token). Also usable as a macro. */
function configure(token = canvas.tokens?.controlled?.[0]) {
  if (!token) {
    ui.notifications?.warn("Monster Brain: select a token first.");
    return null;
  }
  return MonsterBrainDialog.open(token);
}

/** Open the roles dialog for a PC token (default: the first controlled token). */
function tagRoles(token = canvas.tokens?.controlled?.[0]) {
  if (!token) {
    ui.notifications?.warn("Monster Brain: select a token first.");
    return null;
  }
  return MonsterBrainRolesDialog.open(token);
}

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
  game.settings.register(MODULE_ID, "stripExpanded", { scope: "client", config: false, type: Boolean, default: false });
  profiles.registerSettings();
  // Console API until the editor exists: game.modules.get("monster-brain").api
  game.modules.get(MODULE_ID).api = { ...profiles, ...roles, SUGGESTED_ROLES, dryRun, explain, configure, tagRoles };
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

  // Per-token "Monster Brain" buttons on the Token HUD (right-click a token).
  registerTokenHud();

  // Action tracking: detected actions and corrections change a Combat flag, which re-evaluates.
  Hooks.on("createChatMessage", onCreateChatMessage);
  Hooks.on("updateToken", onUpdateToken);
  Hooks.on("updateCombat", (combat, changes) => {
    if (!changes.flags?.[MODULE_ID] || !game.users.activeGM?.isSelf) return;
    if (combat.id === game.combat?.id) refresh(combat);
  });
  console.log(`${MODULE_ID} | ready (GM)`);
});
