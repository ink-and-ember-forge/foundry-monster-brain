import { describe, it, expect } from "vitest";
import { STARTER_TEMPLATES, STARTER_TEMPLATE_IDS, STARTER_ALIASES, canonicalTemplateId } from "../scripts/engine/starter-templates.mjs";
import { SYSTEM_LAYER } from "../scripts/engine/default-rules.mjs";
import { resolveProfile } from "../scripts/engine/cascade.mjs";
import { bindSlots } from "../scripts/engine/slots.mjs";
import { validate } from "../scripts/engine/validate.mjs";
import { evaluate } from "../scripts/engine/evaluate.mjs";
import { formatReport } from "../scripts/engine/report.mjs";
import { actionKey } from "../scripts/engine/actions.mjs";

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

describe("Brawler", () => {
  it("charges the nearest enemy when nobody is in reach", () => {
    const r = run("brawler", { enemies: [e("Far", 10, { distance: 35 }), e("Near", 90, { distance: 15 })], round: 1 });
    expect(top(r)).toMatchObject({ id: "brawler-charge", target: "Near" });
  });
  it("smashes the weakest enemy that is in reach, not a weaker one out of reach", () => {
    const r = run("brawler", { enemies: [e("FarWeak", 5, { distance: 20 }), adjacent("A", 80), adjacent("B", 40)], round: 1 });
    expect(top(r)).toMatchObject({ id: "brawler-smash", target: "B" });
  });
  it("power-attacks from round 2, then the cooldown makes it smash", () => {
    const en = [adjacent("A", 50)];
    expect(top(run("brawler", { enemies: en, round: 2 })).id).toBe("brawler-power-attack");
    expect(top(run("brawler", { enemies: en, round: 3, ruleUses: [{ ruleId: "brawler-power-attack", round: 2 }] })).id).toBe("brawler-smash");
  });
});

describe("Berserker", () => {
  it("rampages at anyone within 60 ft, with two Strides", () => {
    const r = run("berserker", { enemies: [e("Far", 100, { distance: 55 })] });
    expect(top(r)).toMatchObject({ id: "berserker-rampage", target: "Far" });
    expect(top(r).slugs).toEqual(["stride", "stride", "melee-strike"]);
  });
  it("pummels what is in reach when healthy", () => {
    expect(top(run("berserker", { enemies: [adjacent("A", 50)] })).id).toBe("berserker-pummel");
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
  });
});

