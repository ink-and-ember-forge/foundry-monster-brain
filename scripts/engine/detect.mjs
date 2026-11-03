/**
 * Classify PF2e chat-message data into a tracked action. Pure.
 * Field paths verified against foundryvtt/pf2e (docs/decisions.md V3):
 *   flags.pf2e.context.type, .identifier (`${itemId}.${attackSlug}.${melee|ranged}` for strikes), .options.
 * Only the attack roll counts for a Strike: its damage roll is the same action.
 * @param {{ type?: string, identifier?: string, options?: string[] }} context
 * @returns {{ key: string, label: string } | null}
 */
import { actionLabel } from "./actions.mjs";

export function classifyContext(context) {
  if (!context) return null;
  switch (context.type) {
    case "attack-roll": {
      const ranged = String(context.identifier ?? "").split(".").at(-1) === "ranged";
      const key = ranged ? "ranged-strike" : "melee-strike";
      return { key, label: actionLabel(key) };
    }
    case "spell-cast":
      return { key: "spell", label: actionLabel("spell") };
    case "area-fire":
    case "auto-fire":
      return { key: "ranged-strike", label: "Area/auto-fire" };
    case "self-effect":
      return { key: "other", label: "Use an ability" };
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
