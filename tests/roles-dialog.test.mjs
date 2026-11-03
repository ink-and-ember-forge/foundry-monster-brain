// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

class FakeApp {
  constructor(options = {}) {
    this.options = options;
    this.rendered = false;
  }
  async render() {
    this.rendered = true;
    this.lastRender = await this._renderHTML();
  }
  async close() {
    this.rendered = false;
  }
}
globalThis.foundry = { applications: { api: { ApplicationV2: FakeApp } }, utils: {} };
globalThis.game = { combat: null };
globalThis.ui = { notifications: { info: vi.fn() } };

const store = { actorRoles: [], override: null };
const calls = [];
vi.mock("../scripts/roles.mjs", () => ({
  getActorRoles: () => store.actorRoles,
  setActorRoles: async (...a) => calls.push(["setActorRoles", ...a]),
  clearActorRoles: async (...a) => calls.push(["clearActorRoles", ...a]),
  getCombatantRoles: () => store.override,
  setCombatantRoles: async (...a) => calls.push(["setCombatantRoles", ...a]),
}));
const refreshMock = vi.fn();
vi.mock("../scripts/turn-watcher.mjs", () => ({ refresh: (...a) => refreshMock(...a) }));

const { MonsterBrainRolesDialog } = await import("../scripts/roles-dialog.mjs");

const actor = { name: "Mira", id: "a1" };
const tokenDoc = { id: "t1", name: "Mira", actor };
const combatant = { id: "c1", tokenId: "t1" };
let dialog;
async function open() {
  dialog = new MonsterBrainRolesDialog({}, tokenDoc);
  await dialog.render();
  return dialog;
}
const q = (sel) => dialog.lastRender.querySelector(sel);
const qa = (sel) => [...dialog.lastRender.querySelectorAll(sel)];
const btn = (text) => qa("button").find((b) => b.textContent === text);
const tick = (tag, on = true) => {
  const box = q(`input[data-tag="${tag}"]`);
  box.checked = on;
  box.dispatchEvent(new Event("change"));
};
const pickScope = (value) => {
  const r = q(`input[name="scope"][value="${value}"]`);
  r.checked = true;
  r.dispatchEvent(new Event("change"));
};

beforeEach(() => {
  store.actorRoles = [];
  store.override = null;
  calls.length = 0;
  refreshMock.mockReset();
  game.combat = null;
});

describe("roles dialog: default scope", () => {
  it("shows suggested roles ticked from what the character already has, plus custom tags", async () => {
    store.actorRoles = ["caster", "bard"];
    await open();
    expect(q('input[data-tag="caster"]').checked).toBe(true);
    expect(q('input[data-tag="healer"]').checked).toBe(false);
    expect(q('input[data-tag="bard"]').checked).toBe(true);
    expect(dialog.lastRender.textContent).toContain("(custom)");
    expect(q(".mb-effect").textContent).toBe("In effect now: caster, bard");
  });
  it("ticking and adding tags edits the draft; Save writes the character's default", async () => {
    await open();
    tick("healer");
    q(".mb-custom").value = "Summoner, squishy";
    btn("Add").click();
    expect(dialog.tags).toEqual(["healer", "summoner", "squishy"]);
    await btn("Save").click();
    await vi.waitFor(() => expect(calls).toContainEqual(["setActorRoles", actor, ["healer", "summoner", "squishy"]]));
    expect(dialog.rendered).toBe(false);
  });
  it("saving no roles clears the default instead of storing an empty list", async () => {
    store.actorRoles = ["caster"];
    await open();
    tick("caster", false);
    await btn("Save").click();
    await vi.waitFor(() => expect(calls).toContainEqual(["clearActorRoles", actor]));
  });
  it("Clear empties the draft without saving", async () => {
    store.actorRoles = ["caster"];
    await open();
    btn("Clear").click();
    expect(dialog.tags).toEqual([]);
    expect(calls).toEqual([]);
  });
  it("Enter in the custom box adds the tag", async () => {
    await open();
    q(".mb-custom").value = "frontliner";
    q(".mb-custom").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(dialog.tags).toEqual(["frontliner"]);
  });
  it("disables the encounter option when the token is not in combat", async () => {
    await open();
    expect(q('input[value="encounter"]').disabled).toBe(true);
    expect(dialog.lastRender.textContent).toContain("not in the current combat");
  });
  it("re-evaluates the strip after saving during a running combat", async () => {
    game.combat = { started: true, combatants: [combatant] };
    await open();
    tick("caster");
    await btn("Save").click();
    await vi.waitFor(() => expect(refreshMock).toHaveBeenCalledWith(game.combat));
  });
  it("does not refresh when no combat is running", async () => {
    await open();
    tick("caster");
    await btn("Save").click();
    await vi.waitFor(() => expect(calls.length).toBe(1));
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

describe("roles dialog: this encounter only", () => {
  beforeEach(() => {
    game.combat = { started: true, combatants: [combatant] };
  });
  it("is available in combat and starts by inheriting the default", async () => {
    store.actorRoles = ["caster"];
    await open();
    expect(q('input[value="encounter"]').disabled).toBe(false);
    pickScope("encounter");
    await dialog.render();
    expect(dialog.inherit).toBe(true);
    expect(q(".mb-inherit").checked).toBe(true);
    // while inheriting, role boxes are locked and show the default
    expect(q('input[data-tag="caster"]').checked).toBe(true);
    expect(q('input[data-tag="caster"]').disabled).toBe(true);
    expect(q(".mb-custom").disabled).toBe(true);
  });
  it("unticking inherit lets you override; Save stores the override on the combatant", async () => {
    store.actorRoles = ["caster"];
    await open();
    pickScope("encounter");
    await dialog.render();
    const inherit = q(".mb-inherit");
    inherit.checked = false;
    inherit.dispatchEvent(new Event("change"));
    await dialog.render();
    tick("squishy");
    await btn("Save").click();
    await vi.waitFor(() => expect(calls).toContainEqual(["setCombatantRoles", combatant, ["caster", "squishy"]]));
    expect(calls.some((c) => c[0] === "setActorRoles")).toBe(false);
  });
  it("saving while inheriting removes the override (null)", async () => {
    store.override = ["healer"];
    await open();
    pickScope("encounter");
    expect(dialog.inherit).toBe(false);
    btn("Clear").click();
    expect(dialog.inherit).toBe(true);
    await btn("Save").click();
    await vi.waitFor(() => expect(calls).toContainEqual(["setCombatantRoles", combatant, null]));
  });
  it("an empty override is kept as an override of no roles", async () => {
    store.actorRoles = ["caster"];
    store.override = ["healer"];
    await open();
    pickScope("encounter");
    tick("healer", false);
    await btn("Save").click();
    await vi.waitFor(() => expect(calls).toContainEqual(["setCombatantRoles", combatant, []]));
  });
  it("'in effect now' reflects the draft: override replaces the default", async () => {
    store.actorRoles = ["caster"];
    await open();
    pickScope("encounter");
    await dialog.render();
    expect(q(".mb-effect").textContent).toBe("In effect now: caster");
    const inherit = q(".mb-inherit");
    inherit.checked = false;
    inherit.dispatchEvent(new Event("change"));
    await dialog.render();
    tick("healer");
    tick("caster", false);
    await dialog.render();
    expect(q(".mb-effect").textContent).toBe("In effect now: healer");
  });
  it("in default scope the line accounts for an existing encounter override", async () => {
    store.actorRoles = ["caster"];
    store.override = ["healer"];
    await open();
    expect(q(".mb-effect").textContent).toBe("In effect now: healer");
  });
});
