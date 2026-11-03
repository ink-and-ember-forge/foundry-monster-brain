import { describe, it, expect } from "vitest";
import { remainingBundle, slotForItem } from "../scripts/engine/taken.mjs";
import { classifyContext } from "../scripts/engine/detect.mjs";
import { labelWithItem } from "../scripts/engine/actions.mjs";
import { distanceText } from "../scripts/engine/suggestion.mjs";
import { STARTER_TEMPLATES } from "../scripts/engine/starter-templates.mjs";
import { SYSTEM_LAYER, DEFAULT_POLICIES } from "../scripts/engine/default-rules.mjs";
import { resolveProfile } from "../scripts/engine/cascade.mjs";
import { bindSlots } from "../scripts/engine/slots.mjs";
import { evaluate } from "../scripts/engine/evaluate.mjs";
import { planBundle } from "../scripts/engine/world.mjs";

describe("remainingBundle: what is left to do", () => {
  it("removes what was already done, so the plan advances", () => {
    expect(remainingBundle(["signature", "melee-strike"], [{ key: "signature" }])).toEqual(["melee-strike"]);
    expect(remainingBundle(["stride", "melee-strike", "melee-strike"], [{ key: "stride" }, { key: "melee-strike" }])).toEqual(["melee-strike"]);
  });
  it("does not care about order", () => {
    expect(remainingBundle(["signature", "melee-strike"], [{ key: "melee-strike" }])).toEqual(["signature"]);
  });
  it("each recorded action is spent once", () => {
    expect(remainingBundle(["melee-strike", "melee-strike"], [{ key: "melee-strike" }])).toEqual(["melee-strike"]);
    expect(remainingBundle(["melee-strike"], [{ key: "melee-strike" }, { key: "melee-strike" }])).toEqual([]);
  });
  it("leaves everything when nothing relevant was done", () => {
    expect(remainingBundle(["signature", "melee-strike"], [{ key: "spell" }, { key: "other" }])).toEqual(["signature", "melee-strike"]);
    expect(remainingBundle(["signature"], [])).toEqual(["signature"]);
    expect(remainingBundle(["signature"], undefined)).toEqual(["signature"]);
  });
  it("tells Stride from Stride away when the direction is known", () => {
    expect(remainingBundle(["melee-strike", "stride-away"], [{ key: "stride", slug: "stride" }])).toEqual(["melee-strike", "stride-away"]);
    expect(remainingBundle(["melee-strike", "stride-away"], [{ key: "stride", slug: "stride-away" }])).toEqual(["melee-strike"]);
  });
  it("a movement whose direction is unknown (a token drag) counts toward the first outstanding movement step", () => {
    expect(remainingBundle(["stride", "stride", "melee-strike"], [{ key: "stride" }])).toEqual(["stride", "melee-strike"]);
  });
  it("does not mutate its inputs", () => {
    const bundle = ["signature", "melee-strike"];
    const taken = [{ key: "signature" }];
    remainingBundle(bundle, taken);
    expect(bundle).toEqual(["signature", "melee-strike"]);
    expect(taken).toEqual([{ key: "signature" }]);
  });
});

describe("slotForItem: which slot a detected roll was", () => {
  // The reported case: the signature IS the ranged attack, so one item fills two slots.
  const bound = {
    "ranged-strike": { itemId: "bow", label: "Shortbow", auto: true },
    signature: { itemId: "bow", label: "Shortbow", auto: false },
    "melee-strike": { itemId: "claw", label: "Claw", auto: true },
  };
  it("the plan's expected slot wins", () => {
    expect(slotForItem("bow", bound, { prefer: ["signature"], fallbackKey: "ranged-strike" })).toBe("signature");
    expect(slotForItem("bow", bound, { prefer: ["ranged-strike"], fallbackKey: "ranged-strike" })).toBe("ranged-strike");
  });
  it("with nothing expected, the slot the GM chose explicitly beats the auto-bound Strike", () => {
    expect(slotForItem("bow", bound, { prefer: [], fallbackKey: "ranged-strike" })).toBe("signature");
  });
  it("an item bound to one slot gives that slot", () => {
    expect(slotForItem("claw", bound, { fallbackKey: "melee-strike" })).toBe("melee-strike");
  });
  it("falls back to what the roll looked like when the item is unknown or unbound", () => {
    expect(slotForItem("other", bound, { fallbackKey: "melee-strike" })).toBe("melee-strike");
    expect(slotForItem(undefined, bound, { fallbackKey: "spell" })).toBe("spell");
    expect(slotForItem("bow", {}, { fallbackKey: "ranged-strike" })).toBe("ranged-strike");
    expect(slotForItem("bow", undefined, { fallbackKey: "ranged-strike" })).toBe("ranged-strike");
  });
  it("with only auto-bound candidates it prefers the generic Strike the roll looked like", () => {
    const autos = { "ranged-strike": { itemId: "bow", auto: true }, extra: { itemId: "bow", auto: true } };
    expect(slotForItem("bow", autos, { fallbackKey: "ranged-strike" })).toBe("ranged-strike");
  });
});

