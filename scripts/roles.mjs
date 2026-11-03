/**
 * PC role tags. Campaign default: flag on the (base) actor. Per-encounter override: flag on the
 * combatant, which replaces the default for that encounter. Tags are free-form lowercase strings.
 */
import { MODULE_ID } from "./constants.mjs";
import { normaliseRoles, resolveRoles } from "./engine/targets.mjs";

const baseActor = (actor) => actor.baseActor ?? actor;

export const getActorRoles = (actor) => normaliseRoles(baseActor(actor).getFlag(MODULE_ID, "roles"));
export const setActorRoles = (actor, tags) => baseActor(actor).setFlag(MODULE_ID, "roles", normaliseRoles(tags));

/** The raw per-encounter override, or null when there is none. */
export const getCombatantRoles = (combatant) => combatant.getFlag(MODULE_ID, "roles") ?? null;
/** Pass null to remove the override and fall back to the campaign default. */
export const setCombatantRoles = (combatant, tags) =>
  tags == null ? combatant.unsetFlag(MODULE_ID, "roles") : combatant.setFlag(MODULE_ID, "roles", normaliseRoles(tags));

/** The effective tags for a combatant right now. */
export const rolesFor = (combatant) => resolveRoles(getActorRoles(combatant.actor), getCombatantRoles(combatant));
