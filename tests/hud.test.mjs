// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

class FakeApp {
  constructor() {}
}
globalThis.foundry = { applications: { api: { ApplicationV2: FakeApp } }, utils: {} };
globalThis.game = {};
globalThis.Hooks = { on: vi.fn() };
vi.mock("../scripts/roles.mjs", () => ({}));
vi.mock("../scripts/profiles.mjs", () => ({}));
vi.mock("../scripts/adapter.mjs", () => ({}));
vi.mock("../scripts/dryrun.mjs", () => ({}));
vi.mock("../scripts/turn-watcher.mjs", () => ({}));

const { addHudButton, hudKindFor } = await import("../scripts/hud.mjs");

const hud = (html) => {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
};

describe("addHudButton", () => {
  it("inserts after the effects button, labelled and clickable", () => {
    const root = hud('<div class="col"><button class="control-icon" data-palette="config"></button><button class="control-icon" data-palette="effects"></button><button class="control-icon" data-palette="other"></button></div>');
    const onClick = vi.fn();
    const btn = addHudButton(root, { icon: "fa-brain", label: "Monster Brain", onClick });
    const order = [...root.querySelectorAll("button")].map((b) => b.dataset.palette ?? "mine");
    expect(order).toEqual(["config", "effects", "mine", "other"]);
    expect(btn.getAttribute("aria-label")).toBe("Monster Brain");
    expect(btn.dataset.tooltip).toBe("Monster Brain");
    expect(btn.querySelector("i").className).toBe("fa-solid fa-brain");
    btn.click();
    expect(onClick).toHaveBeenCalledOnce();
  });
  it("falls back to the first control icon when there is no effects button", () => {
    const root = hud('<div><button class="control-icon" data-palette="a"></button><button class="control-icon" data-palette="b"></button></div>');
    addHudButton(root, { icon: "x", label: "L", onClick: () => {} });
    expect([...root.querySelectorAll("button")].map((b) => b.dataset.palette ?? "mine")).toEqual(["a", "mine", "b"]);
  });
  it("returns null and adds nothing if the HUD has no control icons", () => {
    const root = hud("<div></div>");
    expect(addHudButton(root, { icon: "x", label: "L", onClick: () => {} })).toBeNull();
    expect(root.querySelector("button")).toBeNull();
  });
});

describe("hudKindFor", () => {
  const actorOfType = (type) => ({ isOfType: (...ts) => ts.includes(type) });
  it("NPCs configure, PCs get roles, everything else gets nothing", () => {
    expect(hudKindFor(actorOfType("npc"))).toBe("configure");
    expect(hudKindFor(actorOfType("character"))).toBe("roles");
    expect(hudKindFor(actorOfType("hazard"))).toBeNull();
    expect(hudKindFor(null)).toBeNull();
    expect(hudKindFor({})).toBeNull();
  });
});
