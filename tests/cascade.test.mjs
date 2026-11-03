import { describe, it, expect } from "vitest";
import { resolveProfile } from "../scripts/engine/cascade.mjs";
import { bindSlots } from "../scripts/engine/slots.mjs";
import { validate } from "../scripts/engine/validate.mjs";
import { evaluate } from "../scripts/engine/evaluate.mjs";
import { SYSTEM_LAYER } from "../scripts/engine/default-rules.mjs";

const r = (id, extra = {}) => ({ id, label: id, when: [], do: ["melee-strike"], ...extra });
const ids = (resolved) => resolved.rules.map((x) => x.id);

describe("resolveProfile: merge", () => {
  it("adds new rules in layer order", () => {
    const res = resolveProfile({ system: { rules: [r("a")] }, template: { rules: [r("b")] }, creature: { rules: [r("c")] } });
    expect(ids(res)).toEqual(["a", "b", "c"]);
    expect(res.rules.map((x) => x.source)).toEqual(["system", "template", "creature"]);
  });
  it("replaces a rule with the same id in place, keeping its priority position", () => {
    const res = resolveProfile({ system: { rules: [r("a"), r("b")] }, creature: { rules: [r("a", { label: "mine" })] } });
    expect(ids(res)).toEqual(["a", "b"]);
    expect(res.rules[0]).toMatchObject({ label: "mine", source: "creature" });
  });
  it("disables a rule, and a later layer can re-enable it by supplying it again", () => {
    const off = resolveProfile({ system: { rules: [r("a")] }, template: { disable: ["a"] } });
    expect(off.rules[0]).toMatchObject({ enabled: false, disabledBy: "template" });
    const on = resolveProfile({ system: { rules: [r("a")] }, template: { disable: ["a"] }, creature: { rules: [r("a")] } });
    expect(on.rules[0].enabled).toBeUndefined();
  });
  it("merges policies by key; null removes one", () => {
    const res = resolveProfile({
      system: { policies: { maxSameActionPerTurn: 2, other: 1 } },
      campaign: { policies: { maxSameActionPerTurn: 3 } },
      creature: { policies: { other: null } },
    });
    expect(res.policies).toEqual({ maxSameActionPerTurn: 3 });
  });
  it("slot bindings: more specific layer wins", () => {
    const res = resolveProfile({ creature: { slotBindings: { signature: "a", x: "1" } }, encounter: { slotBindings: { signature: "b" } } });
    expect(res.slotBindings).toEqual({ signature: "b", x: "1" });
  });
  it("does not mutate its inputs", () => {
    const sys = { rules: [r("a")] };
    const res = resolveProfile({ system: sys, creature: { disable: ["a"] } });
    res.rules[0].label = "changed";
    expect(sys.rules[0].label).toBe("a");
    expect(sys.rules[0].enabled).toBeUndefined();
  });
  it("reports unknown disables and duplicate ids within a layer", () => {
    const res = resolveProfile({ system: { rules: [r("a"), r("a")] }, creature: { disable: ["zzz"] } });
    expect(res.issues).toEqual([
      { type: "duplicate-id", id: "a", layer: "system" },
      { type: "unknown-disable", id: "zzz", layer: "creature" },
    ]);
  });
  it("works with no layers", () => {
    expect(resolveProfile()).toMatchObject({ rules: [], policies: {}, slots: [] });
  });
});

describe("resolveProfile: slots", () => {
  it("derives slots from enabled rules, excluding movement", () => {
    const res = resolveProfile({ system: { rules: [r("a", { do: ["stride-away", "ranged-strike", "signature"] }), r("b", { do: ["melee-strike"], enabled: false })] } });
    expect(res.slots.sort()).toEqual(["ranged-strike", "signature"]);
  });
  it("includes declared slots even when unused", () => {
    expect(resolveProfile({ template: { slots: ["signature"] } }).slots).toEqual(["signature"]);
  });
  it("ignores slots used only by disabled rules", () => {
    const res = resolveProfile({ system: { rules: [r("a", { do: ["signature"] })] }, creature: { disable: ["a"] } });
    expect(res.slots).toEqual([]);
  });
});

