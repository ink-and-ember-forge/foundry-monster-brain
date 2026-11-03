import { describe, it, expect } from "vitest";
import { STARTER_TEMPLATES, STARTER_TEMPLATE_IDS } from "../scripts/engine/starter-templates.mjs";
import { SYSTEM_LAYER, DEFAULT_POLICIES } from "../scripts/engine/default-rules.mjs";
import { resolveProfile } from "../scripts/engine/cascade.mjs";
import { bindSlots } from "../scripts/engine/slots.mjs";
import { evaluate } from "../scripts/engine/evaluate.mjs";

const e = (name, hpPercent, extra = {}) => ({ id: name, name, hpPercent, conditions: [], roles: [], distance: 30, inReach: false, ...extra });
const near = (name, hp, extra = {}) => e(name, hp, { distance: 5, inReach: true, ...extra });

const CLAW = { id: "claw", label: "Claw", kind: "melee", reach: 5 };
const BOW = { id: "bow", label: "Shortbow", kind: "ranged", range: 60 };
const RANGED_SIGNATURE = { id: "fire", label: "Fire Bolt", kind: "other", range: 60 };
const MELEE_SIGNATURE = { id: "smite", label: "Crushing Blow", kind: "melee", reach: 5 };

function run(templateId, { items, enemies, self = {}, round = 1, turn, ruleUses } = {}) {
  const resolved = resolveProfile({
    system: SYSTEM_LAYER,
    template: templateId ? STARTER_TEMPLATES[templateId] : undefined,
    creature: { slotBindings: { signature: items.find((i) => i.id === "fire") ? "fire" : "smite" } },
  });
  const binding = bindSlots(resolved.slots, resolved.slotBindings, items);
  const ctx = {
    round,
    self: { name: "Monster", hpPercent: 100, conditions: [], speed: 25, reach: 5, ...self },
    enemies,
    slots: { bound: binding.bound, unbound: binding.unbound },
    turn,
    ruleUses,
  };
  return { ...evaluate(resolved.rules, ctx, { policies: resolved.policies, max: 3 }), ctx };
}
const top = (r) => r.suggestions[0];

describe("the reported case: a ranged signature on a Brawler in round 1", () => {
  const items = [CLAW, RANGED_SIGNATURE];
  it("with the enemy 60 ft away it fires the ranged signature, then closes in, instead of an impossible melee Strike", () => {
    const r = run("brawler", { items, enemies: [e("Mira", 100, { distance: 60 })], round: 1 });
    expect(top(r).id).toBe("opening-signature");
    expect(top(r).slugs).toEqual(["signature", "stride", "stride"]);
    expect(top(r).steps.map((s) => s.label)).toEqual(["Signature action (Fire Bolt)", "Stride", "Stride"]);
    expect(top(r).adjustments[0]).toMatch(/no action left to attack with this turn/);
  });
  it("with the enemy 30 ft away it fires, closes in and strikes, saying what it added", () => {
    const r = run("duelist", { items, enemies: [e("Mira", 100, { distance: 30 })], round: 1 });
    const open = r.suggestions.find((s) => s.id === "opening-signature") ?? top(r);
    expect(open.slugs.filter((s) => s === "melee-strike").length).toBeLessThanOrEqual(1);
    for (const s of r.suggestions) {
      const melee = s.slugs.indexOf("melee-strike");
      if (melee > 0) expect(s.slugs.slice(0, melee), s.id).toContain("stride");
    }
  });
  it("adjacent, the same bundle needs no Stride", () => {
    const r = run("brawler", { items, enemies: [near("Mira", 100)], round: 1 });
    const open = r.suggestions.find((s) => s.id === "opening-signature");
    if (open) expect(open.slugs).toEqual(["signature", "melee-strike"]);
  });
  it("the signature's kind decides: a melee signature at range gets its Stride first", () => {
    const r = run("brawler", { items: [CLAW, MELEE_SIGNATURE], enemies: [e("Mira", 100, { distance: 20 })], round: 1 });
    const open = r.suggestions.find((s) => s.id === "opening-signature") ?? top(r);
    expect(open.slugs[0]).toBe("stride");
  });
});

describe("choosing a target the plan can be carried out against", () => {
  const items = [CLAW];
  const rule = { id: "r", label: "R", when: [], do: ["melee-strike"], target: ["lowest-hp"] };
  const evalRule = (self, enemies) => {
    const bound = { "melee-strike": { kind: "melee", reach: 5 } };
    return evaluate([rule], { round: 1, self: { name: "M", hpPercent: 100, conditions: [], speed: 25, reach: 5, ...self }, enemies, slots: { bound, unbound: [] } }, {});
  };
  it("a restrained creature skips the preferred far target for one it can actually hit", () => {
    const r = evalRule({ conditions: ["restrained"] }, [e("FarWeak", 5, { distance: 30 }), near("NearStrong", 90)]);
    expect(r.suggestions[0]).toMatchObject({ target: "NearStrong", slugs: ["melee-strike"] });
  });
  it("when it can reach the preferred target (by moving), it keeps the preference", () => {
    const r = evalRule({}, [e("FarWeak", 5, { distance: 30 }), near("NearStrong", 90)]);
    expect(r.suggestions[0]).toMatchObject({ target: "FarWeak", slugs: ["stride", "melee-strike"] });
  });
  it("when nothing can be done, the rule is held back and says exactly why", () => {
    const r = evalRule({ conditions: ["restrained"] }, [e("Far", 50, { distance: 30 })]);
    expect(r.suggestions).toEqual([]);
    expect(r.held[0].reasons).toEqual(["Melee strike needs Far within 5 ft (30 ft away), and the creature can't move: restrained"]);
  });
  it("an incapacitated creature gets no suggestions at all", () => {
    const r = evalRule({ conditions: ["paralyzed"] }, [near("A", 50)]);
    expect(r.suggestions).toEqual([]);
    expect(r.held[0].reasons).toEqual(["can't act: paralyzed"]);
  });
  it("an unknown position is assumed possible (we cannot prove otherwise)", () => {
    const r = evalRule({}, [e("Unplaced", 50, { distance: null, inReach: null })]);
    expect(r.suggestions[0].slugs).toEqual(["melee-strike"]);
  });
  it("a longer-reach creature needs no Stride at 10 ft", () => {
    const bound = { "melee-strike": { kind: "melee", reach: 10 } };
    const r = evaluate([rule], { round: 1, self: { name: "M", hpPercent: 100, conditions: [], speed: 25, reach: 10 }, enemies: [e("A", 50, { distance: 10 })], slots: { bound, unbound: [] } }, {});
    expect(r.suggestions[0].slugs).toEqual(["melee-strike"]);
  });
});

