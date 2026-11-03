import { describe, it, expect } from "vitest";
import { CONDITIONS } from "../scripts/engine/conditions.mjs";
import { CONDITION_SCHEMA, CONDITION_SLUGS, ACTION_CHOICES, TARGET_CHOICES, LIMIT_FIELDS } from "../scripts/engine/schema.mjs";
import { evaluate } from "../scripts/engine/evaluate.mjs";
import { DEFAULT_POLICIES } from "../scripts/engine/default-rules.mjs";
import { STARTER_TEMPLATES } from "../scripts/engine/starter-templates.mjs";
import * as d from "../scripts/engine/rule-draft.mjs";

describe("schema stays in step with the engine", () => {
  it("has an editor entry for every condition, and nothing extra", () => {
    expect(Object.keys(CONDITION_SCHEMA).sort()).toEqual(Object.keys(CONDITIONS).sort());
  });
  it("every parameter's default is usable by its condition", () => {
    for (const [type, schema] of Object.entries(CONDITION_SCHEMA)) {
      const cond = d.defaultCondition(type);
      const ctx = { round: 3, self: { name: "G", hpPercent: 50, conditions: [] }, enemies: [{ id: "e", name: "E", hpPercent: 50, conditions: [], roles: [], distance: 10, inReach: true }] };
      const out = evaluate([{ id: "r", when: [cond], do: [] }], ctx, { policies: DEFAULT_POLICIES });
      expect(out.held.concat(out.suggestions).length, type).toBe(1); // evaluates without throwing
      for (const p of schema.params) expect(cond[p.key], `${type}.${p.key}`).toBeDefined();
    }
  });
  it("offers the standard actions, targets and limits, and real PF2e condition slugs", () => {
    expect(ACTION_CHOICES.map(([v]) => v)).toEqual(expect.arrayContaining(["melee-strike", "ranged-strike", "stride", "stride-away", "signature"]));
    expect(TARGET_CHOICES.map(([v]) => v)).toEqual(expect.arrayContaining(["lowest-hp", "in-reach", "role"]));
    expect(LIMIT_FIELDS.map((f) => f.key)).toEqual(["oncePerEncounter", "maxPerTurn", "cooldownRounds"]);
    expect(CONDITION_SLUGS).toEqual(expect.arrayContaining(["prone", "frightened", "off-guard", "slowed"]));
    expect(new Set(CONDITION_SLUGS).size).toBe(CONDITION_SLUGS.length);
  });
});