describe("bindSlots", () => {
  const items = [
    { id: "i1", label: "Dagger", kind: "melee" },
    { id: "i2", label: "Shortbow", kind: "ranged" },
    { id: "i3", label: "Flaming Arrow", kind: "other" },
    { id: "i4", label: "Spear", kind: "melee" },
  ];
  it("auto-binds strike slots to the first matching item", () => {
    const b = bindSlots(["melee-strike", "ranged-strike"], {}, items);
    expect(b.bound["melee-strike"]).toEqual({ itemId: "i1", label: "Dagger", auto: true });
    expect(b.bound["ranged-strike"].label).toBe("Shortbow");
    expect(b.unbound).toEqual([]);
  });
  it("never guesses other slots", () => {
    expect(bindSlots(["signature"], {}, items).unbound).toEqual(["signature"]);
  });
  it("GM binding wins, including over auto-binding", () => {
    const b = bindSlots(["signature", "melee-strike"], { signature: "i3", "melee-strike": "i4" }, items);
    expect(b.bound.signature).toMatchObject({ label: "Flaming Arrow", auto: false });
    expect(b.bound["melee-strike"].label).toBe("Spear");
  });
  it("a binding to a missing item is unbound and reported", () => {
    const b = bindSlots(["signature"], { signature: "gone" }, items);
    expect(b).toMatchObject({ unbound: ["signature"], missing: ["signature"] });
  });
  it("unbound strike slot when the creature has no such attack", () => {
    expect(bindSlots(["ranged-strike"], {}, [items[0]]).unbound).toEqual(["ranged-strike"]);
  });
});

describe("validate", () => {
  const run = (layers, items = []) => {
    const resolved = resolveProfile(layers);
    return validate(resolved, bindSlots(resolved.slots, resolved.slotBindings, items));
  };
  it("is clean for the shipped rules on a creature with a melee strike and signature bound", () => {
    const msgs = run({ system: SYSTEM_LAYER, creature: { slotBindings: { signature: "s" } } }, [
      { id: "m", label: "Claw", kind: "melee" },
      { id: "s", label: "Roar", kind: "other" },
    ]);
    expect(msgs).toEqual([]);
  });
  it("warns about unbound slots, unknown conditions, empty rules and conflicting limits", () => {
    const msgs = run({
      creature: {
        rules: [
          r("a", { do: ["ranged-strike"] }),
          r("b", { when: [{ type: "nope" }] }),
          r("c", { do: [] }),
          r("d", { limits: { oncePerEncounter: true, cooldownRounds: 2 } }),
        ],
      },
    });
    const text = msgs.map((m) => m.message).join("|");
    expect(text).toMatch(/slot "ranged-strike" is not bound/);
    expect(text).toMatch(/unknown condition "nope"/);
    expect(text).toMatch(/no actions/);
    expect(text).toMatch(/redundant/);
  });
  it("reports merge issues and missing bindings", () => {
    const msgs = run({ creature: { disable: ["zzz"], slotBindings: { signature: "gone" }, rules: [r("a", { do: ["signature"] })] } });
    const text = msgs.map((m) => m.message).join("|");
    expect(text).toMatch(/no such rule exists/);
    expect(text).toMatch(/no longer has/);
  });
  it("does not warn about disabled rules", () => {
    expect(run({ system: { rules: [r("a", { do: ["ranged-strike"], when: [{ type: "nope" }] })] }, creature: { disable: ["a"] } })).toEqual([]);
  });
});

describe("evaluate with slots", () => {
  const ctx = (slots) => ({
    round: 1,
    self: { name: "G", hpPercent: 100, conditions: [] },
    enemies: [],
    slots,
  });
  it("labels bound slots with their item", () => {
    const res = evaluate([r("a", { do: ["ranged-strike", "stride"] })], ctx({ bound: { "ranged-strike": { label: "Shortbow" } }, unbound: [] }));
    expect(res.suggestions[0].actions).toEqual(["Ranged strike (Shortbow)", "Stride"]);
  });
  it("holds back a rule needing a strike the creature lacks", () => {
    const res = evaluate([r("a", { do: ["ranged-strike"] })], ctx({ bound: {}, unbound: ["ranged-strike"] }));
    expect(res.suggestions).toEqual([]);
    expect(res.held[0].reasons[0]).toMatch(/no ranged attack/);
  });
  it("keeps a rule whose unbound slot is a GM-bound one, with a generic label", () => {
    const res = evaluate([r("a", { do: ["signature"] })], ctx({ bound: {}, unbound: ["signature"] }));
    expect(res.suggestions[0].actions).toEqual(["Signature action"]);
  });
  it("behaves as before when no slot info is given", () => {
    expect(evaluate([r("a", { do: ["ranged-strike"] })], { ...ctx(undefined) }).suggestions).toHaveLength(1);
  });
});