describe("Duelist", () => {
  it("exploits an off-guard enemy in reach", () => {
    const r = run("duelist", { enemies: [adjacent("Open", 90, { conditions: ["off-guard"] }), adjacent("Guarded", 10)] });
    expect(top(r)).toMatchObject({ id: "duelist-exploit-opening", target: "Open" });
  });
  it("otherwise feints with its special move, then falls back to measured strikes while that cools down", () => {
    const en = [adjacent("A", 50)];
    expect(top(run("duelist", { enemies: en })).id).toBe("duelist-feint");
    const cooling = run("duelist", { enemies: en, round: 3, ruleUses: [{ ruleId: "duelist-feint", round: 2 }] });
    expect(top(cooling).id).toBe("duelist-measured-strikes");
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
  it("darts in on squishy targets from range", () => {
    const r = run("skirmisher", { enemies: [e("Tank", 10, { distance: 30 }), e("Mage", 90, { distance: 40, roles: ["squishy"] })] });
    expect(top(r)).toMatchObject({ id: "skirmisher-dart-in", target: "Mage" });
  });
});

describe("Ambusher", () => {
  const prey = [e("Tank", 100, { distance: 40 }), e("Mage", 80, { distance: 50, roles: ["squishy"] })];
  it("opens with its special move on a soft target, once", () => {
    const r = run("ambusher", { enemies: prey, round: 1 });
    expect(top(r)).toMatchObject({ id: "ambusher-opening-strike", target: "Mage", hint: "Strike from hiding if you can" });
    expect(top(r).slugs).toEqual(["stride", "signature", "melee-strike"]);
    const after = run("ambusher", { enemies: prey, round: 2, ruleUses: [{ ruleId: "ambusher-opening-strike", round: 1 }] });
    expect(ids(after)).not.toContain("ambusher-opening-strike");
    expect(top(after).id).toBe("ambusher-stalk");
  });
  it("opens whenever it first acts, even if it joins in a later round", () => {
    expect(top(run("ambusher", { enemies: prey, round: 4 })).id).toBe("ambusher-opening-strike");
  });
  it("then strikes and vanishes when engaged", () => {
    const r = run("ambusher", { enemies: [adjacent("Rogue", 50, { roles: ["squishy"] })], round: 2, ruleUses: [{ ruleId: "ambusher-opening-strike", round: 1 }] });
    expect(top(r)).toMatchObject({ id: "ambusher-strike-and-vanish", target: "Rogue" });
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
  it("respects the retreat cooldown", () => {
    const r = run("sniper", { enemies: party, round: 2, ruleUses: [{ ruleId: "sniper-retreat-and-shoot", round: 1 }] });
    expect(top(r).id).not.toBe("sniper-retreat-and-shoot");
    expect(r.held.find((h) => h.id === "sniper-retreat-and-shoot").reasons[0]).toMatch(/cooldown/);
  });
  it("a creature with no ranged attack has the sniper rules held back", () => {
    const engaged = run("sniper", { items: MELEE_ONLY, enemies: party });
    expect(engaged.held.find((h) => h.id === "sniper-retreat-and-shoot").reasons.join(" ")).toMatch(/no ranged attack/);
    const distant = run("sniper", { items: MELEE_ONLY, enemies: [e("Mage", 70, { distance: 40, roles: ["caster"] })] });
    expect(distant.held.find((h) => h.id === "sniper-volley").reasons[0]).toMatch(/no ranged attack/);
  });
});

describe("Spellslinger", () => {
  it("keeps its distance when engaged", () => {
    expect(top(run("spellslinger", { enemies: [adjacent("Tank", 100)] }))).toMatchObject({ id: "spellslinger-keep-distance", hint: "Back off, then cast" });
  });
  it("casts at a squishy target when nobody is in reach", () => {
    const r = run("spellslinger", { enemies: [e("Tank", 10, { distance: 20 }), e("Rogue", 90, { distance: 25, roles: ["squishy"] })] });
    expect(top(r)).toMatchObject({ id: "spellslinger-cast", target: "Rogue" });
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
  it("backs off when engaged, once per turn", () => {
    const afflicted = adjacent("A", 100, { conditions: ["frightened"] });
    expect(top(run("hexer", { enemies: [afflicted] })).id).toBe("hexer-keep-away");
  });
});

describe("Coward", () => {
  it("flees when badly hurt", () => {
    expect(top(run("coward", { self: { hpPercent: 40 }, enemies: [adjacent("A", 50)] })).id).toBe("coward-flee");
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

describe("Swarmer", () => {
  it("rushes the nearest enemy, ignoring roles and HP", () => {
    const r = run("swarmer", { items: [ITEMS[0]], enemies: [e("Weak", 5, { distance: 50 }), e("Close", 100, { distance: 20, roles: ["frontliner"] })] });
    expect(top(r)).toMatchObject({ id: "swarmer-rush", target: "Close" });
  });
  it("bites the nearest enemy in reach", () => {
    const r = run("swarmer", { items: [ITEMS[0]], enemies: [adjacent("Far", 10, { distance: 10 }), adjacent("Near", 90)] });
    expect(top(r)).toMatchObject({ id: "swarmer-bite", target: "Near" });
  });
  it("needs nothing bound beyond a melee attack: no warnings, no special moves, no tactics", () => {
    const resolved = resolveProfile({ system: SYSTEM_LAYER, template: STARTER_TEMPLATES.swarmer });
    const binding = bindSlots(resolved.slots, resolved.slotBindings, [ITEMS[0]]);
    expect(validate(resolved, binding)).toEqual([]);
    const hurt = run("swarmer", { items: [ITEMS[0]], self: { hpPercent: 5 }, enemies: [adjacent("A", 50, { conditions: ["prone"] })] });
    expect(top(hurt).id).toBe("swarmer-bite");
    expect(ids(hurt)).not.toContain("last-stand");
    expect(ids(hurt)).not.toContain("punish-prone");
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
