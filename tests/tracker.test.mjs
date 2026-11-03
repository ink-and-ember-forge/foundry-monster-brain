import { describe, it, expect, beforeEach, vi } from "vitest";
import { emptyHistory, isDuplicateMovement, markMerged, addAction, turnActions, ruleUsesFor } from "../scripts/engine/history.mjs";

let flag;
let n = 0;
let bound = {};
let resolveShouldThrow = false;
vi.mock("../scripts/profiles.mjs", () => ({
  resolveFor: () => {
    if (resolveShouldThrow) throw new Error("no profile");
    return { binding: { bound } };
  },
}));
const combatant = { id: "c1", tokenId: "t1", actor: { alliance: "opposition" } };
const combat = {
  round: 2,
  combatant,
  getFlag: () => flag,
  setFlag: async (_m, _k, v) => {
    flag = structuredClone(v);
  },
};
globalThis.foundry = { utils: { randomID: () => `id${++n}` } };
globalThis.game = { combat, users: { activeGM: { isSelf: true } } };

const { panelHandlers, onUpdateToken, onCreateChatMessage, noteExpected } = await import("../scripts/tracker.mjs");

const mine = () => turnActions(flag, 2, "c1");
const keys = () => mine().map((a) => `${a.key}:${a.source}`);
const plan = (slugs, id = "charge") => ({ id, slugs, steps: slugs.map((slug) => ({ slug })) });
const drag = (at) => {
  vi.setSystemTime(at);
  return onUpdateToken({ id: "t1" }, { x: 100 });
};

beforeEach(() => {
  flag = emptyHistory();
  n = 0;
  bound = {};
  resolveShouldThrow = false;
  noteExpected(null, null, []);
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});

describe("pure movement helpers", () => {
  const stride = (source, ts, extra = {}) => ({ id: "a", key: "stride", source, ts, ...extra });
  it("a click and a drag, in either order, within a minute, are one Stride", () => {
    expect(isDuplicateMovement(stride("suggestion", 0), "auto", 30_000)).toBe(true);
    expect(isDuplicateMovement(stride("manual", 0), "auto", 30_000)).toBe(true);
    expect(isDuplicateMovement(stride("auto", 0), "suggestion", 30_000)).toBe(true);
    expect(isDuplicateMovement(stride("auto", 0), "manual", 30_000)).toBe(true);
  });
  it("same-side repeats are separate Strides, as are old or already-merged ones", () => {
    expect(isDuplicateMovement(stride("auto", 0), "auto", 1000)).toBe(false);
    expect(isDuplicateMovement(stride("suggestion", 0), "manual", 1000)).toBe(false);
    expect(isDuplicateMovement(stride("suggestion", 0), "auto", 61_000)).toBe(false);
    expect(isDuplicateMovement(stride("suggestion", 0, { merged: true }), "auto", 1000)).toBe(false);
  });
  it("only Strides are ever merged", () => {
    expect(isDuplicateMovement({ key: "melee-strike", source: "suggestion", ts: 0 }, "auto", 1000)).toBe(false);
    expect(isDuplicateMovement(undefined, "auto", 1000)).toBe(false);
  });
  it("markMerged flags just that action, immutably", () => {
    const h = addAction(addAction(emptyHistory(), { id: "a", key: "stride" }), { id: "b", key: "stride" });
    const m = markMerged(h, "a");
    expect(m.actions.map((x) => x.merged)).toEqual([true, undefined]);
    expect(h.actions[0].merged).toBeUndefined();
  });
});

describe("'Did this' (one step)", () => {
  it("records only the highlighted action", async () => {
    await panelHandlers(combat, combatant).onTook(plan(["stride", "melee-strike", "melee-strike"]), "step");
    expect(keys()).toEqual(["stride:suggestion"]);
  });
  it("does not count a rule use until the last step is done", async () => {
    const h = panelHandlers(combat, combatant);
    await h.onTook(plan(["stride", "melee-strike"]), "step");
    expect(ruleUsesFor(flag, "c1")).toEqual([]);
    await h.onTook(plan(["melee-strike"]), "step");
    expect(ruleUsesFor(flag, "c1")).toEqual([{ ruleId: "charge", round: 2, combatantId: "c1" }]);
  });
  it("a rule with maxPerTurn is not shut out of its own second step", async () => {
    await panelHandlers(combat, combatant).onTook(plan(["melee-strike", "stride-away"], "fade"), "step");
    expect(ruleUsesFor(flag, "c1")).toEqual([]);
  });
  it("a one-step plan counts as complete immediately", async () => {
    await panelHandlers(combat, combatant).onTook(plan(["melee-strike"], "smash"), "step");
    expect(ruleUsesFor(flag, "c1")).toHaveLength(1);
  });
  it("stride-away is logged as a Stride", async () => {
    await panelHandlers(combat, combatant).onTook(plan(["stride-away"]), "step");
    expect(keys()).toEqual(["stride:suggestion"]);
  });
  it("does nothing without a suggestion", async () => {
    await panelHandlers(combat, combatant).onTook(null, "step");
    expect(flag).toEqual(emptyHistory());
  });
});

