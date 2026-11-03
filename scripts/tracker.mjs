/**
 * Action tracking (brief section 10). Detects what the current monster did and keeps a visible,
 * correctable log in a flag on the Combat document, so it survives reloads and is shared with any
 * other GM client. Only the active GM writes, so two GMs never double-count.
 * Known blind spots: narrated actions (Interact, Aid, improvised) are not detected; the GM adds them.
 */
import { MODULE_ID } from "./constants.mjs";
import { classifyContext } from "./engine/detect.mjs";
import { actionLabel, actionKey, labelWithItem } from "./engine/actions.mjs";
import { slotForItem } from "./engine/taken.mjs";
import { resolveFor } from "./profiles.mjs";
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

/**
 * `slug` is the plan step this fulfils (e.g. "signature", "stride-away"). `key` is the coarser tracking key
 * (a Stride and a Stride away share one). The slug lets the planner tell which step is done.
 */
const makeAction = (combat, combatant, { key, label, slug }, source) => ({
  id: foundry.utils.randomID(),
  round: combat.round,
  combatantId: combatant.id,
  key,
  ...(slug ? { slug } : {}),
  label,
  source,
  ts: Date.now(),
});

/**
 * What the plan on screen is waiting for (the first step of each suggestion it is showing), so a detected
 * roll that could be two slots (a signature that IS the ranged Strike) is recorded as the one the plan
 * wants. Set by the strip whenever it evaluates.
 */
let expected = { combatantId: null, round: null, slugs: [] };
export function noteExpected(combatantId, round, slugs) {
  expected = { combatantId, round, slugs: slugs.filter(Boolean) };
}
const expectedFor = (combatantId, round) => (expected.combatantId === combatantId && expected.round === round ? expected.slugs : []);

/** Slot bindings for the current monster; empty if they cannot be resolved (the roll then falls back to its generic kind). */
function boundSlots(combatant) {
  try {
    return resolveFor(combatant).binding.bound;
  } catch (err) {
    console.warn(`${MODULE_ID} | could not resolve slot bindings`, err);
    return {};
  }
}

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
  const found = classifyContext(context, message.flags?.pf2e?.origin);
  if (!found) return;
  // Which of the creature's actions was it? A signature is often one of its Strikes: if the roll was for the
  // item bound to the slot the plan is waiting for, record THAT slot, not just "a ranged Strike".
  const bound = boundSlots(c);
  const slot = slotForItem(found.itemId, bound, { prefer: expectedFor(c.id, combat.round), fallbackKey: found.key });
  const action = slot === found.key ? { ...found, slug: slot } : { key: actionKey(slot), slug: slot, label: labelWithItem(slot, bound[slot]) };
  return write(combat, (h) => addAction(h, makeAction(combat, c, action, "auto")));
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
          const label = suggestion.steps?.find((st) => st.slug === slug)?.label ?? actionLabel(slug);
          next = recordHuman(next, combat, combatant, { key: actionKey(slug), slug, label }, "suggestion");
        }
        const planDone = scope === "all" || suggestion.slugs.length <= 1;
        return planDone ? recordRuleUse(next, { ruleId: suggestion.id, round: combat.round, combatantId: combatant.id }) : next;
      }),
    onRemove: (id) => write(combat, (h) => removeAction(h, id)),
    onAdd: (key) => write(combat, (h) => recordHuman(h, combat, combatant, { key, slug: key, label: actionLabel(key) }, "manual")),
  };
}
