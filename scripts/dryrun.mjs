/**
 * Prep-time dry run (brief section 12): "what would this creature suggest right now, against the
 * hostile tokens on the current scene?" No combat needed. Prints a report and returns the details.
 */
import { MODULE_ID } from "./constants.mjs";
import { buildDryRunContext } from "./adapter.mjs";
import { evaluate } from "./engine/evaluate.mjs";
import { formatReport } from "./engine/report.mjs";
import { resolveForActor } from "./profiles.mjs";

/**
 * @param actor an Actor, or an actor name
 * @param opts { round = 1, token = null (a specific Token), print = true }
 */
export function dryRun(actor, { round = 1, token = null, print = true } = {}) {
  const resolvedActor = typeof actor === "string" ? game.actors.getName(actor) : actor;
  if (!resolvedActor) throw new Error(`${MODULE_ID} | dryRun: no such actor "${actor}"`);
  const { resolved, binding, warnings, profile } = resolveForActor(resolvedActor);
  const { ctx, notes } = buildDryRunContext(resolvedActor, { token, round });
  const withSlots = { ...ctx, slots: { bound: binding.bound, unbound: binding.unbound } };
  const result = evaluate(resolved.rules, withSlots, { policies: resolved.policies, max: 3 });
  const report = {
    name: resolvedActor.name,
    templateName: profile?.template ?? null,
    round,
    suggestions: result.suggestions,
    held: result.held,
    warnings,
    notes,
  };
  if (print) console.info(`${MODULE_ID} | dry run\n${formatReport(report)}`);
  return { report, ctx: withSlots, ...result, resolved, binding, warnings };
}