describe("'Took whole plan'", () => {
  it("records every step and one rule use", async () => {
    await panelHandlers(combat, combatant).onTook(plan(["stride", "melee-strike", "melee-strike"]), "all");
    expect(keys()).toEqual(["stride:suggestion", "melee-strike:suggestion", "melee-strike:suggestion"]);
    expect(ruleUsesFor(flag, "c1")).toHaveLength(1);
  });
  it("defaults to the whole plan", async () => {
    await panelHandlers(combat, combatant).onTook(plan(["stride", "melee-strike"]));
    expect(keys()).toHaveLength(2);
  });
});

describe("a Stride reported by both a click and a token drag", () => {
  it("click then drag is one Stride", async () => {
    await panelHandlers(combat, combatant).onTook(plan(["stride", "melee-strike"]), "step");
    await drag(1_005_000);
    expect(keys()).toEqual(["stride:suggestion"]);
    expect(mine()[0].merged).toBe(true);
  });
  it("drag then click is one Stride", async () => {
    await drag(1_000_000);
    vi.setSystemTime(1_020_000);
    await panelHandlers(combat, combatant).onTook(plan(["stride", "melee-strike"]), "step");
    expect(keys()).toEqual(["stride:auto"]);
    expect(mine()[0].merged).toBe(true);
  });
  it("a second drag after a merged click is a new Stride (the first is spent)", async () => {
    await panelHandlers(combat, combatant).onTook(plan(["stride", "stride", "melee-strike"]), "step");
    await drag(1_005_000);
    await drag(1_020_000);
    expect(keys()).toEqual(["stride:suggestion", "stride:auto"]);
  });
  it("two real drags a few seconds apart are two Strides; one fast drag is one", async () => {
    await drag(1_000_000);
    await drag(1_001_000); // the same drag, still reporting
    expect(keys()).toEqual(["stride:auto"]);
    await drag(1_010_000); // a new move
    expect(keys()).toEqual(["stride:auto", "stride:auto"]);
  });
  it("a click long after a drag is a separate Stride", async () => {
    await drag(1_000_000);
    vi.setSystemTime(1_000_000 + 90_000);
    await panelHandlers(combat, combatant).onTook(plan(["stride"]), "step");
    expect(keys()).toEqual(["stride:auto", "stride:suggestion"]);
  });
  it("a Strike after a Stride is never merged into it", async () => {
    await panelHandlers(combat, combatant).onTook(plan(["stride", "melee-strike"]), "all");
    expect(keys()).toEqual(["stride:suggestion", "melee-strike:suggestion"]);
  });
  it("a manually added Stride after a drag is merged once", async () => {
    await drag(1_000_000);
    await panelHandlers(combat, combatant).onAdd("stride");
    expect(keys()).toEqual(["stride:auto"]);
  });
  it("ignores token moves from anyone but the current monster, or when not the active GM", async () => {
    await onUpdateToken({ id: "someone-else" }, { x: 1 });
    game.users.activeGM = { isSelf: false };
    await onUpdateToken({ id: "t1" }, { x: 1 });
    game.users.activeGM = { isSelf: true };
    await onUpdateToken({ id: "t1" }, { elevation: 5 });
    expect(flag).toEqual(emptyHistory());
  });
});

