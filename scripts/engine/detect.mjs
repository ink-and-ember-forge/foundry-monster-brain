/**
 * Classify PF2e chat-message data into a tracked action. Pure.
 * Field paths verified against foundryvtt/pf2e (docs/decisions.md V3):
 *   flags.pf2e.context.type, .identifier (`${itemId}.${attackSlug}.${melee|ranged}` for strikes), .options.
 * Only the attack roll counts for a Strike: its damage roll is the same action.
 * `itemId` is the item the card was for (strikes: the first segment of the identifier; spells: the last
 * segment of origin.uuid; self-effects: context.item), so the caller can tell WHICH of the creature's
 * actions was used, e.g. that a ranged Strike was its signature.
 * @param {{ type?: string, identifier?: string, options?: string[], item?: string }} context
 * @param {{ uuid?: string }} [origin] flags.pf2e.origin
 * @returns {{ key: string, label: string, itemId?: string } | null}
 */
import { actionLabel } from "./actions.mjs";

const lastSegment = (uuid) => (typeof uuid === "string" && uuid ? uuid.split(".").at(-1) : undefined);

export function classifyContext(context, origin) {
  if (!context) return null;
  switch (context.type) {
    case "attack-roll": {
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
    case "skill-check": {
      // Only checks that are part of an action carry an `action:<slug>` option; plain checks do not count.
      const opt = (context.options ?? []).find((o) => o.startsWith("action:"));
      const slug = opt?.split(":")[1];
      if (!slug || slug === "strike") return null;
      return { key: slug, label: actionLabel(slug) };
    }
    default:
      return null;
  }
}
