import { describe, it, expect } from "vitest";
import { selfStats, itemsFor } from "../scripts/adapter.mjs";

const speeds = (o) => ({ system: { movement: { speeds: o } } });

describe("selfStats", () => {
  it("takes the fastest movement type, ignoring travel and missing ones", () => {
    const actor = { ...speeds({ land: { value: 25 }, fly: { value: 40 }, swim: null, burrow: null, climb: null, travel: { value: 999 } }), getReach: () => 10 };
    expect(selfStats(actor)).toEqual({ speed: 40, reach: 10 });
  });
  it("a creature with only a land speed uses it", () => {
    expect(selfStats({ ...speeds({ land: { value: 30 } }), getReach: () => 5 })).toEqual({ speed: 30, reach: 5 });
  });
  it("a creature that cannot move reports speed 0, not 'unknown'", () => {
    expect(selfStats({ ...speeds({ land: { value: 0 } }), getReach: () => 5 }).speed).toBe(0);
  });
  it("unknown speed and reach come back undefined, never throwing", () => {
    expect(selfStats({ system: {} })).toEqual({ speed: undefined, reach: undefined });
    expect(selfStats({ ...speeds({ land: null }), getReach: () => { throw new Error("x"); } })).toEqual({ speed: undefined, reach: undefined });
  });
  it("asks PF2e for the attack reach", () => {
    let asked;
    selfStats({ ...speeds({}), getReach: (o) => ((asked = o), 5) });
    expect(asked).toEqual({ action: "attack" });
  });
});

describe("itemsFor", () => {
  const item = (over) => ({ id: "i", name: "Thing", isRanged: false, ...over });
  const actor = ({ actions = [], items = [], reach = () => 5 } = {}) => ({ system: { actions }, items, getReach: reach });

  it("melee strikes carry the reach of that very weapon", () => {
    const asked = [];
    const a = actor({
      actions: [{ type: "strike", label: "Pike", item: item({ id: "pike", name: "Pike" }) }],
      reach: (o) => (asked.push(o), 10),
    });
    expect(itemsFor(a)).toEqual([{ id: "pike", label: "Pike", kind: "melee", reach: 10 }]);
    expect(asked[0].weapon.id).toBe("pike");
  });
  it("ranged strikes carry their maximum range", () => {
    const a = actor({ actions: [{ type: "strike", label: "Bow", item: item({ id: "bow", isRanged: true, range: { increment: 60, max: 360 } }) }] });
    expect(itemsFor(a)).toEqual([{ id: "bow", label: "Bow", kind: "ranged", range: 360 }]);
  });
  it("a ranged strike with no known range stays ranged with no range", () => {
    const a = actor({ actions: [{ type: "strike", item: item({ id: "sling", name: "Sling", isRanged: true, range: null }) }] });
    expect(itemsFor(a)[0]).toMatchObject({ kind: "ranged", label: "Sling" });
    expect(itemsFor(a)[0].range).toBeUndefined();
  });
  it("area-fire and non-strike entries are not offered as strikes", () => {
    const a = actor({ actions: [{ type: "area-fire", item: item({ id: "x" }) }, { type: "strike" }] });
    expect(itemsFor(a)).toEqual([]);
  });
  it("spells: ranged ones keep their range, touch spells are melee with reach, self/area have none", () => {
    const a = actor({
      items: [
        { id: "fire", name: "Fireball", type: "spell", isMelee: false, range: { max: 500 } },
        { id: "touch", name: "Chill Touch", type: "spell", isMelee: true, range: { max: 5 } },
        { id: "ward", name: "Ward", type: "spell", isMelee: false, range: null },
      ],
    });
    expect(itemsFor(a)).toEqual([
      { id: "fire", label: "Fireball", kind: "other", range: 500 },
      { id: "touch", label: "Chill Touch", kind: "melee", reach: 5 },
      { id: "ward", label: "Ward", kind: "other", range: undefined },
    ]);
  });
  it("actions are offered with no spatial requirement; other item types are ignored", () => {
    const a = actor({ items: [{ id: "roar", name: "Roar", type: "action" }, { id: "sword", name: "Sword", type: "weapon" }] });
    expect(itemsFor(a)).toEqual([{ id: "roar", label: "Roar", kind: "other" }]);
  });
  it("a data error on one item degrades that item instead of breaking the list", () => {
    const bad = { type: "strike", label: "Odd", item: { id: "odd", name: "Odd", get isRanged() { throw new Error("boom"); } } };
    const a = actor({ actions: [bad, { type: "strike", label: "Fine", item: item({ id: "fine", name: "Fine" }) }] });
    expect(() => itemsFor(a)).not.toThrow();
  });
  it("lists each item once", () => {
    const strike = { type: "strike", label: "Claw", item: item({ id: "claw", name: "Claw" }) };
    expect(itemsFor(actor({ actions: [strike, strike] }))).toHaveLength(1);
  });
});

