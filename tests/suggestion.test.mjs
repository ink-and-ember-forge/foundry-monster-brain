import { describe, it, expect } from "vitest";
import { hardcodedSuggestion, stripText, isMonsterAlliance } from "../scripts/engine/suggestion.mjs";

describe("suggestion stub", () => {
  it("renders label only when no target", () => {
    expect(stripText(hardcodedSuggestion())).toBe("Retreat and shoot");
  });
  it("renders label and target", () => {
    expect(stripText({ ...hardcodedSuggestion(), target: "Mira" })).toBe("Retreat and shoot → Mira");
  });
  it("empty for no suggestion", () => {
    expect(stripText(null)).toBe("");
  });
  it("only opposition alliance counts as monster", () => {
    expect(isMonsterAlliance("opposition")).toBe(true);
    expect(isMonsterAlliance("party")).toBe(false);
    expect(isMonsterAlliance(null)).toBe(false);
  });
});
