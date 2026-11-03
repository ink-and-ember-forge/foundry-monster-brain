import { describe, it, expect } from "vitest";
import { planBundle, requirementFor, DEFAULT_SPEED } from "../scripts/engine/world.mjs";
import { rankTargets } from "../scripts/engine/targets.mjs";

const target = (distance, name = "Mira") => ({ name, distance });
const ctx = (over = {}, slots) => ({ self: { speed: 25, reach: 5, conditions: [], ...over }, slots });
const plan = (bundle, { dist = 30, remaining = 3, self = {}, bound } = {}) =>
  planBundle({ bundle, ctx: ctx(self, bound ? { bound } : undefined), target: target(dist), remaining });
const slugs = (p) => p.slugs;

describe("requirements", () => {
  it("strikes and movement have spatial requirements; unknown slots do not", () => {
    expect(requirementFor("melee-strike", undefined, { reach: 10 })).toEqual({ type: "melee", reach: 10 });
    expect(requirementFor("melee-strike", { "melee-strike": { reach: 15 } }, { reach: 5 })).toEqual({ type: "melee", reach: 15 });
    expect(requirementFor("ranged-strike", { "ranged-strike": { range: 60 } })).toEqual({ type: "ranged", range: 60 });
    expect(requirementFor("stride")).toEqual({ type: "move-toward" });
    expect(requirementFor("stride-away")).toEqual({ type: "move-away" });
    expect(requirementFor("flaming-arrow")).toEqual({ type: "free" });
  });
  it("a signature takes its requirement from what it is bound to", () => {
    expect(requirementFor("signature", { signature: { kind: "ranged", range: 60 } })).toEqual({ type: "ranged", range: 60 });
    expect(requirementFor("signature", { signature: { kind: "melee", reach: 10 } })).toEqual({ type: "melee", reach: 10 });
    expect(requirementFor("signature", { signature: { kind: "other", range: 30 } })).toEqual({ type: "ranged", range: 30 });
    expect(requirementFor("signature", { signature: { kind: "other" } })).toEqual({ type: "free" });
    expect(requirementFor("signature", {})).toEqual({ type: "free" });
  });
});

describe("the reported case: a ranged signature followed by a melee Strike", () => {
  const bound = { signature: { kind: "ranged", range: 60 } };
  it("at range, the melee Strike gets the Stride it needs", () => {
    const p = plan(["signature", "melee-strike"], { dist: 30, bound });
    expect(slugs(p)).toEqual(["signature", "stride", "melee-strike"]);
    expect(p.adjustments).toEqual(["Added Stride: Mira is 30 ft away (Melee strike needs 5 ft)"]);
    expect(p.steps.map((s) => s.added)).toEqual([false, true, false]);
  });
  it("adjacent, nothing is added", () => {
    expect(slugs(plan(["signature", "melee-strike"], { dist: 5, bound }))).toEqual(["signature", "melee-strike"]);
  });
  it("a ranged signature out of range gets a Stride too", () => {
    expect(slugs(plan(["signature"], { dist: 80, bound }))).toEqual(["stride", "signature"]);
  });
  it("a melee signature is treated like a melee Strike", () => {
    const p = plan(["signature", "melee-strike"], { dist: 20, bound: { signature: { kind: "melee", reach: 5 } } });
    expect(slugs(p)).toEqual(["stride", "signature", "melee-strike"]);
  });
});

