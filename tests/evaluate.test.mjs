import { describe, it, expect } from "vitest";
import { evaluate, actionLabel } from "../scripts/engine/evaluate.mjs";
import { DEFAULT_RULES } from "../scripts/engine/default-rules.mjs";
import {
  stripText,
  actionsText,
  isMonsterAlliance,
  pipsText,
  whyLines,
  heldLines,
  warningLines,
  nextIndex,
  alternativeOf,
} from "../scripts/engine/suggestion.mjs";

const enemy = (over = {}) => ({ id: "e1", name: "Mira", hpPercent: 100, conditions: [], distance: 30, inReach: false, ...over });
const ctx = (over = {}) => ({
  round: 2,
  self: { name: "Goblin", hpPercent: 100, conditions: [] },
  enemies: [enemy()],
  ...over,
});
const ids = (r) => r.suggestions.map((s) => s.id);

describe("conditions", () => {
  it("self-hp-below", () => {
    const rules = [{ id: "r", when: [{ type: "self-hp-below", percent: 25 }], do: [] }];
    expect(ids(evaluate(rules, ctx({ self: { name: "G", hpPercent: 24, conditions: [] } })))).toEqual(["r"]);
    expect(ids(evaluate(rules, ctx({ self: { name: "G", hpPercent: 25, conditions: [] } })))).toEqual([]);
  });
  it("self-has-condition and negation", () => {
    const has = [{ id: "r", when: [{ type: "self-has-condition", slug: "frightened" }], do: [] }];
    const not = [{ id: "r", when: [{ type: "self-has-condition", slug: "frightened", not: true }], do: [] }];
    const scared = ctx({ self: { name: "G", hpPercent: 100, conditions: ["frightened"] } });
    expect(ids(evaluate(has, scared))).toEqual(["r"]);
    expect(ids(evaluate(not, scared))).toEqual([]);
    expect(ids(evaluate(not, ctx()))).toEqual(["r"]);
  });
  it("round comparisons", () => {
    const at = (op, value) => [{ id: "r", when: [{ type: "round", op, value }], do: [] }];
    expect(ids(evaluate(at(">=", 2), ctx()))).toEqual(["r"]);
    expect(ids(evaluate(at(">", 2), ctx()))).toEqual([]);
    expect(ids(evaluate(at("==", 2), ctx()))).toEqual(["r"]);
    expect(ids(evaluate([{ id: "r", when: [{ type: "round", value: 2 }], do: [] }], ctx()))).toEqual(["r"]);
  });
  it("enemy-has-condition narrows target and fails when none match", () => {
    const rules = [{ id: "r", when: [{ type: "enemy-has-condition", slug: "prone" }], do: ["melee-strike"] }];
    const c = ctx({
      enemies: [enemy({ id: "a", name: "Mira", hpPercent: 50 }), enemy({ id: "b", name: "Tor", hpPercent: 80, conditions: ["prone"] })],
    });
    expect(evaluate(rules, c).suggestions[0].target).toBe("Tor");
    expect(evaluate(rules, ctx()).held[0].reasons[0]).toMatch(/no enemy matches/);
  });
  it("negated enemy condition keeps only enemies without it", () => {
    const rules = [{ id: "r", when: [{ type: "enemy-has-condition", slug: "prone", not: true }], do: [] }];
    const c = ctx({ enemies: [enemy({ name: "Mira", conditions: ["prone"] }), enemy({ id: "b", name: "Tor" })] });
    expect(evaluate(rules, c).suggestions[0].target).toBe("Tor");
  });
  it("unknown condition holds the rule back with a reason", () => {
    const r = evaluate([{ id: "r", label: "R", when: [{ type: "nope" }], do: [] }], ctx());
    expect(r.suggestions).toEqual([]);
    expect(r.held[0].reasons[0]).toMatch(/unknown condition/);
  });
});

