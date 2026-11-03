import { MODULE_ID } from "./constants.mjs";
import { stripText, actionsText } from "./engine/suggestion.mjs";
import { actionLabel, MANUAL_ACTION_KEYS } from "./engine/actions.mjs";

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

  /**
   * Show the strip; reuses a single window.
   * @param view { suggestion, turn: { budget, remaining, actions: [{ id, label, source }] } }
   * @param handlers { onTook(), onRemove(id), onAdd(key) }
   */
  static async show(combatant, view, handlers) {
    const app = (this.#instance ??= new this({ position: this.#savedPosition() }));
    app.combatant = combatant;
    app.view = view;
    app.handlers = handlers;
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
    const { suggestion, turn } = this.view;
    const el = document.createElement("div");
    el.classList.add("mb-strip-body");

    // Row 1: the suggestion and the "Took it" button.
    const head = document.createElement("div");
    head.classList.add("mb-row");
    head.title = actionsText(suggestion);
    const name = document.createElement("strong");
    name.textContent = this.combatant?.name ?? "";
    const text = document.createElement("span");
    text.classList.add("mb-text");
    text.textContent = turn.remaining <= 0 ? "No actions left this turn" : stripText(suggestion);
    const took = document.createElement("button");
    took.type = "button";
    took.textContent = "Took it";
    took.disabled = !suggestion;
    took.addEventListener("click", () => this.handlers.onTook());
    head.append(name, document.createTextNode(": "), text, took);

    // Row 2: action budget, the log of this turn's actions (click a chip to remove), and manual add.
    const log = document.createElement("div");
    log.classList.add("mb-row", "mb-log");
    const pips = document.createElement("span");
    pips.classList.add("mb-pips");
    pips.textContent = `${"\u25CF".repeat(turn.remaining)}${"\u25CB".repeat(Math.max(0, turn.budget - turn.remaining))}`;
    pips.title = `${turn.remaining} of ${turn.budget} actions left`;
    log.append(pips);
    for (const a of turn.actions) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.classList.add("mb-chip", `mb-${a.source}`);
      chip.textContent = `${a.label} \u00D7`;
      chip.title = `Remove (${a.source})`;
      chip.addEventListener("click", () => this.handlers.onRemove(a.id));
      log.append(chip);
    }
    const add = document.createElement("select");
    add.classList.add("mb-add");
    add.append(new Option("+ add action", ""));
    for (const key of MANUAL_ACTION_KEYS) add.append(new Option(actionLabel(key), key));
    add.addEventListener("change", () => add.value && this.handlers.onAdd(add.value));
    log.append(add);

    el.append(head, log);
    return el;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }
}
