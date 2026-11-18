import { describe, it, expect } from "vitest";
import {
  ACTIONS,
  ACTION_GROUPS,
  SLOT_INFO,
  BUILTIN_SLUGS,
  actionInfo,
  actionCost,
  actionTooltip,
  turnCost,
  skillNote,
  isBuiltin,
} from "../scripts/engine/action-catalog.mjs";
import { actionKey, actionLabel, manualActionGroups, MANUAL_ACTION_KEYS } from "../scripts/engine/actions.mjs";
import { planBundle, requirementFor } from "../scripts/engine/world.mjs";
import { evaluate } from "../scripts/engine/evaluate.mjs";
import { classifyContext } from "../scripts/engine/detect.mjs";
import { resolveProfile } from "../scripts/engine/cascade.mjs";
import { selfStats } from "../scripts/adapter.mjs";
import { remainingBundle } from "../scripts/engine/taken.mjs";

const plan = (bundle, { distance = 5, self = {}, taken = [], remaining = 3, name = "Mira" } = {}) =>
  planBundle({ bundle, ctx: { self: { speed: 25, reach: 5, conditions: [], ...self }, turn: { taken } }, target: { name, distance }, remaining });
const slugs = (p) => p.slugs;

describe("the catalog", () => {
  it("covers the combat set the GM asked for", () => {
    const wanted = [
      "step", "escape", "raise-a-shield", "take-cover", "drop-prone", "crawl", "leap", "seek", "ready", "aid", "point-out", "interact",
      "trip", "grapple", "shove", "reposition", "disarm", "demoralize", "feint", "create-a-diversion", "hide", "sneak", "tumble-through",
      "stride", "stride-away", "stand",
    ];
    for (const slug of wanted) expect(isBuiltin(slug), slug).toBe(true);
  });
  it("every entry is complete: label, a known group, a cost, a tooltip summary and a PF2e compendium name", () => {
    const groups = new Set(ACTION_GROUPS.map(([id]) => id));
    for (const [slug, a] of Object.entries(ACTIONS)) {
      expect(a.label, slug).toBeTruthy();
      expect(groups.has(a.group), `${slug} group`).toBe(true);
      expect(Number.isInteger(a.cost) && a.cost >= 1, `${slug} cost`).toBe(true);
      expect(a.summary.length, `${slug} summary`).toBeGreaterThan(15);
      expect(a.compendium, `${slug} compendium`).toBeTruthy();
      expect(["melee", "within", "move-toward", "move-away", "step", "stand", "drop-prone", "free"], slug).toContain(a.use.kind);
    }
  });
  it("slugs are PF2e's own, lower-case and hyphenated, so a rolled action is recognised as the same action", () => {
    for (const slug of BUILTIN_SLUGS) expect(slug).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });
  it("no built-in is also a slot that needs binding", () => {
    for (const slot of ["melee-strike", "ranged-strike", "signature", "spell", "other"]) expect(isBuiltin(slot), slot).toBe(false);
  });
  it("strike slots still have rules text to look up", () => {
    expect(SLOT_INFO["melee-strike"].compendium).toBe("Strike");
    expect(actionInfo("ranged-strike").summary).toBeTruthy();
    expect(actionInfo("signature")).toBeNull();
  });
  it("costs: Ready is two actions, everything else one, and anything unknown is one", () => {
    expect(actionCost("ready")).toBe(2);
    expect(actionCost("trip")).toBe(1);
    expect(actionCost("signature")).toBe(1);
    expect(actionCost("a-custom-slot")).toBe(1);
  });
  it("the tooltip names the cost, the rule in one line and what it needs", () => {
    const t = actionTooltip("trip");
    expect(t).toMatch(/^Trip \(1 action\)\n/);
    expect(t).toMatch(/Athletics vs Reflex DC/);
    expect(t).toMatch(/Needs: a free hand/);
    expect(actionTooltip("ready")).toMatch(/\(2 actions\)/);
    expect(actionTooltip("signature")).toBeNull();
  });
  it("labels come from the catalog, including for slots", () => {
    expect(actionLabel("create-a-diversion")).toBe("Create a diversion");
    expect(actionLabel("melee-strike")).toBe("Melee strike");
    expect(actionLabel("signature")).toBe("Signature action");
    expect(actionLabel("flaming-arrow")).toBe("Flaming arrow");
  });
});