describe("reach and distance", () => {
  const inReach = (not) => [{ id: "r", when: [{ type: "enemy-in-reach", ...(not ? { not: true } : {}) }], do: [] }];
  it("enemy-in-reach is true if any enemy is in reach", () => {
    const c = ctx({ enemies: [enemy({ inReach: false }), enemy({ id: "b", name: "Tor", distance: 5, inReach: true })] });
    expect(ids(evaluate(inReach(false), c))).toEqual(["r"]);
    expect(ids(evaluate(inReach(true), c))).toEqual([]);
  });
  it("negated enemy-in-reach means no enemy is in reach", () => {
    expect(ids(evaluate(inReach(true), ctx()))).toEqual(["r"]);
  });
  it("unknown reach counts as not in reach", () => {
    expect(ids(evaluate(inReach(false), ctx({ enemies: [enemy({ inReach: null, distance: null })] })))).toEqual([]);
  });
  it("enemy-within narrows targets to those in range", () => {
    const rules = [{ id: "r", when: [{ type: "enemy-within", feet: 60 }], do: [] }];
    const c = ctx({ enemies: [enemy({ name: "Far", distance: 90, hpPercent: 1 }), enemy({ id: "b", name: "Near", distance: 60 })] });
    expect(evaluate(rules, c).suggestions[0].target).toBe("Near");
    expect(evaluate(rules, ctx({ enemies: [enemy({ distance: 61 })] })).held[0].reasons[0]).toMatch(/within 60 ft/);
  });
  it("enemy-within excludes unknown distances even when negated", () => {
    const unknown = ctx({ enemies: [enemy({ distance: null, inReach: null })] });
    expect(ids(evaluate([{ id: "r", when: [{ type: "enemy-within", feet: 60 }], do: [] }], unknown))).toEqual([]);
    expect(ids(evaluate([{ id: "r", when: [{ type: "enemy-within", feet: 60, not: true }], do: [] }], unknown))).toEqual([]);
  });
});

describe("targets", () => {
  it("picks the lowest-HP enemy when the rule asks for a target", () => {
    const rules = [{ id: "r", when: [], target: ["lowest-hp"], do: [] }];
    const c = ctx({ enemies: [enemy({ name: "A", hpPercent: 90 }), enemy({ id: "b", name: "B", hpPercent: 10 })] });
    expect(evaluate(rules, c).suggestions[0].target).toBe("B");
  });
  it("gives no target when none is wanted, or no enemies exist", () => {
    expect(evaluate([{ id: "r", when: [], do: [] }], ctx()).suggestions[0].target).toBeNull();
    expect(evaluate([{ id: "r", when: [], target: ["lowest-hp"], do: [] }], ctx({ enemies: [] })).suggestions[0].target).toBeNull();
  });
});

describe("ranking and output", () => {
  const always = (id, extra = {}) => ({ id, when: [], do: [], ...extra });
  it("rule order is priority", () => {
    expect(ids(evaluate([always("a"), always("b")], ctx()))).toEqual(["a", "b"]);
  });
  it("explicit priority beats order; weight breaks ties", () => {
    expect(ids(evaluate([always("a"), always("b", { priority: -1 })], ctx()))).toEqual(["b", "a"]);
    expect(ids(evaluate([always("a", { priority: 1 }), always("b", { priority: 1, weight: 5 })], ctx()))).toEqual(["b", "a"]);
  });
  it("returns at most two suggestions", () => {
    expect(evaluate([always("a"), always("b"), always("c")], ctx()).suggestions).toHaveLength(2);
  });
  it("skips disabled rules", () => {
    expect(ids(evaluate([always("a", { enabled: false }), always("b")], ctx()))).toEqual(["b"]);
  });
  it("records held-back rules with reasons", () => {
    const r = evaluate([{ id: "r", label: "Late", when: [{ type: "round", op: ">=", value: 5 }], do: [] }], ctx());
    expect(r.held).toEqual([{ id: "r", label: "Late", reasons: ["round >= 5"] }]);
  });
  it("labels actions", () => {
    expect(actionLabel("ranged-strike")).toBe("Ranged strike");
    expect(actionLabel("flaming-arrow")).toBe("Flaming arrow");
  });
});

