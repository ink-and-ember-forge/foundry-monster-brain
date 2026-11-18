/**
 * Action feasibility (the "world model"). Pure.
 *
 * Each action has requirements on the world, and some change it:
 *   melee Strike / melee signature   target within that weapon's reach
 *   ranged Strike / ranged signature target within that attack's range (when known)
 *   Stride                           closes distance by up to the creature's Speed
 *   Stride away                      opens distance by up to its Speed
 *   Stand up                         needed before moving while prone
 * Movement is blocked by grabbed, immobilized, restrained and the incapacitating conditions.
 *
 * The built-in actions (action-catalog.mjs) add to this:
 *   Trip, Grapple, Shove, Reposition, Disarm, Feint   target within the creature's own reach
 *   Demoralize                                        target within 30 ft
 *   Step                                              opens 5 ft; needs Speed 10 ft, doesn't need a clear path
 *   Tumble Through, Sneak                             move toward, by a full / half Speed, never skipped
 *   Escape                                            only while grabbed, immobilized or restrained; a move later in
 *                                                     the same plan then assumes it worked (and says so)
 *   Crawl                                             only while prone;  Drop prone: not if already prone, and a
 *                                                     later move gets a Stand up added
 *   Ready                                             costs two actions and ends the turn
 * Every action costs what the catalog says (default one); `remaining` counts actions, not steps.
 *
 * planBundle() walks a rule's action list for ONE target, tracking distance as the turn unfolds, and
 * returns the plan that can actually be done: it inserts the Strides (and Stand) a Strike needs, skips
 * a Stride that is not needed, truncates when actions run out, and rejects the rule with a reason when
 * the plan is impossible. Every change is reported in `adjustments`, so nothing is silent.
 *
 * Unknown distance (no tokens on the canvas) cannot be checked, so those steps are assumed possible,
 * and the plan SAYS so ("distance unknown") instead of quietly looking certain.
 *
 * Actions already recorded this turn change the world too. A Stride the GM clicked "Did this" for,
 * without dragging the token, still counts as moving: it shifts the distance (toward or away by one
 * Speed). A Stride detected from a token drag does not, because the token's real position already
 * reflects it. A recorded Stand up means the creature is no longer prone.
 *
 * Context used: ctx.self { speed, reach, conditions }, ctx.slots.bound[slot] { kind, reach, range },
 * and the target { name, distance }.
 */
import { actionLabel } from "./actions.mjs";
import { actionInfo, actionCost, isBuiltin } from "./action-catalog.mjs";

export const DEFAULT_SPEED = 25;
export const DEFAULT_REACH = 5;
const ADJACENT = 5;

export const BLOCKS_MOVEMENT = ["grabbed", "immobilized", "restrained", "paralyzed", "petrified", "unconscious", "dying"];
export const BLOCKS_ACTING = ["paralyzed", "petrified", "unconscious", "dying"];

/**
 * What an action needs. Built-in actions say so in the catalog; for the rest `bound` is ctx.slots.bound, and
 * unbound custom slots have no spatial requirement.
 * @returns {{ type: "move-toward"|"move-away"|"step"|"stand"|"drop-prone"|"melee"|"ranged"|"free", reach?: number, range?: number|null, fraction?: number, noSkip?: boolean }}
 */
export function requirementFor(slug, bound, self = {}) {
  const myReach = self.reach ?? DEFAULT_REACH;
  const use = actionInfo(slug)?.use;
  if (use) {
    switch (use.kind) {
      case "melee":
        return { type: "melee", reach: myReach };
      case "within":
        return { type: "ranged", range: use.feet };
      case "move-toward":
        return { type: "move-toward", ...(use.fraction ? { fraction: use.fraction } : {}), ...(use.noSkip ? { noSkip: true } : {}) };
      case "move-away":
        return { type: "move-away" };
      case "step":
        return { type: "step" };
      case "stand":
        return { type: "stand" };
      case "drop-prone":
        return { type: "drop-prone" };
      default:
        return { type: "free" };
    }
  }
  const item = bound?.[slug];
  if (slug === "melee-strike") return { type: "melee", reach: item?.reach ?? myReach };
  if (slug === "ranged-strike") return { type: "ranged", range: item?.range ?? null };
  if (item?.kind === "melee") return { type: "melee", reach: item.reach ?? myReach };
  if (item?.kind === "ranged" || (item?.kind === "other" && item.range != null)) return { type: "ranged", range: item.range ?? null };
  return { type: "free" };
}

