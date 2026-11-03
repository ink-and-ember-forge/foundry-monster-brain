import { actionBudget } from "./engine/budget.mjs";
import { turnActions, ruleUsesFor } from "./engine/history.mjs";
import { rolesFor, getActorRoles } from "./roles.mjs";

/**
 * Foundry/PF2e to plain-context adapter. The only place the rules pipeline touches game data.
 * Data paths verified in docs/decisions.md (V2).
 */

function hpPercent(actor) {
  const hp = actor.system?.attributes?.hp;
  if (!hp || !(hp.max > 0)) return 100;
  return (hp.value / hp.max) * 100;
}

function conditionSlugs(actor) {
  return actor.conditions.active.map((c) => c.slug);
}

const UNKNOWN = { distance: null, inReach: null };

/**
 * Distance (ft) and reach check between two tokens. Null when unknown: a token is missing or not on
 * the canvas the caller has already established is showing the right scene.
 * Reach test mirrors PF2e's own TokenPF2e#canFlank: reach >= distanceTo(target, { reach }).
 */
function measure(selfActor, a, b) {
  try {
    if (!canvas?.ready || !a || !b) return UNKNOWN;
    const reach = selfActor.getReach({ action: "attack" });
    const distance = a.distanceTo(b);
    const reachDistance = a.distanceTo(b, { reach });
    if (Number.isNaN(distance) || Number.isNaN(reachDistance)) return UNKNOWN;
    return { distance, inReach: reach >= reachDistance };
  } catch (err) {
    console.warn("monster-brain | distance measurement failed", err);
    return UNKNOWN;
  }
}

/**
 * Movement and reach for the action planner (engine/world.mjs). Speed is the fastest movement type the
 * creature has (a flyer's Stride is its Fly speed); undefined when unknown, so the planner assumes 25.
 * Verified paths: actor.system.movement.speeds.<type>.value; actor.getReach({ action: "attack" }).
 */
export function selfStats(actor) {
  let speed;
  try {
    const speeds = Object.entries(actor.system?.movement?.speeds ?? {})
      .filter(([type, s]) => type !== "travel" && s && Number.isFinite(s.value))
      .map(([, s]) => s.value);
    if (speeds.length) speed = Math.max(...speeds);
  } catch {
    /* unknown speed */
  }
  let reach;
  try {
    reach = actor.getReach?.({ action: "attack" });
  } catch {
    /* unknown reach */
  }
  return { speed, reach };
}

/** Condition slug to badge value (1 when the condition has no badge). */
function conditionValues(actor) {
  return Object.fromEntries(actor.conditions.active.map((c) => [c.slug, c.value ?? 1]));
}

/** One enemy as the engine sees it. `other` is { id, name, actor, roles, token } (token may be null). */
function enemyEntry(other, selfActor, selfToken) {
  return {
    id: other.id,
    name: other.name,
    hpPercent: hpPercent(other.actor),
    conditions: conditionSlugs(other.actor),
    roles: other.roles,
    ...measure(selfActor, selfToken, other.token),
  };
}

/**
 * @param combatant the monster whose turn it is
 * @param combat the encounter
 * @param history this combat's tracked history (see engine/history.mjs)
 */
export function buildContext(combatant, combat, history) {
  const actor = combatant.actor;
  // A token can be measured when it is on the scene being viewed: TokenDocument#object is null otherwise.
  // (Deliberately NOT comparing combat.scene to the canvas: a combat with no scene set would then make every
  // distance "unknown", and a plan that cannot see distances looks just like one that checked them.)
  const tokenOf = (c) => (canvas?.ready ? (c.token?.object ?? null) : null);
  const enemies = combat.combatants
    .filter((c) => c.actor && !c.isDefeated && c.id !== combatant.id && actor.isEnemyOf(c.actor))
    .map((c) => ({ id: c.id, name: c.name, actor: c.actor, roles: rolesFor(c), token: tokenOf(c) }))
    .map((other) => enemyEntry(other, actor, tokenOf(combatant)));
  const budget = actionBudget(conditionValues(actor));
  const taken = turnActions(history, combat.round, combatant.id);
  return {
    round: combat.round,
    self: { name: combatant.name, hpPercent: hpPercent(actor), conditions: conditionSlugs(actor), ...selfStats(actor) },
    enemies,
    turn: { budget, remaining: Math.max(0, budget - taken.length), taken },
    ruleUses: ruleUsesFor(history, combatant.id),
  };
}

