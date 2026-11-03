/**
 * Storage for the cascade layers (docs/decisions.md V6):
 *   actor profile       flag  actor.flags.monster-brain.profile      (on the base actor: a default for all its tokens)
 *   token profile       flag  tokenDocument.flags.monster-brain.profile  (one token; overrides the actor's)
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
import { STARTER_TEMPLATES, STARTER_TEMPLATE_IDS, canonicalTemplateId } from "./engine/starter-templates.mjs";
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

/** Accepts a TokenDocument or a Token placeable. */
const tokenDocOf = (token) => token?.document ?? token;
export const getTokenProfile = (token) => tokenDocOf(token).getFlag(MODULE_ID, "profile") ?? null;
export const setTokenProfile = (token, profile) => replaceFlag(tokenDocOf(token), "profile", profile);
export const clearTokenProfile = (token) => replaceFlag(tokenDocOf(token), "profile", null);

export const getOverrides = (combatant) => combatant.getFlag(MODULE_ID, "overrides") ?? null;
export const setOverrides = (combatant, overrides) => replaceFlag(combatant, "overrides", overrides);

export const getTemplates = () => game.settings.get(MODULE_ID, "templates") ?? {};
export const setTemplate = (id, template) => game.settings.set(MODULE_ID, "templates", { ...getTemplates(), [id]: template });
export function deleteTemplate(id) {
  const { [id]: _removed, ...rest } = getTemplates();
  return game.settings.set(MODULE_ID, "templates", rest);
}
/**
 * Template lookup: your own templates (world setting) win over the shipped starters of the same id,
 * so tweaking a starter is just saving a template with its id (see installStarterTemplates).
 */
export function templateById(id) {
  const world = getTemplates();
  // Your own copy of an old id wins; otherwise the starter, following renames (brute -> brawler ...).
  return world[id] ?? STARTER_TEMPLATES[id] ?? world[canonicalTemplateId(id)] ?? STARTER_TEMPLATES[canonicalTemplateId(id)] ?? null;
}

/** Every template available, with where it comes from. */
export function listTemplates() {
  const world = getTemplates();
  const ids = [...new Set([...Object.keys(world), ...STARTER_TEMPLATE_IDS])];
  return ids.map((id) => ({
    id,
    name: (world[id] ?? STARTER_TEMPLATES[id]).name ?? id,
    source: id in world ? (id in STARTER_TEMPLATES ? "yours (overrides starter)" : "yours") : "starter",
  }));
}

/** Copy starter templates into your world so you can edit them. Existing ones are kept unless overwrite is true. */
export async function installStarterTemplates(ids = STARTER_TEMPLATE_IDS, { overwrite = false } = {}) {
  const world = getTemplates();
  const installed = [];
  for (const requested of ids) {
    const id = canonicalTemplateId(requested);
    if (!STARTER_TEMPLATES[id] || (id in world && !overwrite)) continue;
    world[id] = structuredClone(STARTER_TEMPLATES[id]);
    installed.push(id);
  }
  await game.settings.set(MODULE_ID, "templates", world);
  return installed;
}

export const getCampaign = () => game.settings.get(MODULE_ID, "campaign") ?? {};
export const setCampaign = (campaign) => game.settings.set(MODULE_ID, "campaign", campaign ?? {});

/** Resolve every cascade layer for a combatant (its token's profile applies, not just the actor's). */
export const resolveFor = (combatant) =>
  resolveForActor(combatant.actor, { tokenDoc: combatant.token ?? null, encounter: getOverrides(combatant) });

/**
 * Resolve the cascade for an actor, and optionally one of its tokens.
 * A token's profile overrides the actor's; its `template` (if the key is present) replaces the
 * actor's, with null meaning "no template". `draft` previews unsaved edits:
 * { scope: "token" | "actor", profile } replaces that layer's stored profile.
 */
export function resolveForActor(actor, { tokenDoc = null, encounter = null, draft = null } = {}) {
  let actorProfile = getProfile(actor);
  let tokenProfile = tokenDoc ? getTokenProfile(tokenDoc) : null;
  if (draft) {
    if (draft.scope === "actor") actorProfile = draft.profile ?? null;
    else tokenProfile = draft.profile ?? null;
  }
  const templateId = tokenProfile && "template" in tokenProfile ? tokenProfile.template : actorProfile?.template;
  const template = templateId ? templateById(templateId) : null;
  const resolved = resolveProfile({
    system: SYSTEM_LAYER,
    campaign: getCampaign(),
    template,
    creature: actorProfile,
    token: tokenProfile,
    encounter,
  });
  const binding = bindSlots(resolved.slots, resolved.slotBindings, itemsFor(actor));
  const warnings = validate(resolved, binding);
  if (templateId && !template) {
    warnings.push({ level: "warn", ruleId: null, message: `template "${templateId}" does not exist` });
  }
  return { resolved, binding, warnings, templateId: templateId ?? null, actorProfile, tokenProfile };
}