describe("chat cards say which item was used", () => {
  it("strikes: the first segment of the identifier", () => {
    expect(classifyContext({ type: "attack-roll", identifier: "bow123.shortbow.ranged" }).itemId).toBe("bow123");
    expect(classifyContext({ type: "attack-roll", identifier: "claw9.claw.melee" })).toMatchObject({ key: "melee-strike", itemId: "claw9" });
  });
  it("spells: the last segment of the origin uuid", () => {
    expect(classifyContext({ type: "spell-cast" }, { uuid: "Actor.a1.Item.fire77" }).itemId).toBe("fire77");
    expect(classifyContext({ type: "spell-cast" }, { uuid: "Scene.s.Token.t.Actor.a.Item.zap" }).itemId).toBe("zap");
    expect(classifyContext({ type: "spell-cast" }).itemId).toBeUndefined();
  });
  it("self effects: context.item", () => {
    expect(classifyContext({ type: "self-effect", item: "Actor.a.Item.rage" }).itemId).toBe("rage");
    expect(classifyContext({ type: "self-effect", item: "rage" }).itemId).toBe("rage");
  });
  it("copes with missing identifiers", () => {
    expect(classifyContext({ type: "attack-roll" }).itemId).toBeUndefined();
    expect(classifyContext({ type: "area-fire", identifier: "arrow.x" }).itemId).toBe("arrow");
  });
  it("labels a slot with its item", () => {
    expect(labelWithItem("signature", { label: "Fire Bolt" })).toBe("Signature action (Fire Bolt)");
    expect(labelWithItem("signature", undefined)).toBe("Signature action");
  });
});

// ---- a whole turn, played the way it was reported ---------------------------------------------------

const e = (name, hpPercent, extra = {}) => ({ id: name, name, hpPercent, conditions: [], roles: [], distance: 30, inReach: false, ...extra });
const CLAW = { id: "claw", label: "Claw", kind: "melee", reach: 5 };
const FIRE = { id: "fire", label: "Fire Bolt", kind: "other", range: 120 };

/** One evaluation of a Brawler whose signature is a ranged spell, given what has been recorded so far. */
function evaluateBrawler({ enemies, taken = [], round = 1, self = {} }) {
  const resolved = resolveProfile({ system: SYSTEM_LAYER, template: STARTER_TEMPLATES.brawler, creature: { slotBindings: { signature: "fire" } } });
  const binding = bindSlots(resolved.slots, resolved.slotBindings, [CLAW, FIRE]);
  const budget = 3;
  const ctx = {
    round,
    self: { name: "Brawler", hpPercent: 100, conditions: [], speed: 25, reach: 5, ...self },
    enemies,
    slots: { bound: binding.bound, unbound: binding.unbound },
    turn: { budget, remaining: Math.max(0, budget - taken.length), taken },
  };
  return evaluate(resolved.rules, ctx, { policies: DEFAULT_POLICIES, max: 3 });
}
const entry = (slug, source = "suggestion", extra = {}) => ({ key: slug === "stride-away" ? "stride" : slug, slug, source, ...extra });