describe("tracking vocabulary", () => {
  it("Step, Leap and Crawl are movement for tracking, so a token drag merges with them", () => {
    for (const slug of ["step", "leap", "crawl", "stride-away"]) expect(actionKey(slug)).toBe("stride");
    expect(actionKey("trip")).toBe("trip");
    expect(actionKey("sneak")).toBe("sneak");
  });
  it("the correction menu offers every catalog action, in groups", () => {
    const groups = manualActionGroups();
    expect(groups[0]).toMatchObject({ label: "Attacks" });
    expect(groups.map((g) => g.label)).toEqual(expect.arrayContaining(["Dirty tricks", "Morale and nerve", "Defence"]));
    for (const slug of BUILTIN_SLUGS) expect(MANUAL_ACTION_KEYS, slug).toContain(slug);
    expect(MANUAL_ACTION_KEYS).toContain("melee-strike");
  });
  it("a turn's spent actions are counted by cost: Ready is two", () => {
    expect(turnCost([{ key: "melee-strike" }, { key: "ready", slug: "ready" }])).toBe(3);
    expect(turnCost([])).toBe(0);
    expect(turnCost([{ key: "stride", slug: "step" }])).toBe(1);
  });
  it("a recorded Step counts toward a Step in the plan, not toward a Stride", () => {
    expect(remainingBundle(["step", "melee-strike"], [{ key: "stride", slug: "step" }])).toEqual(["melee-strike"]);
    expect(remainingBundle(["stride", "melee-strike"], [{ key: "stride", slug: "step" }])).toEqual(["stride", "melee-strike"]);
  });
  it("the modifier note names the best candidate and its sign", () => {
    expect(skillNote("trip", { athletics: 7 })).toBe("Athletics +7");
    expect(skillNote("escape", { athletics: 3, acrobatics: 9 })).toBe("Acrobatics +9");
    expect(skillNote("demoralize", { intimidation: -1 })).toBe("Intimidation −1");
    expect(skillNote("trip", {})).toBe("");
    expect(skillNote("signature", { athletics: 5 })).toBe("");
  });
});

