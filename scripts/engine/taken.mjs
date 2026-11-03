/**
 * What has already been done this turn, and which plan step a detected action fulfils. Pure.
 */
import { actionKey } from "./actions.mjs";

/**
 * The rest of a rule's action list once what was already done this turn is taken off it. Without this
 * the plan never advances: recording "signature" would just produce the same plan, starting with the
 * signature again.
 *
 * Matching is by action key. A Stride and a Stride away share a key, so they are told apart by the
 * original slug when it is known; a movement the token drag detected has no direction, so it counts
 * toward the first movement step still outstanding.
 *
 * @param {string[]} bundle authored action slugs
 * @param {{ key: string, slug?: string }[]} taken actions recorded this turn
 */
export function remainingBundle(bundle, taken = []) {
  const pool = taken.map((a) => ({ key: a.key, slug: a.slug, used: false }));
  const rest = [];
  for (const slug of bundle) {
    const k = actionKey(slug);
    const hit = pool.find((p) => !p.used && p.key === k && (p.slug == null || p.slug === slug));
    if (hit) hit.used = true;
    else rest.push(slug);
  }
  return rest;
}

/**
 * Which slot a detected action was. A creature's signature is often one of its Strikes, so the same
 * item can be bound to two slots (e.g. signature AND ranged-strike). Prefer, in order: a slot the
 * current plan is waiting for, an explicit binding (the GM chose it), the generic Strike the roll
 * looked like, then the first slot bound to that item.
 * @param itemId the item the chat card was for (undefined if unknown)
 * @param bound ctx.slots.bound
 * @param opts { prefer: slots the plan expects next, fallbackKey: what the roll looks like without bindings }
 */
export function slotForItem(itemId, bound, { prefer = [], fallbackKey } = {}) {
  if (!itemId) return fallbackKey;
  const slots = Object.entries(bound ?? {})
    .filter(([, b]) => b?.itemId === itemId)
    .map(([slot]) => slot);
  if (slots.length === 0) return fallbackKey;
  for (const p of prefer) if (slots.includes(p)) return p;
  const explicit = slots.find((s) => bound[s].auto === false);
  if (explicit) return explicit;
  if (slots.includes(fallbackKey)) return fallbackKey;
  return slots[0];
}
