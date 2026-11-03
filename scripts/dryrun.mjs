/**
 * Prep-time dry run (brief section 12): "what would this creature suggest right now, against the
 * hostile tokens on the current scene?" No combat needed. Prints a report and returns the details.
 * Works per token: a token's own profile overrides its actor's.
 */
import { MODULE_ID } from "./constants.mjs";
import { buildDryRunContext } from "./adapter.mjs";
import { evaluate } from "./engine/evaluate.mjs";
import { formatReport } from "./engine/report.mjs";
import { resolveForActor } from "./profiles.mjs";

/** Accept an actor name, Actor, Token (placeable) or TokenDocument. */
function resolveTarget(target) {
  if (typeof target === "string") {
    const actor = game.actors.getName(target);
    return { actor, token: null, tokenDoc: null };
  }
  if (target?.document?.documentName === "Token") return { actor: target.actor, token: target, tokenDoc: target.document };
  if (target?.documentName === "Token") return { actor: target.actor, token: target.object ?? null, tokenDoc: target };
  return { actor: target, token: null, tokenDoc: null };
}

/**
 * @param target an actor name, Actor, Token or TokenDocument (pass a token to evaluate that token)
 * @param opts { round = 1, token, tokenDoc, print = true, draft } `draft` previews unsaved profile edits
 */
export function dryRun(target, { round = 1, token = null, tokenDoc: givenDoc = null, print = true, draft = null } = {}) {
  const t = resolveTarget(target);
  if (!t.actor) throw new Error(`${MODULE_ID} | dryRun: no such actor "${target}"`);
  const actor = t.actor;
  const notes = [];

  // Which token: an explicit one, else the target's, else the actor's first token on the scene.
  let placeable = token ?? t.token;
  const explicitDoc = givenDoc ?? t.tokenDoc;
  if (!placeable && explicitDoc) {
    // A specific token was asked for but is not on the scene being shown: never substitute another one.
    notes.push(`"${explicitDoc.name}" is not on the scene being shown, so distances and reach are unknown`);
  } else if (!placeable && canvas?.ready) {
    const tokens = actor.getActiveTokens?.() ?? [];
    placeable = tokens[0] ?? null;
    if (tokens.length > 1) notes.push(`${tokens.length} tokens on the scene; evaluated "${placeable.name}" (pass a token to choose)`);
  }
  const tokenDoc = placeable?.document ?? explicitDoc ?? null;

  const { resolved, binding, warnings, templateId } = resolveForActor(actor, { tokenDoc, draft });
  const built = buildDryRunContext(actor, { token: placeable, round });
  notes.push(...built.notes);
  const ctx = { ...built.ctx, slots: { bound: binding.bound, unbound: binding.unbound } };
  const result = evaluate(resolved.rules, ctx, { policies: resolved.policies, max: 3 });
  const report = {
    name: tokenDoc?.name ?? actor.name,
    templateName: templateId,
    round,
    suggestions: result.suggestions,
    held: result.held,
    warnings,
    notes,
  };
  if (print) console.info(`${MODULE_ID} | dry run\n${formatReport(report)}`);
  return { report, ctx, ...result, resolved, binding, warnings };
}
