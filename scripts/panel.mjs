import { MODULE_ID } from "./constants.mjs";
import { stripText } from "./engine/suggestion.mjs";

const { ApplicationV2 } = foundry.applications.api;

const WIDTH = 360;

/**
 * Slim GM-only strip. Uses only ApplicationV2 APIs present in Foundry v13 and v14,
 * and renders without Handlebars to keep that surface small.
 */
export class MonsterBrainStrip extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-strip`,
    classes: [MODULE_ID, "mb-strip"],
    window: { title: "MONSTERBRAIN.Title", minimizable: false, resizable: false },
    position: { width: WIDTH, height: "auto" },
  };

  /** @type {MonsterBrainStrip|null} */
  static #instance = null;

  /** Show the strip for a combatant and suggestion; reuses a single window. */
  static async show(combatant, suggestion) {
    const app = (this.#instance ??= new this({ position: this.#savedPosition() }));
    app.combatant = combatant;
    app.suggestion = suggestion;
    await app.render({ force: true });
    return app;
  }

  static async hide() {
    const app = this.#instance;
    if (app?.rendered) await app.close();
  }

  static #savedPosition() {
    let saved = null;
    try {
      saved = game.settings.get(MODULE_ID, "stripPosition");
    } catch {
      /* setting not registered yet */
    }
    if (saved && Number.isFinite(saved.top) && Number.isFinite(saved.left)) {
      return { width: WIDTH, height: "auto", top: saved.top, left: saved.left };
    }
    // Default: top centre, clear of the combat tracker (right) and hotbar (bottom).
    return { width: WIDTH, height: "auto", top: 12, left: Math.max(0, (window.innerWidth - WIDTH) / 2) };
  }

  _persistPosition = foundry.utils.debounce(() => {
    const { top, left } = this.position;
    game.settings.set(MODULE_ID, "stripPosition", { top, left });
  }, 500);

  setPosition(position) {
    const result = super.setPosition(position);
    if (this.rendered) this._persistPosition();
    return result;
  }

  async _renderHTML() {
    const el = document.createElement("div");
    el.classList.add("mb-strip-body");
    const name = document.createElement("strong");
    name.textContent = this.combatant?.name ?? "";
    const text = document.createElement("span");
    text.textContent = stripText(this.suggestion);
    el.append(name, document.createTextNode(": "), text);
    return el;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }
}