describe("helpers", () => {
  it("slugify and uniqueId", () => {
    expect(d.slugify("  Retreat & Shoot! ")).toBe("retreat-shoot");
    expect(d.slugify("")).toBe("item");
    expect(d.uniqueId("a", [])).toBe("a");
    expect(d.uniqueId("a", ["a", "a-2"])).toBe("a-3");
  });
  it("moveItem swaps neighbours and ignores out-of-range moves", () => {
    expect(d.moveItem([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(d.moveItem([1, 2, 3], 1, 1)).toEqual([1, 3, 2]);
    const a = [1, 2];
    expect(d.moveItem(a, 0, -1)).toBe(a);
    expect(d.moveItem(a, 1, 1)).toBe(a);
    expect(d.moveItem(a, 5, 1)).toBe(a);
  });
});

describe("rule editing", () => {
  const base = { id: "r", label: "R", when: [], do: ["melee-strike"] };
  it("creates a rule with a unique id", () => {
    expect(d.newRule(["new-rule"])).toMatchObject({ id: "new-rule-2", label: "New rule", when: [], do: ["melee-strike"] });
  });
  it("sets and clears simple fields", () => {
    expect(d.setField(base, "hint", "Back off")).toMatchObject({ hint: "Back off" });
    expect(d.setField({ ...base, hint: "x" }, "hint", "")).not.toHaveProperty("hint");
  });
  it("adds a condition with defaults, changes its type (keeping negation), and removes it", () => {
    let r = d.addCondition(base, "self-hp-below");
    expect(r.when).toEqual([{ type: "self-hp-below", percent: 25 }]);
    r = d.setConditionNot(r, 0, true);
    r = d.setConditionType(r, 0, "enemy-within");
    expect(r.when).toEqual([{ type: "enemy-within", feet: 30, not: true }]);
    r = d.setConditionNot(r, 0, false);
    expect(r.when[0]).not.toHaveProperty("not");
    expect(d.removeCondition(r, 0).when).toEqual([]);
    expect(base.when).toEqual([]);
  });
  it("parses and clamps numeric params, and ignores junk", () => {
    let r = d.addCondition(base, "self-hp-below");
    expect(d.setConditionParam(r, 0, "percent", "40").when[0].percent).toBe(40);
    expect(d.setConditionParam(r, 0, "percent", "400").when[0].percent).toBe(100);
    expect(d.setConditionParam(r, 0, "percent", "-5").when[0].percent).toBe(1);
    expect(d.setConditionParam(r, 0, "percent", "abc")).toBe(r);
    r = d.addCondition(base, "self-has-condition");
    expect(d.setConditionParam(r, 0, "slug", "  Off-Guard ").when[0].slug).toBe("off-guard");
    r = d.addCondition(base, "round");
    expect(d.setConditionParam(r, 0, "op", "==").when[0].op).toBe("==");
  });
  it("edits actions: add, replace, reorder, remove, and keeps custom slots slugged", () => {
    let r = d.addAction(base, "ranged-strike");
    expect(r.do).toEqual(["melee-strike", "ranged-strike"]);
    r = d.moveAction(r, 1, -1);
    expect(r.do).toEqual(["ranged-strike", "melee-strike"]);
    r = d.setAction(r, 0, "Flaming Arrow");
    expect(r.do[0]).toBe("flaming-arrow");
    expect(d.setAction(r, 0, "  ")).toBe(r);
    expect(d.removeAction(r, 0).do).toEqual(["melee-strike"]);
  });
  it("edits target preferences and drops the key when empty", () => {
    let r = d.addTarget(base, "role:caster");
    r = d.addTarget(r, "lowest-hp");
    expect(r.target).toEqual(["role:caster", "lowest-hp"]);
    r = d.moveTarget(r, 1, -1);
    expect(r.target).toEqual(["lowest-hp", "role:caster"]);
    r = d.setTarget(r, 0, "nearest");
    expect(r.target[0]).toBe("nearest");
    r = d.removeTarget(d.removeTarget(r, 0), 0);
    expect(r).not.toHaveProperty("target");
  });
  it("edits limits and drops the key when none remain", () => {
    let r = d.setLimit(base, "oncePerEncounter", true);
    r = d.setLimit(r, "maxPerTurn", "2");
    r = d.setLimit(r, "cooldownRounds", "3");
    expect(r.limits).toEqual({ oncePerEncounter: true, maxPerTurn: 2, cooldownRounds: 3 });
    r = d.setLimit(r, "maxPerTurn", "");
    r = d.setLimit(r, "cooldownRounds", "0");
    r = d.setLimit(r, "oncePerEncounter", false);
    expect(r).not.toHaveProperty("limits");
    expect(d.setLimit(base, "bogus", 1)).toBe(base);
  });
  it("describes a rule in one sentence", () => {
    const r = { id: "r", when: [{ type: "enemy-in-reach", not: true }, { type: "enemy-within", feet: 60 }], do: ["ranged-strike", "ranged-strike"], target: ["role:caster", "lowest-hp"], limits: { maxPerTurn: 1, cooldownRounds: 2 } };
    expect(d.ruleSentence(r)).toBe(
      "When NOT (an enemy is within my reach) and an enemy is within 60 ft: Ranged strike, then Ranged strike. Target: prefer caster, then lowest HP (max 1 per turn; then wait 2 rounds)",
    );
    expect(d.ruleSentence({ id: "x", when: [], do: [] })).toBe("Always: (no actions). Target: in reach, then lowest HP (default)");
    expect(d.ruleSentence({ id: "x", do: ["stride"], limits: { oncePerEncounter: true, cooldownRounds: 1 } })).toBe(
      "Always: Stride. Target: in reach, then lowest HP (default) (once per encounter; then wait 1 round)",
    );
  });
  it("an edited rule behaves as described when evaluated", () => {
    let r = d.newRule([], "Pounce");
    r = d.addCondition(r, "enemy-has-condition");
    r = d.setConditionParam(r, 0, "slug", "prone");
    r = d.addTarget(r, "lowest-hp");
    const ctx = { round: 1, self: { name: "G", hpPercent: 100, conditions: [] }, enemies: [{ id: "a", name: "A", hpPercent: 90, conditions: ["prone"], roles: [] }, { id: "b", name: "B", hpPercent: 10, conditions: [], roles: [] }] };
    expect(evaluate([r], ctx).suggestions[0]).toMatchObject({ id: "pounce", target: "A" });
  });
});

describe("template editing", () => {
  it("creates and duplicates templates with unique ids", () => {
    expect(d.newTemplate(["new-template"])).toMatchObject({ id: "new-template-2", template: { name: "New template", rules: [] } });
    const copy = d.duplicateTemplate(STARTER_TEMPLATES.sniper, ["sniper", "sniper-copy"]);
    expect(copy.id).toBe("sniper-copy-2");
    expect(copy.template.name).toBe("Sniper (copy)");
    copy.template.rules[0].label = "changed";
    expect(STARTER_TEMPLATES.sniper.rules[0].label).not.toBe("changed");
  });
  it("adds, updates, moves and removes rules, keeping ids unique", () => {
    let t = { name: "T", rules: [] };
    t = d.addRule(t);
    t = d.addRule(t);
    expect(t.rules.map((r) => r.id)).toEqual(["new-rule", "new-rule-2"]);
    t = d.updateRule(t, 0, { ...t.rules[0], label: "First" });
    t = d.moveRule(t, 0, 1);
    expect(t.rules.map((r) => r.id)).toEqual(["new-rule-2", "new-rule"]);
    expect(d.removeRule(t, 0).rules).toHaveLength(1);
  });
  it("switches shipped rules off and on", () => {
    let t = d.setShippedRuleEnabled({ name: "T" }, "close-in", false);
    expect(t.disable).toEqual(["close-in"]);
    expect(d.setShippedRuleEnabled(t, "close-in", true)).not.toHaveProperty("disable");
  });
  it("validates a template on its own", () => {
    expect(d.validateTemplate(STARTER_TEMPLATES.sniper)).toEqual([]);
    const msgs = d.validateTemplate({ name: "T", rules: [{ id: "a", when: [{ type: "nope" }], do: [], target: ["bogus"] }] }).map((m) => m.message);
    expect(msgs).toEqual(expect.arrayContaining(['unknown condition "nope"', "rule has no actions", 'unknown target preference "bogus"']));
  });
});

describe("campaign policy", () => {
  it("reads the cap, falling back to the shipped default only when unset", () => {
    expect(d.capFromCampaign({}, 2)).toBe(2);
    expect(d.capFromCampaign({ policies: { maxSameActionPerTurn: 3 } }, 2)).toBe(3);
    expect(d.capFromCampaign({ policies: { maxSameActionPerTurn: null } }, 2)).toBeNull();
  });
  it("writes a cap, or null for no limit, without losing other campaign data", () => {
    expect(d.campaignWithCap({ other: 1 }, 3)).toEqual({ other: 1, policies: { maxSameActionPerTurn: 3 } });
    expect(d.campaignWithCap({}, null).policies.maxSameActionPerTurn).toBeNull();
    expect(d.campaignWithCap({}, "0").policies.maxSameActionPerTurn).toBe(1);
    expect(d.campaignWithCap({}, "abc").policies.maxSameActionPerTurn).toBeNull();
  });
});