describe("planning the new actions", () => {
  it("a trick needs the target within reach: it adds the Stride it needs", () => {
    const p = plan(["trip", "melee-strike"], { distance: 20 });
    expect(slugs(p)).toEqual(["stride", "trip", "melee-strike"]);
    expect(p.adjustments[0]).toMatch(/Trip needs 5 ft/);
    // Too far to trip this turn: it closes as far as it can and says why, rather than promising a Trip it can't make.
    const far = plan(["trip"], { distance: 60 });
    expect(slugs(far)).toEqual(["stride", "stride", "stride"]);
    expect(far.adjustments[0]).toMatch(/no action left to act with this turn/);
  });
  it("a trick with the target adjacent needs nothing added", () => {
    expect(slugs(plan(["trip", "melee-strike", "melee-strike"]))).toEqual(["trip", "melee-strike", "melee-strike"]);
  });
  it("uses the creature's own reach, so a long-reach goon can trip from 10 ft", () => {
    expect(slugs(plan(["trip"], { distance: 10, self: { reach: 10 } }))).toEqual(["trip"]);
    expect(slugs(plan(["trip"], { distance: 10, self: { reach: 5 } }))).toEqual(["stride", "trip"]);
  });
  it("Demoralize reaches 30 ft, so it needs no Stride at 25 ft but one at 40 ft", () => {
    expect(slugs(plan(["demoralize", "melee-strike"], { distance: 25 }))).toEqual(["demoralize", "stride", "melee-strike"]);
    expect(slugs(plan(["demoralize"], { distance: 25 }))).toEqual(["demoralize"]);
    expect(slugs(plan(["demoralize"], { distance: 40 }))).toEqual(["stride", "demoralize"]);
  });
  it("Escape is skipped when nothing holds the creature, and said so", () => {
    const p = plan(["escape", "melee-strike"]);
    expect(slugs(p)).toEqual(["melee-strike"]);
    expect(p.adjustments[0]).toBe("Skipped Escape: not grabbed, immobilized or restrained");
  });
  it("Escape is planned when grabbed, and a move after it assumes it worked", () => {
    const p = plan(["escape", "stride-away"], { self: { conditions: ["grabbed"] } });
    expect(p.ok).toBe(true);
    expect(slugs(p)).toEqual(["escape", "stride-away"]);
    expect(p.adjustments).toContain("Moving after Escape assumes the Escape works");
  });
  it("a grabbed creature still cannot Stride without an Escape first", () => {
    const p = plan(["stride-away"], { self: { conditions: ["grabbed"] } });
    expect(p.ok).toBe(false);
    expect(p.reason).toMatch(/grabbed/);
  });
  it("paralysis is never assumed away by an Escape", () => {
    expect(plan(["escape", "stride-away"], { self: { conditions: ["paralyzed"] } }).ok).toBe(false);
  });
  it("an Escape already made this turn lets the creature move", () => {
    const p = plan(["stride-away"], { self: { conditions: ["grabbed"] }, taken: [{ key: "escape", slug: "escape", source: "suggestion" }] });
    expect(p.ok).toBe(true);
  });
  it("Step opens 5 ft, and a melee Strike after it is dropped, like after a Stride away", () => {
    const p = plan(["step", "melee-strike"]);
    expect(slugs(p)).toEqual(["step"]);
    expect(p.finalDistance).toBe(10);
    expect(p.adjustments[0]).toMatch(/Dropped Melee strike and the rest/);
  });
  it("Step then a ranged Strike is a real plan", () => {
    const p = plan(["step", "ranged-strike", "ranged-strike"]);
    expect(slugs(p)).toEqual(["step", "ranged-strike", "ranged-strike"]);
  });
  it("Step needs Speed 10 ft", () => {
    const p = plan(["step"], { self: { speed: 5 } });
    expect(p.ok).toBe(false);
    expect(p.reason).toMatch(/Speed is under 10 ft/);
  });
  it("a prone creature gets a Stand up added before a Step", () => {
    expect(slugs(plan(["step"], { self: { conditions: ["prone"] } }))).toEqual(["stand", "step"]);
  });
  it("Drop prone is skipped if already prone; otherwise a later move gets a Stand up", () => {
    expect(plan(["drop-prone"], { self: { conditions: ["prone"] } }).reason).toBe("nothing to do: skipped Drop prone: already prone");
    expect(slugs(plan(["drop-prone", "ranged-strike"]))).toEqual(["drop-prone", "ranged-strike"]);
    expect(slugs(plan(["drop-prone", "stride-away"]))).toEqual(["drop-prone", "stand", "stride-away"]);
  });
  it("Drop prone recorded this turn makes the creature prone for the rest of the plan", () => {
    const p = plan(["stride-away"], { taken: [{ key: "drop-prone", slug: "drop-prone", source: "manual" }] });
    expect(slugs(p)).toEqual(["stand", "stride-away"]);
  });
  it("a Drop prone then a Stand up recorded this turn is upright again", () => {
    const taken = [{ key: "drop-prone" }, { key: "stand" }];
    expect(slugs(plan(["stride-away"], { taken }))).toEqual(["stride-away"]);
  });
  it("Crawl only when prone", () => {
    expect(plan(["crawl"]).ok).toBe(false);
    expect(slugs(plan(["crawl"], { self: { conditions: ["prone"] } }))).toEqual(["crawl"]);
  });
  it("Ready costs two actions and ends the turn, so what follows it is dropped", () => {
    const p = plan(["ready", "melee-strike"]);
    expect(slugs(p)).toEqual(["ready"]);
    expect(p.adjustments[0]).toMatch(/Dropped what follows Ready: it ends the turn/);
  });
  it("Ready does not fit when only one action is left", () => {
    expect(plan(["ready"], { remaining: 1 }).ok).toBe(false);
    expect(plan(["ready"], { remaining: 2 }).ok).toBe(true);
  });
  it("a one-action step before Ready leaves room for it, two do not", () => {
    expect(slugs(plan(["trip", "ready"]))).toEqual(["trip", "ready"]);
    expect(slugs(plan(["trip", "trip", "ready"]))).toEqual(["trip", "trip"]);
  });
  it("Sneak moves half a Speed and is never skipped, even when adjacent", () => {
    const p = plan(["sneak"], { distance: 40, self: { speed: 30 } });
    expect(p.steps[0]).toMatchObject({ slug: "sneak", note: "to 25 ft from Mira" });
    expect(slugs(plan(["sneak"], { distance: 5 }))).toEqual(["sneak"]);
  });
  it("Tumble Through is a full move and is never skipped", () => {
    expect(plan(["tumble-through", "melee-strike"], { distance: 30 }).steps[0]).toMatchObject({ slug: "tumble-through", note: "to 5 ft from Mira" });
    expect(slugs(plan(["tumble-through"], { distance: 5 }))).toEqual(["tumble-through"]);
  });
  it("actions with no spatial need are simply planned (Hide, Seek, Take cover, Aid)", () => {
    expect(slugs(plan(["seek", "hide", "take-cover"]))).toEqual(["seek", "hide", "take-cover"]);
  });
  it("a clicked Step moves the creature away 5 ft for the rest of the plan; a Leap or a drag does not", () => {
    const click = (slug, source = "suggestion") => ({ key: "stride", slug, source });
    expect(plan(["ranged-strike"], { distance: 5, taken: [click("step")] }).finalDistance).toBe(10);
    expect(plan(["ranged-strike"], { distance: 5, taken: [click("leap")] }).finalDistance).toBe(5);
    expect(plan(["ranged-strike"], { distance: 5, taken: [click("step", "auto")] }).finalDistance).toBe(5);
  });
  it("requirements are read from the catalog", () => {
    expect(requirementFor("trip", {}, { reach: 10 })).toEqual({ type: "melee", reach: 10 });
    expect(requirementFor("demoralize")).toEqual({ type: "ranged", range: 30 });
    expect(requirementFor("sneak")).toEqual({ type: "move-toward", fraction: 0.5, noSkip: true });
    expect(requirementFor("raise-a-shield")).toEqual({ type: "free" });
    expect(requirementFor("stride")).toEqual({ type: "move-toward" });
  });
});

