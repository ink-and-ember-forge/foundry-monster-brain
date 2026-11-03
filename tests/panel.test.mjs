// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// Minimal stand-ins for the Foundry globals the panel touches.
class FakeApp {
  constructor(opts = {}) {
    this.position = opts.position ?? {};
    this.rendered = false;
  }
  async render() {
    this.rendered = true;
    this.lastRender = await this._renderHTML();
  }
  async close() {
    this.rendered = false;
  }
  setPosition() {}
}
const settings = new Map();
globalThis.foundry = { applications: { api: { ApplicationV2: FakeApp } }, utils: { debounce: (fn) => fn } };
globalThis.game = { settings: { get: (_m, k) => settings.get(k), set: vi.fn(async (_m, k, v) => settings.set(k, v)) } };

const { MonsterBrainStrip } = await import("../scripts/panel.mjs");

const suggestion = (id, label, extra = {}) => ({ id, label, actions: ["Stride", "Melee strike (Claw)"], target: "Mira", why: ["round == 1"], source: "system", hint: null, slugs: [], ...extra });
const makeView = (over = {}) => ({
  key: "k1",
  suggestions: [suggestion("a", "Close in"), suggestion("b", "Strike, strike", { target: null })],
  held: [{ id: "c", label: "Volley", reasons: ["slot: this creature has no ranged attack"] }],
  warnings: [{ ruleId: "d", message: "unknown condition" }],
  templateName: "skirmisher",
  round: 2,
  turn: { budget: 3, remaining: 2, actions: [{ id: "x1", label: "Stride", source: "auto" }] },
  ...over,
});
const handlers = () => ({ onTook: vi.fn(), onRemove: vi.fn(), onAdd: vi.fn() });
const combatant = { name: "Goblin" };

async function open(view, h, expanded) {
  settings.set("stripExpanded", expanded);
  // each test gets a fresh window
  MonsterBrainStrip.hide();
  const app = await MonsterBrainStrip.show(combatant, view, h);
  return app;
}
const btn = (root, text) => [...root.querySelectorAll("button")].find((b) => b.textContent.startsWith(text));

beforeEach(() => settings.clear());

describe("collapsed strip", () => {
  it("shows name, suggestion, pips and a Took it button", async () => {
    const h = handlers();
    const app = await open(makeView(), h, false);
    const root = app.lastRender;
    expect(root.textContent).toContain("Goblin: Close in → Mira");
    expect(root.querySelector(".mb-pips").textContent).toBe("●●○");
    btn(root, "Took it").click();
    expect(h.onTook).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
  });
  it("says so when no actions are left and disables Took it", async () => {
    const app = await open(makeView({ turn: { budget: 3, remaining: 0, actions: [] } }), handlers(), false);
    expect(app.lastRender.textContent).toContain("No actions left this turn");
    expect(btn(app.lastRender, "Took it").disabled).toBe(true);
  });
  it("shows 'No suggestion' when nothing matched", async () => {
    const app = await open(makeView({ suggestions: [] }), handlers(), false);
    expect(app.lastRender.textContent).toContain("No suggestion");
    expect(btn(app.lastRender, "Took it").disabled).toBe(true);
  });
  it("expands and remembers the choice", async () => {
    const app = await open(makeView(), handlers(), false);
    btn(app.lastRender, "▾").click();
    expect(app.expanded).toBe(true);
    expect(game.settings.set).toHaveBeenCalledWith("monster-brain", "stripExpanded", true);
  });
});

describe("expanded card", () => {
  it("shows template, round, primary, alternative, log, why and held back", async () => {
    const app = await open(makeView(), handlers(), true);
    const t = app.lastRender.textContent;
    expect(t).toContain("skirmisher · round 2");
    expect(t).toContain("Close in");
    expect(t).toContain("Stride → Melee strike (Claw)");
    expect(t).toContain("Target: Mira");
    expect(t).toContain("Alternative: Strike, strike");
    expect(t).toContain("Stride ×");
    expect(t).toContain("Held back (1)");
    expect(t).toContain("Volley: slot: this creature has no ranged attack");
    expect(t).toContain("Rule: Close in (system layer)");
    expect(t).toContain("Warnings (1)");
  });
  it("Something else cycles to the alternative, wraps, and resets when the view key changes", async () => {
    const h = handlers();
    const app = await open(makeView(), h, true);
    btn(app.lastRender, "Something else").click();
    expect(app.index).toBe(1);
    await app.render();
    btn(app.lastRender, "Took suggestion").click();
    expect(h.onTook).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
    btn(app.lastRender, "Something else").click();
    expect(app.index).toBe(0);
    app.index = 1;
    await MonsterBrainStrip.show(combatant, makeView({ key: "k2" }), h);
    expect(app.index).toBe(0);
  });
  it("disables Something else with only one suggestion, and hides the alternative", async () => {
    const app = await open(makeView({ suggestions: [suggestion("a", "Only")] }), handlers(), true);
    expect(btn(app.lastRender, "Something else").disabled).toBe(true);
    expect(app.lastRender.textContent).not.toContain("Alternative");
  });
  it("clicking a log chip removes that action; the add menu adds one", async () => {
    const h = handlers();
    const app = await open(makeView(), h, true);
    btn(app.lastRender, "Stride ×").click();
    expect(h.onRemove).toHaveBeenCalledWith("x1");
    const select = app.lastRender.querySelector("select.mb-add");
    select.value = "spell";
    select.dispatchEvent(new Event("change"));
    expect(h.onAdd).toHaveBeenCalledWith("spell");
  });
  it("omits the warnings section when there are none, and shows 'nothing' for empty lists", async () => {
    const app = await open(makeView({ warnings: [], held: [] }), handlers(), true);
    expect(app.lastRender.textContent).not.toContain("Warnings");
    expect(app.lastRender.textContent).toContain("Held back (0)");
  });
  it("renders text safely (no HTML injection from names or labels)", async () => {
    const app = await open(makeView({ suggestions: [suggestion("a", "<img src=x onerror=alert(1)>")] }), handlers(), true);
    expect(app.lastRender.querySelector("img")).toBeNull();
  });
});
