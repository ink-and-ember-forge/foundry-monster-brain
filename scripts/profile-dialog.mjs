/**
 * "Configure" dialog: apply a template, bind slots and switch rules off, for ONE TOKEN (or, if you
 * choose, as a default for every token of its actor). Opened from the Token HUD or the API.
 * A thin DOM view over engine/draft.mjs; it previews unsaved edits with the dry run.
 */
import { MODULE_ID } from "./constants.mjs";
import { el, button } from "./dom.mjs";
import {
  setTemplate,
  setBinding,
  setRuleEnabled,
  prune,
  isEmptyProfile,
  templateToValue,
  valueToTemplate,
  templateOptions,
  ruleRows,
  layerOfScope,
} from "./engine/draft.mjs";
import { formatReport } from "./engine/report.mjs";
import {
  getProfile,
  setProfile,
  clearProfile,
  getTokenProfile,
  setTokenProfile,
  clearTokenProfile,
  listTemplates,
  templateById,
} from "./profiles.mjs";
import { dryRun } from "./dryrun.mjs";
import { itemsFor } from "./adapter.mjs";
import { refresh } from "./turn-watcher.mjs";
import { MonsterBrainEditor } from "./template-editor.mjs";
import { canonicalTemplateId } from "./engine/starter-templates.mjs";

const { ApplicationV2 } = foundry.applications.api;