describe("evaluating them", () => {
  const enemy = (over = {}) => ({ id: "e", name: "Mira", hpPercent: 80, conditions: [], roles: [], distance: 5, inReach: true, ...over });
  const run = (rule, ctx = {}) =>
    evaluate([{ target: ["nearest"], ...rule }], { round: 1, self: { name: "G", hpPercent: 100, conditions: [], speed: 25, reach: 5, ...ctx.self }, enemies: [enemy()], ...ctx, self: { name: "G", hpPercent: 100, conditions: [], speed: 25, reach: 5, ...ctx.self } });

  it("Raise a Shield is held back when the creature has none", () => {
    const r = run({ id: "g", label: "Guard", do: ["melee-strike", "raise-a-shield"] }, { self: { hasShield: false } });
    expect(r.suggestions).toEqual([]);
    expect(r.held[0].reasons[0]).toMatch(/needs a shield/);
  });
  it("Raise a Shield stands when the creature has one, or when that is not known", () => {
    expect(run({ id: "g", label: "Guard", do: ["melee-strike", "raise-a-shield"] }, { self: { hasShield: true } }).suggestions).toHaveLength(1);
    expect(run({ id: "g", label: "Guard", do: ["melee-strike", "raise-a-shield"] }).suggestions).toHaveLength(1);
  });
  it("shows the modifier next to a skill action when it is known", () => {
    const r = run({ id: "t", label: "Trip", do: ["trip", "melee-strike"] }, { self: { skills: { athletics: 7 } } });
    expect(r.suggestions[0].steps[0]).toMatchObject({ slug: "trip", label: "Trip", note: "Athletics +7" });
    expect(r.suggestions[0].steps[1].note).toBe("");
  });
  it("puts the modifier after the planner's own note", () => {
    const r = run({ id: "d", label: "Taunt", do: ["demoralize"] }, { self: { skills: { intimidation: 5 } }, enemies: [enemy({ distance: 40, inReach: false })] });
    expect(r.suggestions[0].steps.map((s) => s.slug)).toEqual(["stride", "demoralize"]);
    expect(r.suggestions[0].steps[1].note).toBe("Intimidation +5");
  });
  it("a plan's budget is counted in actions: Ready takes two of three", () => {
    const r = run({ id: "r", label: "Hold", do: ["ready"] }, { turn: { remaining: 2, taken: [] } });
    expect(r.suggestions[0].slugs).toEqual(["ready"]);
    expect(run({ id: "r", label: "Hold", do: ["ready"] }, { turn: { remaining: 1, taken: [] } }).suggestions).toEqual([]);
  });
  it("the repeat cap still stops three Demoralizes, and movement stays uncapped", () => {
    const r = run({ id: "d", label: "Shout", do: ["demoralize", "demoralize", "demoralize"] }, {});
    expect(r.suggestions).toHaveLength(1); // no policy passed here, so no cap
    const capped = evaluate([{ id: "d", label: "Shout", do: ["demoralize", "demoralize", "demoralize"], target: ["nearest"] }], { round: 1, self: { name: "G", hpPercent: 100, conditions: [] }, enemies: [enemy()] }, { policies: { maxSameActionPerTurn: 2 } });
    expect(capped.suggestions).toEqual([]);
    expect(capped.held[0].reasons[0]).toMatch(/Demoralize would be used 3 times/);
  });
});

