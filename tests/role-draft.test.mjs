import { describe, it, expect } from "vitest";
import { parseTags, toggleRole, addTags, roleChoices } from "../scripts/engine/role-draft.mjs";

describe("role draft", () => {
  it("parses commas and whitespace, lowercases and dedupes", () => {
    expect(parseTags("Caster, squishy  healer,CASTER")).toEqual(["caster", "squishy", "healer"]);
    expect(parseTags("")).toEqual([]);
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags(" , ,")).toEqual([]);
  });
  it("toggles a role on and off without mutating", () => {
    const a = ["caster"];
    expect(toggleRole(a, "healer", true)).toEqual(["caster", "healer"]);
    expect(toggleRole(a, "caster", false)).toEqual([]);
    expect(toggleRole(a, "caster", true)).toEqual(["caster"]);
    expect(a).toEqual(["caster"]);
  });
  it("ignores blank roles and normalises the tag it toggles", () => {
    expect(toggleRole(["caster"], "  ", true)).toEqual(["caster"]);
    expect(toggleRole([], " Healer ", true)).toEqual(["healer"]);
  });
  it("adds typed tags to the existing ones", () => {
    expect(addTags(["caster"], "squishy, Caster")).toEqual(["caster", "squishy"]);
    expect(addTags(undefined, "a b")).toEqual(["a", "b"]);
  });
  it("lists suggested roles first, then custom tags, all ticked correctly", () => {
    const rows = roleChoices(["caster", "healer"], ["healer", "bard"]);
    expect(rows).toEqual([
      { tag: "caster", checked: false, custom: false },
      { tag: "healer", checked: true, custom: false },
      { tag: "bard", checked: true, custom: true },
    ]);
  });
});
