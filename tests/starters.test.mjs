import { describe, it, expect } from "vitest";
import { STARTER_TEMPLATES, STARTER_TEMPLATE_IDS } from "../scripts/engine/starter-templates.mjs";
import { SYSTEM_LAYER } from "../scripts/engine/default-rules.mjs";
import { resolveProfile } from "../scripts/engine/cascade.mjs";
import { bindSlots } from "../scripts/engine/slots.mjs";
import { validate } from "../scripts/engine/validate.mjs";
import { evaluate } from "../scripts/engine/evaluate.mjs";
import { formatReport } from "../scripts/engine/report.mjs";

const ITEMS = [
  { id: "claw", label: "Claw", kind: "melee" },
  { id: "bow", label: "Shortbow", kind: "ranged" },
  { id: "spell", label: "Fireball", kind: "other" },
];
const MELEE_ONLY = [ITEMS[0], ITEMS[2]];

const e = (name, hpPercent, extra = {}) => ({ id: name, name, hpPercent, conditions: [], roles: [], distance: 30, inReach: false, ...extra });

/** Resolve system + template + a creature binding `signature`, then evaluate. */
function run(templateId, { items = ITEMS, enemies, self = {}, round = 3, turn, ruleUses } = {}) {
  const resolved = resolveProfile({
    system: SYSTEM_LAYER,
    template: STARTER_TEMPLATES[templateId],
    creature: { slotBindings: { signature: "spell" } },
  });
  const binding = bindSlots(resolved.slots, resolved.slotBindings, items);
  const ctx = {
    round,
    self: { name: "Monster", hpPercent: 100, conditions: [], ...self },
    enemies,
    slots: { bound: binding.bound, unbound: binding.unbound },
    turn,
    ruleUses,
  };
  return { resolved, binding, ...evaluate(resolved.rules, ctx, { policies: resolved.policies, max: 3 }) };
}
const top = (r) => r.suggestions[0];

describe("every starter template", () => {
  it("ships the five from the brief", () => {
    expect(STARTER_TEMPLATE_IDS).toEqual(["brute", "skirmisher", "archer", "caster", "skittish"]);
  });
  for (const id of STARTER_TEMPLATE_IDS) {
    it(`${id}: resolves cleanly with no validation warnings when its slots are bound`, () => {
      const resolved = resolveProfile({ system: SYSTEM_LAYER, template: STARTER_TEMPLATES[id], creature: { slotBindings: { signature: "spell" } } });
      const binding = bindSlots(resolved.slots, resolved.slotBindings, ITEMS);
      expect(validate(resolved, binding)).toEqual([]);
    });
    it(`${id}: has a name and description, and only uses declared-or-derivable slots`, () => {
      const t = STARTER_TEMPLATES[id];
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
    });
    it(`${id}: no rule's bundle needs more than three actions, and none repeats an action beyond the default policy`, () => {
      for (const rule of STARTER_TEMPLATES[id].rules) {
        expect(rule.do.length).toBeLessThanOrEqual(3);
        const counts = {};
        for (const a of rule.do) counts[a === "stride-away" ? "stride" : a] = (counts[a === "stride-away" ? "stride" : a] ?? 0) + 1;
        expect(Math.max(...Object.values(counts))).toBeLessThanOrEqual(2);
      }
    });
  }
});

describe("Brute", () => {
  it("charges the nearest enemy when nobody is in reach", () => {
    const r = run("brute", { enemies: [e("Far", 10, { distance: 35 }), e("Near", 90, { distance: 15 })], round: 1 });
    expect(top(r)).toMatchObject({ id: "brute-charge", target: "Near" });
  });
  it("smashes the weakest enemy that is in reach, not a weaker one out of reach", () => {
    const r = run("brute", {
      enemies: [e("FarWeak", 5, { distance: 20 }), e("A", 80, { distance: 5, inReach: true }), e("B", 40, { distance: 5, inReach: true })],
      round: 1,
    });
    expect(top(r)).toMatchObject({ id: "brute-smash", target: "B" });
  });
  it("uses its power attack from round 2, then the cooldown makes it smash", () => {
    const adjacent = [e("A", 50, { distance: 5, inReach: true })];
    expect(top(run("brute", { enemies: adjacent, round: 2 })).id).toBe("brute-power-attack");
    const cooling = run("brute", { enemies: adjacent, round: 3, ruleUses: [{ ruleId: "brute-power-attack", round: 2 }] });
    expect(top(cooling).id).toBe("brute-smash");
  });
});

describe("Skirmisher", () => {
  it("strikes a squishy target in reach and fades", () => {
    const r = run("skirmisher", {
      enemies: [e("Tank", 100, { distance: 5, inReach: true }), e("Mage", 90, { distance: 5, inReach: true, roles: ["squishy"] })],
    });
    expect(top(r)).toMatchObject({ id: "skirmisher-strike-and-fade", target: "Mage", hint: "Back off to at least 10 ft" });
  });
  it("darts in on squishy targets from range", () => {
    const r = run("skirmisher", { enemies: [e("Tank", 10, { distance: 30 }), e("Mage", 90, { distance: 40, roles: ["squishy"] })] });
    expect(top(r)).toMatchObject({ id: "skirmisher-dart-in", target: "Mage" });
  });
});