describe("closing the distance", () => {
  it("adds as many Strides as the gap needs (Speed 25: 55 ft away needs two to reach 5 ft)", () => {
    const p = plan(["melee-strike"], { dist: 55 });
    expect(slugs(p)).toEqual(["stride", "stride", "melee-strike"]);
    expect(p.adjustments[0]).toBe("Added 2 Strides: Mira is 55 ft away (Melee strike needs 5 ft)");
  });
  it("a longer reach needs fewer Strides", () => {
    expect(slugs(plan(["melee-strike"], { dist: 30, self: { reach: 10 } }))).toEqual(["stride", "melee-strike"]);
    expect(slugs(plan(["melee-strike"], { dist: 10, self: { reach: 10 } }))).toEqual(["melee-strike"]);
  });
  it("uses the bound weapon's own reach, not the creature's best", () => {
    const bound = { "melee-strike": { reach: 5 } };
    expect(slugs(plan(["melee-strike"], { dist: 10, self: { reach: 10 }, bound }))).toEqual(["stride", "melee-strike"]);
  });
  it("tracks distance through authored Strides: [stride, melee] at 30 ft needs no extra", () => {
    const p = plan(["stride", "melee-strike"], { dist: 30 });
    expect(slugs(p)).toEqual(["stride", "melee-strike"]);
    expect(p.adjustments).toEqual([]);
    expect(p.finalDistance).toBe(5);
  });
  it("adds only the shortfall: [stride, melee] at 55 ft needs one more Stride", () => {
    expect(slugs(plan(["stride", "melee-strike"], { dist: 55 }))).toEqual(["stride", "stride", "melee-strike"]);
  });
  it("at 60 ft it takes three Strides to get adjacent, so there is no action left to Strike with", () => {
    const p = plan(["stride", "melee-strike"], { dist: 60 });
    expect(slugs(p)).toEqual(["stride", "stride", "stride"]);
    expect(p.adjustments[0]).toMatch(/no action left to attack with this turn/);
  });
  it("skips a Stride that is not needed", () => {
    const p = plan(["stride", "stride", "melee-strike"], { dist: 20 });
    expect(slugs(p)).toEqual(["stride", "melee-strike"]);
    expect(p.adjustments).toEqual(["Skipped Stride: Mira is already adjacent (5 ft)"]);
  });
  it("skips a Stride when the target is already within the next Strike's reach", () => {
    expect(slugs(plan(["stride", "melee-strike"], { dist: 10, self: { reach: 10 } }))).toEqual(["melee-strike"]);
  });
  it("a bundle that is all unnecessary movement has nothing to do", () => {
    const p = plan(["stride"], { dist: 5 });
    expect(p.ok).toBe(false);
    expect(p.reason).toMatch(/nothing to do/);
  });
  it("speed defaults to 25 when unknown", () => {
    expect(DEFAULT_SPEED).toBe(25);
    expect(slugs(planBundle({ bundle: ["melee-strike"], ctx: { self: { conditions: [] } }, target: target(30), remaining: 3 }))).toEqual(["stride", "melee-strike"]);
  });
  it("a slower creature needs more Strides", () => {
    expect(slugs(plan(["melee-strike"], { dist: 30, self: { speed: 10 }, remaining: 4 }))).toEqual(["stride", "stride", "stride", "melee-strike"]);
    expect(slugs(plan(["melee-strike"], { dist: 30, self: { speed: 10 }, remaining: 3 }))).toEqual(["stride", "stride", "stride"]);
  });
});

describe("running out of actions", () => {
  it("closes as far as it can and stops, when the gap eats the whole turn", () => {
    const p = plan(["melee-strike", "melee-strike"], { dist: 100, remaining: 3 });
    expect(slugs(p)).toEqual(["stride", "stride", "stride"]);
    expect(p.adjustments[0]).toMatch(/no action left to attack with this turn/);
  });
  it("keeps the repair and drops later steps when the budget is tight", () => {
    expect(slugs(plan(["melee-strike", "melee-strike"], { dist: 30, remaining: 2 }))).toEqual(["stride", "melee-strike"]);
  });
  it("trims an over-long bundle to the actions left without comment", () => {
    const p = plan(["melee-strike", "melee-strike", "melee-strike"], { dist: 5, remaining: 2 });
    expect(slugs(p)).toEqual(["melee-strike", "melee-strike"]);
    expect(p.adjustments).toEqual([]);
  });
  it("with one action left and the target out of reach, it just moves", () => {
    expect(slugs(plan(["melee-strike"], { dist: 30, remaining: 1 }))).toEqual(["stride"]);
  });
  it("with no actions left there is no plan", () => {
    expect(plan(["melee-strike"], { dist: 5, remaining: 0 }).ok).toBe(false);
  });
});

describe("moving away", () => {
  it("a melee Strike right after Stride away is dropped, not 'repaired' by walking back", () => {
    const p = plan(["stride-away", "melee-strike"], { dist: 5 });
    expect(slugs(p)).toEqual(["stride-away"]);
    expect(p.adjustments).toEqual(["Dropped Melee strike and the rest: just moved away from Mira"]);
  });
  it("a ranged Strike after Stride away is fine while in range", () => {
    expect(slugs(plan(["stride-away", "ranged-strike"], { dist: 5, bound: { "ranged-strike": { range: 60 } } }))).toEqual(["stride-away", "ranged-strike"]);
  });
  it("Strike then Stride away is fine in either order for a melee creature", () => {
    expect(slugs(plan(["melee-strike", "stride-away"], { dist: 5 }))).toEqual(["melee-strike", "stride-away"]);
  });
  it("reports the new distance", () => {
    expect(plan(["stride-away"], { dist: 5 }).steps[0].note).toBe("about 30 ft from Mira");
  });
});

describe("ranged attacks", () => {
  const bound = { "ranged-strike": { range: 60 } };
  it("are fine at point-blank and within range", () => {
    expect(slugs(plan(["ranged-strike"], { dist: 5, bound }))).toEqual(["ranged-strike"]);
    expect(slugs(plan(["ranged-strike"], { dist: 60, bound }))).toEqual(["ranged-strike"]);
  });
  it("past maximum range need a Stride first", () => {
    expect(slugs(plan(["ranged-strike"], { dist: 80, bound }))).toEqual(["stride", "ranged-strike"]);
  });
  it("with unknown range, are assumed possible", () => {
    expect(slugs(plan(["ranged-strike"], { dist: 500 }))).toEqual(["ranged-strike"]);
  });
});

