/**
 * Editing helpers for a creature/token profile draft. Pure and immutable; the configure dialog is a
 * thin view over these.
 *
 * Profile: { template?: string|null, slotBindings?: {slot: itemId}, disable?: [ruleId], ... }
 *   template undefined = inherit (from the actor, for a token); null = explicitly none; string = id.
 */

export const INHERIT = "__inherit__";
export const NONE = "__none__";

/** Drop empty containers so an untouched draft saves as nothing. `template: null` is meaningful and kept. */
export function prune(profile) {
  const p = { ...(profile ?? {}) };
  if (p.template === undefined) delete p.template;
  if (p.slotBindings && Object.keys(p.slotBindings).length === 0) delete p.slotBindings;
  if (p.disable && p.disable.length === 0) delete p.disable;
  return p;
}

export const isEmptyProfile = (profile) => Object.keys(prune(profile)).length === 0;

export function setTemplate(profile, template) {
  const p = { ...(profile ?? {}) };
  if (template === undefined) delete p.template;
  else p.template = template;
  return prune(p);
}

/** itemId falsy removes the binding. */
export function setBinding(profile, slot, itemId) {
  const bindings = { ...(profile?.slotBindings ?? {}) };
  if (itemId) bindings[slot] = itemId;
  else delete bindings[slot];
  return prune({ ...(profile ?? {}), slotBindings: bindings });
}

export function setRuleEnabled(profile, ruleId, enabled) {
  const disable = new Set(profile?.disable ?? []);
  if (enabled) disable.delete(ruleId);
  else disable.add(ruleId);
  return prune({ ...(profile ?? {}), disable: [...disable] });
}

/** Select value for the profile's template. Inheriting is only offered at token scope. */
export function templateToValue(profile, scope) {
  if (!profile || profile.template === undefined) return scope === "token" ? INHERIT : NONE;
  return profile.template === null ? NONE : profile.template;
}

/** Inverse of templateToValue: undefined (inherit), null (none) or an id. */
export function valueToTemplate(value) {
  if (value === INHERIT) return undefined;
  if (value === NONE) return null;
  return value;
}

/**
 * Options for the template select.
 * @param templates [{ id, name, source }]
 * @param inheritedName name of the template the actor would give (or null) for the "inherit" label
 */
export function templateOptions(templates, scope, inheritedName = null) {
  const opts = [];
  if (scope === "token") opts.push({ value: INHERIT, label: `Same as the actor (${inheritedName ?? "no template"})` });
  opts.push({ value: NONE, label: "No template" });
  for (const t of templates) opts.push({ value: t.id, label: `${t.name} (${t.source})` });
  return opts;
}

/**
 * Rows for the rule list. A rule disabled by a *different* layer cannot be re-enabled here (the
 * cascade only re-enables by supplying the rule again), so it is shown but not editable.
 * @param scopeLayer the cascade layer this dialog edits: "token" or "creature"
 */
export function ruleRows(rules, scopeLayer) {
  return rules.map((r) => {
    const disabledElsewhere = r.enabled === false && r.disabledBy && r.disabledBy !== scopeLayer;
    return {
      id: r.id,
      label: r.label ?? r.id,
      source: r.source ?? "system",
      enabled: r.enabled !== false,
      editable: !disabledElsewhere,
      note: disabledElsewhere ? `turned off by the ${r.disabledBy} layer` : null,
    };
  });
}

/** Which cascade layer a dialog scope edits. */
export const layerOfScope = (scope) => (scope === "token" ? "token" : "creature");
