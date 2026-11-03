import { MODULE_ID } from "./constants.mjs";
import {
  stripText,
  actionsText,
  stripParts,
  stepRows,
  adjustmentLines,
  pipsText,
  whyLines,
  heldLines,
  warningLines,
  nextIndex,
  alternativeOf,
} from "./engine/suggestion.mjs";
import { actionLabel, MANUAL_ACTION_KEYS } from "./engine/actions.mjs";
import { el, button } from "./dom.mjs";

const { ApplicationV2 } = foundry.applications.api;

const WIDTH = 380;

/**
 * GM-only panel: a slim one-line strip, expandable to the full card (brief section 11).
 * Uses only ApplicationV2 APIs present in Foundry v13 and v14, and renders without Handlebars.
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

  /** Which of the evaluated suggestions "Something else" has cycled to. */
  index = 0;
  viewKey = null;
  /** Which collapsible sections are open (survives re-render). */
  openSections = new Set();
  expanded = (() => {
    try {
      return game.settings.get(MODULE_ID, "stripExpanded") === true;
    } catch {
      return false;
    }
  })();

  /**
   * @param view { key, suggestions, held, warnings, templateName, round,
   *               turn: { budget, remaining, actions: [{ id, label, source }] } }
   * @param handlers { onTook(suggestion, "step"|"all"), onRemove(id), onAdd(key) }
   */
  static async show(combatant, view, handlers) {
    const app = (this.#instance ??= new this({ position: this.#savedPosition() }));
    if (app.viewKey !== view.key) {
      app.index = 0;
      app.viewKey = view.key;
    }
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

  #toggleExpanded() {
    this.expanded = !this.expanded;
    game.settings.set(MODULE_ID, "stripExpanded", this.expanded);
    this.render({ force: true });
  }

  async _renderHTML() {
    const { suggestions } = this.view;
    const shown = suggestions[this.index % Math.max(1, suggestions.length)] ?? null;
    const out = el("div", { cls: "mb-strip-body" });
    out.append(this.expanded ? this.#card(shown) : this.#line(shown));
    return out;
  }

  #primaryText(shown) {
    return this.view.turn.remaining <= 0 ? "No actions left this turn" : stripText(shown, { noEnemies: this.view.noEnemies });
  }

  /**
   * Collapsed: one line. The action to do NOW is bold after a marker; what follows is muted, so the
   * whole turn is visible with the current step standing out.
   */
  #line(shown) {
    const { turn } = this.view;
    const row = el("div", { cls: "mb-row", title: shown ? `${shown.label}: ${actionsText(shown)}` : "" });
    row.append(el("strong", { text: this.combatant?.name ?? "" }));
    const parts = turn.remaining > 0 ? stripParts(shown) : null;
    if (parts) {
      row.append(document.createTextNode(" "), el("span", { cls: "mb-marker", text: "\u25B6" }), document.createTextNode(" "), el("strong", { cls: "mb-current", text: parts.current }));
      if (parts.target) row.append(el("span", { cls: "mb-target-text", text: ` \u2192 ${parts.target}` }));
      if (parts.then) row.append(el("span", { cls: "mb-then", text: `  then ${parts.then}` }));
    } else {
      row.append(document.createTextNode(": "), el("span", { cls: "mb-text", text: this.#primaryText(shown) }));
    }
    row.append(
      el("span", { cls: "mb-pips", text: pipsText(turn.remaining, turn.budget), title: `${turn.remaining} of ${turn.budget} actions left` }),
      button("Did this", () => this.handlers.onTook(shown, "step"), { title: "Record the highlighted action as done", disabled: !shown || turn.remaining <= 0 }),
      button("\u25BE", () => this.#toggleExpanded(), { title: "Expand", cls: "mb-toggle" }),
    );
    return row;
  }

  /** Expanded: the full card. */
  #card(shown) {
    const { suggestions, held, warnings, templateName, round, turn } = this.view;
    const card = el("div", { cls: "mb-card" });

    const head = el("div", { cls: "mb-row mb-head" });
    head.append(
      el("strong", { text: this.combatant?.name ?? "" }),
      el("span", { cls: "mb-meta", text: `${templateName ?? "no template"} · round ${round}` }),
      el("span", { cls: "mb-pips", text: pipsText(turn.remaining, turn.budget), title: `${turn.remaining} of ${turn.budget} actions left` }),
      button("▴", () => this.#toggleExpanded(), { title: "Collapse", cls: "mb-toggle" }),
    );
    card.append(head);

    // Primary suggestion: the plan for the turn, with the action to do now highlighted.
    const primary = el("div", { cls: "mb-primary" });
    if (turn.remaining <= 0) primary.append(el("div", { cls: "mb-label", text: "No actions left this turn" }));
    else if (!shown) primary.append(el("div", { cls: "mb-label", text: stripText(null, { noEnemies: this.view.noEnemies }) }));
    else {
      primary.append(el("div", { cls: "mb-label", text: shown.label }));
      const steps = el("ol", { cls: "mb-steps" });
      for (const row of stepRows(shown)) {
        const li = el("li", { cls: ["mb-step", `mb-${row.state}`, row.added ? "mb-added" : ""].filter(Boolean) });
        if (row.state === "current") li.setAttribute("aria-current", "step");
        li.append(el("span", { cls: "mb-stepmark", text: row.state === "current" ? "\u25B6" : `${row.index}.` }), document.createTextNode(" "), el("span", { cls: "mb-steplabel", text: row.label }));
        if (row.state === "current" && row.index !== 1) li.append(el("span", { cls: "mb-meta", text: ` (step ${row.index})` }));
        if (row.added) li.append(el("span", { cls: "mb-meta", text: " (added)" }));
        if (row.note) li.append(el("span", { cls: "mb-meta", text: ` \u2014 ${row.note}` }));
        steps.append(li);
      }
      primary.append(steps);
      for (const line of adjustmentLines(shown)) primary.append(el("div", { cls: "mb-adjust", text: line }));
      if (shown.target) primary.append(el("div", { cls: "mb-targetline", text: `Target: ${shown.target}` }));
      if (shown.hint) primary.append(el("div", { cls: "mb-hint", text: shown.hint }));
    }
    const buttons = el("div", { cls: "mb-row" });
    buttons.append(
      button("Did this action", () => this.handlers.onTook(shown, "step"), { title: "Record the highlighted action as done", cls: "mb-primary-btn", disabled: !shown || turn.remaining <= 0 }),
      button("Took whole plan", () => this.handlers.onTook(shown, "all"), { title: "Record every step as done", disabled: !shown || turn.remaining <= 0 || shown.slugs.length < 2 }),
      button(
        "Something else",
        () => {
          this.index = nextIndex(this.index, suggestions.length);
          this.render({ force: true });
        },
        { disabled: suggestions.length < 2 },
      ),
    );
    primary.append(buttons);
    card.append(primary);

    const alt = alternativeOf(suggestions, this.index);
    if (alt) card.append(el("div", { cls: "mb-alt", text: `Alternative: ${stripText(alt)}`, title: actionsText(alt) }));

    // This turn's action log: click a chip to remove it; add what was not detected.
    const log = el("div", { cls: "mb-row mb-log" });
    log.append(el("span", { cls: "mb-meta", text: "This turn:" }));
    if (turn.actions.length === 0) log.append(el("span", { cls: "mb-meta", text: "nothing yet" }));
    for (const a of turn.actions) {
      log.append(button(`${a.label} ×`, () => this.handlers.onRemove(a.id), { cls: ["mb-chip", `mb-${a.source}`], title: `Remove (${a.source})` }));
    }
    const add = el("select", { cls: "mb-add" });
    add.append(new Option("+ add action", ""));
    for (const key of MANUAL_ACTION_KEYS) add.append(new Option(actionLabel(key), key));
    add.addEventListener("change", () => add.value && this.handlers.onAdd(add.value));
    log.append(add);
    card.append(log);

    card.append(
      this.#section("why", "Why this one", whyLines(shown)),
      this.#section("held", `Held back (${held.length})`, heldLines(held)),
    );
    if (warnings.length) card.append(this.#section("warn", `Warnings (${warnings.length})`, warningLines(warnings)));
    return card;
  }

  /** A collapsible list; open state is remembered across re-renders. */
  #section(id, title, lines) {
    const details = el("details", { cls: "mb-section" });
    details.open = this.openSections.has(id);
    details.addEventListener("toggle", () => (details.open ? this.openSections.add(id) : this.openSections.delete(id)));
    details.append(el("summary", { text: title }));
    const list = el("ul");
    for (const line of lines.length ? lines : ["nothing"]) list.append(el("li", { text: line }));
    details.append(list);
    return details;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }
}
