// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

class FakeApp {
  constructor(options = {}) {
    this.options = options;
    this.renders = 0;
    this.rendered = false;
  }
  async render() {
    this.renders++;
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
globalThis.confirm = vi.fn(() => true);

const world = {};
let campaign = {};
const saved = [];
vi.mock("../scripts/profiles.mjs", async () => {
  const { STARTER_TEMPLATES } = await import("../scripts/engine/starter-templates.mjs");
  return {
    listTemplates: () => [
      ...Object.entries(world).map(([id, t]) => ({ id, name: t.name ?? id, source: id in STARTER_TEMPLATES ? "yours (overrides starter)" : "yours" })),
      ...Object.entries(STARTER_TEMPLATES).filter(([id]) => !(id in world)).map(([id, t]) => ({ id, name: t.name, source: "starter" })),
    ],
    templateById: (id) => world[id] ?? STARTER_TEMPLATES[id] ?? null,
    setTemplate: async (id, t) => {
      world[id] = structuredClone(t);
      saved.push(["setTemplate", id, structuredClone(t)]);
    },
    deleteTemplate: async (id) => {
      delete world[id];
      saved.push(["deleteTemplate", id]);
    },
    getCampaign: () => campaign,
    setCampaign: async (c) => {
      campaign = c;
      saved.push(["setCampaign", structuredClone(c)]);
    },
  };
});
const refreshMock = vi.fn();
vi.mock("../scripts/turn-watcher.mjs", () => ({ refresh: (...a) => refreshMock(...a) }));

const { MonsterBrainEditor } = await import("../scripts/template-editor.mjs");

let app;
async function open() {
  app = new MonsterBrainEditor();
  await app.render();
  return app;
}
const q = (sel) => app.lastRender.querySelector(sel);
const qa = (sel) => [...app.lastRender.querySelectorAll(sel)];
const btn = (text) => qa("button").find((b) => b.textContent === text);
const fire = (node, type = "change") => node.dispatchEvent(new Event(type, { bubbles: true }));
const setVal = (node, value, type = "change") => {
  node.value = value;
  fire(node, type);
};
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
async function click(text) {
  btn(text).click();
  await settle();
}
/** Duplicate the starter sniper into an editable copy and open its first rule. */
async function editableCopy() {
  await open();
  setVal(q(".mb-picker"), "sniper");
  await settle();
  await click("Duplicate");
  q(".mb-rulecard").open = true;
}

beforeEach(() => {
  for (const k of Object.keys(world)) delete world[k];
  campaign = {};
  saved.length = 0;
  refreshMock.mockReset();
  globalThis.confirm = vi.fn(() => true);
  game.combat = null;
});

describe("starter templates", () => {
  it("open read-only: inputs disabled, banner shown, Save and Delete off", async () => {
    await open();
    expect(app.readOnly).toBe(true);
    expect(q(".mb-body").disabled).toBe(true);
    expect(q(".mb-banner").textContent).toContain("read-only");
    expect(btn("Save").disabled).toBe(true);
    expect(btn("Delete").disabled).toBe(true);
    expect(btn("Duplicate").disabled).toBe(false);
  });
  it("lists the ten starters by fighting style, labelled", async () => {
    await open();
    expect([...q(".mb-picker").options].map((o) => o.text)).toEqual([
      "Brawler (starter)", "Berserker (starter)", "Duelist (starter)", "Skirmisher (starter)", "Ambusher (starter)",
      "Sniper (starter)", "Spellslinger (starter)", "Hexer (starter)", "Coward (starter)", "Swarmer (starter)",
    ]);
  });
});

describe("duplicating and saving", () => {
  it("Duplicate makes an editable, unsaved copy with a unique id", async () => {
    await editableCopy();
    expect(app.selectedId).toBe("sniper-copy");
    expect(app.draft.name).toBe("Sniper (copy)");
    expect(app.readOnly).toBe(false);
    expect(app.dirty).toBe(true);
    expect([...q(".mb-picker").options].map((o) => o.text)).toContain("Sniper (copy) (unsaved)");
    expect(q(".mb-body").disabled).toBe(false);
  });
  it("Save writes the template, clears dirty, and re-evaluates a running combat", async () => {
    game.combat = { started: true };
    await editableCopy();
    await click("Save");
    await vi.waitFor(() => expect(saved[0][0]).toBe("setTemplate"));
    expect(saved[0][1]).toBe("sniper-copy");
    expect(saved[0][2].rules.map((r) => r.id)).toEqual(["sniper-retreat-and-shoot", "sniper-volley"]);
    expect(app.dirty).toBe(false);
    expect(app.isNew).toBe(false);
    expect(refreshMock).toHaveBeenCalledWith(game.combat);
    expect([...q(".mb-picker").options].map((o) => o.text)).toContain("Sniper (copy)");
  });
  it("New creates a blank template", async () => {
    await open();
    await click("New");
    expect(app.draft).toMatchObject({ name: "New template", rules: [] });
    expect(app.isNew).toBe(true);
    expect(btn("Discard")).toBeTruthy();
  });
});

describe("typing does not re-render (so Save is never lost)", () => {
  it("renaming a rule updates its summary and the draft without re-rendering", async () => {
    await editableCopy();
    const before = app.renders;
    const label = q(".mb-rulecard input[type=text]");
    setVal(label, "Run and gun", "input");
    expect(app.renders).toBe(before);
    expect(app.draft.rules[0].label).toBe("Run and gun");
    expect(q(".mb-ruletitle").textContent).toBe("Run and gun");
    expect(app.dirty).toBe(true);
  });
  it("editing a number param and a limit does not re-render, and clamps on blur", async () => {
    await editableCopy();
    app.draft.rules[1].when[1].feet = 60; // sniper-volley: enemy-within 60
    await app.render();
    const before = app.renders;
    const volley = qa(".mb-rulecard")[1];
    const feet = volley.querySelector("input.mb-param");
    setVal(feet, "2", "input");
    expect(app.renders).toBe(before);
    expect(app.draft.rules[1].when[1].feet).toBe(5);
    fire(feet, "change");
    expect(feet.value).toBe("5");
    const maxPerTurn = volley.querySelectorAll("input.mb-limit")[0];
    setVal(maxPerTurn, "2", "input");
    expect(app.draft.rules[1].limits.maxPerTurn).toBe(2);
    expect(app.renders).toBe(before);
  });
});

describe("rule editing", () => {
  it("adds a condition with defaults, changes its type, negates it and removes it", async () => {
    await editableCopy();
    const card = () => qa(".mb-rulecard")[0];
    setVal(card().querySelector(".mb-addselect"), "self-hp-below");
    await settle();
    await app.render();
    expect(app.draft.rules[0].when.at(-1)).toEqual({ type: "self-hp-below", percent: 25 });
    const last = () => [...card().querySelectorAll(".mb-cond")].at(-1);
    setVal(last().querySelector(".mb-condtype"), "enemy-within");
    await app.render();
    expect(app.draft.rules[0].when.at(-1)).toEqual({ type: "enemy-within", feet: 30 });
    const box = last().querySelector("input[type=checkbox]");
    box.checked = true;
    fire(box);
    await app.render();
    expect(app.draft.rules[0].when.at(-1).not).toBe(true);
    expect(card().querySelector(".mb-rulesentence").textContent).toContain("NOT (an enemy is within 30 ft)");
    last().querySelector("button[title='Remove condition']").click();
    await app.render();
    expect(app.draft.rules[0].when.at(-1).type).not.toBe("enemy-within");
  });
  it("offers a condition-slug list and stores slugs lowercased", async () => {
    await editableCopy();
    app.draft.rules[0].when = [{ type: "self-has-condition", slug: "frightened" }];
    await app.render();
    const input = q(".mb-cond input.mb-param");
    expect(input.getAttribute("list")).toBe("monster-brain-condition-slugs");
    expect(q("#monster-brain-condition-slugs option[value=prone]")).toBeTruthy();
    setVal(input, "Off-Guard", "input");
    expect(app.draft.rules[0].when[0].slug).toBe("off-guard");
  });
  it("edits actions: add, reorder, custom slot, remove", async () => {
    await editableCopy();
    const doing = () => qa(".mb-rulecard")[0].querySelectorAll(".mb-action");
    const start = app.draft.rules[0].do.length;
    qa(".mb-rulecard")[0].querySelector("fieldset:nth-of-type(2) > button").click();
    await app.render();
    expect(app.draft.rules[0].do).toHaveLength(start + 1);
    setVal(doing()[start].querySelector(".mb-actionsel"), "__custom__");
    await app.render();
    expect(app.draft.rules[0].do[start]).toBe("custom-slot");
    const custom = doing()[start].querySelector(".mb-customslot");
    setVal(custom, "Flaming Arrow");
    expect(app.draft.rules[0].do[start]).toBe("flaming-arrow");
    expect(custom.value).toBe("flaming-arrow");
    setVal(custom, "   ");
    expect(app.draft.rules[0].do[start]).toBe("flaming-arrow");
    doing()[start].querySelector("button[title='Move earlier']").click();
    await app.render();
    expect(app.draft.rules[0].do[start - 1]).toBe("flaming-arrow");
    doing()[start - 1].querySelector("button[title='Remove action']").click();
    await app.render();
    expect(app.draft.rules[0].do).not.toContain("flaming-arrow");
  });
  it("edits target preferences including a role", async () => {
    await editableCopy();
    const rows = () => qa(".mb-rulecard")[0].querySelectorAll(".mb-target");
    expect(app.draft.rules[0].target).toEqual(["role:caster", "lowest-hp"]);
    const role = rows()[0].querySelector(".mb-roleinput");
    expect(role.value).toBe("caster");
    setVal(role, " Healer ");
    expect(app.draft.rules[0].target[0]).toBe("role:healer");
    expect(role.value).toBe("healer");
    setVal(rows()[1].querySelector(".mb-targetsel"), "nearest");
    await app.render();
    expect(app.draft.rules[0].target).toEqual(["role:healer", "nearest"]);
    rows()[1].querySelector("button[title='Move earlier']").click();
    await app.render();
    expect(app.draft.rules[0].target).toEqual(["nearest", "role:healer"]);
  });
  it("sets once-per-encounter and clears limits when emptied", async () => {
    await editableCopy();
    const card = qa(".mb-rulecard")[0];
    const once = card.querySelector("fieldset:nth-of-type(4) input[type=checkbox]");
    once.checked = true;
    fire(once);
    expect(app.draft.rules[0].limits.oncePerEncounter).toBe(true);
    once.checked = false;
    fire(once);
    setVal(card.querySelectorAll("input.mb-limit")[0], "", "input");
    setVal(card.querySelectorAll("input.mb-limit")[1], "", "input");
    expect(app.draft.rules[0]).not.toHaveProperty("limits");
  });
  it("adds, moves and deletes rules", async () => {
    await editableCopy();
    await click("+ Add rule");
    expect(app.draft.rules.map((r) => r.id)).toEqual(["sniper-retreat-and-shoot", "sniper-volley", "new-rule"]);
    const up = qa("button").filter((b) => b.textContent === "↑ Move up")[2];
    up.click();
    await app.render();
    expect(app.draft.rules.map((r) => r.id)).toEqual(["sniper-retreat-and-shoot", "new-rule", "sniper-volley"]);
    const del = qa("button").filter((b) => b.textContent === "Delete rule")[1];
    del.click();
    await settle();
    await vi.waitFor(() => expect(app.draft.rules.map((r) => r.id)).toEqual(["sniper-retreat-and-shoot", "sniper-volley"]));
  });
  it("declining the confirmation keeps the rule", async () => {
    await editableCopy();
    globalThis.confirm = vi.fn(() => false);
    qa("button").filter((b) => b.textContent === "Delete rule")[0].click();
    await settle();
    expect(app.draft.rules).toHaveLength(2);
  });
  it("shows rule warnings inline", async () => {
    await editableCopy();
    app.draft.rules[0].when = [{ type: "mystery" }];
    await app.render();
    expect(qa(".mb-rulecard")[0].querySelector(".mb-rulewarn").textContent).toBe("⚠ 1");
    expect(qa(".mb-rulecard")[0].textContent).toContain('unknown condition "mystery"');
  });
});

describe("shipped default rules", () => {
  it("can be switched off per template", async () => {
    await editableCopy();
    const row = qa(".mb-section .mb-rule").find((r) => r.textContent.includes("Strike, strike"));
    const box = row.querySelector("input");
    expect(box.checked).toBe(true);
    box.checked = false;
    fire(box);
    expect(app.draft.disable).toContain("fallback-strikes");
  });
  it("locks a shipped rule the template replaces itself", async () => {
    await open();
    setVal(q(".mb-picker"), "spellslinger");
    await settle();
    await click("Duplicate");
    const row = qa(".mb-section .mb-rule").find((r) => r.textContent.includes("Open with signature"));
    expect(row.querySelector("input").disabled).toBe(true);
    expect(row.textContent).toContain("replaced by this template");
  });
});

describe("deleting, switching and closing", () => {
  it("deletes a saved template after confirming, and not when declined", async () => {
    await editableCopy();
    await click("Save");
    await vi.waitFor(() => expect(world["sniper-copy"]).toBeTruthy());
    globalThis.confirm = vi.fn(() => false);
    await click("Delete");
    expect(world["sniper-copy"]).toBeTruthy();
    globalThis.confirm = vi.fn(() => true);
    await click("Delete");
    await vi.waitFor(() => expect(world["sniper-copy"]).toBeUndefined());
    expect(saved.some((s) => s[0] === "deleteTemplate")).toBe(true);
  });
  it("Discard drops an unsaved template without touching storage", async () => {
    await open();
    await click("New");
    await click("Discard");
    expect(saved).toEqual([]);
    expect(app.isNew).toBe(false);
  });
  it("switching templates with unsaved changes asks first", async () => {
    await editableCopy();
    globalThis.confirm = vi.fn(() => false);
    await app.select("brawler");
    expect(app.selectedId).toBe("sniper-copy");
    globalThis.confirm = vi.fn(() => true);
    await app.select("brawler");
    expect(app.selectedId).toBe("brawler");
    expect(app.dirty).toBe(false);
  });
  it("closing with unsaved changes asks first", async () => {
    await editableCopy();
    globalThis.confirm = vi.fn(() => false);
    await app.close();
    expect(app.rendered).toBe(true);
    globalThis.confirm = vi.fn(() => true);
    await app.close();
    expect(app.rendered).toBe(false);
  });
  it("re-rendering keeps the scroll position", () => {
    const content = { scrollTop: 240, replaceChildren: vi.fn() };
    app.constructor.prototype._replaceHTML.call(app, document.createElement("div"), content);
    expect(content.scrollTop).toBe(240);
  });
});

describe("campaign policies tab", () => {
  async function campaignTab() {
    await open();
    await click("Campaign policies");
  }
  it("shows the shipped default cap", async () => {
    await campaignTab();
    expect(q(".mb-cap-limited").checked).toBe(true);
    expect(q(".mb-cap-value").value).toBe("2");
  });
  it("saves a new cap", async () => {
    await campaignTab();
    setVal(q(".mb-cap-value"), "3", "input");
    await click("Save");
    await vi.waitFor(() => expect(saved.at(-1)).toEqual(["setCampaign", { policies: { maxSameActionPerTurn: 3 } }]));
  });
  it("saves 'no limit' as null", async () => {
    await campaignTab();
    const box = q(".mb-cap-limited");
    box.checked = false;
    fire(box);
    await app.render();
    expect(q(".mb-cap-value").disabled).toBe(true);
    await click("Save");
    await vi.waitFor(() => expect(saved.at(-1)[1].policies.maxSameActionPerTurn).toBeNull());
  });
  it("reads an existing campaign setting back", async () => {
    campaign = { policies: { maxSameActionPerTurn: null } };
    await campaignTab();
    expect(q(".mb-cap-limited").checked).toBe(false);
  });
});

describe("safety", () => {
  it("renders names as text, never HTML", async () => {
    await editableCopy();
    app.draft.name = "<img src=x onerror=alert(1)>";
    app.draft.rules[0].label = "<b>bold</b>";
    await app.render();
    expect(app.lastRender.querySelector("img")).toBeNull();
    expect(app.lastRender.querySelector(".mb-ruletitle b")).toBeNull();
  });
});
