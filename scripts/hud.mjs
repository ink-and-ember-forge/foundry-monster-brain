/**
 * Token HUD buttons (right-click a token). NPCs get "configure" (template, rules, slots);
 * PCs get "roles". Anchored beside the effects button, the pattern PF2e itself uses
 * (renderTokenHUD gives an HTMLElement; data._id is the token id; buttons are .control-icon).
 */
import { MonsterBrainDialog } from "./profile-dialog.mjs";
import { MonsterBrainRolesDialog } from "./roles-dialog.mjs";

/** Add a HUD button after the effects button (or the first control icon). Returns the button or null. */
export function addHudButton(html, { icon, label, onClick }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.classList.add("control-icon", "mb-hud");
  btn.dataset.tooltip = label;
  btn.setAttribute("aria-label", label);
  const i = document.createElement("i");
  i.className = `fa-solid ${icon}`;
  btn.append(i);
  btn.addEventListener("click", onClick);
  const anchor = html.querySelector(".control-icon[data-palette=effects]") ?? html.querySelector(".control-icon");
  if (!anchor) return null;
  anchor.after(btn);
  return btn;
}

/** Which button an actor gets: NPCs configure behaviour, PCs get role tags. */
export function hudKindFor(actor) {
  if (!actor?.isOfType) return null;
  if (actor.isOfType("npc")) return "configure";
  if (actor.isOfType("character")) return "roles";
  return null;
}

export function registerTokenHud() {
  Hooks.on("renderTokenHUD", (_app, html, data) => {
    const tokenDoc = canvas.scene?.tokens.get(data?._id ?? "");
    const kind = hudKindFor(tokenDoc?.actor);
    if (kind === "configure") addHudButton(html, { icon: "fa-brain", label: "Monster Brain", onClick: () => MonsterBrainDialog.open(tokenDoc) });
    else if (kind === "roles") addHudButton(html, { icon: "fa-tags", label: "Monster Brain: roles", onClick: () => MonsterBrainRolesDialog.open(tokenDoc) });
  });
}