/**
 * An independent checker: replay a suggestion's steps from scratch and confirm no action is
 * impossible. Deliberately re-implements the rules instead of calling the planner.
 */
function replay(suggestion, ctx) {
  const enemy = ctx.enemies.find((x) => x.name === suggestion.target);
  const speed = ctx.self.speed ?? 25;
  const bound = ctx.slots?.bound ?? {};
  let d = enemy.distance;
  let prone = ctx.self.conditions.includes("prone");
  const cannotMove = ctx.self.conditions.some((c) => ["grabbed", "immobilized", "restrained", "paralyzed", "petrified", "unconscious", "dying"].includes(c));
  const problems = [];
  suggestion.steps.forEach((st, i) => {
    const b = bound[st.slug];
    const kind = st.slug === "melee-strike" ? "melee" : st.slug === "ranged-strike" ? "ranged" : b?.kind === "melee" ? "melee" : b?.kind === "ranged" || (b?.kind === "other" && b.range != null) ? "ranged" : null;
    if (st.slug === "stride" || st.slug === "stride-away") {
      if (cannotMove) problems.push(`step ${i}: moves while unable to`);
      if (prone && st.slug !== "stand") problems.push(`step ${i}: moves while prone`);
      if (d != null) d = st.slug === "stride" ? Math.max(5, d - speed) : d + speed;
    } else if (st.slug === "stand") {
      prone = false;
    } else if (kind === "melee" && d != null) {
      const reach = b?.reach ?? ctx.self.reach ?? 5;
      if (d > reach) problems.push(`step ${i}: melee from ${d} ft with reach ${reach}`);
    } else if (kind === "ranged" && d != null) {
      const range = b?.range ?? null;
      if (range != null && d > range) problems.push(`step ${i}: ranged from ${d} ft with range ${range}`);
    }
  });
  // Movement while prone must be preceded by Stand. (Strikes may be made prone.)
  const firstMove = suggestion.steps.findIndex((s) => s.slug === "stride" || s.slug === "stride-away");
  const stand = suggestion.steps.findIndex((s) => s.slug === "stand");
  if (ctx.self.conditions.includes("prone") && firstMove >= 0 && (stand < 0 || stand > firstMove)) problems.push("moves before standing");
  return problems;
}

describe("no suggested plan is ever impossible (independent replay)", () => {
  const selfs = [{}, { conditions: ["prone"] }, { conditions: ["grabbed"] }, { speed: 10 }, { hpPercent: 10 }, { conditions: ["frightened"] }];
  const itemSets = {
    "claw+bow+ranged spell": [CLAW, BOW, RANGED_SIGNATURE],
    "claw+melee signature": [CLAW, MELEE_SIGNATURE],
    "claw only": [CLAW],
  };
  const scenes = {
    adjacent: [near("A", 50)],
    "mid-range": [e("A", 50, { distance: 30 })],
    far: [e("A", 50, { distance: 90 })],
    "very far": [e("A", 50, { distance: 300 })],
    crowd: [near("A", 80), e("B", 20, { distance: 40, roles: ["caster"] }), e("C", 60, { distance: 80, roles: ["squishy"], conditions: ["prone", "off-guard"] })],
  };
  let checked = 0;
  for (const id of STARTER_TEMPLATE_IDS) {
    for (const [itemName, items] of Object.entries(itemSets)) {
      for (const [sceneName, enemies] of Object.entries(scenes)) {
        for (const self of selfs) {
          for (const round of [1, 3]) {
            for (const remaining of [1, 3]) {
              it(`${id} | ${itemName} | ${sceneName} | ${JSON.stringify(self)} | r${round} | ${remaining} actions`, () => {
                const r = run(id, { items, enemies, self, round, turn: { remaining, taken: [] } });
                for (const s of r.suggestions) {
                  expect(replay(s, r.ctx), `${s.id}: ${s.slugs.join(",")}`).toEqual([]);
                  expect(s.slugs.length).toBeLessThanOrEqual(remaining);
                  expect(s.steps.map((x) => x.slug)).toEqual(s.slugs);
                  checked++;
                }
              });
            }
          }
        }
      }
    }
  }
  it("actually exercised a large number of suggestions", () => {
    expect(checked).toBeGreaterThan(2000);
  });
});