describe("recording the plan step, not just the kind of action", () => {
  it("'Did this' remembers which step it was, with its item in the label", async () => {
    const suggestion = { id: "r", slugs: ["signature", "melee-strike"], steps: [{ slug: "signature", label: "Signature action (Fire Bolt)" }, { slug: "melee-strike", label: "Melee strike (Claw)" }] };
    await panelHandlers(combat, combatant).onTook(suggestion, "step");
    expect(mine()[0]).toMatchObject({ key: "signature", slug: "signature", label: "Signature action (Fire Bolt)", source: "suggestion" });
  });
  it("a Stride away keeps its direction in the slug while sharing the Stride key", async () => {
    await panelHandlers(combat, combatant).onTook(plan(["stride-away"]), "step");
    expect(mine()[0]).toMatchObject({ key: "stride", slug: "stride-away" });
  });
  it("a manually added action records its slug too", async () => {
    await panelHandlers(combat, combatant).onAdd("stand");
    expect(mine()[0]).toMatchObject({ key: "stand", slug: "stand", source: "manual" });
  });
});

describe("a detected roll is recorded as the plan step it fulfilled (the reported case)", () => {
  const chat = (context, origin) => ({ speaker: { token: "t1" }, flags: { pf2e: { context: { token: "Scene.s.Token.t1", ...context }, origin } } });
  // The signature IS the bow: one item bound to two slots.
  const SIGNATURE_IS_THE_BOW = () => ({
    "ranged-strike": { itemId: "bow", label: "Shortbow", auto: true },
    signature: { itemId: "bow", label: "Shortbow", auto: false },
    "melee-strike": { itemId: "claw", label: "Claw", auto: true },
  });
  const roll = (identifier) => chat({ type: "attack-roll", identifier });

  it("when the plan is waiting for the signature, the ranged roll is the signature", async () => {
    bound = SIGNATURE_IS_THE_BOW();
    noteExpected("c1", 2, ["signature"]);
    await onCreateChatMessage(roll("bow.shortbow.ranged"));
    expect(mine()[0]).toMatchObject({ key: "signature", slug: "signature", source: "auto", label: "Signature action (Shortbow)" });
  });
  it("when the plan is waiting for a plain ranged Strike, it is that", async () => {
    bound = SIGNATURE_IS_THE_BOW();
    noteExpected("c1", 2, ["ranged-strike"]);
    await onCreateChatMessage(roll("bow.shortbow.ranged"));
    expect(mine()[0]).toMatchObject({ key: "ranged-strike", slug: "ranged-strike" });
  });
  it("with no plan on screen, the slot the GM chose explicitly wins over the auto-bound Strike", async () => {
    bound = SIGNATURE_IS_THE_BOW();
    await onCreateChatMessage(roll("bow.shortbow.ranged"));
    expect(mine()[0].slug).toBe("signature");
  });
  it("expectations from another round or another combatant are ignored", async () => {
    bound = SIGNATURE_IS_THE_BOW();
    noteExpected("c1", 1, ["ranged-strike"]);
    await onCreateChatMessage(roll("bow.shortbow.ranged"));
    expect(mine()[0].slug).toBe("signature");
  });
  it("a roll for an ordinary Strike stays that Strike", async () => {
    bound = SIGNATURE_IS_THE_BOW();
    await onCreateChatMessage(roll("claw.claw.melee"));
    expect(mine()[0]).toMatchObject({ key: "melee-strike", label: "Melee strike" });
  });
  it("an item that is not bound to anything keeps its generic kind", async () => {
    bound = SIGNATURE_IS_THE_BOW();
    await onCreateChatMessage(roll("dagger.dagger.melee"));
    expect(mine()[0]).toMatchObject({ key: "melee-strike" });
  });
  it("a spell is matched to its slot through the card's origin", async () => {
    bound = { signature: { itemId: "fire", label: "Fire Bolt", auto: false } };
    await onCreateChatMessage(chat({ type: "spell-cast" }, { uuid: "Actor.a1.Item.fire" }));
    expect(mine()[0]).toMatchObject({ slug: "signature", label: "Signature action (Fire Bolt)" });
  });
  it("if the bindings cannot be resolved, it still records the roll as its generic kind", async () => {
    resolveShouldThrow = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await onCreateChatMessage(roll("bow.shortbow.ranged"));
    expect(mine()[0]).toMatchObject({ key: "ranged-strike" });
    warn.mockRestore();
  });
  it("damage rolls and other combatants' rolls are still ignored", async () => {
    bound = SIGNATURE_IS_THE_BOW();
    await onCreateChatMessage(chat({ type: "damage-roll", identifier: "bow.shortbow.ranged" }));
    await onCreateChatMessage({ speaker: { token: "someone-else" }, flags: { pf2e: { context: { type: "attack-roll", identifier: "bow.x.ranged", token: "Scene.s.Token.zzz" } } } });
    expect(flag).toEqual(emptyHistory());
  });
});