describe("detecting them from chat cards", () => {
  it("Escape rolls the unarmed attack modifier, so it arrives as an attack roll, and is still Escape", () => {
    expect(classifyContext({ type: "attack-roll", identifier: null, options: ["action:escape", "action:escape:unarmed"] })).toEqual({ key: "escape", label: "Escape" });
  });
  it("Escape rolled with Athletics is a skill check", () => {
    expect(classifyContext({ type: "skill-check", options: ["action:escape", "action:escape:athletics"] })).toEqual({ key: "escape", label: "Escape" });
  });
  it("Seek is a perception check", () => {
    expect(classifyContext({ type: "perception-check", options: ["action:seek"] })).toEqual({ key: "seek", label: "Seek" });
  });
  it("a perception check that is not an action is not counted", () => {
    expect(classifyContext({ type: "perception-check", options: [] })).toBeNull();
  });
  it("the skill tricks are recognised under their PF2e slugs", () => {
    for (const slug of ["trip", "grapple", "shove", "reposition", "disarm", "demoralize", "feint", "create-a-diversion", "hide", "sneak", "tumble-through"]) {
      expect(classifyContext({ type: "skill-check", options: [`action:${slug}`] }), slug).toEqual({ key: slug, label: ACTIONS[slug].label });
    }
  });
  it("an ordinary attack roll is still a Strike", () => {
    expect(classifyContext({ type: "attack-roll", identifier: "claw9.claw.melee", options: [] })).toMatchObject({ key: "melee-strike", itemId: "claw9" });
  });
  it("a spell attack roll is still ignored", () => {
    expect(classifyContext({ type: "attack-roll", identifier: null, options: ["action:cast-a-spell", "action:escape"] })).toBeNull();
  });
});

describe("the cascade and slots", () => {
  it("built-in actions never become slots to bind", () => {
    const r = resolveProfile({ system: { rules: [{ id: "a", do: ["trip", "demoralize", "step", "melee-strike", "signature"] }] } });
    expect(r.slots.sort()).toEqual(["melee-strike", "signature"]);
  });
});

describe("the adapter's view of the creature", () => {
  const actor = (over = {}) => ({ system: { movement: { speeds: { land: { value: 25 } } } }, getReach: () => 5, ...over });
  it("reports a held shield, a missing one, and an unknown one", () => {
    expect(selfStats(actor({ heldShield: { id: "s" } })).hasShield).toBe(true);
    expect(selfStats(actor({ heldShield: null })).hasShield).toBe(false);
    expect(selfStats(actor()).hasShield).toBeUndefined();
    expect("hasShield" in selfStats(actor())).toBe(false);
  });
  it("reads the modifiers of the skills the actions use, and skips what it cannot read", () => {
    const stats = { athletics: { mod: 7 }, intimidation: { mod: 3 }, stealth: { get mod() { throw new Error("odd"); } } };
    const out = selfStats(actor({ getStatistic: (slug) => stats[slug] }));
    expect(out.skills).toEqual({ athletics: 7, intimidation: 3 });
  });
  it("leaves skills out entirely when there is no way to read them", () => {
    expect("skills" in selfStats(actor())).toBe(false);
  });
});
