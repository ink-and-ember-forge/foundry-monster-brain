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
  if (found) write(combat, (h) => addAction(h, makeAction(combat, c, found, "auto")));
}

export function onUpdateToken(tokenDoc, changes) {
  if (!isActiveGM() || !("x" in changes || "y" in changes)) return;
  const combat = game.combat;
  const c = currentMonster(combat);
  if (!c || tokenDoc.id !== c.tokenId) return;
  write(combat, (h) => {
    const mine = turnActions(h, combat.round, c.id);
    if (isSameMovement(mine.at(-1), Date.now())) return h;
    return addAction(h, makeAction(combat, c, { key: "stride", label: actionLabel("stride") }, "auto"));
  });
}

/** Handlers the panel calls. All writes trigger updateCombat, which re-evaluates the suggestion. */
export function panelHandlers(combat, combatant, suggestion) {
  return {
    onTook: () =>
      suggestion &&
      write(combat, (h) => {
        let next = h;
        for (const slug of suggestion.slugs) {
          next = addAction(next, makeAction(combat, combatant, { key: actionKey(slug), label: actionLabel(slug) }, "suggestion"));
        }
        return recordRuleUse(next, { ruleId: suggestion.id, round: combat.round, combatantId: combatant.id });
      }),
    onRemove: (id) => write(combat, (h) => removeAction(h, id)),
    onAdd: (key) => write(combat, (h) => addAction(h, makeAction(combat, combatant, { key, label: actionLabel(key) }, "manual"))),
  };
}
