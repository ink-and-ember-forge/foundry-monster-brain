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

const store = { actor: null, token: null };
const calls = [];
const record = (name) => vi.fn(async (...args) => calls.push([name, ...args]));

vi.mock("../scripts/profiles.mjs", () => ({
  getProfile: () => store.actor,
  setProfile: (...a) => record("setProfile")(...a),
  clearProfile: (...a) => record("clearProfile")(...a),
  getTokenProfile: () => store.token,
  setTokenProfile: (...a) => record("setTokenProfile")(...a),
  clearTokenProfile: (...a) => record("clearTokenProfile")(...a),
  listTemplates: () => [
    { id: "archer", name: "Archer", source: "starter" },
    { id: "brute", name: "Brute", source: "starter" },
  ],
  templateById: (id) => ({ name: id === "brute" ? "Brute" : id, description: id === "archer" ? "Shoots from range." : undefined }),
}));
vi.mock("../scripts/adapter.mjs", () => ({
  itemsFor: () => [
    { id: "bow", label: "Shortbow", kind: "ranged" },
    { id: "spell", label: "Fireball", kind: "other" },
  ],
}));
const dryRunMock = vi.fn();
vi.mock("../scripts/dryrun.mjs", () => ({ dryRun: (...a) => dryRunMock(...a) }));
const refreshMock = vi.fn();
vi.mock("../scripts/turn-watcher.mjs", () => ({ refresh: (...a) => refreshMock(...a) }));

const { MonsterBrainDialog } = await import("../scripts/profile-dialog.mjs");

const run = (over = {}) => ({
  resolved: {
    rules: [
      { id: "volley", label: "Volley", source: "template" },
      { id: "close-in", label: "Close the distance", source: "system", enabled: false, disabledBy: "creature" },
      { id: "last-stand", label: "Last stand", source: "system" },
    ],
    slots: ["ranged-strike", "signature"],
  },
  binding: { bound: { "ranged-strike": { label: "Shortbow", auto: true } }, unbound: ["signature"] },
  report: { name: "Goblin", templateName: "archer", round: 1, suggestions: [], held: [], warnings: [] },
  ...over,
});

const tokenDoc = { id: "t1", name: "Goblin 2", actor: { name: "Goblin", id: "a1" }, object: null };
let dialog;
async function open() {
  dryRunMock.mockImplementation(() => run());
  dialog = new MonsterBrainDialog({}, tokenDoc);
  await dialog.render();
  return dialog;
}
const q = (sel) => dialog.lastRender.querySelector(sel);
const qa = (sel) => [...dialog.lastRender.querySelectorAll(sel)];
const btn = (text) => qa("button").find((b) => b.textContent === text);

beforeEach(() => {
  store.actor = null;
  store.token = null;
  calls.length = 0;
  dryRunMock.mockReset();
  refreshMock.mockReset();
  game.combat = null;
});