describe("conditions that block actions", () => {
  it("a grabbed creature cannot Stride, so a rule that needs one is rejected with a reason", () => {
    const p = plan(["stride", "melee-strike"], { dist: 30, self: { conditions: ["grabbed"] } });
    expect(p.ok).toBe(false);
    expect(p.reason).toBe("can't Stride toward Mira: grabbed");
  });
  it("a grabbed creature can still Strike what is in reach", () => {
    expect(slugs(plan(["melee-strike"], { dist: 5, self: { conditions: ["grabbed"] } }))).toEqual(["melee-strike"]);
  });
  it("a grabbed creature cannot melee something out of reach, and the reason says why", () => {
    const p = plan(["melee-strike"], { dist: 30, self: { conditions: ["restrained"] } });
    expect(p.ok).toBe(false);
    expect(p.reason).toBe("Melee strike needs Mira within 5 ft (30 ft away), and the creature can't move: restrained");
  });
  it("cannot flee while immobilized", () => {
    expect(plan(["stride-away"], { dist: 5, self: { conditions: ["immobilized"] } }).reason).toMatch(/can't Stride away from Mira: immobilized/);
  });
  it("an incapacitated creature cannot act at all", () => {
    for (const c of ["paralyzed", "unconscious", "petrified", "dying"]) {
      expect(plan(["melee-strike"], { dist: 5, self: { conditions: [c] } }).reason).toBe(`can't act: ${c}`);
    }
  });
  it("a creature with no movement speed cannot move", () => {
    expect(plan(["stride", "melee-strike"], { dist: 30, self: { speed: 0 } }).reason).toMatch(/no movement speed/);
  });
  it("a prone creature stands before moving, which costs an action", () => {
    const p = plan(["stride", "melee-strike"], { dist: 30, self: { conditions: ["prone"] } });
    expect(slugs(p)).toEqual(["stand", "stride", "melee-strike"]);
    expect(p.adjustments).toContain("Added Stand up: prone creatures can't move");
  });
  it("a prone creature can Strike what is in reach without standing", () => {
    expect(slugs(plan(["melee-strike"], { dist: 5, self: { conditions: ["prone"] } }))).toEqual(["melee-strike"]);
  });
  it("standing plus closing plus attacking can overrun the budget; it then closes and stops", () => {
    const p = plan(["melee-strike"], { dist: 55, remaining: 3, self: { conditions: ["prone"] } });
    expect(slugs(p)).toEqual(["stand", "stride", "stride"]);
  });
  it("an authored Stand does nothing when not prone", () => {
    expect(slugs(plan(["stand", "melee-strike"], { dist: 5 }))).toEqual(["melee-strike"]);
  });
});

describe("unknown positions", () => {
  it("cannot be checked, so steps are assumed possible", () => {
    const p = planBundle({ bundle: ["melee-strike", "ranged-strike"], ctx: ctx(), target: { name: "Mira", distance: null }, remaining: 3 });
    expect(slugs(p)).toEqual(["melee-strike", "ranged-strike"]);
    expect(p.adjustments).toEqual([]);
  });
  it("an authored Stride is kept when distance is unknown", () => {
    const p = planBundle({ bundle: ["stride", "melee-strike"], ctx: ctx(), target: { name: "Mira", distance: null }, remaining: 3 });
    expect(slugs(p)).toEqual(["stride", "melee-strike"]);
  });
});

describe("plans never exceed the budget", () => {
  it("across many distances, speeds and budgets", () => {
    for (const dist of [5, 10, 25, 30, 55, 100, 300]) {
      for (const speed of [10, 25, 40]) {
        for (const remaining of [1, 2, 3, 4]) {
          for (const bundle of [["melee-strike", "melee-strike"], ["stride", "melee-strike"], ["signature", "melee-strike"], ["ranged-strike", "stride-away"]]) {
            const p = plan(bundle, { dist, remaining, self: { speed }, bound: { signature: { kind: "ranged", range: 60 }, "ranged-strike": { range: 60 } } });
            if (p.ok) expect(p.slugs.length, `${bundle} d${dist} s${speed} r${remaining}`).toBeLessThanOrEqual(remaining);
          }
        }
      }
    }
  });
});

describe("rankTargets", () => {
  const e = (name, hp, inReach = false) => ({ name, hpPercent: hp, inReach, roles: [] });
  it("returns every enemy best-first, ties in original order", () => {
    const ranked = rankTargets([e("A", 50), e("B", 10), e("C", 50, true)], ["in-reach", "lowest-hp"]);
    expect(ranked.map((x) => x.name)).toEqual(["C", "B", "A"]);
    expect(rankTargets([], ["lowest-hp"])).toEqual([]);
    expect(rankTargets(undefined)).toEqual([]);
  });
});