export class MonsterBrainDialog extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-configure`,
    classes: [MODULE_ID, "mb-dialog"],
    window: { title: "Monster Brain", resizable: true },
    position: { width: 480, height: "auto" },
  };

  /** One dialog per token. */
  static #open = new Map();

  /** @param token a TokenDocument or Token placeable */
  static open(token) {
    const doc = token.document ?? token;
    let app = this.#open.get(doc.id);
    if (!app) {
      app = new this({ id: `${MODULE_ID}-configure-${doc.id}` }, doc);
      this.#open.set(doc.id, app);
    }
    return app.render({ force: true });
  }

  constructor(options, tokenDoc) {
    super(options);
    this.tokenDoc = tokenDoc;
    this.actor = tokenDoc.actor;
    this.scope = "token";
    this.draft = this.#load();
  }

  get title() {
    return `Monster Brain: ${this.tokenDoc.name}`;
  }

  async close(options) {
    MonsterBrainDialog.#open.delete(this.tokenDoc.id);
    return super.close(options);
  }

  #load() {
    return (this.scope === "token" ? getTokenProfile(this.tokenDoc) : getProfile(this.actor)) ?? {};
  }

  #setDraft(draft) {
    this.draft = draft;
    this.render({ force: true });
  }

  async #save() {
    const profile = prune(this.draft);
    const empty = isEmptyProfile(profile);
    if (this.scope === "token") await (empty ? clearTokenProfile(this.tokenDoc) : setTokenProfile(this.tokenDoc, profile));
    else await (empty ? clearProfile(this.actor) : setProfile(this.actor, profile));
    ui.notifications?.info(`Monster Brain: saved for ${this.scope === "token" ? this.tokenDoc.name : this.actor.name}`);
    // If this token is acting right now, show the new behaviour straight away.
    const combat = game.combat;
    if (combat?.combatant?.tokenId === this.tokenDoc.id) refresh(combat);
    return this.close();
  }

  async #clear() {
    this.#setDraft({});
  }

  async _renderHTML() {
    const draftArg = { scope: this.scope, profile: prune(this.draft) };
    const run = dryRun(this.actor, { token: this.tokenDoc.object ?? null, print: false, draft: draftArg, tokenDoc: this.tokenDoc });
    const root = el("form", { cls: "mb-form" });
    root.addEventListener("submit", (e) => e.preventDefault());

    root.append(this.#scopeSection(), this.#templateSection(), this.#rulesSection(run), this.#slotsSection(run), this.#previewSection(run));

    const footer = el("div", { cls: "mb-row mb-footer" });
    footer.append(
      button("Save", () => this.#save(), { cls: "mb-primary-btn" }),
      button("Clear this setting", () => this.#clear(), { title: "Remove everything set at this level" }),
      button("Cancel", () => this.close()),
    );
    root.append(footer);
    return root;
  }

  /** This token only, or every token of the actor. */
  #scopeSection() {
    const sec = el("fieldset");
    sec.append(el("legend", { text: "Applies to" }));
    for (const [value, label] of [
      ["token", `This token only (${this.tokenDoc.name})`],
      ["actor", `Every ${this.actor.name} token (a default; tokens can override)`],
    ]) {
      const row = el("label", { cls: "mb-radio" });
      const input = el("input", { attrs: { type: "radio", name: "scope", value } });
      input.checked = this.scope === value;
      input.addEventListener("change", () => {
        this.scope = value;
        this.#setDraft(this.#load());
      });
      row.append(input, document.createTextNode(` ${label}`));
      sec.append(row);
    }
    return sec;
  }

  #templateSection() {
    const sec = el("fieldset");
    sec.append(el("legend", { text: "Template" }));
    const inherited = getProfile(this.actor)?.template;
    const inheritedName = inherited ? (templateById(inherited)?.name ?? inherited) : null;
    const select = el("select", { cls: "mb-template" });
    const options = templateOptions(listTemplates(), this.scope, inheritedName);
    for (const o of options) select.append(new Option(o.label, o.value));
    // A profile saved with an old starter id (e.g. "archer") still shows its renamed template ("sniper").
    const current = templateToValue(this.draft, this.scope);
    select.value = options.some((o) => o.value === current) ? current : canonicalTemplateId(current);
    select.addEventListener("change", () => this.#setDraft(setTemplate(this.draft, valueToTemplate(select.value))));
    sec.append(select);
    const chosen = valueToTemplate(select.value) ?? getProfile(this.actor)?.template ?? null;
    // Say in words what kind of fighter the chosen template makes.
    const about = chosen ? templateById(chosen)?.description : null;
    if (about) sec.append(el("p", { cls: "mb-meta mb-about", text: about }));
    sec.append(button("Edit templates\u2026", () => MonsterBrainEditor.open({ templateId: chosen }), { title: "Open the template and rule editor" }));
    return sec;
  }

  #rulesSection(run) {
    const sec = el("fieldset");
    sec.append(el("legend", { text: "Rules (untick to switch one off)" }));
    for (const row of ruleRows(run.resolved.rules, layerOfScope(this.scope))) {
      const label = el("label", { cls: "mb-rule" });
      const box = el("input", { attrs: { type: "checkbox" } });
      box.checked = row.enabled;
      box.disabled = !row.editable;
      box.addEventListener("change", () => this.#setDraft(setRuleEnabled(this.draft, row.id, box.checked)));
      label.append(box, el("span", { text: ` ${row.label} ` }), el("span", { cls: "mb-meta", text: `${row.source}${row.note ? `, ${row.note}` : ""}` }));
      sec.append(label);
    }
    return sec;
  }

  #slotsSection(run) {
    const sec = el("fieldset");
    sec.append(el("legend", { text: "Action slots" }));
    if (run.resolved.slots.length === 0) {
      sec.append(el("div", { cls: "mb-meta", text: "No slots are used by the active rules." }));
      return sec;
    }
    const items = itemsFor(this.actor);
    for (const slot of run.resolved.slots) {
      const row = el("div", { cls: "mb-row mb-slot" });
      const bound = run.binding.bound[slot];
      const status = bound ? `${bound.label}${bound.auto ? " (auto)" : ""}` : "not bound";
      row.append(el("span", { cls: "mb-slotname", text: slot }), el("span", { cls: bound ? "mb-meta" : "mb-warn", text: status }));
      const select = el("select");
      select.append(new Option("Automatic / none", ""));
      for (const item of items) select.append(new Option(`${item.label} (${item.kind})`, item.id));
      select.value = this.draft.slotBindings?.[slot] ?? "";
      select.addEventListener("change", () => this.#setDraft(setBinding(this.draft, slot, select.value)));
      row.append(select);
      sec.append(row);
    }
    return sec;
  }

  #previewSection(run) {
    const sec = el("fieldset");
    sec.append(el("legend", { text: "Preview (against this scene, with your unsaved changes)" }));
    sec.append(el("pre", { cls: "mb-preview", text: formatReport(run.report) }));
    return sec;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }
}
