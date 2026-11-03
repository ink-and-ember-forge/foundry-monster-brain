/**
 * Action-slot binding (brief section 8). Pure.
 * Slots are abstract ("melee-strike", "signature") and resolve to real items on each creature.
 * Auto-bind: "melee-strike" to the first melee item, "ranged-strike" to the first ranged one.
 * Other slots (e.g. "signature") are never guessed; the GM binds them per creature.
 * A GM binding always wins over auto-binding.
 *
 * @param {string[]} slots
 * @param {Record<string,string>} bindings slot to item id (GM overrides)
 * @param {{ id: string, label: string, kind: "melee"|"ranged"|"other", reach?: number, range?: number }[]} items the creature's candidate items
 * @returns {{ bound: Record<string, { itemId: string, label: string, auto: boolean }>, unbound: string[], missing: string[] }}
 *   `missing` lists slots whose GM binding points at an item the creature no longer has.
 */
export const STRIKE_SLOTS = { "melee-strike": "melee", "ranged-strike": "ranged" };

/** What the planner needs to know about a bound item (world.mjs): its kind, reach and range. */
const spatial = (item) => ({ kind: item.kind, reach: item.reach, range: item.range });

export function bindSlots(slots, bindings = {}, items = []) {
  const bound = {};
  const unbound = [];
  const missing = [];
  for (const slot of slots) {
    if (bindings[slot]) {
      const item = items.find((i) => i.id === bindings[slot]);
      if (item) bound[slot] = { itemId: item.id, label: item.label, auto: false, ...spatial(item) };
      else {
        missing.push(slot);
        unbound.push(slot);
      }
      continue;
    }
    const kind = STRIKE_SLOTS[slot];
    const item = kind && items.find((i) => i.kind === kind);
    if (item) bound[slot] = { itemId: item.id, label: item.label, auto: true, ...spatial(item) };
    else unbound.push(slot);
  }
  return { bound, unbound, missing };
}