describe("the reported session: recording a step moves on to the next", () => {
  const far = [e("Mira", 100, { distance: 55 })];

  it("round 1, enemy 55 ft away: fire the ranged signature first", () => {
    const r = evaluateBrawler({ enemies: far });
    expect(r.suggestions[0].id).toBe("opening-signature");
    expect(r.suggestions[0].slugs[0]).toBe("signature");
    expect(r.suggestions[0].steps[0].label).toBe("Signature action (Fire Bolt)");
  });

  it("after 'Did this action' for the signature, the signature is NOT suggested again", () => {
    const first = evaluateBrawler({ enemies: far }).suggestions[0];
    const after = evaluateBrawler({ enemies: far, taken: [entry("signature")] });
    expect(after.suggestions[0].slugs).not.toContain("signature");
    expect(after.suggestions[0].slugs[0]).toBe("stride");
    expect(after.suggestions[0].slugs.length).toBeLessThan(first.slugs.length);
  });

  it("a recorded Stride, with no token drag, still closes the distance for the next step", () => {
    const next = evaluateBrawler({ enemies: far, taken: [entry("signature"), entry("stride")] });
    // 55 ft, one Stride of 25 ft recorded: 30 ft remain, and only one action is left: another Stride.
    expect(next.suggestions[0].slugs).toEqual(["stride"]);
    expect(next.suggestions[0].targetDistance).toBe(55); // the measured distance is shown honestly
    expect(next.suggestions[0].steps[0].note).toBe("to 5 ft from Mira");
  });

  it("played to the end: each step advances, and nothing is suggested once the actions run out", () => {
    const taken = [];
    const seen = [];
    for (let guard = 0; guard < 6; guard++) {
      const r = evaluateBrawler({ enemies: far, taken });
      if (!r.suggestions.length) break;
      const step = r.suggestions[0].slugs[0];
      seen.push(step);
      taken.push(entry(step));
    }
    expect(seen).toEqual(["signature", "stride", "stride"]);
    expect(evaluateBrawler({ enemies: far, taken }).suggestions).toEqual([]);
  });

  it("when the token really moved (a drag), the distance is the measured one, with no double count", () => {
    const moved = [e("Mira", 100, { distance: 5, inReach: true })];
    const r = evaluateBrawler({ enemies: moved, taken: [entry("signature"), entry("stride", "auto")] });
    expect(r.suggestions[0].slugs[0]).toBe("melee-strike");
  });

  it("a clicked Stride that was later merged with a real drag is not counted twice", () => {
    const moved = [e("Mira", 100, { distance: 30 })];
    const r = evaluateBrawler({ enemies: moved, taken: [entry("stride", "suggestion", { merged: true })] });
    // The token is really 30 ft away: it still needs a Stride (the merged click adds no virtual movement).
    expect(r.suggestions[0].steps.some((s) => s.slug === "stride")).toBe(true);
  });

  it("a rule whose every action is done is finished, and the next rule takes over", () => {
    const adjacent = [e("Mira", 100, { distance: 5, inReach: true })];
    const done = evaluateBrawler({ enemies: adjacent, round: 2, taken: [entry("melee-strike"), entry("melee-strike")] });
    expect(done.held.find((h) => h.id === "brawler-smash").reasons).toContain("already done this turn");
  });

  it("an authored Stand up is satisfied by a recorded one", () => {
    const prone = planBundle({
      bundle: ["stride", "melee-strike"],
      ctx: { self: { speed: 25, reach: 5, conditions: ["prone"] }, turn: { taken: [{ key: "stand", slug: "stand", source: "manual" }] } },
      target: { name: "Mira", distance: 30 },
      remaining: 2,
    });
    expect(prone.slugs).toEqual(["stride", "melee-strike"]); // no second "Stand up"
  });

  it("having already fled this turn, it does not walk back to attack", () => {
    const p = planBundle({
      bundle: ["melee-strike"],
      ctx: { self: { speed: 25, reach: 5, conditions: [] }, turn: { taken: [{ key: "stride", slug: "stride-away", source: "suggestion" }] } },
      target: { name: "Mira", distance: 5 },
      remaining: 2,
    });
    expect(p.ok).toBe(false);
  });
});

describe("unknown distance is visible, not silent (the '55 ft but it said Melee strike' case)", () => {
  it("the plan says the distance was unknown, so a confident-looking Strike is not mistaken for a checked one", () => {
    const r = evaluateBrawler({ enemies: [e("Mira", 100, { distance: null, inReach: null })], round: 2 });
    const s = r.suggestions[0];
    expect(s.adjustments.join(" ")).toMatch(/Distance to Mira is unknown/);
    expect(distanceText(s)).toBe("distance unknown");
    expect(distanceText(s, true)).toBe("? ft");
  });
  it("a measured distance is shown on the suggestion", () => {
    const s = evaluateBrawler({ enemies: [e("Mira", 100, { distance: 55 })], round: 2 }).suggestions[0];
    expect(s.targetDistance).toBe(55);
    expect(distanceText(s)).toBe("55 ft away");
    expect(distanceText(s, true)).toBe("55 ft");
  });
  it("and at 55 ft a melee Strike is never planned as the first action (it needs Strides)", () => {
    for (const round of [1, 2, 3]) {
      const r = evaluateBrawler({ enemies: [e("Mira", 100, { distance: 55 })], round });
      for (const s of r.suggestions) expect(s.slugs[0] === "melee-strike", `${s.id} r${round}`).toBe(false);
    }
  });
});
