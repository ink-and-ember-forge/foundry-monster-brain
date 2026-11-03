import { describe, it, expect } from "vitest";
import { emptyHistory, addAction, removeAction, recordRuleUse, turnActions, ruleUsesFor, isSameMovement } from "../scripts/engine/history.mjs";
import { actionBudget } from "../scripts/engine/budget.mjs";
import { classifyContext } from "../scripts/engine/detect.mjs";
import { actionKey, actionLabel } from "../scripts/engine/actions.mjs";
import { evaluate } from "../scripts/engine/evaluate.mjs";
import { DEFAULT_RULES, DEFAULT_POLICIES } from "../scripts/engine/default-rules.mjs";

describe("history", () => {
  const act = (id, round, combatantId = "m1") => ({ id, round, combatantId, key: "melee-strike", label: "x", source: "auto", ts: 0 });
  it("is immutable and scoped by round and combatant", () => {
    const h0 = emptyHistory();
    const h1 = addAction(addAction(addAction(h0, act("a", 1)), act("b", 2)), act("c", 1, "m2"));
    expect(h0.actions).toHaveLength(0);
    expect(turnActions(h1, 1, "m1").map((a) => a.id)).toEqual(["a"]);
  });
  it("removes an action by id", () => {
    const h = removeAction(addAction(emptyHistory(), act("a", 1)), "a");
    expect(h.actions).toEqual([]);
  });
  it("records rule uses per combatant", () => {
    const h = recordRuleUse(recordRuleUse(emptyHistory(), { ruleId: "r", round: 1, combatantId: "m1" }), { ruleId: "r", round: 1, combatantId: "m2" });
    expect(ruleUsesFor(h, "m1")).toHaveLength(1);
  });
  it("tolerates a missing history", () => {
    expect(turnActions(undefined, 1, "m1")).toEqual([]);
    expect(ruleUsesFor(null, "m1")).toEqual([]);
  });
  it("merges rapid auto movement into one Stride", () => {
    const prev = { key: "stride", source: "auto", ts: 1000 };
    expect(isSameMovement(prev, 4000)).toBe(true);
    expect(isSameMovement(prev, 6000)).toBe(false);
    expect(isSameMovement({ ...prev, source: "manual" }, 2000)).toBe(false);
    expect(isSameMovement(undefined, 2000)).toBe(false);
  });
});

describe("budget", () => {
  it("is 3 by default", () => expect(actionBudget()).toBe(3));
  it("slowed and stunned subtract; quickened adds; never below zero", () => {
    expect(actionBudget({ slowed: 1 })).toBe(2);
    expect(actionBudget({ slowed: 1, stunned: 1 })).toBe(1);
    expect(actionBudget({ quickened: 1 })).toBe(4);
    expect(actionBudget({ stunned: 5 })).toBe(0);
  });
  it("paralyzed or unconscious have none", () => {
    expect(actionBudget({ paralyzed: 1 })).toBe(0);
    expect(actionBudget({ unconscious: 1, quickened: 1 })).toBe(0);
  });
});

describe("chat classification", () => {
  it("counts attack rolls, melee or ranged by identifier", () => {
    expect(classifyContext({ type: "attack-roll", identifier: "abc.longsword.melee" })).toEqual({ key: "melee-strike", label: "Melee strike" });
    expect(classifyContext({ type: "attack-roll", identifier: "abc.shortbow.ranged" }).key).toBe("ranged-strike");
  });
  it("does not count damage rolls (same action as the attack)", () => {
    expect(classifyContext({ type: "damage-roll" })).toBeNull();
    expect(classifyContext({ type: "damage-taken" })).toBeNull();
  });
  it("counts spells and abilities", () => {
    expect(classifyContext({ type: "spell-cast" }).key).toBe("spell");
    expect(classifyContext({ type: "self-effect" }).key).toBe("other");
  });
  it("counts skill checks only when part of an action", () => {
    expect(classifyContext({ type: "skill-check", options: ["action:trip", "other"] })).toEqual({ key: "trip", label: "Trip" });
    expect(classifyContext({ type: "skill-check", options: ["something"] })).toBeNull();
    expect(classifyContext({ type: "skill-check", options: ["action:strike"] })).toBeNull();
  });
  it("ignores unknown or missing contexts", () => {
    expect(classifyContext(undefined)).toBeNull();
    expect(classifyContext({ type: "saving-throw" })).toBeNull();
  });
});

describe("action keys", () => {
  it("aliases stride-away to stride", () => {
    expect(actionKey("stride-away")).toBe("stride");
    expect(actionKey("melee-strike")).toBe("melee-strike");
    expect(actionLabel("stride")).toBe("Stride");
  });
});

const base = (over = {}) => ({
  round: 2,
  self: { name: "G", hpPercent: 100, conditions: [] },
  enemies: [{ id: "e", name: "Mira", hpPercent: 100, conditions: [], distance: 5, inReach: true }],
  ...over,
});
const ids = (r) => r.suggestions.map((s) => s.id);
const rule = (extra = {}) => ({ id: "r", when: [], do: ["melee-strike"], ...extra });

