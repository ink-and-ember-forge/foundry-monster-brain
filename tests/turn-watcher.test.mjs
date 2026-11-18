// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The live bug: a monster was dragged 20 ft to stand beside a PC. The move was recorded, but the plan was measured
 * while the token was still animating, so it said "Lyra is 20 ft away" and added a Stride that was not needed.
 * These tests drive the real refresh(), with the world's distance changing only when the animation finishes.
 */
const shown = [];
let world;
let history;

vi.mock("../scripts/panel.mjs", () => ({
  MonsterBrainStrip: { show: async (c, view) => shown.push(view), hide: vi.fn() },
}));
vi.mock("../scripts/tracker.mjs", () => ({
  readHistory: () => history,
  panelHandlers: () => ({}),
  noteExpected: () => {},
}));
vi.mock("../scripts/profiles.mjs", () => ({
  resolveFor: () => ({
    resolved: { rules: [{ id: "close", label: "Close the distance", when: [], do: ["stride", "melee-strike"], target: ["nearest"] }], policies: {} },
    binding: { bound: {}, unbound: [] },
    warnings: [],
    templateId: "brawler",
  }),
}));
// The adapter reads the world's distance at the moment it is called, like a token's bounds do.
vi.mock("../scripts/adapter.mjs", () => ({
  buildContext: (combatant, combat, hist) => ({
    round: combat.round,
    self: { name: combatant.name, hpPercent: 100, conditions: [], speed: 25, reach: 5 },
    enemies: [{ id: "lyra", name: "Lyra", hpPercent: 100, conditions: [], roles: [], distance: world.distance, inReach: world.distance <= 5 }],
    turn: { budget: 3, remaining: 2, taken: hist.taken },
    ruleUses: [],
  }),
}));

globalThis.game = { settings: { get: () => false, set: () => {} } };
const { refresh } = await import("../scripts/turn-watcher.mjs");

const combatant = { id: "c1", name: "Cutthroat", actor: { alliance: "opposition" } };
const makeCombat = (tokens) => ({
  round: 2,
  combatant,
  combatants: { map: (fn) => [{ ...combatant, token: { object: tokens[0] } }, { id: "lyra", token: { object: tokens[1] } }].map(fn) },
});

beforeEach(() => {
  shown.length = 0;
  world = { distance: 20 };
  // The Stride has been recorded (a token drag), so the authored Stride is already done.
  history = { taken: [{ key: "stride", source: "auto", id: "a1", round: 2, combatantId: "c1", ts: 1 }] };
});

describe("refresh after a token has been dragged", () => {
  it("waits for the animation, so the plan is measured from where the token landed", async () => {
    let finish;
    const animation = new Promise((resolve) => {
      finish = () => {
        world.distance = 5; // the token lands, and only now do its bounds say so
        resolve();
      };
    });
    const pending = refresh(makeCombat([{ animation }, { animation: null }]), combatant);
    await Promise.resolve();
    expect(shown).toHaveLength(0); // nothing was shown from the stale position
    finish();
    await pending;
    expect(shown).toHaveLength(1);
    const plan = shown[0].suggestions[0];
    expect(plan.targetDistance).toBe(5);
    expect(plan.slugs).toEqual(["melee-strike"]); // adjacent: no Stride added
    expect(plan.adjustments).toEqual([]);
  });
  it("measures straight away when nothing is moving", async () => {
    world.distance = 5;
    await refresh(makeCombat([{ animation: null }, { animation: null }]), combatant);
    expect(shown[0].suggestions[0].slugs).toEqual(["melee-strike"]);
  });
  it("without the wait this is the reported bug: a stale 20 ft adds a Stride that is not needed", async () => {
    // Same scene, measured before the token lands.
    await refresh(makeCombat([{ animation: null }, { animation: null }]), combatant);
    expect(shown[0].suggestions[0].slugs).toEqual(["stride", "melee-strike"]);
    expect(shown[0].suggestions[0].adjustments[0]).toMatch(/Lyra is 20 ft away/);
  });
  it("does not show a strip for a turn that ended while it waited", async () => {
    let finish;
    const animation = new Promise((resolve) => (finish = resolve));
    const combat = makeCombat([{ animation }, { animation: null }]);
    const pending = refresh(combat, combatant);
    combat.combatant = { id: "someone-else" };
    finish();
    await pending;
    expect(shown).toHaveLength(0);
  });
});
