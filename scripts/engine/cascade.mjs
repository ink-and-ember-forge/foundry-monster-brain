/**
 * Customisation cascade (brief section 8). Pure.
 *
 * Layers, general to specific: system, campaign, template, creature, encounter.
 * Each layer is { rules?, disable?, policies?, slots?, slotBindings? }.
 *   - A rule with an existing id REPLACES it in place (position is priority, so it is kept).
 *   - A new id is appended.
 *   - `disable: [ids]` switches rules off; a later layer that supplies the id again re-enables it.
 *   - Policies merge by key; a null value removes the policy.
 *   - slotBindings merge by slot; the more specific layer wins.
 */

/** Movement actions are built in; every other action in a bundle is a slot that needs binding. */
export const BUILTIN_ACTIONS = ["stride", "stride-away"];

/** @returns {{ rules: Rule[], policies: object, slots: string[], slotBindings: object, issues: Issue[] }} */
export function resolveProfile({ system, campaign, template, creature, encounter } = {}) {
  const layers = [
    ["system", system],
    ["campaign", campaign],
    ["template", template],
    ["creature", creature],
    ["encounter", encounter],
  ].filter(([, l]) => l);

  const rules = [];
  const policies = {};
  const slotBindings = {};
  const declared = new Set();
  const issues = [];

  for (const [name, layer] of layers) {
    const seen = new Set();
    for (const rule of layer.rules ?? []) {
      if (seen.has(rule.id)) issues.push({ type: "duplicate-id", id: rule.id, layer: name });
      seen.add(rule.id);
      const entry = { ...structuredClone(rule), source: name };
      const at = rules.findIndex((r) => r.id === rule.id);
      if (at === -1) rules.push(entry);
      else rules[at] = entry;
    }
    for (const id of layer.disable ?? []) {
      const at = rules.findIndex((r) => r.id === id);
      if (at === -1) issues.push({ type: "unknown-disable", id, layer: name });
      else rules[at] = { ...rules[at], enabled: false, disabledBy: name };
    }
    for (const [key, value] of Object.entries(layer.policies ?? {})) {
      if (value === null) delete policies[key];
      else policies[key] = value;
    }
    Object.assign(slotBindings, layer.slotBindings ?? {});
    for (const slot of layer.slots ?? []) declared.add(slot);
  }

  // Slots: everything declared, plus every non-movement action used by an enabled rule.
  const slots = new Set(declared);
  for (const rule of rules) {
    if (rule.enabled === false) continue;
    for (const slug of rule.do ?? []) if (!BUILTIN_ACTIONS.includes(slug)) slots.add(slug);
  }
  return { rules, policies, slots: [...slots], slotBindings, issues };
}
