/**
 * Storage for the cascade layers (docs/decisions.md V6):
 *   creature profile    flag  actor.flags.monster-brain.profile      (on the base actor, so all tokens share it)
 *   encounter overrides flag  combatant.flags.monster-brain.overrides
 *   templates           world setting `templates`  { [id]: template }
 *   campaign            world setting `campaign`   { policies, ... }
 * Flags merge on write, so replacing a layer unsets it first.
 */
import { MODULE_ID } from "./constants.mjs";
import { resolveProfile } from "./engine/cascade.mjs";
import { bindSlots } from "./engine/slots.mjs";
import { validate } from "./engine/validate.mjs";
import { SYSTEM_LAYER } from "./engine/default-rules.mjs";
import { itemsFor } from "./adapter.mjs";

const baseActor = (actor) => actor.baseActor ?? actor;

async function replaceFlag(doc, key, value) {
  await doc.unsetFlag(MODULE_ID, key);
  if (value != null) await doc.setFlag(MODULE_ID, key, value);
}

export function registerSettings() {
  game.settings.register(MODULE_ID, "templates", { scope: "world", config: false, type: Object, default: {} });
  game.settings.register(MODULE_ID, "campaign", { scope: "world", config: false, type: Object, default: {} });
}

export const getProfile = (actor) => baseActor(actor).getFlag(MODULE_ID, "profile") ?? null;
export const setProfile = (actor, profile) => replaceFlag(baseActor(actor), "profile", profile);
export const clearProfile = (actor) => replaceFlag(baseActor(actor), "profile", null);

export const getOverrides = (combatant) => combatant.getFlag(MODULE_ID, "overrides") ?? null;
export const setOverrides = (combatant, overrides) => replaceFlag(combatant, "overrides", overrides);

export const getTemplates = () => game.settings.get(MODULE_ID, "templates") ?? {};
export const setTemplate = (id, template) => game.settings.set(MODULE_ID, "templates", { ...getTemplates(), [id]: template });
export function deleteTemplate(id) {
  const { [id]: _removed, ...rest } = getTemplates();
  return game.settings.set(MODULE_ID, "templates", rest);
}
export const getCampaign = () => game.settings.get(MODULE_ID, "campaign") ?? {};
export const setCampaign = (campaign) => game.settings.set(MODULE_ID, "campaign", campaign ?? {});

/** Resolve every cascade layer for a combatant. */
export function resolveFor(combatant) {
  const actor = combatant.actor;
  const profile = getProfile(actor);
  const template = profile?.template ? getTemplates()[profile.template] : null;
  const resolved = resolveProfile({
    system: SYSTEM_LAYER,
    campaign: getCampaign(),
    template,
    creature: profile,
    encounter: getOverrides(combatant),
  });
  const binding = bindSlots(resolved.slots, resolved.slotBindings, itemsFor(actor));
  const warnings = validate(resolved, binding);
  if (profile?.template && !template) {
    warnings.push({ level: "warn", ruleId: null, message: `template "${profile.template}" does not exist` });
  }
  return { resolved, binding, warnings };
}
