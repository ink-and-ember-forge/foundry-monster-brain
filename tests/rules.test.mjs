// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

let packs;
let prompt;

async function load() {
  vi.resetModules();
  return import("../scripts/rules.mjs");
}

const fakePack = (entries, doc) => ({
  getIndex: vi.fn(async () => entries),
  getDocument: vi.fn(async () => doc),
});

beforeEach(() => {
  packs = new Map();
  prompt = vi.fn(async () => {});
  globalThis.game = { packs: { get: (id) => packs.get(id) } };
  globalThis.foundry = { applications: { api: { DialogV2: { prompt } } } };
  globalThis.ui = { notifications: { info: vi.fn() } };
});

describe("matching a PF2e pack entry by name", () => {
  it("ignores case and stray spaces, and finds nothing for a blank name", async () => {
    const { matchEntry } = await load();
    const entries = [{ _id: "a", name: "Step" }, { _id: "b", name: " Raise a Shield " }];
    expect(matchEntry(entries, "raise a shield")._id).toBe("b");
    expect(matchEntry(entries, "STEP")._id).toBe("a");
    expect(matchEntry(entries, "Stride")).toBeNull();
    expect(matchEntry(entries, "")).toBeNull();
    expect(matchEntry(entries, undefined)).toBeNull();
  });
});

describe("opening the rules", () => {
  it("opens PF2e's own entry for the action in a sheet", async () => {
    const render = vi.fn();
    const pack = fakePack([{ _id: "t1", name: "Trip" }], { sheet: { render } });
    packs.set("pf2e.actionspf2e", pack);
    const { openRules } = await load();
    expect(await openRules("trip")).toBe(true);
    expect(pack.getDocument).toHaveBeenCalledWith("t1");
    expect(render).toHaveBeenCalledWith({ force: true });
    expect(prompt).not.toHaveBeenCalled();
  });
  it("uses the catalog's compendium name, not the slug (Create a Diversion, Tumble Through, Stride away)", async () => {
    const pack = fakePack([{ _id: "d", name: "Create a Diversion" }, { _id: "s", name: "Stride" }], { sheet: { render: vi.fn() } });
    packs.set("pf2e.actionspf2e", pack);
    const { openRules } = await load();
    await openRules("create-a-diversion");
    expect(pack.getDocument).toHaveBeenLastCalledWith("d");
    await openRules("stride-away");
    expect(pack.getDocument).toHaveBeenLastCalledWith("s");
  });
  it("fetches the pack index once, however many times it is opened", async () => {
    const pack = fakePack([{ _id: "t1", name: "Trip" }], { sheet: { render: vi.fn() } });
    packs.set("pf2e.actionspf2e", pack);
    const { openRules } = await load();
    await openRules("trip");
    await openRules("trip");
    expect(pack.getIndex).toHaveBeenCalledTimes(1);
  });
  it("falls back to the catalog's summary when the pack is missing", async () => {
    const { openRules } = await load();
    expect(await openRules("trip")).toBe(false);
    const arg = prompt.mock.calls[0][0];
    expect(arg.window.title).toBe("Trip");
    expect(arg.content).toContain("Athletics vs Reflex DC");
    expect(arg.content).not.toContain("full PF2e rules");
  });
  it("falls back when the entry is not in the pack (a renamed or translated entry)", async () => {
    packs.set("pf2e.actionspf2e", fakePack([{ _id: "x", name: "Something else" }], null));
    const { openRules } = await load();
    expect(await openRules("demoralize")).toBe(false);
    expect(prompt).toHaveBeenCalledTimes(1);
  });
  it("falls back, with a warning, when opening throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    packs.set("pf2e.actionspf2e", { getIndex: async () => { throw new Error("pack broke"); }, getDocument: async () => null });
    const { openRules } = await load();
    expect(await openRules("trip")).toBe(false);
    expect(warn).toHaveBeenCalled();
    expect(prompt).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
  it("shows a notification when there is no dialog class", async () => {
    globalThis.foundry = { applications: { api: {} } };
    const { openRules } = await load();
    await openRules("trip");
    expect(ui.notifications.info.mock.calls[0][0]).toMatch(/Trip/);
  });
  it("does nothing for an action with no rules to open (a custom slot, the signature)", async () => {
    const { openRules } = await load();
    expect(await openRules("flaming-arrow")).toBe(false);
    expect(await openRules("signature")).toBe(false);
    expect(prompt).not.toHaveBeenCalled();
  });
  it("escapes anything it puts in the fallback window", async () => {
    const { openRules } = await load();
    await openRules("raise-a-shield");
    expect(prompt.mock.calls[0][0].content).not.toMatch(/<(?!\/?(p|strong)\b)/);
  });
});