describe("Archer", () => {
  const party = [e("Tank", 100, { distance: 5, inReach: true }), e("Mage", 70, { distance: 40, roles: ["caster"] })];
  it("retreats and shoots the caster when engaged", () => {
    const r = run("archer", { enemies: party });
    expect(top(r)).toMatchObject({ id: "archer-retreat-and-shoot", target: "Mage" });
    expect(top(r).actions).toEqual(["Stride away", "Ranged strike (Shortbow)"]);
  });
  it("volleys the caster when nobody is in reach", () => {
    const r = run("archer", { enemies: [e("Tank", 100, { distance: 20 }), e("Mage", 70, { distance: 40, roles: ["caster"] })] });
    expect(top(r)).toMatchObject({ id: "archer-volley", target: "Mage" });
  });
  it("retreat-and-shoot respects its cooldown, so it volleys or strikes instead", () => {
    const r = run("archer", { enemies: party, round: 2, ruleUses: [{ ruleId: "archer-retreat-and-shoot", round: 1 }] });
    expect(top(r).id).not.toBe("archer-retreat-and-shoot");
    expect(r.held.find((h) => h.id === "archer-retreat-and-shoot").reasons[0]).toMatch(/cooldown/);
  });
  it("a creature with no ranged attack has the archer rules held back", () => {
    const engaged = run("archer", { items: MELEE_ONLY, enemies: party });
    expect(engaged.suggestions.map((s) => s.id)).not.toContain("archer-retreat-and-shoot");
    expect(engaged.held.find((h) => h.id === "archer-retreat-and-shoot").reasons.join(" ")).toMatch(/no ranged attack/);
    const distant = run("archer", { items: MELEE_ONLY, enemies: [e("Mage", 70, { distance: 40, roles: ["caster"] })] });
    expect(distant.suggestions.map((s) => s.id)).not.toContain("archer-volley");
    expect(distant.held.find((h) => h.id === "archer-volley").reasons[0]).toMatch(/no ranged attack/);
  });
  it("does not close in to melee (close-in is disabled)", () => {
    const r = run("archer", { enemies: [e("Mage", 70, { distance: 40 })] });
    expect(r.resolved.rules.find((x) => x.id === "close-in")).toMatchObject({ enabled: false });
  });
});

describe("Caster", () => {
  it("keeps its distance when engaged", () => {
    const r = run("caster", { enemies: [e("Tank", 100, { distance: 5, inReach: true })] });
    expect(top(r)).toMatchObject({ id: "caster-keep-distance", hint: "Back off, then cast" });
  });
  it("casts at a squishy target when nobody is in reach", () => {
    const r = run("caster", { enemies: [e("Tank", 10, { distance: 20 }), e("Rogue", 90, { distance: 25, roles: ["squishy"] })] });
    expect(top(r)).toMatchObject({ id: "caster-cast", target: "Rogue" });
  });
  it("replaces the shipped opening rule so round 1 leads with spells, not a melee Strike", () => {
    const opening = run("caster", { enemies: [], round: 1 }).resolved.rules.find((x) => x.id === "opening-signature");
    expect(opening).toMatchObject({ source: "template", do: ["signature", "signature"] });
  });
  it("never punishes the prone in melee", () => {
    const r = run("caster", { enemies: [e("Tank", 50, { conditions: ["prone"], distance: 5, inReach: true })] });
    expect(r.suggestions.map((s) => s.id)).not.toContain("punish-prone");
  });
});

describe("Skittish", () => {
  it("flees when badly hurt", () => {
    const r = run("skittish", { self: { hpPercent: 40 }, enemies: [e("A", 50, { distance: 5, inReach: true })] });
    expect(top(r).id).toBe("skittish-flee");
  });
  it("panics when frightened", () => {
    const r = run("skittish", { self: { conditions: ["frightened"] }, enemies: [e("A", 50, { distance: 5, inReach: true })] });
    expect(top(r).id).toBe("skittish-panic");
  });
  it("never makes a last stand", () => {
    const r = run("skittish", { self: { hpPercent: 10 }, enemies: [e("A", 50, { distance: 5, inReach: true })] });
    expect(r.suggestions.map((s) => s.id)).not.toContain("last-stand");
  });
  it("pokes and runs when healthy but cornered", () => {
    const r = run("skittish", { enemies: [e("A", 50, { distance: 5, inReach: true })] });
    expect(top(r)).toMatchObject({ id: "skittish-poke", target: "A" });
  });
});

describe("formatReport", () => {
  it("renders suggestions, why, held back and warnings as text", () => {
    const r = run("archer", { enemies: [e("Mage", 70, { distance: 40, roles: ["caster"] })], round: 1 });
    const text = formatReport({ name: "Goblin Archer", templateName: "archer", round: 1, suggestions: r.suggestions, held: r.held, warnings: [{ ruleId: "x", message: "heads up" }] });
    expect(text).toContain("Goblin Archer (archer, round 1)");
    expect(text).toContain("Suggests: Volley → Mage");
    expect(text).toContain("Ranged strike (Shortbow)");
    expect(text).toContain("Target: Mage (prefer caster, then lowest HP)");
    expect(text).toContain("Held back:");
    expect(text).toContain("Warnings:");
    expect(text).toContain("x: heads up");
  });
  it("says so when nothing is suggested, and includes notes", () => {
    const text = formatReport({ name: "Rock", templateName: null, round: null, suggestions: [], held: [], warnings: [], notes: ["no token on this scene"] });
    expect(text).toContain("Rock (no template)");
    expect(text).toContain("note: no token on this scene");
    expect(text).toContain("Suggests: nothing");
  });
});
