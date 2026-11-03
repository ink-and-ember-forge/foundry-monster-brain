/**
 * Customisation cascade (brief section 8). Pure.
 *
 * Layers, general to specific: system, campaign, template, creature (the actor), token (one token
 * on the map; overrides its actor so two goblins from one sheet can differ), encounter.
 * Each layer is { rules?, disable?, policies?, slots?, slotBindings? }.
 *   - A rule with an existing id REPLACES it in place (position is priority, so it is kept).
 *   - A new id goes AHEAD of every rule from more general layers (rule order is priority, so a
 *     template or creature rule outranks a shipped default); order within a layer is kept. Without
 *     this, nothing could ever outrank the always-true fallback rule at the end of the system layer.
 *     An explicit `priority` still overrides position.
 *   - `disable: [ids]` switches rules off; a later layer that supplies the id again re-enables it.
 *   - Policies merge by key; a null value removes the policy.
 *   - slotBindings merge by slot; the more specific layer wins.
 */

/** Movement actions are built in; every other action in a bundle is a slot that needs binding. */
export const BUILTIN_ACTIONS = ["stride", "stride-away"];

/** @returns {{ rules: Rule[], policies: object, slots: string[], slotBindings: object, issues: Issue[] }} */
export function resolveProfile({ system, campaign, template, creature, token, encounter } = {}) {
  const layers = [
    ["system", system],
    ["campaign", campaign],
    ["template", template],
    ["creature", creature],
    ["token", token],
    ["encounter", encounter],
  ].filter(([, l]) => l);

  const rules = [];
  const policies = {};
  const slotBindings = {};
  const declared = new Set();
  const issues = [];

  for (const [name, layer] of layers) {
    const seen = new Set();
    const added = [];
    for (const rule of layer.rules ?? []) {
      if (seen.has(rule.id)) issues.push({ type: "duplicate-id", id: rule.id, layer: name });
      seen.add(rule.id);
      const entry = { ...structuredClone(rule), source: name };
      const at = rules.findIndex((r) => r.id === rule.id);
      const addedAt = added.findIndex((r) => r.id === rule.id);
      if (at !== -1) rules[at] = entry;
      else if (addedAt !== -1) added[addedAt] = entry;
      else added.push(entry);
    }
    rules.unshift(...added);
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
