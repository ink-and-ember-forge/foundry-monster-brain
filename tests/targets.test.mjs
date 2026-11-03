import { describe, it, expect } from "vitest";
import {
  pickTarget,
  describeSelector,
  unknownSelectorEntries,
  normaliseRoles,
  resolveRoles,
  DEFAULT_SELECTOR,
  SUGGESTED_ROLES,
} from "../scripts/engine/targets.mjs";
import { evaluate } from "../scripts/engine/evaluate.mjs";
import { resolveProfile } from "../scripts/engine/cascade.mjs";
import { validate } from "../scripts/engine/validate.mjs";
import { whyLines } from "../scripts/engine/suggestion.mjs";
import { DEFAULT_RULES } from "../scripts/engine/default-rules.mjs";

const e = (name, hpPercent, extra = {}) => ({ id: name, name, hpPercent, conditions: [], roles: [], distance: 10, inReach: false, ...extra });
const name = (t) => t?.name ?? null;

describe("pickTarget", () => {
  const party = [e("Tank", 100, { roles: ["frontliner"] }), e("Mage", 80, { roles: ["caster"] }), e("Cleric", 30, { roles: ["healer"] }), e("Rogue", 20, { roles: ["squishy"] })];
  it("defaults to lowest HP", () => {
    expect(name(pickTarget(party))).toBe("Rogue");
    expect(DEFAULT_SELECTOR).toEqual(["lowest-hp"]);
  });
  it("casters first, then lowest HP", () => {
    expect(name(pickTarget(party, ["role:caster", "lowest-hp"]))).toBe("Mage");
  });
  it("falls through to the next preference when nobody has the tag", () => {
    expect(name(pickTarget(party, ["role:necromancer", "lowest-hp"]))).toBe("Rogue");
  });
  it("lowest HP among those with the tag", () => {
    const two = [e("A", 90, { roles: ["caster"] }), e("B", 40, { roles: ["caster"] }), e("C", 5)];
    expect(name(pickTarget(two, ["role:caster", "lowest-hp"]))).toBe("B");
  });
  it("order of entries matters: lowest HP first, tag only breaks ties", () => {
    expect(name(pickTarget(party, ["lowest-hp", "role:caster"]))).toBe("Rogue");
    const tied = [e("A", 50), e("B", 50, { roles: ["caster"] })];
    expect(name(pickTarget(tied, ["lowest-hp", "role:caster"]))).toBe("B");
  });
  it("several role preferences rank in order", () => {
    expect(name(pickTarget(party, ["role:healer", "role:caster"]))).toBe("Cleric");
    expect(name(pickTarget(party.filter((p) => p.name !== "Cleric"), ["role:healer", "role:caster"]))).toBe("Mage");
  });
  it("role matching ignores case and whitespace in the selector", () => {
    expect(name(pickTarget(party, ["role: Caster "]))).toBe("Mage");
  });
  it("nearest and farthest, with unknown distance last", () => {
    const d = [e("Far", 100, { distance: 60 }), e("Near", 100, { distance: 5 }), e("Unknown", 100, { distance: null })];
    expect(name(pickTarget(d, ["nearest"]))).toBe("Near");
    expect(name(pickTarget(d, ["farthest"]))).toBe("Far");
  });
  it("highest HP", () => {
    expect(name(pickTarget(party, ["highest-hp"]))).toBe("Tank");
  });
  it("is stable: ties keep original order", () => {
    expect(name(pickTarget([e("A", 50), e("B", 50)], ["lowest-hp"]))).toBe("A");
    expect(name(pickTarget([e("A", 50), e("B", 50)], []))).toBe("A");
  });
  it("ignores unknown entries, and returns null for no enemies", () => {
    expect(name(pickTarget(party, ["bogus", "lowest-hp"]))).toBe("Rogue");
    expect(pickTarget([], ["lowest-hp"])).toBeNull();
    expect(pickTarget(undefined)).toBeNull();
  });
  it("tolerates enemies without a roles list", () => {
    expect(name(pickTarget([{ name: "X", hpPercent: 10 }], ["role:caster"]))).toBe("X");
  });
});

