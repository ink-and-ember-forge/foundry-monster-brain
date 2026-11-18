/** Shared bits of UI for the built-in actions: the "?" button that opens the rules, and tooltips. */
import { el, button } from "./dom.mjs";
import { actionInfo, actionTooltip } from "./engine/action-catalog.mjs";
import { openRules } from "./rules.mjs";

/** Plain-text tooltip for an action, or undefined when it has none (a signature, a custom slot). */
export const tooltipFor = (slug) => actionTooltip(slug) ?? undefined;

/**
 * A small "?" button that opens the PF2e rules for an action. Null for actions with no rules text to open, so
 * callers can append it unconditionally.
 */
export function infoButton(slug) {
  const info = actionInfo(slug);
  if (!info?.compendium) return null;
  const b = button("?", () => openRules(slug), { cls: "mb-info", title: tooltipFor(slug) });
  b.setAttribute("aria-label", `Rules for ${info.label}`);
  return b;
}

/** A label whose hover text is the action's tooltip. */
export function actionSpan(slug, text, cls) {
  return el("span", { cls, text, title: tooltipFor(slug) });
}
