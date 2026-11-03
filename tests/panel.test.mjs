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

const suggestion = (id, label, extra = {}) => ({
  id,
  label,
  actions: ["Stride", "Melee strike (Claw)"],
  steps: [
    { slug: "stride", label: "Stride", note: "to 5 ft from Mira", added: false },
    { slug: "melee-strike", label: "Melee strike (Claw)", note: "", added: true },
  ],
  adjustments: ["Added Stride: Mira is 30 ft away (Melee strike needs 5 ft)"],
  target: "Mira",
  why: ["round == 1"],
  source: "system",
  hint: null,
  slugs: ["stride", "melee-strike"],
  ...extra,
});
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
  it("highlights the action to do now, then the target, with the rest of the turn muted", async () => {
    const app = await open(makeView(), handlers(), false);
    const root = app.lastRender;
    expect(root.querySelector(".mb-current").textContent).toBe("Stride");
    expect(root.querySelector(".mb-target-text").textContent).toBe(" → Mira");
    expect(root.querySelector(".mb-then").textContent).toContain("then Melee strike (Claw)");
    expect(root.textContent).toContain("Goblin ▶ Stride → Mira");
    expect(root.querySelector(".mb-pips").textContent).toBe("●●○");
  });
  it("'Did this' records only the highlighted action", async () => {
    const h = handlers();
    const app = await open(makeView(), h, false);
    btn(app.lastRender, "Did this").click();
    expect(h.onTook).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), "step");
  });
  it("with a single-step plan there is nothing after it", async () => {
    const one = suggestion("a", "Strike", { steps: [{ slug: "melee-strike", label: "Melee strike (Claw)", note: "", added: false }], slugs: ["melee-strike"], actions: ["Melee strike (Claw)"], adjustments: [] });
    const app = await open(makeView({ suggestions: [one] }), handlers(), false);
    expect(app.lastRender.querySelector(".mb-then")).toBeNull();
    expect(app.lastRender.querySelector(".mb-current").textContent).toBe("Melee strike (Claw)");
  });
  it("still works for a suggestion that has no steps (falls back to its action list)", async () => {
    const legacy = suggestion("a", "Old", { steps: undefined });
    const app = await open(makeView({ suggestions: [legacy] }), handlers(), false);
    expect(app.lastRender.querySelector(".mb-current").textContent).toBe("Stride");
  });
  it("says so when no actions are left and disables Took it", async () => {
    const app = await open(makeView({ turn: { budget: 3, remaining: 0, actions: [] } }), handlers(), false);
    expect(app.lastRender.textContent).toContain("No actions left this turn");
    expect(app.lastRender.querySelector(".mb-current")).toBeNull();
    expect(btn(app.lastRender, "Did this").disabled).toBe(true);
  });
  it("shows 'No suggestion' when nothing matched", async () => {
    const app = await open(makeView({ suggestions: [] }), handlers(), false);
    expect(app.lastRender.textContent).toContain("No suggestion");
    expect(btn(app.lastRender, "Did this").disabled).toBe(true);
  });
  it("says 'No enemies to target' when there is nobody to aim at, not just 'No suggestion'", async () => {
    const app = await open(makeView({ suggestions: [], noEnemies: true }), handlers(), false);
    expect(app.lastRender.textContent).toContain("No enemies to target");
    const card = await open(makeView({ suggestions: [], noEnemies: true }), handlers(), true);
    expect(card.lastRender.textContent).toContain("No enemies to target");
    expect(card.lastRender.textContent).not.toContain("No suggestion");
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
    expect(t).toContain("▶ Stride");
    expect(t).toContain("2. Melee strike (Claw)");
    expect(t).toContain("Target: Mira");
    expect(t).toContain("Alternative: Strike, strike");
    expect(t).toContain("Stride ×");
    expect(t).toContain("Held back (1)");
    expect(t).toContain("Volley: slot: this creature has no ranged attack");
    expect(t).toContain("Rule: Close in (system layer)");
    expect(t).toContain("Warnings (1)");
  });
  it("shows the whole plan as numbered steps, with the current one highlighted", async () => {
    const app = await open(makeView(), handlers(), true);
    const steps = [...app.lastRender.querySelectorAll(".mb-step")];
    expect(steps).toHaveLength(2);
    expect(steps[0].classList.contains("mb-current")).toBe(true);
    expect(steps[0].getAttribute("aria-current")).toBe("step");
    expect(steps[0].textContent).toContain("\u25B6 Stride");
    expect(steps[0].textContent).toContain("to 5 ft from Mira");
    expect(steps[1].classList.contains("mb-current")).toBe(false);
    expect(steps[1].classList.contains("mb-next")).toBe(true);
    expect(steps[1].textContent).toContain("2. Melee strike (Claw)");
    expect(app.lastRender.querySelectorAll("[aria-current=step]")).toHaveLength(1);
  });
  it("marks steps the planner added, and says what it changed and why", async () => {
    const app = await open(makeView(), handlers(), true);
    const steps = [...app.lastRender.querySelectorAll(".mb-step")];
    expect(steps[0].classList.contains("mb-added")).toBe(false);
    expect(steps[1].classList.contains("mb-added")).toBe(true);
    expect(steps[1].textContent).toContain("(added)");
    expect(app.lastRender.querySelector(".mb-adjust").textContent).toBe("Added Stride: Mira is 30 ft away (Melee strike needs 5 ft)");
  });
  it("'Did this action' records the current step; 'Took whole plan' records all of it", async () => {
    const h = handlers();
    const app = await open(makeView(), h, true);
    btn(app.lastRender, "Did this action").click();
    expect(h.onTook).toHaveBeenLastCalledWith(expect.objectContaining({ id: "a" }), "step");
    btn(app.lastRender, "Took whole plan").click();
    expect(h.onTook).toHaveBeenLastCalledWith(expect.objectContaining({ id: "a" }), "all");
  });
  it("'Took whole plan' is pointless for a one-step plan, so it is off", async () => {
    const one = suggestion("a", "Strike", { steps: [{ slug: "melee-strike", label: "Melee strike", note: "", added: false }], slugs: ["melee-strike"], adjustments: [] });
    const app = await open(makeView({ suggestions: [one] }), handlers(), true);
    expect(btn(app.lastRender, "Took whole plan").disabled).toBe(true);
    expect(btn(app.lastRender, "Did this action").disabled).toBe(false);
  });
  it("shows no adjustment lines when the plan was not changed", async () => {
    const plain = suggestion("a", "Plain", { adjustments: [], steps: [{ slug: "melee-strike", label: "Melee strike", note: "", added: false }], slugs: ["melee-strike"] });
    const app = await open(makeView({ suggestions: [plain] }), handlers(), true);
    expect(app.lastRender.querySelector(".mb-adjust")).toBeNull();
  });
  it("Something else cycles to the alternative, wraps, and resets when the view key changes", async () => {
    const h = handlers();
    const app = await open(makeView(), h, true);
    btn(app.lastRender, "Something else").click();
    expect(app.index).toBe(1);
    await app.render();
    btn(app.lastRender, "Did this action").click();
    expect(h.onTook).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }), "step");
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