describe("selector helpers", () => {
  it("describes a selector in words", () => {
    expect(describeSelector(["role:caster", "lowest-hp"])).toBe("prefer caster, then lowest HP");
    expect(describeSelector(["nearest"])).toBe("nearest");
    expect(describeSelector(["bogus"])).toBe("");
  });
  it("finds unknown entries", () => {
    expect(unknownSelectorEntries(["role:caster", "lowest-hp", "bogus", "role:"])).toEqual(["bogus", "role:"]);
  });
});

describe("role tags", () => {
  it("normalises: lowercase, trim, dedupe, drop junk", () => {
    expect(normaliseRoles([" Caster ", "caster", "", "Healer"])).toEqual(["caster", "healer"]);
    expect(normaliseRoles("caster")).toEqual([]);
    expect(normaliseRoles(undefined)).toEqual([]);
  });
  it("an encounter override replaces the campaign default; an empty override clears it", () => {
    expect(resolveRoles(["caster"], undefined)).toEqual(["caster"]);
    expect(resolveRoles(["caster"], null)).toEqual(["caster"]);
    expect(resolveRoles(["caster"], ["healer"])).toEqual(["healer"]);
    expect(resolveRoles(["caster"], [])).toEqual([]);
  });
  it("suggests a starter list but tags are free-form", () => {
    expect(SUGGESTED_ROLES).toEqual(expect.arrayContaining(["caster", "healer", "squishy", "frontliner"]));
  });
});

describe("targets in evaluation", () => {
  const ctx = (enemies) => ({ round: 1, self: { name: "G", hpPercent: 100, conditions: [] }, enemies });
  const rule = { id: "r", label: "R", when: [], do: ["melee-strike"], target: ["role:caster", "lowest-hp"] };
  it("uses the rule's selector and says why", () => {
    const s = evaluate([rule], ctx([e("Rogue", 10), e("Mage", 90, { roles: ["caster"] })])).suggestions[0];
    expect(s).toMatchObject({ target: "Mage", targetWhy: "prefer caster, then lowest HP" });
  });
  it("applies the selector among enemies that passed the enemy conditions", () => {
    const r = { ...rule, when: [{ type: "enemy-has-condition", slug: "prone" }] };
    const s = evaluate([r], ctx([e("Mage", 90, { roles: ["caster"] }), e("Rogue", 10, { conditions: ["prone"] })])).suggestions[0];
    expect(s.target).toBe("Rogue");
  });
  it("narrowing without a selector falls back to lowest HP, with a reason", () => {
    const r = { id: "r", when: [{ type: "enemy-has-condition", slug: "prone" }], do: [] };
    const s = evaluate([r], ctx([e("A", 80, { conditions: ["prone"] }), e("B", 20, { conditions: ["prone"] })])).suggestions[0];
    expect(s).toMatchObject({ target: "B", targetWhy: "lowest HP" });
  });
  it("no selector and no narrowing: action only", () => {
    expect(evaluate([{ id: "r", when: [], do: [] }], ctx([e("A", 80)])).suggestions[0]).toMatchObject({ target: null, targetWhy: null });
  });
  it("the shipped close-in rule prefers casters", () => {
    const res = evaluate(DEFAULT_RULES, { ...ctx([e("Rogue", 10), e("Mage", 90, { roles: ["caster"] })]), round: 3 });
    expect(res.suggestions[0]).toMatchObject({ id: "close-in", target: "Mage" });
  });
  it("the target explanation appears in the why lines", () => {
    const s = evaluate([rule], ctx([e("Mage", 90, { roles: ["caster"] })])).suggestions[0];
    expect(whyLines(s)).toContain("Target: Mage (prefer caster, then lowest HP)");
  });
});

describe("selector validation", () => {
  it("warns about unknown target preferences", () => {
    const resolved = resolveProfile({ creature: { rules: [{ id: "r", when: [], do: ["stride"], target: ["role:caster", "bogus"] }] } });
    const msgs = validate(resolved, { unbound: [], missing: [] }).map((m) => m.message);
    expect(msgs).toEqual(['unknown target preference "bogus"']);
  });
});