describe("rule limits", () => {
  it("oncePerEncounter", () => {
    const c = base({ ruleUses: [{ ruleId: "r", round: 1 }] });
    const r = evaluate([rule({ limits: { oncePerEncounter: true } })], c);
    expect(r.suggestions).toEqual([]);
    expect(r.held[0].reasons[0]).toMatch(/once per encounter/);
  });
  it("maxPerTurn counts uses in the current round only", () => {
    const l = { limits: { maxPerTurn: 1 } };
    expect(ids(evaluate([rule(l)], base({ ruleUses: [{ ruleId: "r", round: 1 }] })))).toEqual(["r"]);
    expect(ids(evaluate([rule(l)], base({ ruleUses: [{ ruleId: "r", round: 2 }] })))).toEqual([]);
  });
  it("cooldownRounds: used in round 1 with cooldown 2 is available again in round 3", () => {
    const l = { limits: { cooldownRounds: 2 } };
    const uses = [{ ruleId: "r", round: 1 }];
    expect(ids(evaluate([rule(l)], base({ round: 2, ruleUses: uses })))).toEqual([]);
    expect(evaluate([rule(l)], base({ round: 2, ruleUses: uses })).held[0].reasons[0]).toMatch(/1 more round$/);
    expect(ids(evaluate([rule(l)], base({ round: 3, ruleUses: uses })))).toEqual(["r"]);
  });
  it("ignores other rules' uses", () => {
    expect(ids(evaluate([rule({ limits: { oncePerEncounter: true } })], base({ ruleUses: [{ ruleId: "other", round: 1 }] })))).toEqual(["r"]);
  });
});

describe("budget in evaluation", () => {
  it("suggests nothing with no actions left", () => {
    const r = evaluate([rule()], base({ turn: { remaining: 0, taken: [] } }));
    expect(r).toMatchObject({ suggestions: [], remaining: 0 });
  });
  it("trims the bundle to the actions remaining", () => {
    const far = [{ id: "e", name: "Mira", hpPercent: 100, conditions: [], distance: 30, inReach: false }];
    const r = evaluate([rule({ do: ["stride", "melee-strike", "melee-strike"] })], base({ enemies: far, turn: { remaining: 2, taken: [] } }));
    expect(r.suggestions[0].slugs).toEqual(["stride", "melee-strike"]);
  });
});

describe("policies", () => {
  const p = { maxSameActionPerTurn: 2 };
  it("holds back a bundle that would repeat an action beyond the cap", () => {
    const r = evaluate([rule({ do: ["melee-strike", "melee-strike", "melee-strike"] })], base(), { policies: p });
    expect(r.suggestions).toEqual([]);
    expect(r.held[0].reasons[0]).toMatch(/Melee strike would be used 3 times this turn \(max 2\)/);
  });
  it("counts actions already taken this turn", () => {
    const c = base({ turn: { remaining: 2, taken: [{ key: "melee-strike" }] } });
    expect(ids(evaluate([rule({ do: ["melee-strike", "melee-strike"] })], c, { policies: p }))).toEqual([]);
    expect(ids(evaluate([rule({ do: ["melee-strike"] })], c, { policies: p }))).toEqual(["r"]);
  });
  it("never caps movement: closing a gap can take several Strides", () => {
    const c = base({ turn: { remaining: 1, taken: [{ key: "stride" }, { key: "stride" }, { key: "stride" }] } });
    expect(ids(evaluate([rule({ do: ["stride-away"] })], c, { policies: p }))).toEqual(["r"]);
    const far = [{ id: "e", name: "Mira", hpPercent: 100, conditions: [], distance: 200, inReach: false }];
    const out = evaluate([rule({ do: ["melee-strike"] })], base({ enemies: far }), { policies: p });
    expect(out.suggestions[0].slugs).toEqual(["stride", "stride", "stride"]);
  });
  it("still caps attacks, even after movement", () => {
    const c = base({ turn: { remaining: 2, taken: [{ key: "melee-strike" }, { key: "melee-strike" }] } });
    expect(ids(evaluate([rule({ do: ["melee-strike"] })], c, { policies: p }))).toEqual([]);
  });
  it("does nothing without a policy", () => {
    expect(ids(evaluate([rule({ do: ["melee-strike", "melee-strike", "melee-strike"] })], base()))).toEqual(["r"]);
  });
});

describe("default rules with limits and policies", () => {
  const hurt = { name: "G", hpPercent: 10, conditions: [] };
  it("last stand fires once, then is held back", () => {
    const first = evaluate(DEFAULT_RULES, base({ self: hurt }), { policies: DEFAULT_POLICIES });
    expect(first.suggestions[0].id).toBe("last-stand");
    const again = evaluate(DEFAULT_RULES, base({ self: hurt, ruleUses: [{ ruleId: "last-stand", round: 2 }] }), { policies: DEFAULT_POLICIES });
    expect(again.suggestions[0].id).not.toBe("last-stand");
  });
  it("after two strikes, the strike fallback is held back by policy", () => {
    const c = base({ turn: { remaining: 1, taken: [{ key: "melee-strike" }, { key: "melee-strike" }] } });
    const r = evaluate(DEFAULT_RULES, c, { policies: DEFAULT_POLICIES });
    expect(r.held.find((h) => h.id === "fallback-strikes").reasons[0]).toMatch(/policy/);
  });
});