const FREEABLE = ["grabbed", "immobilized", "restrained"];
const STEP_FEET = 5;
const joinOr = (list) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} or ${list.at(-1)}` : list[0]);

/** @returns {{ ok: boolean, slugs: string[], steps: {slug: string, note: string, added: boolean}[], adjustments: string[], reason: string|null, finalDistance: number|null }} */
export function planBundle({ bundle, ctx, target, remaining }) {
  if (bundle.length === 0) return { ok: true, slugs: [], steps: [], adjustments: [], reason: null, finalDistance: null };
  const self = ctx.self ?? {};
  const bound = ctx.slots?.bound;
  const conditions = self.conditions ?? [];
  const name = target?.name ?? "the target";
  const speed = self.speed === 0 ? 0 : self.speed > 0 ? self.speed : DEFAULT_SPEED;

  const steps = [];
  const adjustments = [];
  const fail = (reason) => ({ ok: false, slugs: [], steps: [], adjustments: [], reason, finalDistance: null });

  const cannotAct = conditions.find((c) => BLOCKS_ACTING.includes(c));
  if (cannotAct) return fail(`can't act: ${cannotAct}`);

  let d = Number.isFinite(target?.distance) ? target.distance : null;
  const taken = ctx.turn?.taken ?? [];
  // Posture, from the condition and then what was done this turn, in order (a Drop prone then a Stand up is upright).
  let prone = conditions.includes("prone");
  for (const a of taken) {
    if (a.key === "drop-prone") prone = true;
    else if (a.key === "stand") prone = false;
  }
  let movedAway = taken.some((a) => a.slug === "stride-away" || a.slug === "step");
  // An Escape already made this turn: whatever held the creature is assumed gone, so it may move.
  let escaped = taken.some((a) => a.key === "escape");
  let assumedEscape = false;
  // Clicked (not dragged, not merged with a drag) moves still moved the creature. Only Stride, Stride away and
  // Step have a distance worth modelling; a Leap or Crawl has none, and a drag already moved the real token.
  if (d != null) {
    for (const a of taken) {
      if (a.key !== "stride" || a.source === "auto" || a.merged) continue;
      if (a.slug === "stride-away") d += speed;
      else if (a.slug === "step") d += STEP_FEET;
      else if (a.slug === undefined || a.slug === "stride") d = Math.max(ADJACENT, d - speed);
    }
  }
  const distanceKnown = d != null;
  let noted = false;
  const noteUnknown = () => {
    if (distanceKnown || noted) return;
    noted = true;
    adjustments.push(`Distance to ${name} is unknown (is its token on this scene?), so reach and range were not checked`);
  };

  /** What stops the creature moving right now, or null. An Escape earlier in the plan frees what held it. */
  const blocker = () => {
    const hard = conditions.find((c) => BLOCKS_MOVEMENT.includes(c) && !FREEABLE.includes(c));
    if (hard) return hard;
    if (speed === 0) return "no movement speed";
    const held = conditions.find((c) => FREEABLE.includes(c));
    if (!held) return null;
    if (escaped) {
      assumedEscape = true;
      return null;
    }
    return held;
  };
  const has = (c) => (c === "prone" ? prone : conditions.includes(c));

  const limit = remaining ?? Infinity;
  let used = 0;
  const fits = (slug) => used + actionCost(slug) <= limit;

  const push = (slug, note, added = false) => {
    steps.push({ slug, note: note ?? "", added });
    used += actionCost(slug);
  };
  const closeBy = (feet) => (d == null ? null : Math.max(ADJACENT, d - feet));
  const standNote = "Added Stand up: prone creatures can't move";
  /** Stand up if prone. Returns false if there is no action left to do it with. */
  const standIfProne = () => {
    if (!prone) return true;
    if (!fits("stand")) return false;
    push("stand", "", true);
    adjustments.push(standNote);
    prone = false;
    return true;
  };

  for (let i = 0; i < bundle.length; i++) {
    const slug = bundle[i];
    const req = requirementFor(slug, bound, self);
    const info = actionInfo(slug);
    const label = actionLabel(slug);
    if (!fits(slug)) break; // out of actions: later steps are simply left for next time

    // What the creature has to be (or not be) for the action to make sense.
    const need = info?.requires?.self;
    if (need && !need.some(has)) {
      adjustments.push(`Skipped ${label}: not ${joinOr(need)}`);
      continue;
    }

    if (req.type === "move-toward") {
      const feet = req.fraction ? Math.floor(speed * req.fraction) : speed;
      const nextReach = bundle.slice(i + 1).map((s) => requirementFor(s, bound, self)).find((r) => r.type === "melee")?.reach;
      if (!req.noSkip && d != null && d <= Math.max(ADJACENT, nextReach ?? 0)) {
        adjustments.push(`Skipped ${label}: ${name} is already ${d <= ADJACENT ? "adjacent" : "in reach"} (${d} ft)`);
        continue;
      }
      const stuck = blocker();
      if (stuck) return fail(`can't ${label} toward ${name}: ${stuck}`);
      if (!standIfProne() || !fits(slug)) break;
      push(slug, d == null ? "" : `to ${closeBy(feet)} ft from ${name}`);
      d = closeBy(feet);
      continue;
    }

    if (req.type === "move-away") {
      const stuck = blocker();
      if (stuck) return fail(`can't ${label} from ${name}: ${stuck}`);
      if (!standIfProne() || !fits(slug)) break;
      d = d == null ? null : d + speed;
      movedAway = true;
      push(slug, d == null ? "" : `about ${d} ft from ${name}`);
      continue;
    }

    if (req.type === "step") {
      if (speed < 10) return fail(`can't Step: Speed is under 10 ft`);
      const stuck = blocker();
      if (stuck) return fail(`can't Step away from ${name}: ${stuck}`);
      if (!standIfProne() || !fits(slug)) break;
      d = d == null ? null : d + STEP_FEET;
      movedAway = true;
      push(slug, d == null ? "" : `about ${d} ft from ${name}`);
      continue;
    }

    if (req.type === "stand") {
      if (!prone) {
        adjustments.push("Skipped Stand up: not prone");
        continue;
      }
      push("stand");
      prone = false;
      continue;
    }

    if (req.type === "drop-prone") {
      if (prone) {
        adjustments.push("Skipped Drop prone: already prone");
        continue;
      }
      push(slug);
      prone = true;
      continue;
    }

    if (req.type === "melee" || req.type === "ranged") {
      const reachNeeded = req.type === "melee" ? req.reach : req.range;
      if (d == null && reachNeeded != null) noteUnknown();
      if (d != null && reachNeeded != null && d > reachNeeded) {
        if (movedAway) {
          adjustments.push(`Dropped ${label} and the rest: just moved away from ${name}`);
          break;
        }
        const stuck = blocker();
        if (stuck) {
          return fail(`${label} needs ${name} within ${reachNeeded} ft (${d} ft away), and the creature can't move: ${stuck}`);
        }
        const strides = Math.ceil((d - reachNeeded) / speed);
        const room = limit - used - (prone ? 1 : 0);
        const before = d;
        if (room < strides + actionCost(slug)) {
          // Not enough actions to close the gap AND act: close as far as we can, and stop.
          const doable = Math.max(0, room);
          if (doable === 0) break;
          standIfProne();
          for (let k = 0; k < Math.min(doable, strides); k++) {
            push("stride", `to ${closeBy(speed)} ft from ${name}`, true);
            d = closeBy(speed);
          }
          adjustments.push(`Added ${strides > 1 ? `${Math.min(doable, strides)} Strides` : "Stride"}: ${name} is ${before} ft away (${label} needs ${reachNeeded} ft), so there is no action left to ${isBuiltin(slug) ? "act" : "attack"} with this turn`);
          break;
        }
        standIfProne();
        for (let k = 0; k < strides; k++) {
          push("stride", `to ${closeBy(speed)} ft from ${name}`, true);
          d = closeBy(speed);
        }
        adjustments.push(`Added ${strides > 1 ? `${strides} Strides` : "Stride"}: ${name} is ${before} ft away (${label} needs ${reachNeeded} ft)`);
      }
      push(slug);
      continue;
    }

    push(slug); // free action: no spatial requirement
    if (slug === "escape") escaped = true;
    if (info?.use?.endsTurn && i < bundle.length - 1) {
      adjustments.push(`Dropped what follows ${label}: it ends the turn`);
      break;
    }
  }

  if (assumedEscape) adjustments.push("Moving after Escape assumes the Escape works");
  if (steps.length === 0) return fail(adjustments.length ? adjustments[0].replace(/^Skipped /, "nothing to do: skipped ") : "no action could be done");
  return { ok: true, slugs: steps.map((s) => s.slug), steps, adjustments, reason: null, finalDistance: d };
}