/**
 * Context for the prep-time dry run (brief section 12): no combat, so no history and a full budget.
 * Enemies are the visible hostile tokens on the current scene. Returns { ctx, notes } where notes
 * explain anything that limits the answer (e.g. distances unknown).
 */
export function buildDryRunContext(actor, { token = null, round = 1 } = {}) {
  const notes = [];
  const onCanvas = !!canvas?.ready;
  const selfToken = onCanvas ? (token ?? actor.getActiveTokens()?.[0] ?? null) : null;
  if (!onCanvas) notes.push("no scene is showing, so distances and reach are unknown");
  else if (!selfToken) notes.push("this creature has no token on the current scene, so distances and reach are unknown");
  if (actor.alliance === null) notes.push("this actor has no alliance, so it has no enemies");

  const others = onCanvas
    ? canvas.tokens.placeables
        .filter((t) => t.actor && t !== selfToken && !t.document.hidden && actor.isEnemyOf(t.actor))
        .filter((t) => (t.actor.system?.attributes?.hp?.value ?? 1) > 0)
        .map((t) => ({ id: t.id, name: t.name, actor: t.actor, roles: getActorRoles(t.actor), token: t }))
    : [];
  if (others.length === 0 && actor.alliance !== null) notes.push("no hostile tokens on the scene to evaluate against");

  const budget = actionBudget(conditionValues(actor));
  const ctx = {
    round,
    self: { name: actor.name, hpPercent: hpPercent(actor), conditions: conditionSlugs(actor), ...selfStats(actor) },
    enemies: others.map((other) => enemyEntry(other, actor, selfToken)),
    turn: { budget, remaining: budget, taken: [] },
    ruleUses: [],
  };
  return { ctx, notes };
}

/**
 * Candidate items for slot binding, with what the planner needs to know about each (world.mjs).
 * Strikes come from the PF2e strike list (actor.system.actions), so only attacks the creature can
 * actually make are auto-bound. Actions and spells are offered for explicit GM bindings (e.g.
 * "signature" to "Flaming Arrow").
 *   melee strike  { kind: "melee",  reach }   reach: actor.getReach({ action: "attack", weapon })
 *   ranged strike { kind: "ranged", range }   range: item.range.max
 *   spell         touch/melee spells are melee with reach; others are "other" with their range
 *   action        { kind: "other" } (no spatial requirement is known)
 * @returns {{ id: string, label: string, kind: "melee"|"ranged"|"other", reach?: number, range?: number }[]}
 */
/** Read a property that may throw on odd data. */
function safely(read, fallback) {
  try {
    return read();
  } catch {
    return fallback;
  }
}

export function itemsFor(actor) {
  const strikes = (actor.system.actions ?? [])
    .filter((a) => a.type === "strike" && a.item)
    .map((a) => {
      const base = { id: a.item.id, label: a.label ?? a.item.name };
      const ranged = safely(() => a.item.isRanged, false);
      try {
        if (ranged) return { ...base, kind: "ranged", range: a.item.range?.max ?? undefined };
        return { ...base, kind: "melee", reach: actor.getReach?.({ action: "attack", weapon: a.item }) };
      } catch {
        return { ...base, kind: ranged ? "ranged" : "melee" }; // keep the item, lose only the spatial detail
      }
    });
  const others = actor.items
    .filter((i) => ["action", "spell"].includes(i.type))
    .map((i) => {
      const base = { id: i.id, label: i.name };
      if (i.type !== "spell") return { ...base, kind: "other" };
      try {
        const max = i.range?.max;
        if (i.isMelee) return { ...base, kind: "melee", reach: max ?? undefined };
        return { ...base, kind: "other", range: max ?? undefined };
      } catch {
        return { ...base, kind: "other" };
      }
    });
  const seen = new Set();
  return [...strikes, ...others].filter((i) => (seen.has(i.id) ? false : seen.add(i.id)));
}
