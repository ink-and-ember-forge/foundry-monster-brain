import { describe, it, expect } from "vitest";
import { STARTER_TEMPLATES, STARTER_TEMPLATE_IDS, STARTER_ALIASES, canonicalTemplateId } from "../scripts/engine/starter-templates.mjs";
import { SYSTEM_LAYER } from "../scripts/engine/default-rules.mjs";
import { resolveProfile } from "../scripts/engine/cascade.mjs";
import { bindSlots } from "../scripts/engine/slots.mjs";
import { validate } from "../scripts/engine/validate.mjs";
import { evaluate } from "../scripts/engine/evaluate.mjs";
import { formatReport } from "../scripts/engine/report.mjs";
import { actionKey } from "../scripts/engine/actions.mjs";
import { isBuiltin } from "../scripts/engine/action-catalog.mjs";

const ITEMS = [
  { id: "claw", label: "Claw", kind: "melee" },
  { id: "bow", label: "Shortbow", kind: "ranged" },
  { id: "spell", label: "Fireball", kind: "other" },
];
const MELEE_ONLY = [ITEMS[0], ITEMS[2]];

const e = (name, hpPercent, extra = {}) => ({ id: name, name, hpPercent, conditions: [], roles: [], distance: 30, inReach: false, ...extra });
const adjacent = (name, hp, extra = {}) => e(name, hp, { distance: 5, inReach: true, ...extra });

