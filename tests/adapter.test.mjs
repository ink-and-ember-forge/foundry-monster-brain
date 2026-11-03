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
