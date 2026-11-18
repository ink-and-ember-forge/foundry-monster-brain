/**
 * Classify PF2e chat-message data into a tracked action. Pure.
 * Field paths verified against foundryvtt/pf2e (docs/decisions.md V3):
 *   flags.pf2e.context.type, .identifier (`${itemId}.${attackSlug}.${melee|ranged}` for strikes), .options.
 * Only the attack roll counts for a Strike: its damage roll is the same action.
 * `itemId` is the item the card was for (strikes: the first segment of the identifier; spells: the last
 * segment of origin.uuid; self-effects: context.item), so the caller can tell WHICH of the creature's
 * actions was used, e.g. that a ranged Strike was its signature.
 *
 * Spells (verified in v13-dev, see docs/decisions.md V3):
 *  - Every cast makes a card carrying `flags.pf2e.casting`, but only a spell with a save or attack gets a
 *    `context` ({ type: "spell-cast" }). A buff, heal or summon has none, so `casting` is the cast signal.
 *  - The attack roll made from that card is an `attack-roll` with no identifier and `action:cast-a-spell` in
 *    its options. It is part of the cast already counted, so it is NOT a Strike and is not counted again.
 * @param {{ type?: string, identifier?: string|null, options?: string[], item?: string }} [context]
 * @param {{ uuid?: string }} [origin] flags.pf2e.origin
 * @param {object} [casting] flags.pf2e.casting (present on a spell's cast card only)
 * @returns {{ key: string, label: string, itemId?: string } | null}
 */
import { actionLabel } from "./actions.mjs";
import { isBuiltin } from "./action-catalog.mjs";

const lastSegment = (uuid) => (typeof uuid === "string" && uuid ? uuid.split(".").at(-1) : undefined);
const CAST_OPTION = "action:cast-a-spell";

/** The PF2e action slug a roll was made for: `action:<slug>` or `action:<slug>:<variant>` in its options. */
function actionOf(context) {
  const opt = (context.options ?? []).find((o) => o.startsWith("action:"));
  return opt?.split(":")[1];
}

export function classifyContext(context, origin, casting) {
  if (casting && (!context || context.type === "spell-cast")) {
    return { key: "spell", label: actionLabel("spell"), itemId: lastSegment(origin?.uuid) };
  }
  if (!context) return null;
  switch (context.type) {
    case "attack-roll": {
      if (context.options?.includes(CAST_OPTION)) return null; // a spell's attack roll: the cast card already counted
      // Escape rolls the unarmed attack modifier (action-macros/basic/escape.ts), so it arrives as an attack roll.
      const named = actionOf(context);
      if (named && isBuiltin(named)) return { key: named, label: actionLabel(named) };
      const ranged = String(context.identifier ?? "").split(".").at(-1) === "ranged";
      const key = ranged ? "ranged-strike" : "melee-strike";
      return { key, label: actionLabel(key), itemId: String(context.identifier ?? "").split(".")[0] || undefined };
    }
    case "spell-cast":
      return { key: "spell", label: actionLabel("spell"), itemId: lastSegment(origin?.uuid) };
    case "area-fire":
    case "auto-fire":
      return { key: "ranged-strike", label: "Area/auto-fire", itemId: String(context.identifier ?? "").split(".")[0] || undefined };
    case "self-effect":
      return { key: "other", label: "Use an ability", itemId: lastSegment(context.item) };
    case "skill-check":
    case "perception-check": {
      // Only checks that are part of an action carry an `action:<slug>` option; plain checks do not count.
      // (Seek is a perception check.)
      const slug = actionOf(context);
      if (!slug || slug === "strike") return null;
      return { key: slug, label: actionLabel(slug) };
    }
    default:
      return null;
  }
}