// ---- building the context from a combat ------------------------------------------------------------

import { buildContext } from "../scripts/adapter.mjs";
import { emptyHistory, addAction } from "../scripts/engine/history.mjs";

describe("buildContext: measuring the distance to each enemy", () => {
  const actor = (over = {}) => ({
    name: "Actor",
    system: { attributes: { hp: { value: 10, max: 10 } }, movement: { speeds: { land: { value: 25 } } } },
    conditions: { active: [] },
    isEnemyOf: () => true,
    getReach: () => 5,
    getFlag: () => undefined,
    ...over,
  });
  const token = (distance, calls = []) => ({
    distanceTo: (_other, opts) => {
      calls.push(opts);
      return distance;
    },
  });
  const rig = ({ scene = null, canvasState = { ready: true, scene: { id: "viewed" } }, selfToken = token(55), enemyToken = {} } = {}) => {
    globalThis.canvas = canvasState;
    const self = { id: "m1", name: "Goblin", actor: actor(), token: { object: selfToken }, getFlag: () => undefined };
    const foe = { id: "p1", name: "Mira", actor: actor(), isDefeated: false, token: { object: enemyToken }, getFlag: () => undefined };
    return { self, combat: { round: 1, scene, combatants: [self, foe] } };
  };

  it("measures even when the combat has no scene set (the old scene check made this 'unknown')", () => {
    const { self, combat } = rig({ scene: null });
    const ctx = buildContext(self, combat, emptyHistory());
    expect(ctx.enemies[0]).toMatchObject({ name: "Mira", distance: 55, inReach: false });
  });
  it("measures when the combat's scene differs from the viewed one, as long as both tokens are on the canvas", () => {
    const { self, combat } = rig({ scene: { id: "elsewhere" } });
    expect(buildContext(self, combat, emptyHistory()).enemies[0].distance).toBe(55);
  });
  it("reports unknown when the canvas is not ready, or a token is not on it", () => {
    const a = rig({ canvasState: { ready: false } });
    expect(buildContext(a.self, a.combat, emptyHistory()).enemies[0]).toMatchObject({ distance: null, inReach: null });
    const b = rig({ enemyToken: null });
    expect(buildContext(b.self, b.combat, emptyHistory()).enemies[0]).toMatchObject({ distance: null, inReach: null });
  });
  it("reports unknown, not NaN, when PF2e cannot measure", () => {
    const { self, combat } = rig({ selfToken: token(NaN) });
    expect(buildContext(self, combat, emptyHistory()).enemies[0]).toMatchObject({ distance: null, inReach: null });
  });
  it("decides 'in reach' with PF2e's own reach-aware measure", () => {
    const calls = [];
    const { self, combat } = rig({ selfToken: token(5, calls) });
    const e = buildContext(self, combat, emptyHistory()).enemies[0];
    expect(e).toMatchObject({ distance: 5, inReach: true });
    expect(calls).toContainEqual({ reach: 5 });
  });
  it("gives the planner the creature's speed and reach", () => {
    const { self, combat } = rig();
    expect(buildContext(self, combat, emptyHistory()).self).toMatchObject({ speed: 25, reach: 5 });
  });
  it("passes this turn's recorded actions through whole, so the planner can see their slug, source and merge state", () => {
    const { self, combat } = rig();
    let h = emptyHistory();
    h = addAction(h, { id: "a", round: 1, combatantId: "m1", key: "stride", slug: "stride-away", source: "suggestion", merged: true, ts: 1 });
    h = addAction(h, { id: "b", round: 2, combatantId: "m1", key: "melee-strike", source: "auto", ts: 2 }); // another round: ignored
    const ctx = buildContext(self, combat, h);
    expect(ctx.turn.taken).toEqual([expect.objectContaining({ key: "stride", slug: "stride-away", source: "suggestion", merged: true })]);
    expect(ctx.turn).toMatchObject({ budget: 3, remaining: 2 });
  });
  it("leaves out defeated enemies and the creature itself", () => {
    const { self, combat } = rig();
    combat.combatants[1].isDefeated = true;
    expect(buildContext(self, combat, emptyHistory()).enemies).toEqual([]);
  });
});
