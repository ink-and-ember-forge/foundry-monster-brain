/**
 * Action tracking (brief section 10). Detects what the current monster did and keeps a visible,
 * correctable log in a flag on the Combat document, so it survives reloads and is shared with any
 * other GM client. Only the active GM writes, so two GMs never double-count.
 * Known blind spots: narrated actions (Interact, Aid, improvised) are not detected; the GM adds them.
 */
import { MODULE_ID } from "./constants.mjs";
import { classifyContext } from "./engine/detect.mjs";
import { actionLabel, actionKey } from "./engine/actions.mjs";
import {
  emptyHistory,
  addAction,
  removeAction,
  recordRuleUse,
  turnActions,
  isSameMovement,
  isDuplicateMovement,
  markMerged,
} from "./engine/history.mjs";
import { isMonsterAlliance } from "./engine/suggestion.mjs";

const FLAG = "history";
let queue = Promise.resolve();

export const readHistory = (combat) => combat.getFlag(MODULE_ID, FLAG) ?? emptyHistory();
const isActiveGM = () => game.users.activeGM?.isSelf === true;

function currentMonster(combat) {
  const c = combat?.combatant;
  return c?.actor && isMonsterAlliance(c.actor.alliance) ? c : null;
}

/** Serialise writes so read-modify-write cycles cannot interleave. */
function write(combat, mutate) {
  queue = queue
    .then(() => combat.setFlag(MODULE_ID, FLAG, mutate(readHistory(combat))))
    .catch((err) => console.error(`${MODULE_ID} | history write failed`, err));
  return queue;
}

const makeAction = (combat, combatant, { key, label }, source) => ({
  id: foundry.utils.randomID(),
  round: combat.round,
  combatantId: combatant.id,
  key,
  label,
  source,
  ts: Date.now(),
});

export function onCreateChatMessage(message) {
  if (!isActiveGM()) return;
  const combat = game.combat;
  const c = currentMonster(combat);
  if (!c) return;
  const context = message.flags?.pf2e?.context;
  // Only the current combatant's own actions count (reactions on other turns are ignored).
  const ctxToken = typeof context?.token === "string" ? context.token : "";
  const fromCurrent = (message.speaker?.token && message.speaker.token === c.tokenId) || (c.tokenId && ctxToken.endsWith(c.tokenId));
  if (!fromCurrent) return;
  const found = classifyContext(context);
  if (found) return write(combat, (h) => addAction(h, makeAction(combat, c, found, "auto")));
}

export function onUpdateToken(tokenDoc, changes) {
  if (!isActiveGM() || !("x" in changes || "y" in changes)) return;
  const combat = game.combat;
  const c = currentMonster(combat);
  if (!c || tokenDoc.id !== c.tokenId) return;
  return write(combat, (h) => {
    const last = turnActions(h, combat.round, c.id).at(-1);
    const now = Date.now();
    if (isSameMovement(last, now)) return h; // the same drag, reported again
    // The GM already clicked "Did this" for this Stride: the drag is that Stride, not another.
    if (isDuplicateMovement(last, "auto", now)) return markMerged(h, last.id);
    return addAction(h, makeAction(combat, c, { key: "stride", label: actionLabel("stride") }, "auto"));
  });
}

/**
 * Record an action the GM did by hand (clicked, not detected). A Stride they already made by dragging
 * the token is not logged a second time.
 */
function recordHuman(h, combat, combatant, found, source) {
  const last = turnActions(h, combat.round, combatant.id).at(-1);
  if (found.key === "stride" && isDuplicateMovement(last, source, Date.now())) return markMerged(h, last.id);
  return addAction(h, makeAction(combat, combatant, found, source));
}

/**
 * Handlers the panel calls. All writes trigger updateCombat, which re-evaluates the suggestion.
 *   onTook(suggestion, "step")  the action being shown now (the plan's first step), and, when it was the
 *                               last step, one use of the rule (so limits count completed plans, and a
 *                               rule with maxPerTurn is not shut out of its own second step)
 *   onTook(suggestion, "all")   the whole plan, and one use of the rule
 */
export function panelHandlers(combat, combatant) {
  return {
    onTook: (suggestion, scope = "all") =>
      suggestion &&
      write(combat, (h) => {
        const slugs = scope === "step" ? suggestion.slugs.slice(0, 1) : suggestion.slugs;
        let next = h;
        for (const slug of slugs) {
          next = recordHuman(next, combat, combatant, { key: actionKey(slug), label: actionLabel(slug) }, "suggestion");
        }
        const planDone = scope === "all" || suggestion.slugs.length <= 1;
        return planDone ? recordRuleUse(next, { ruleId: suggestion.id, round: combat.round, combatantId: combatant.id }) : next;
      }),
    onRemove: (id) => write(combat, (h) => removeAction(h, id)),
    onAdd: (key) => write(combat, (h) => recordHuman(h, combat, combatant, { key, label: actionLabel(key) }, "manual")),
  };
}