/** Resolve system + template + a creature binding `signature`, then evaluate. */
function run(templateId, { items = ITEMS, enemies = [], self = {}, round = 3, turn, ruleUses } = {}) {
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
const ids = (r) => r.suggestions.map((s) => s.id);

describe("the starter set", () => {
  it("is ten fighting styles, named for how they fight", () => {
    expect(STARTER_TEMPLATE_IDS).toEqual(["brawler", "berserker", "duelist", "skirmisher", "ambusher", "sniper", "spellslinger", "hexer", "coward", "swarmer"]);
  });
  it("old role-based ids still resolve to their renamed style", () => {
    expect(STARTER_ALIASES).toEqual({ brute: "brawler", archer: "sniper", caster: "spellslinger", skittish: "coward" });
    expect(canonicalTemplateId("archer")).toBe("sniper");
    expect(canonicalTemplateId("duelist")).toBe("duelist");
    expect(canonicalTemplateId("custom-thing")).toBe("custom-thing");
    for (const target of Object.values(STARTER_ALIASES)) expect(STARTER_TEMPLATES[target]).toBeTruthy();
    for (const old of Object.keys(STARTER_ALIASES)) expect(STARTER_TEMPLATES[old]).toBeUndefined();
  });
  for (const id of STARTER_TEMPLATE_IDS) {
    const t = STARTER_TEMPLATES[id];
    it(`${id}: validates with no warnings when its slots are bound`, () => {
      const resolved = resolveProfile({ system: SYSTEM_LAYER, template: t, creature: { slotBindings: { signature: "spell" } } });
      expect(validate(resolved, bindSlots(resolved.slots, resolved.slotBindings, ITEMS))).toEqual([]);
    });
    it(`${id}: has a name and a description that says what it needs`, () => {
      expect(t.name).toBeTruthy();
      expect(t.description.length).toBeGreaterThan(30);
      expect(t.description).toMatch(/Needs|Bind|bind/);
    });
    it(`${id}: rule ids are prefixed with the template id, and unique across all templates`, () => {
      for (const r of t.rules) if (r.id !== "opening-signature") expect(r.id.startsWith(`${id}-`), r.id).toBe(true);
    });
    it(`${id}: no bundle exceeds three actions or repeats one beyond the default cap of two`, () => {
      for (const rule of t.rules) {
        expect(rule.do.length).toBeLessThanOrEqual(3);
        const counts = {};
        for (const a of rule.do) counts[actionKey(a)] = (counts[actionKey(a)] ?? 0) + 1;
        expect(Math.max(...Object.values(counts)), rule.id).toBeLessThanOrEqual(2);
      }
    });
    it(`${id}: only disables shipped rules that exist`, () => {
      const shipped = new Set(SYSTEM_LAYER.rules.map((r) => r.id));
      for (const d of t.disable ?? []) expect(shipped.has(d), d).toBe(true);
    });
    it(`${id}: the styles stay distinct: no two templates share a rule id`, () => {
      const mine = new Set(t.rules.map((r) => r.id).filter((x) => x !== "opening-signature"));
      for (const other of STARTER_TEMPLATE_IDS.filter((o) => o !== id)) {
        for (const r of STARTER_TEMPLATES[other].rules) expect(mine.has(r.id), r.id).toBe(false);
      }
    });
  }
  it("only the swarmer needs nothing bound; every other style names what to bind or says none is needed", () => {
    const swarm = resolveProfile({ system: SYSTEM_LAYER, template: STARTER_TEMPLATES.swarmer });
    expect(swarm.slots.every((s) => s !== "signature")).toBe(true);
  });
});

/**
 * Play a template for several rounds against a fixed scene, recording the rule it picked each round as "used" (so
 * cooldowns bite). Returns the rule ids: the rhythm of the creature.
 */
function rotation(id, enemies, { rounds = 6, self, items } = {}) {
  const ruleUses = [];
  const seq = [];
  for (let round = 1; round <= rounds; round++) {
    const s = top(run(id, { enemies, round, self, items, ruleUses: [...ruleUses] }));
    seq.push(s?.id ?? null);
    if (s) ruleUses.push({ ruleId: s.id, round });
  }
  return seq;
}
const used = (...pairs) => pairs.map(([ruleId, round]) => ({ ruleId, round }));
const NO_SHIELD = { hasShield: false };

describe("Brawler", () => {
  it("charges the nearest enemy when nobody is in reach", () => {
    const r = run("brawler", { enemies: [e("Far", 10, { distance: 35 }), e("Near", 90, { distance: 15 })], round: 1 });
    expect(top(r)).toMatchObject({ id: "brawler-charge", target: "Near" });
  });
  it("smashes the weakest enemy that is in reach, once its tricks are cooling down", () => {
    const en = [e("FarWeak", 5, { distance: 20 }), adjacent("A", 80), adjacent("B", 40)];
    const r = run("brawler", { enemies: en, round: 3, ruleUses: used(["brawler-grab", 1], ["brawler-trip", 2], ["brawler-power-attack", 2]) });
    expect(top(r)).toMatchObject({ id: "brawler-smash", target: "B" });
  });
  it("rotates tricks and its power attack instead of repeating itself", () => {
    const party = [adjacent("Tank", 100, { roles: ["frontliner"] }), adjacent("Mage", 60, { roles: ["caster"] })];
    expect(rotation("brawler", party)).toEqual([
      "brawler-grab", "brawler-power-attack", "brawler-trip", "brawler-power-attack", "brawler-grab", "brawler-power-attack",
    ]);
  });
  it("grabs the caster, then hits it while it is held", () => {
    const r = run("brawler", { enemies: [adjacent("Tank", 100), adjacent("Mage", 60, { roles: ["caster"] })], round: 1 });
    expect(top(r)).toMatchObject({ id: "brawler-grab", target: "Mage" });
    expect(top(r).slugs).toEqual(["grapple", "melee-strike", "melee-strike"]);
  });
  it("trips the toughest standing enemy, and never one that is already prone", () => {
    const en = [adjacent("Down", 10, { conditions: ["prone"] }), adjacent("Tank", 100, { roles: ["frontliner"] })];
    const r = run("brawler", { enemies: en, round: 1, ruleUses: used(["brawler-grab", 1]) });
    expect(top(r)).toMatchObject({ id: "brawler-trip", target: "Tank" });
    const onlyDown = run("brawler", { enemies: [adjacent("Down", 10, { conditions: ["prone"] })], round: 3, ruleUses: used(["brawler-grab", 1]) });
    expect(ids(onlyDown)).not.toContain("brawler-trip");
  });
  it("braces behind its shield when hurt, and shows the skill modifier for its tricks", () => {
    const hurt = run("brawler", { self: { hpPercent: 40 }, enemies: [adjacent("A", 50)] });
    expect(top(hurt)).toMatchObject({ id: "brawler-brace" });
    expect(top(hurt).slugs).toEqual(["melee-strike", "raise-a-shield"]);
    const trip = run("brawler", { self: { skills: { athletics: 8 } }, enemies: [adjacent("A", 50)], round: 1, ruleUses: used(["brawler-grab", 1]) });
    expect(top(trip).steps[0]).toMatchObject({ slug: "trip", note: "Athletics +8" });
  });
  it("without a shield the brace is held back, and it carries on with its tricks", () => {
    const r = run("brawler", { self: { hpPercent: 40, ...NO_SHIELD }, enemies: [adjacent("A", 50)], round: 1 });
    expect(r.held.find((h) => h.id === "brawler-brace").reasons[0]).toMatch(/needs a shield/);
    expect(top(r).id).toBe("brawler-grab");
  });
});

describe("Berserker", () => {
  const far = [e("Far", 100, { distance: 55 })];
  it("opens with a battle cry as it closes in, once", () => {
    const r = run("berserker", { enemies: far, round: 1 });
    expect(top(r)).toMatchObject({ id: "berserker-battle-cry", hint: "Roar as you charge" });
    expect(top(r).slugs).toEqual(["stride", "demoralize", "stride"]); // Demoralize reaches 30 ft, so it closes first
    expect(ids(run("berserker", { enemies: far, round: 2, ruleUses: used(["berserker-battle-cry", 1]) }))).not.toContain("berserker-battle-cry");
  });
  it("then rampages at anyone within 60 ft, with two Strides", () => {
    const r = run("berserker", { enemies: far, ruleUses: used(["berserker-battle-cry", 1]) });
    expect(top(r)).toMatchObject({ id: "berserker-rampage", target: "Far" });
    expect(top(r).slugs).toEqual(["stride", "stride", "melee-strike"]);
  });
  it("pummels what is in reach when healthy, after its battle cry", () => {
    expect(top(run("berserker", { enemies: [adjacent("A", 50)], ruleUses: used(["berserker-battle-cry", 1]) })).id).toBe("berserker-pummel");
  });
  it("roars at a caster first", () => {
    const r = run("berserker", { enemies: [e("Tank", 100, { distance: 30 }), e("Mage", 60, { distance: 40, roles: ["caster"] })] });
    expect(top(r)).toMatchObject({ id: "berserker-battle-cry", target: "Mage" });
  });
  it("goes into a frenzy when badly hurt, instead of backing off", () => {
    const r = run("berserker", { self: { hpPercent: 30 }, enemies: [adjacent("A", 50)] });
    expect(top(r)).toMatchObject({ id: "berserker-frenzy", hint: "Hurt and furious: all-in" });
    expect(top(r).slugs).toEqual(["melee-strike", "signature", "melee-strike"]);
  });
  it("has no separate last stand (the frenzy covers it)", () => {
    const r = run("berserker", { self: { hpPercent: 10 }, enemies: [adjacent("A", 50)] });
    expect(ids(r)).not.toContain("last-stand");
  });
  it("does not chase beyond 60 ft", () => {
    const r = run("berserker", { enemies: [e("Faraway", 100, { distance: 90 })] });
    expect(ids(r)).not.toContain("berserker-rampage");
    expect(ids(r)).not.toContain("berserker-battle-cry");
  });
});

describe("Duelist", () => {
  it("exploits an off-guard enemy in reach", () => {
    const r = run("duelist", { enemies: [adjacent("Open", 90, { conditions: ["off-guard"] }), adjacent("Guarded", 10)] });
    expect(top(r)).toMatchObject({ id: "duelist-exploit-opening", target: "Open" });
  });
  it("makes its own openings with a real feint, and needs no signature bound", () => {
    const r = run("duelist", { enemies: [adjacent("A", 50)] });
    expect(top(r)).toMatchObject({ id: "duelist-feint" });
    expect(top(r).slugs).toEqual(["feint", "melee-strike"]);
    expect(STARTER_TEMPLATES.duelist.slots).toEqual(["melee-strike"]);
  });
  it("rotates feint, disarm and measured strikes", () => {
    expect(rotation("duelist", [adjacent("Tank", 100, { roles: ["frontliner"] })])).toEqual([
      "duelist-feint", "duelist-disarm", "duelist-feint", "duelist-measured-strikes", "duelist-feint", "duelist-disarm",
    ]);
  });
  it("disarms the best-armed foe", () => {
    const r = run("duelist", { enemies: [adjacent("Mage", 40), adjacent("Fighter", 90, { roles: ["frontliner"] })], round: 2, ruleUses: used(["duelist-feint", 1]) });
    expect(top(r)).toMatchObject({ id: "duelist-disarm", target: "Fighter" });
  });
  it("guards behind a shield when hurt, but only if it has one", () => {
    const hurt = { hpPercent: 50 };
    expect(top(run("duelist", { self: hurt, enemies: [adjacent("A", 50)] })).slugs).toEqual(["melee-strike", "raise-a-shield"]);
    const bare = run("duelist", { self: { ...hurt, ...NO_SHIELD }, enemies: [adjacent("A", 50)] });
    expect(bare.held.find((h) => h.id === "duelist-guard").reasons[0]).toMatch(/needs a shield/);
    expect(top(bare).id).toBe("duelist-feint");
  });
  it("steps in only for foes within 25 ft", () => {
    expect(top(run("duelist", { enemies: [e("Near", 50, { distance: 20 })] })).id).toBe("duelist-step-in");
    const far = run("duelist", { enemies: [e("Far", 50, { distance: 40 })] });
    expect(ids(far)).not.toContain("duelist-step-in");
    expect(far.resolved.rules.find((x) => x.id === "close-in")).toMatchObject({ enabled: false });
  });
});

describe("Skirmisher", () => {
  it("strikes a squishy target in reach and fades", () => {
    const r = run("skirmisher", { enemies: [adjacent("Tank", 100), adjacent("Mage", 90, { roles: ["squishy"] })] });
    expect(top(r)).toMatchObject({ id: "skirmisher-strike-and-fade", target: "Mage", hint: "Back off to at least 10 ft" });
  });
  it("tumbles past the front line to a squishy target from range", () => {
    const r = run("skirmisher", { enemies: [e("Tank", 10, { distance: 30 }), e("Mage", 90, { distance: 40, roles: ["squishy"] })] });
    expect(top(r)).toMatchObject({ id: "skirmisher-tumble", target: "Mage" });
    expect(top(r).slugs[0]).toBe("tumble-through");
  });
  it("rotates tumbling, taunting and plain darting in", () => {
    expect(rotation("skirmisher", [e("Mage", 60, { distance: 30, roles: ["squishy"] })], { rounds: 4 })).toEqual([
      "skirmisher-tumble", "skirmisher-taunt", "skirmisher-tumble", "skirmisher-dart-in",
    ]);
  });
  it("taunts a squishy target within 30 ft, closing in to shout if needed, then darts in", () => {
    const r = run("skirmisher", { enemies: [e("Mage", 60, { distance: 30, roles: ["squishy"] })], ruleUses: used(["skirmisher-tumble", 2]), round: 3 });
    expect(top(r)).toMatchObject({ id: "skirmisher-taunt", target: "Mage" });
    expect(top(r).slugs).toEqual(["demoralize", "stride", "melee-strike"]);
  });
});

describe("Ambusher", () => {
  const prey = [e("Tank", 100, { distance: 40 }), e("Mage", 80, { distance: 30, roles: ["squishy"] })];
  it("opens with its special move on a soft target, once", () => {
    const r = run("ambusher", { enemies: prey, round: 1 });
    expect(top(r)).toMatchObject({ id: "ambusher-opening-strike", target: "Mage", hint: "Strike from hiding if you can" });
    expect(top(r).slugs).toEqual(["stride", "signature", "melee-strike"]);
    const after = run("ambusher", { enemies: prey, round: 2, ruleUses: used(["ambusher-opening-strike", 1]) });
    expect(ids(after)).not.toContain("ambusher-opening-strike");
  });
  it("then creates a diversion to set up its next strike, and stalks while that cools down", () => {
    const after = run("ambusher", { enemies: prey, round: 2, ruleUses: used(["ambusher-opening-strike", 1]) });
    expect(top(after)).toMatchObject({ id: "ambusher-diversion", target: "Mage" });
    expect(top(after).slugs[0]).toBe("create-a-diversion");
    const cooling = run("ambusher", { enemies: prey, round: 3, ruleUses: used(["ambusher-opening-strike", 1], ["ambusher-diversion", 2]) });
    expect(top(cooling).id).toBe("ambusher-stalk");
  });
  it("opens whenever it first acts, even if it joins in a later round", () => {
    expect(top(run("ambusher", { enemies: prey, round: 4 })).id).toBe("ambusher-opening-strike");
  });
  it("then strikes and vanishes when engaged", () => {
    const r = run("ambusher", { enemies: [adjacent("Rogue", 50, { roles: ["squishy"] })], round: 2, ruleUses: used(["ambusher-opening-strike", 1]) });
    expect(top(r)).toMatchObject({ id: "ambusher-strike-and-vanish", target: "Rogue" });
  });
  it("lies in wait while the party is far away, but only for the first two rounds", () => {
    const far = [e("Mage", 60, { distance: 90, roles: ["squishy"] })];
    const wait = run("ambusher", { enemies: far, round: 1 });
    expect(top(wait)).toMatchObject({ id: "ambusher-lie-in-wait" });
    expect(top(wait).slugs).toEqual(["hide", "ready"]);
    expect(top(run("ambusher", { enemies: far, round: 3 })).id).not.toBe("ambusher-lie-in-wait");
    expect(ids(run("ambusher", { enemies: [e("Near", 50, { distance: 40 })], round: 1 }))).not.toContain("ambusher-lie-in-wait");
  });
  it("goes to ground when hurt", () => {
    const r = run("ambusher", { self: { hpPercent: 40 }, enemies: [adjacent("Rogue", 50)], round: 2, ruleUses: used(["ambusher-opening-strike", 1]) });
    expect(top(r)).toMatchObject({ id: "ambusher-lie-low" });
    expect(top(r).slugs).toEqual(["hide", "sneak"]);
  });
});

describe("Sniper", () => {
  const party = [adjacent("Tank", 100), e("Mage", 70, { distance: 40, roles: ["caster"] })];
  it("retreats and shoots the caster when engaged, naming its bow", () => {
    const r = run("sniper", { enemies: party });
    expect(top(r)).toMatchObject({ id: "sniper-retreat-and-shoot", target: "Mage" });
    expect(top(r).actions).toEqual(["Stride away", "Ranged strike (Shortbow)"]);
  });
  it("volleys the caster when nobody is in reach", () => {
    const r = run("sniper", { enemies: [e("Tank", 100, { distance: 20 }), e("Mage", 70, { distance: 40, roles: ["caster"] })] });
    expect(top(r)).toMatchObject({ id: "sniper-volley", target: "Mage" });
  });
  it("respects the retreat cooldown, and sidesteps with a Step instead (no reaction to provoke)", () => {
    const r = run("sniper", { enemies: party, round: 2, ruleUses: used(["sniper-retreat-and-shoot", 1]) });
    expect(r.held.find((h) => h.id === "sniper-retreat-and-shoot").reasons[0]).toMatch(/cooldown/);
    expect(top(r)).toMatchObject({ id: "sniper-sidestep" });
    expect(top(r).slugs).toEqual(["step", "ranged-strike", "ranged-strike"]);
  });
  it("alternates the long retreat and the sidestep while engaged", () => {
    expect(rotation("sniper", [adjacent("Tank", 100)], { rounds: 4 })).toEqual([
      "sniper-retreat-and-shoot", "sniper-sidestep", "sniper-retreat-and-shoot", "sniper-sidestep",
    ]);
  });
  it("shoots first and takes cover last when hurt (cover ends if you attack afterwards)", () => {
    const r = run("sniper", { self: { hpPercent: 40 }, enemies: [e("Mage", 70, { distance: 40, roles: ["caster"] })] });
    expect(top(r)).toMatchObject({ id: "sniper-take-cover", target: "Mage" });
    expect(top(r).slugs).toEqual(["ranged-strike", "ranged-strike", "take-cover"]);
  });
  it("a creature with no ranged attack has the sniper rules held back", () => {
    const engaged = run("sniper", { items: MELEE_ONLY, enemies: party });
    expect(engaged.held.find((h) => h.id === "sniper-retreat-and-shoot").reasons.join(" ")).toMatch(/no ranged attack/);
    expect(engaged.held.find((h) => h.id === "sniper-sidestep").reasons.join(" ")).toMatch(/no ranged attack/);
    const distant = run("sniper", { items: MELEE_ONLY, enemies: [e("Mage", 70, { distance: 40, roles: ["caster"] })] });
    expect(distant.held.find((h) => h.id === "sniper-volley").reasons[0]).toMatch(/no ranged attack/);
  });
});

describe("Spellslinger", () => {
  it("steps out of reach before casting when engaged, since a Step triggers no reaction", () => {
    const r = run("spellslinger", { enemies: [adjacent("Tank", 100)] });
    expect(top(r)).toMatchObject({ id: "spellslinger-keep-distance", hint: "Back off, then cast: a Step triggers no reactions" });
    expect(top(r).slugs).toEqual(["step", "signature", "signature"]);
  });
  it("runs properly when hurt", () => {
    const r = run("spellslinger", { self: { hpPercent: 30 }, enemies: [adjacent("Tank", 100)] });
    expect(top(r)).toMatchObject({ id: "spellslinger-retreat" });
    expect(top(r).slugs).toEqual(["stride-away", "signature"]);
  });
  it("casts at a squishy target when nobody is in reach", () => {
    const r = run("spellslinger", { enemies: [e("Tank", 10, { distance: 20 }), e("Rogue", 90, { distance: 25, roles: ["squishy"] })] });
    expect(top(r)).toMatchObject({ id: "spellslinger-cast", target: "Rogue" });
  });
  it("casts, then ducks behind cover when hurt and nobody is close", () => {
    const r = run("spellslinger", { self: { hpPercent: 40 }, enemies: [e("Rogue", 90, { distance: 25, roles: ["squishy"] })] });
    expect(top(r)).toMatchObject({ id: "spellslinger-duck" });
    expect(top(r).slugs).toEqual(["signature", "signature", "take-cover"]);
  });
  it("leads with spells in round 1 and never punishes the prone in melee", () => {
    const opening = run("spellslinger", { round: 1 }).resolved.rules.find((x) => x.id === "opening-signature");
    expect(opening).toMatchObject({ source: "template", do: ["signature", "signature"] });
    const r = run("spellslinger", { enemies: [adjacent("Tank", 50, { conditions: ["prone"] })] });
    expect(ids(r)).not.toContain("punish-prone");
  });
});

describe("Hexer", () => {
  it("debuffs the toughest enemy who is not already afflicted", () => {
    const r = run("hexer", { enemies: [e("Squishy", 30), e("Tank", 100, { roles: ["frontliner"] })] });
    expect(top(r)).toMatchObject({ id: "hexer-hex", target: "Tank" });
  });
  it("skips enemies who are already afflicted", () => {
    const r = run("hexer", { enemies: [e("Afflicted", 100, { conditions: ["frightened"] }), e("Fresh", 20)] });
    expect(top(r)).toMatchObject({ id: "hexer-hex", target: "Fresh" });
  });
  it("moves on once everyone is afflicted", () => {
    const r = run("hexer", { enemies: [e("A", 100, { conditions: ["frightened"] })] });
    expect(ids(r)).not.toContain("hexer-hex");
    expect(r.held.find((h) => h.id === "hexer-hex").reasons[0]).toMatch(/no enemy matches/);
    expect(top(r).id).toBe("hexer-harass");
  });
  it("steps back when engaged, once per turn", () => {
    const afflicted = adjacent("A", 100, { conditions: ["frightened"] });
    const r = run("hexer", { enemies: [afflicted] });
    expect(top(r).id).toBe("hexer-keep-away");
    expect(top(r).slugs).toEqual(["step", "signature"]);
  });
  it("hexes, then takes cover when hurt and nobody is close", () => {
    const r = run("hexer", { self: { hpPercent: 40 }, enemies: [e("A", 100, { conditions: ["frightened"], distance: 40 })] });
    expect(top(r)).toMatchObject({ id: "hexer-duck" });
    expect(top(r).slugs).toEqual(["signature", "take-cover"]);
  });
});

describe("Coward", () => {
  it("slips away behind a diversion the first time it is badly hurt", () => {
    const r = run("coward", { self: { hpPercent: 40 }, enemies: [adjacent("A", 50)] });
    expect(top(r)).toMatchObject({ id: "coward-slip-away" });
    expect(top(r).slugs).toEqual(["create-a-diversion", "sneak"]);
  });
  it("flees when badly hurt, once the slip-away has been tried", () => {
    const r = run("coward", { self: { hpPercent: 40 }, enemies: [adjacent("A", 50)], ruleUses: used(["coward-slip-away", 1]) });
    expect(top(r).id).toBe("coward-flee");
    expect(rotation("coward", [adjacent("A", 50)], { rounds: 3, self: { hpPercent: 30 } })).toEqual(["coward-slip-away", "coward-flee", "coward-flee"]);
  });
  it("panics when frightened", () => {
    expect(top(run("coward", { self: { conditions: ["frightened"] }, enemies: [adjacent("A", 50)] })).id).toBe("coward-panic");
  });
  it("never makes a last stand", () => {
    expect(ids(run("coward", { self: { hpPercent: 10 }, enemies: [adjacent("A", 50)] }))).not.toContain("last-stand");
  });
  it("pokes and runs when healthy but cornered", () => {
    expect(top(run("coward", { enemies: [adjacent("A", 50)] }))).toMatchObject({ id: "coward-poke", target: "A" });
  });
});

describe("Swarmer: goons that fight like a pack", () => {
  const MELEE = { items: [ITEMS[0]] };
  const pack = (over = {}) => run("swarmer", { ...MELEE, ...over });

  it("rotates tricks and plain bites instead of Stride, Strike, Strike every round", () => {
    expect(rotation("swarmer", [adjacent("Mira", 80)], MELEE)).toEqual([
      "swarmer-trip", "swarmer-grab", "swarmer-trip", "swarmer-bite", "swarmer-trip", "swarmer-grab",
    ]);
  });
  it("trips, then follows with a Strike", () => {
    expect(top(pack({ enemies: [adjacent("Mira", 80)] })).slugs).toEqual(["trip", "melee-strike"]);
  });
  it("tricks set each other up: the next goon piles onto whoever is down", () => {
    const down = pack({ enemies: [adjacent("Mira", 80, { conditions: ["prone"] })] });
    expect(top(down)).toMatchObject({ id: "swarmer-pile-on", hint: "A prone target is off-guard: everyone swings at it" });
    expect(top(down).slugs).toEqual(["melee-strike", "melee-strike"]);
  });
  it("...or whoever is held", () => {
    const held = pack({ enemies: [adjacent("Mira", 80, { conditions: ["grabbed"] })] });
    expect(top(held)).toMatchObject({ id: "swarmer-pin-down" });
  });
  it("never trips someone already down or grabs someone already held", () => {
    const prone = pack({ enemies: [adjacent("Mira", 80, { conditions: ["prone"] })], round: 3 });
    expect(ids(prone)).not.toContain("swarmer-trip");
    const grabbed = pack({ enemies: [adjacent("Mira", 80, { conditions: ["grabbed"] })], round: 3, ruleUses: used(["swarmer-trip", 2]) });
    expect(ids(grabbed)).not.toContain("swarmer-grab");
  });
  it("picks on a downed enemy even if a healthier one is nearer, because it is in reach", () => {
    const r = pack({ enemies: [adjacent("Near", 100), adjacent("Down", 100, { conditions: ["prone"], distance: 10 })] });
    expect(top(r)).toMatchObject({ id: "swarmer-pile-on", target: "Down" });
  });
  it("grabs a caster in reach in preference to the nearest", () => {
    const r = pack({ enemies: [adjacent("Near", 50), adjacent("Mage", 50, { roles: ["caster"] })], ruleUses: used(["swarmer-trip", 1]), round: 2 });
    expect(top(r)).toMatchObject({ id: "swarmer-grab", target: "Mage" });
  });
  it("jeers at a soft target within 30 ft on its way in, then just rushes", () => {
    const r = pack({ enemies: [e("Mira", 80, { distance: 25 })] });
    expect(top(r)).toMatchObject({ id: "swarmer-jeer", target: "Mira" });
    expect(top(r).slugs).toEqual(["demoralize", "stride", "melee-strike"]);
    const after = pack({ enemies: [e("Mira", 80, { distance: 25 })], round: 2, ruleUses: used(["swarmer-jeer", 1]) });
    expect(top(after).id).toBe("swarmer-rush");
  });
  it("rushes the nearest enemy, ignoring roles and HP, once it has jeered", () => {
    const en = [e("Weak", 5, { distance: 50 }), e("Close", 100, { distance: 20, roles: ["frontliner"] })];
    const r = pack({ enemies: en, round: 2, ruleUses: used(["swarmer-jeer", 1]) });
    expect(top(r)).toMatchObject({ id: "swarmer-rush", target: "Close" });
  });
  it("bites the nearest enemy in reach when its tricks are cooling down", () => {
    const r = pack({ enemies: [adjacent("Far", 10, { distance: 10 }), adjacent("Near", 90)], round: 4, ruleUses: used(["swarmer-trip", 3], ["swarmer-grab", 2]) });
    expect(top(r)).toMatchObject({ id: "swarmer-bite", target: "Near" });
  });
  it("when hurt, steps back to Aid an ally, alternating with its tricks", () => {
    const hurt = { hpPercent: 30 };
    const r = pack({ self: hurt, enemies: [adjacent("Mira", 80)] });
    expect(top(r)).toMatchObject({ id: "swarmer-back-up" });
    expect(top(r).slugs).toEqual(["step", "aid"]);
    expect(rotation("swarmer", [adjacent("Mira", 80)], { ...MELEE, rounds: 4, self: hurt })).toEqual(["swarmer-back-up", "swarmer-trip", "swarmer-back-up", "swarmer-trip"]);
  });
  it("needs nothing bound beyond a melee attack: no warnings, no special moves, no last stand", () => {
    const resolved = resolveProfile({ system: SYSTEM_LAYER, template: STARTER_TEMPLATES.swarmer });
    const binding = bindSlots(resolved.slots, resolved.slotBindings, [ITEMS[0]]);
    expect(validate(resolved, binding)).toEqual([]);
    expect(resolved.slots).toEqual(["melee-strike"]);
    const hurt = pack({ self: { hpPercent: 5 }, enemies: [adjacent("A", 50, { conditions: ["prone"] })] });
    expect(top(hurt).id).toBe("swarmer-pile-on");
    expect(ids(hurt)).not.toContain("last-stand");
    expect(ids(hurt)).not.toContain("punish-prone");
  });
});

describe("shipped defaults that every creature gets", () => {
  const plain = (enemies, self = {}, round = 3) => {
    const resolved = resolveProfile({ system: SYSTEM_LAYER });
    const binding = bindSlots(resolved.slots, resolved.slotBindings, ITEMS);
    const ctx = { round, self: { name: "M", hpPercent: 100, conditions: [], speed: 25, reach: 5, ...self }, enemies, slots: { bound: binding.bound, unbound: binding.unbound } };
    return evaluate(resolved.rules, ctx, { policies: resolved.policies, max: 3 });
  };
  it("a grabbed creature breaks free before anything else, whatever its template", () => {
    for (const id of STARTER_TEMPLATE_IDS) {
      const r = run(id, { self: { conditions: ["grabbed"] }, enemies: [adjacent("A", 50)] });
      expect(top(r), id).toMatchObject({ id: "break-free-grabbed", slugs: ["escape"] });
    }
  });
  it("a restrained creature does the same", () => {
    expect(top(run("brawler", { self: { conditions: ["restrained"] }, enemies: [adjacent("A", 50)] }))).toMatchObject({ id: "break-free-restrained", slugs: ["escape"] });
  });
  it("after the Escape is done, the rest of the turn goes to the next rule, and it may move", () => {
    const taken = [{ key: "escape", slug: "escape", source: "suggestion" }];
    const r = run("coward", { self: { conditions: ["grabbed"], hpPercent: 30 }, enemies: [adjacent("A", 50)], turn: { remaining: 2, taken } });
    expect(top(r).id).toBe("coward-slip-away");
    expect(r.held.find((h) => h.id === "break-free-grabbed").reasons).toContain("already done this turn");
  });
  it("the break-free rules can be switched off by a template or creature", () => {
    const resolved = resolveProfile({ system: SYSTEM_LAYER, template: { disable: ["break-free-grabbed"] } });
    expect(resolved.rules.find((x) => x.id === "break-free-grabbed")).toMatchObject({ enabled: false });
  });
  it("an enemy that has gone hidden is looked for, when nothing nearer needs doing", () => {
    const r = plain([e("Ghost", 80, { distance: 120, conditions: ["hidden"] })]);
    expect(ids(r)).toContain("seek-the-hidden");
    expect(r.suggestions.find((x) => x.id === "seek-the-hidden").slugs).toEqual(["seek"]);
  });
  it("does not look for anyone who is not hidden", () => {
    expect(ids(plain([e("Ghost", 80, { distance: 120 })]))).not.toContain("seek-the-hidden");
  });
});

describe("the built-in actions in the starter set", () => {
  const slotsOrBuiltin = new Set(["melee-strike", "ranged-strike", "signature"]);
  const everyAction = STARTER_TEMPLATE_IDS.flatMap((id) => STARTER_TEMPLATES[id].rules.flatMap((r) => r.do));
  it("only uses actions the module knows: a built-in, a Strike or the signature", () => {
    for (const slug of everyAction) expect(isBuiltin(slug) || slotsOrBuiltin.has(slug), slug).toBe(true);
  });
  it("covers each flavour of goon behaviour: tricks, nerve, self-preservation and teamwork", () => {
    const set = new Set(everyAction);
    for (const slug of ["trip", "grapple", "disarm"]) expect(set.has(slug), `dirty trick ${slug}`).toBe(true);
    for (const slug of ["demoralize", "feint", "create-a-diversion"]) expect(set.has(slug), `nerve ${slug}`).toBe(true);
    for (const slug of ["raise-a-shield", "take-cover", "step", "hide", "sneak", "tumble-through"]) expect(set.has(slug), `defence ${slug}`).toBe(true);
    for (const slug of ["aid", "ready"]) expect(set.has(slug), `teamwork ${slug}`).toBe(true);
  });
  it("the shipped defaults use Escape and Seek", () => {
    const defaults = SYSTEM_LAYER.rules.flatMap((r) => r.do);
    expect(defaults).toEqual(expect.arrayContaining(["escape", "seek"]));
  });
  it("no template relies on a built-in action for a slot: the editor never asks to bind one", () => {
    for (const id of STARTER_TEMPLATE_IDS) {
      const resolved = resolveProfile({ system: SYSTEM_LAYER, template: STARTER_TEMPLATES[id] });
      for (const slot of resolved.slots) expect(isBuiltin(slot), `${id}: ${slot}`).toBe(false);
    }
  });
  it("a cover action always comes after the attacks it follows, since cover ends when you attack", () => {
    for (const id of STARTER_TEMPLATE_IDS) {
      for (const rule of STARTER_TEMPLATES[id].rules) {
        const at = rule.do.indexOf("take-cover");
        if (at >= 0) expect(rule.do.slice(at + 1), `${rule.id}: nothing follows Take cover`).toEqual([]);
      }
    }
  });
});

describe("every template always has something to suggest, and always names a target", () => {
  const scenes = {
    "one enemy far off": [e("A", 50, { distance: 90 })],
    "one enemy adjacent": [adjacent("A", 50)],
    "a crowd": [adjacent("A", 50), e("B", 20, { distance: 30, roles: ["caster"] }), e("C", 90, { distance: 70, conditions: ["prone"] })],
  };
  for (const id of STARTER_TEMPLATE_IDS) {
    for (const [name, enemies] of Object.entries(scenes)) {
      for (const self of [{}, { hpPercent: 10 }, { conditions: ["frightened"] }]) {
        for (const round of [1, 3]) {
          it(`${id}: ${name}, round ${round}, ${JSON.stringify(self)}`, () => {
            const r = run(id, { enemies, round, self });
            expect(r.suggestions.length, JSON.stringify(r.held)).toBeGreaterThan(0);
            for (const s of r.suggestions) {
              expect(typeof s.target, `${s.id} has no target`).toBe("string");
              expect(s.targetWhy, s.id).toBeTruthy();
            }
          });
        }
      }
    }
    it(`${id}: with nobody to target, nothing is suggested (and each rule says why)`, () => {
      const r = run(id, { enemies: [], round: 2 });
      expect(r.suggestions).toEqual([]);
      expect(r.held.filter((h) => h.reasons.includes("no valid target")).length).toBeGreaterThan(0);
    });
  }
});

describe("rules declare their own target rather than leaning on the default", () => {
  it("every shipped default rule has an explicit target", () => {
    for (const rule of SYSTEM_LAYER.rules) expect(rule.target?.length, rule.id).toBeGreaterThan(0);
  });
  for (const id of STARTER_TEMPLATE_IDS) {
    it(`${id}: every rule has an explicit target`, () => {
      for (const rule of STARTER_TEMPLATES[id].rules) expect(rule.target?.length, rule.id).toBeGreaterThan(0);
    });
  }
});

describe("formatReport", () => {
  it("renders suggestions, why, held back and warnings as text", () => {
    const r = run("sniper", { enemies: [e("Mage", 70, { distance: 40, roles: ["caster"] })], round: 1 });
    const text = formatReport({ name: "Goblin Archer", templateName: "sniper", round: 1, suggestions: r.suggestions, held: r.held, warnings: [{ ruleId: "x", message: "heads up" }] });
    expect(text).toContain("Goblin Archer (sniper, round 1)");
    expect(text).toContain("Suggests: Volley → Mage");
    expect(text).toContain("Ranged strike (Shortbow)");
    expect(text).toContain("Target: Mage (prefer caster, then lowest HP)");
    expect(text).toContain("Held back:");
    expect(text).toContain("Warnings:");
  });
  it("says so when nothing is suggested, and includes notes", () => {
    const text = formatReport({ name: "Rock", templateName: null, round: null, suggestions: [], held: [], warnings: [], notes: ["no token on this scene"] });
    expect(text).toContain("Rock (no template)");
    expect(text).toContain("note: no token on this scene");
    expect(text).toContain("Suggests: nothing");
  });
});
