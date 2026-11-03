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
 * planBundle() walks a rule's action list for ONE target, tracking distance as the turn unfolds, and
 * returns the plan that can actually be done: it inserts the Strides (and Stand) a Strike needs, skips
 * a Stride that is not needed, truncates when actions run out, and rejects the rule with a reason when
 * the plan is impossible. Every change is reported in `adjustments`, so nothing is silent.
 *
 * Unknown distance (no tokens on the canvas) cannot be checked, so those steps are assumed possible.
 *
 * Context used: ctx.self { speed, reach, conditions }, ctx.slots.bound[slot] { kind, reach, range },
 * and the target { name, distance }.
 */
import { actionLabel } from "./actions.mjs";

export const DEFAULT_SPEED = 25;
export const DEFAULT_REACH = 5;
const ADJACENT = 5;

export const BLOCKS_MOVEMENT = ["grabbed", "immobilized", "restrained", "paralyzed", "petrified", "unconscious", "dying"];
export const BLOCKS_ACTING = ["paralyzed", "petrified", "unconscious", "dying"];

/**
 * What a slot needs. `bound` is ctx.slots.bound; unbound custom slots have no spatial requirement.
 * @returns {{ type: "move-toward"|"move-away"|"stand"|"melee"|"ranged"|"free", reach?: number, range?: number|null }}
 */
export function requirementFor(slug, bound, self = {}) {
  if (slug === "stride") return { type: "move-toward" };
  if (slug === "stride-away") return { type: "move-away" };
  if (slug === "stand") return { type: "stand" };
  const item = bound?.[slug];
  const myReach = self.reach ?? DEFAULT_REACH;
  if (slug === "melee-strike") return { type: "melee", reach: item?.reach ?? myReach };
  if (slug === "ranged-strike") return { type: "ranged", range: item?.range ?? null };
  if (item?.kind === "melee") return { type: "melee", reach: item.reach ?? myReach };
  if (item?.kind === "ranged" || (item?.kind === "other" && item.range != null)) return { type: "ranged", range: item.range ?? null };
  return { type: "free" };
}

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
  const cannotMove = conditions.find((c) => BLOCKS_MOVEMENT.includes(c)) ?? (speed === 0 ? "no movement speed" : null);

  let d = Number.isFinite(target?.distance) ? target.distance : null;
  let prone = conditions.includes("prone");
  let movedAway = false;
  const limit = remaining ?? Infinity;
  let used = 0;

  const push = (slug, note, added = false) => {
    steps.push({ slug, note: note ?? "", added });
    used++;
  };
  const closeBy = (feet) => (d == null ? null : Math.max(ADJACENT, d - feet));
  const standNote = "Added Stand up: prone creatures can't move";
  /** Stand up if prone. Returns false if there is no action left to do it with. */
  const standIfProne = () => {
    if (!prone) return true;
    if (used >= limit) return false;
    push("stand", "", true);
    adjustments.push(standNote);
    prone = false;
    return true;
  };

  for (let i = 0; i < bundle.length; i++) {
    const slug = bundle[i];
    const req = requirementFor(slug, bound, self);
    if (used >= limit) break; // out of actions: later steps are simply left for next time

    if (req.type === "move-toward") {
      const nextReach = bundle.slice(i + 1).map((s) => requirementFor(s, bound, self)).find((r) => r.type === "melee")?.reach;
      if (d != null && d <= Math.max(ADJACENT, nextReach ?? 0)) {
        adjustments.push(`Skipped Stride: ${name} is already ${d <= ADJACENT ? "adjacent" : "in reach"} (${d} ft)`);
        continue;
      }
      if (cannotMove) return fail(`can't Stride toward ${name}: ${cannotMove}`);
      if (!standIfProne() || used >= limit) break;
      push("stride", d == null ? "" : `to ${closeBy(speed)} ft from ${name}`);
      d = closeBy(speed);
      continue;
    }

    if (req.type === "move-away") {
      if (cannotMove) return fail(`can't Stride away from ${name}: ${cannotMove}`);
      if (!standIfProne() || used >= limit) break;
      d = d == null ? null : d + speed;
      movedAway = true;
      push("stride-away", d == null ? "" : `about ${d} ft from ${name}`);
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

    if (req.type === "melee" || req.type === "ranged") {
      const reachNeeded = req.type === "melee" ? req.reach : req.range;
      const label = actionLabel(slug);
      if (d != null && reachNeeded != null && d > reachNeeded) {
        if (movedAway) {
          adjustments.push(`Dropped ${label} and the rest: just moved away from ${name}`);
          break;
        }
        if (cannotMove) {
          return fail(`${label} needs ${name} within ${reachNeeded} ft (${d} ft away), and the creature can't move: ${cannotMove}`);
        }
        const strides = Math.ceil((d - reachNeeded) / speed);
        const room = limit - used - (prone ? 1 : 0);
        const before = d;
        if (room < strides + 1) {
          // Not enough actions to close the gap AND attack: close as far as we can, and stop.
          const doable = Math.max(0, room);
          if (doable === 0) break;
          standIfProne();
          for (let k = 0; k < Math.min(doable, strides); k++) {
            push("stride", `to ${closeBy(speed)} ft from ${name}`, true);
            d = closeBy(speed);
          }
          adjustments.push(`Added ${strides > 1 ? `${Math.min(doable, strides)} Strides` : "Stride"}: ${name} is ${before} ft away (${label} needs ${reachNeeded} ft), so there is no action left to attack with this turn`);
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
  }

  if (steps.length === 0) return fail(adjustments.length ? adjustments[0].replace(/^Skipped /, "nothing to do: skipped ") : "no action could be done");
  return { ok: true, slugs: steps.map((s) => s.slug), steps, adjustments, reason: null, finalDistance: d };
}