describe("default rules", () => {
  it("round 1 opens with signature; closing in is the alternative", () => {
    const r = evaluate(DEFAULT_RULES, ctx({ round: 1 }));
    expect(ids(r)).toEqual(["opening-signature", "close-in"]);
  });
  it("fallback is the alternative when an enemy is in reach on round 1", () => {
    const r = evaluate(DEFAULT_RULES, ctx({ round: 1, enemies: [enemy({ distance: 5, inReach: true })] }));
    expect(ids(r)).toEqual(["opening-signature", "fallback-strikes"]);
  });
  it("last stand outranks everything when badly hurt and not frightened", () => {
    const r = evaluate(DEFAULT_RULES, ctx({ round: 1, self: { name: "G", hpPercent: 10, conditions: [] } }));
    expect(r.suggestions[0].id).toBe("last-stand");
  });
  it("frightened blocks last stand", () => {
    const r = evaluate(DEFAULT_RULES, ctx({ self: { name: "G", hpPercent: 10, conditions: ["frightened"] } }));
    expect(ids(r)).not.toContain("last-stand");
    expect(r.held.find((h) => h.id === "last-stand").reasons[0]).toMatch(/NOT \(I am frightened\)/);
  });
  it("prone enemy triggers punish-prone with that target", () => {
    const r = evaluate(DEFAULT_RULES, ctx({ enemies: [enemy({ name: "Tor", conditions: ["prone"] })] }));
    expect(r.suggestions[0]).toMatchObject({ id: "punish-prone", target: "Tor" });
  });
});

describe("close-in default rule", () => {
  it("suggests closing in when nobody is in reach but someone is within 60 ft", () => {
    const r = evaluate(DEFAULT_RULES, ctx({ round: 3 }));
    expect(r.suggestions[0]).toMatchObject({ id: "close-in", target: "Mira" });
  });
  it("is held back when an enemy is already in reach", () => {
    const r = evaluate(DEFAULT_RULES, ctx({ round: 3, enemies: [enemy({ distance: 5, inReach: true })] }));
    expect(ids(r)).not.toContain("close-in");
  });
});

describe("suggestion metadata", () => {
  it("carries why, source and hint for the card", () => {
    const rules = [{ id: "r", label: "R", source: "creature", hint: "Back off 15 ft", when: [{ type: "round", op: ">=", value: 2 }], do: [] }];
    const s = evaluate(rules, ctx()).suggestions[0];
    expect(s).toMatchObject({ why: ["round >= 2"], source: "creature", hint: "Back off 15 ft" });
  });
  it("defaults to no source or hint", () => {
    expect(evaluate([{ id: "r", when: [], do: [] }], ctx()).suggestions[0]).toMatchObject({ why: [], source: null, hint: null });
  });
});

describe("presentation", () => {
  it("strip text", () => {
    expect(stripText({ label: "X", target: null })).toBe("X");
    expect(stripText({ label: "X", target: "Mira" })).toBe("X → Mira");
    expect(stripText(null)).toBe("No suggestion");
    expect(actionsText({ actions: ["A", "B"] })).toBe("A → B");
  });
  it("only opposition alliance is a monster", () => {
    expect(isMonsterAlliance("opposition")).toBe(true);
    expect(isMonsterAlliance("party")).toBe(false);
    expect(isMonsterAlliance(null)).toBe(false);
  });
});

describe("card text helpers", () => {
  it("pips: filled for left, hollow for spent, clamped", () => {
    expect(pipsText(2, 3)).toBe("\u25CF\u25CF\u25CB");
    expect(pipsText(0, 3)).toBe("\u25CB\u25CB\u25CB");
    expect(pipsText(5, 3)).toBe("\u25CF\u25CF\u25CF");
    expect(pipsText(-1, 2)).toBe("\u25CB\u25CB");
  });
  it("why lines show the rule, its layer and satisfied conditions", () => {
    expect(whyLines({ label: "Volley", source: "template", why: ["round == 1"] })).toEqual(["Rule: Volley (template layer)", "\u2713 round == 1"]);
    expect(whyLines({ label: "Fallback", source: null, why: [] })).toEqual(["Rule: Fallback", "\u2713 no conditions (always applies)"]);
    expect(whyLines(null)).toEqual([]);
  });
  it("held and warning lines", () => {
    expect(heldLines([{ id: "a", label: "A", reasons: ["x", "y"] }, { id: "b", reasons: ["z"] }])).toEqual(["A: x; y", "b: z"]);
    expect(warningLines([{ ruleId: "a", message: "m" }, { ruleId: null, message: "n" }])).toEqual(["a: m", "n"]);
    expect(heldLines()).toEqual([]);
  });
  it("Something else cycles and wraps; alternative is the next one", () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(2, 3)).toBe(0);
    expect(nextIndex(0, 1)).toBe(0);
    expect(nextIndex(0, 0)).toBe(0);
    const s = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(alternativeOf(s, 0).id).toBe("b");
    expect(alternativeOf(s, 2).id).toBe("a");
    expect(alternativeOf([{ id: "a" }], 0)).toBeNull();
    expect(alternativeOf([], 0)).toBeNull();
  });
});
