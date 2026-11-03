import { describe, it, expect, beforeEach } from "vitest";

const store = {};
globalThis.game = {
  settings: {
    get: (_m, k) => store[k],
    set: async (_m, k, v) => {
      store[k] = v;
    },
  },
};

const { templateById, listTemplates, installStarterTemplates } = await import("../scripts/profiles.mjs");

beforeEach(() => {
  store.templates = {};
  store.campaign = {};
});

describe("template lookup", () => {
  it("finds the ten starters by their fighting-style ids", () => {
    expect(listTemplates().map((t) => t.id)).toEqual(["brawler", "berserker", "duelist", "skirmisher", "ambusher", "sniper", "spellslinger", "hexer", "coward", "swarmer"]);
    expect(listTemplates().every((t) => t.source === "starter")).toBe(true);
    expect(templateById("duelist").name).toBe("Duelist");
  });
  it("old role-based ids still find the renamed starter, so existing tokens keep working", () => {
    expect(templateById("brute").name).toBe("Brawler");
    expect(templateById("archer").name).toBe("Sniper");
    expect(templateById("caster").name).toBe("Spellslinger");
    expect(templateById("skittish").name).toBe("Coward");
    expect(templateById("nonsense")).toBeNull();
  });
  it("your own copy under an old id wins over the renamed starter", () => {
    store.templates = { archer: { name: "My archer", rules: [] } };
    expect(templateById("archer").name).toBe("My archer");
    expect(templateById("sniper").name).toBe("Sniper");
  });
  it("your own template overrides a starter of the same id, and is labelled so", () => {
    store.templates = { sniper: { name: "Tweaked sniper", rules: [] } };
    expect(templateById("sniper").name).toBe("Tweaked sniper");
    expect(listTemplates().find((t) => t.id === "sniper")).toMatchObject({ source: "yours (overrides starter)" });
  });
  it("lists your own templates alongside the starters", () => {
    store.templates = { mine: { name: "Mine", rules: [] } };
    const all = listTemplates();
    expect(all).toHaveLength(11);
    expect(all.find((t) => t.id === "mine")).toMatchObject({ source: "yours", name: "Mine" });
  });
});

describe("installStarterTemplates", () => {
  it("copies starters into your world, following renames", async () => {
    const installed = await installStarterTemplates(["archer", "duelist"]);
    expect(installed).toEqual(["sniper", "duelist"]);
    expect(Object.keys(store.templates).sort()).toEqual(["duelist", "sniper"]);
    store.templates.sniper.name = "changed";
    expect(templateById("sniper").name).toBe("changed");
  });
  it("keeps existing copies unless told to overwrite, and ignores unknown ids", async () => {
    store.templates = { sniper: { name: "mine", rules: [] } };
    expect(await installStarterTemplates(["sniper", "nope"])).toEqual([]);
    expect(store.templates.sniper.name).toBe("mine");
    expect(await installStarterTemplates(["sniper"], { overwrite: true })).toEqual(["sniper"]);
    expect(store.templates.sniper.name).toBe("Sniper");
  });
  it("installs a deep copy, not the shipped object", async () => {
    await installStarterTemplates(["brawler"]);
    store.templates.brawler.rules[0].label = "edited";
    expect(templateById("brawler").rules[0].label).toBe("edited");
    const { STARTER_TEMPLATES } = await import("../scripts/engine/starter-templates.mjs");
    expect(STARTER_TEMPLATES.brawler.rules[0].label).toBe("Power attack");
  });
  it("installs every starter when no ids are given", async () => {
    expect(await installStarterTemplates()).toHaveLength(10);
  });
});