describe("configure dialog", () => {
  it("titles itself with the token, and defaults to this token only", async () => {
    await open();
    expect(dialog.title).toBe("Monster Brain: Goblin 2");
    expect(dialog.scope).toBe("token");
    expect(q('input[name="scope"][value="token"]').checked).toBe(true);
    expect(dialog.lastRender.textContent).toContain("This token only (Goblin 2)");
    expect(dialog.lastRender.textContent).toContain("Every Goblin token");
  });
  it("previews with the draft and the token (not the actor's first token)", async () => {
    await open();
    expect(dryRunMock).toHaveBeenCalledWith(tokenDoc.actor, expect.objectContaining({ tokenDoc, print: false, draft: { scope: "token", profile: {} } }));
    expect(q(".mb-preview").textContent).toContain("Goblin (archer, round 1)");
  });
  it("offers 'same as the actor' at token scope, naming the actor's template", async () => {
    store.actor = { template: "brute" };
    await open();
    const opts = [...q(".mb-template").options].map((o) => o.text);
    expect(opts[0]).toBe("Same as the actor (Brute)");
    expect(q(".mb-template").value).toBe("__inherit__");
  });
  it("says in words what kind of fighter the chosen template makes", async () => {
    store.token = { template: "archer" };
    await open();
    expect(q(".mb-about").textContent).toBe("Shoots from range.");
  });
  it("shows no description line when the template has none", async () => {
    store.token = { template: "brute" };
    await open();
    expect(q(".mb-about")).toBeNull();
  });
  it("choosing a template updates the draft and re-previews", async () => {
    await open();
    const sel = q(".mb-template");
    sel.value = "archer";
    sel.dispatchEvent(new Event("change"));
    expect(dialog.draft).toEqual({ template: "archer" });
    await dialog.render();
    expect(dryRunMock).toHaveBeenLastCalledWith(tokenDoc.actor, expect.objectContaining({ draft: { scope: "token", profile: { template: "archer" } } }));
  });
  it("lists rules; unticking one disables it; a rule off in another layer is locked", async () => {
    await open();
    const boxes = qa(".mb-rule input");
    expect(boxes).toHaveLength(3);
    expect(boxes[1].disabled).toBe(true);
    expect(dialog.lastRender.textContent).toContain("turned off by the creature layer");
    boxes[0].checked = false;
    boxes[0].dispatchEvent(new Event("change"));
    expect(dialog.draft).toEqual({ disable: ["volley"] });
  });
  it("shows each slot's binding, flags unbound ones, and binds an item", async () => {
    await open();
    const rows = qa(".mb-slot");
    expect(rows[0].textContent).toContain("Shortbow (auto)");
    expect(rows[1].querySelector(".mb-warn").textContent).toBe("not bound");
    const sel = rows[1].querySelector("select");
    sel.value = "spell";
    sel.dispatchEvent(new Event("change"));
    expect(dialog.draft).toEqual({ slotBindings: { signature: "spell" } });
  });
  it("switching scope loads that scope's stored profile", async () => {
    store.actor = { template: "brute" };
    store.token = { template: "archer" };
    await open();
    expect(dialog.draft).toEqual({ template: "archer" });
    const radio = q('input[name="scope"][value="actor"]');
    radio.checked = true;
    radio.dispatchEvent(new Event("change"));
    expect(dialog.scope).toBe("actor");
    expect(dialog.draft).toEqual({ template: "brute" });
    // actor scope does not offer "same as the actor"
    await dialog.render();
    expect([...q(".mb-template").options].map((o) => o.value)).not.toContain("__inherit__");
  });
  it("Save writes the token profile for token scope, then closes", async () => {
    await open();
    dialog.draft = { template: "archer" };
    await btn("Save").click();
    await vi.waitFor(() => expect(calls).toContainEqual(["setTokenProfile", tokenDoc, { template: "archer" }]));
    expect(calls.some((c) => c[0] === "setProfile")).toBe(false);
    expect(dialog.rendered).toBe(false);
  });
  it("Save writes the actor profile for actor scope", async () => {
    await open();
    dialog.scope = "actor";
    dialog.draft = { disable: ["last-stand"] };
    await btn("Save").click();
    await vi.waitFor(() => expect(calls).toContainEqual(["setProfile", tokenDoc.actor, { disable: ["last-stand"] }]));
  });
  it("saving an empty draft clears instead of writing nothing", async () => {
    store.token = { template: "archer" };
    await open();
    dialog.draft = {};
    await btn("Save").click();
    await vi.waitFor(() => expect(calls).toContainEqual(["clearTokenProfile", tokenDoc]));
  });
  it("Clear this setting empties the draft without saving", async () => {
    store.token = { template: "archer" };
    await open();
    await btn("Clear this setting").click();
    expect(dialog.draft).toEqual({});
    expect(calls).toEqual([]);
  });
  it("refreshes the strip after saving if this token is acting now", async () => {
    game.combat = { combatant: { tokenId: "t1" } };
    await open();
    dialog.draft = { template: "archer" };
    await btn("Save").click();
    await vi.waitFor(() => expect(refreshMock).toHaveBeenCalledWith(game.combat));
  });
  it("does not refresh when another token is acting", async () => {
    game.combat = { combatant: { tokenId: "other" } };
    await open();
    dialog.draft = { template: "archer" };
    await btn("Save").click();
    await vi.waitFor(() => expect(calls.length).toBe(1));
    expect(refreshMock).not.toHaveBeenCalled();
  });
  it("Cancel closes without saving", async () => {
    await open();
    await btn("Cancel").click();
    expect(dialog.rendered).toBe(false);
    expect(calls).toEqual([]);
  });
  it("renders names safely", async () => {
    tokenDoc.name = "<img src=x onerror=alert(1)>";
    await open();
    expect(dialog.lastRender.querySelector("img")).toBeNull();
    tokenDoc.name = "Goblin 2";
  });
});
