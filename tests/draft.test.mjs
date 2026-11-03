import { describe, it, expect } from "vitest";
import {
  prune,
  isEmptyProfile,
  setTemplate,
  setBinding,
  setRuleEnabled,
  templateToValue,
  valueToTemplate,
  templateOptions,
  ruleRows,
  layerOfScope,
  INHERIT,
  NONE,
} from "../scripts/engine/draft.mjs";

describe("profile drafts", () => {
  it("an untouched or emptied draft is empty", () => {
    expect(isEmptyProfile(null)).toBe(true);
    expect(isEmptyProfile({})).toBe(true);
    expect(isEmptyProfile({ slotBindings: {}, disable: [], template: undefined })).toBe(true);
  });
  it("template: undefined inherits, null means none, and null is not empty", () => {
    expect(setTemplate({}, "archer")).toEqual({ template: "archer" });
    expect(setTemplate({ template: "archer" }, undefined)).toEqual({});
    expect(setTemplate({}, null)).toEqual({ template: null });
    expect(isEmptyProfile({ template: null })).toBe(false);
  });
  it("sets and clears a slot binding without mutating", () => {
    const a = {};
    const b = setBinding(a, "signature", "item1");
    expect(b).toEqual({ slotBindings: { signature: "item1" } });
    expect(a).toEqual({});
    expect(setBinding(b, "signature", "")).toEqual({});
    expect(setBinding(b, "other", "x").slotBindings).toEqual({ signature: "item1", other: "x" });
  });
  it("disables and re-enables rules, without duplicates", () => {
    let p = setRuleEnabled({}, "a", false);
    p = setRuleEnabled(p, "a", false);
    expect(p.disable).toEqual(["a"]);
    expect(setRuleEnabled(p, "a", true)).toEqual({});
  });
  it("prune keeps other keys such as rules and policies", () => {
    expect(prune({ rules: [1], policies: { x: 1 }, disable: [] })).toEqual({ rules: [1], policies: { x: 1 } });
  });
});

describe("template select", () => {
  it("maps between profile and select value, per scope", () => {
    expect(templateToValue({}, "token")).toBe(INHERIT);
    expect(templateToValue({}, "actor")).toBe(NONE);
    expect(templateToValue(null, "token")).toBe(INHERIT);
    expect(templateToValue({ template: null }, "token")).toBe(NONE);
    expect(templateToValue({ template: "archer" }, "token")).toBe("archer");
    expect(valueToTemplate(INHERIT)).toBeUndefined();
    expect(valueToTemplate(NONE)).toBeNull();
    expect(valueToTemplate("brute")).toBe("brute");
  });
  it("offers 'same as the actor' only at token scope, and labels sources", () => {
    const templates = [{ id: "archer", name: "Archer", source: "starter" }];
    const tok = templateOptions(templates, "token", "Brute");
    expect(tok[0]).toEqual({ value: INHERIT, label: "Same as the actor (Brute)" });
    expect(tok.at(-1)).toEqual({ value: "archer", label: "Archer (starter)" });
    expect(templateOptions(templates, "actor").map((o) => o.value)).toEqual([NONE, "archer"]);
    expect(templateOptions(templates, "token")[0].label).toBe("Same as the actor (no template)");
  });
});

describe("rule rows", () => {
  const rules = [
    { id: "a", label: "A", source: "system" },
    { id: "b", source: "template", enabled: false, disabledBy: "token" },
    { id: "c", label: "C", source: "system", enabled: false, disabledBy: "creature" },
  ];
  it("marks enabled state and editability for the token layer", () => {
    const rows = ruleRows(rules, "token");
    expect(rows[0]).toMatchObject({ id: "a", enabled: true, editable: true, note: null });
    expect(rows[1]).toMatchObject({ label: "b", enabled: false, editable: true });
    expect(rows[2]).toMatchObject({ enabled: false, editable: false, note: "turned off by the creature layer" });
  });
  it("the same rule is editable at the layer that disabled it", () => {
    expect(ruleRows(rules, "creature")[2].editable).toBe(true);
    expect(ruleRows(rules, "creature")[1].editable).toBe(false);
  });
  it("maps dialog scope to cascade layer", () => {
    expect(layerOfScope("token")).toBe("token");
    expect(layerOfScope("actor")).toBe("creature");
  });
});
