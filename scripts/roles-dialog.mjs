/**
 * "Roles" dialog: tag a PC (caster, healer, squishy, ...) so monster rules can prefer them.
 * Two layers, as in the engine: a default on the character, and an optional override that applies
 * to this encounter only (stored on its combatant, replacing the default for that fight).
 */
import { MODULE_ID } from "./constants.mjs";
import { el, button } from "./dom.mjs";
import { SUGGESTED_ROLES, resolveRoles } from "./engine/targets.mjs";
import { toggleRole, addTags, roleChoices } from "./engine/role-draft.mjs";
import { getActorRoles, setActorRoles, clearActorRoles, getCombatantRoles, setCombatantRoles } from "./roles.mjs";
import { refresh } from "./turn-watcher.mjs";

const { ApplicationV2 } = foundry.applications.api;

export class MonsterBrainRolesDialog extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-roles`,
    classes: [MODULE_ID, "mb-dialog"],
    window: { title: "Monster Brain: roles", resizable: false },
    position: { width: 380, height: "auto" },
  };

  static #open = new Map();

  /** @param token a TokenDocument or Token placeable */
  static open(token) {
    const doc = token.document ?? token;
    let app = this.#open.get(doc.id);
    if (!app) {
      app = new this({ id: `${MODULE_ID}-roles-${doc.id}` }, doc);
      this.#open.set(doc.id, app);
    }
    return app.render({ force: true });
  }

  constructor(options, tokenDoc) {
    super(options);
    this.tokenDoc = tokenDoc;
    this.actor = tokenDoc.actor;
    this.combatant = game.combat?.combatants?.find((c) => c.tokenId === tokenDoc.id) ?? null;
    this.scope = "default";
    this.#load();
  }

  get title() {
    return `Monster Brain: roles for ${this.tokenDoc.name}`;
  }

  async close(options) {
    MonsterBrainRolesDialog.#open.delete(this.tokenDoc.id);
    return super.close(options);
  }

  /** Load the draft for the current scope. `inherit` only applies to the encounter scope. */
  #load() {
    if (this.scope === "default") {
      this.tags = getActorRoles(this.actor);
      this.inherit = false;
    } else {
      const override = getCombatantRoles(this.combatant);
      this.inherit = override == null;
      this.tags = override ?? getActorRoles(this.actor);
    }
  }

  #update(fn) {
    fn();
    this.render({ force: true });
  }

  async #save() {
    if (this.scope === "default") {
      await (this.tags.length ? setActorRoles(this.actor, this.tags) : clearActorRoles(this.actor));
    } else {
      await setCombatantRoles(this.combatant, this.inherit ? null : this.tags);
    }
    ui.notifications?.info(`Monster Brain: roles saved for ${this.tokenDoc.name}`);
    // Roles change target choice, so re-evaluate if a combat is running.
    if (game.combat?.started) refresh(game.combat);
    return this.close();
  }

  /** The tags a monster would see right now, given what is saved and what is being edited. */
  #inEffect() {
    const savedDefault = this.scope === "default" ? this.tags : getActorRoles(this.actor);
    let override = this.combatant ? getCombatantRoles(this.combatant) : null;
    if (this.scope === "encounter") override = this.inherit ? null : this.tags;
    return resolveRoles(savedDefault, override);
  }

  async _renderHTML() {
    const root = el("form", { cls: "mb-form" });
    root.addEventListener("submit", (e) => e.preventDefault());

    // Scope.
    const scope = el("fieldset");
    scope.append(el("legend", { text: "Applies to" }));
    const options = [
      ["default", `${this.actor.name} in every encounter (the default)`, false],
      ["encounter", "This encounter only (overrides the default)", !this.combatant],
    ];
    for (const [value, label, disabled] of options) {
      const row = el("label", { cls: "mb-radio" });
      const input = el("input", { attrs: { type: "radio", name: "scope", value } });
      input.checked = this.scope === value;
      input.disabled = disabled;
      input.addEventListener("change", () => this.#update(() => ((this.scope = value), this.#load())));
      row.append(input, document.createTextNode(` ${label}`));
      scope.append(row);
    }
    if (!this.combatant) scope.append(el("div", { cls: "mb-meta", text: "This token is not in the current combat, so only the default is available." }));
    root.append(scope);

    // Tags.
    const tags = el("fieldset");
    tags.append(el("legend", { text: "Roles" }));
    if (this.scope === "encounter") {
      const row = el("label", { cls: "mb-radio" });
      const box = el("input", { attrs: { type: "checkbox" }, cls: "mb-inherit" });
      box.checked = this.inherit;
      box.addEventListener("change", () => this.#update(() => (this.inherit = box.checked)));
      row.append(box, document.createTextNode(" Use the default roles for this encounter"));
      tags.append(row);
    }
    const editable = !(this.scope === "encounter" && this.inherit);
    const shown = this.scope === "encounter" && this.inherit ? getActorRoles(this.actor) : this.tags;
    for (const choice of roleChoices(SUGGESTED_ROLES, shown)) {
      const label = el("label", { cls: "mb-rule" });
      const box = el("input", { attrs: { type: "checkbox", "data-tag": choice.tag } });
      box.checked = choice.checked;
      box.disabled = !editable;
      box.addEventListener("change", () => this.#update(() => (this.tags = toggleRole(this.tags, choice.tag, box.checked))));
      label.append(box, el("span", { text: ` ${choice.tag}` }), choice.custom ? el("span", { cls: "mb-meta", text: " (custom)" }) : document.createTextNode(""));
      tags.append(label);
    }
    // Custom tags.
    const add = el("div", { cls: "mb-row" });
    const text = el("input", { cls: "mb-custom", attrs: { type: "text", placeholder: "add your own, e.g. bard, summoner" } });
    text.disabled = !editable;
    const addBtn = button("Add", () => text.value.trim() && this.#update(() => (this.tags = addTags(this.tags, text.value))), { disabled: !editable });
    text.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addBtn.click();
      }
    });
    add.append(text, addBtn);
    tags.append(add);
    root.append(tags);

    root.append(el("div", { cls: "mb-meta mb-effect", text: `In effect now: ${this.#inEffect().join(", ") || "no roles"}` }));

    const footer = el("div", { cls: "mb-row mb-footer" });
    footer.append(
      button("Save", () => this.#save(), { cls: "mb-primary-btn" }),
      button("Clear", () => this.#update(() => (this.scope === "default" ? (this.tags = []) : (this.inherit = true)))),
      button("Cancel", () => this.close()),
    );
    root.append(footer);
    return root;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }
}
