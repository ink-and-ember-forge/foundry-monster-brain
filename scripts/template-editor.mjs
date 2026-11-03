/**
 * Template and rule editor (brief section 12): a schema-driven form over the JSON model.
 * Tabs: Templates (create, duplicate, edit, delete; starters are read-only) and Campaign (policies).
 * Everything it can offer comes from engine/schema.mjs; all edits go through engine/rule-draft.mjs.
 *
 * UI rule: text and number fields update the draft WITHOUT re-rendering, so typing keeps focus and
 * a click on Save straight after typing is not lost to a re-render. Structural changes (selects,
 * add/remove/move buttons) re-render.
 */
import { MODULE_ID } from "./constants.mjs";
import { el, button, confirmDialog } from "./dom.mjs";
import { CONDITION_SCHEMA, CONDITION_SLUGS, ACTION_CHOICES, TARGET_CHOICES, LIMIT_FIELDS } from "./engine/schema.mjs";
import * as D from "./engine/rule-draft.mjs";
import { SYSTEM_LAYER, DEFAULT_POLICIES } from "./engine/default-rules.mjs";
import { listTemplates, templateById, setTemplate, deleteTemplate, getCampaign, setCampaign } from "./profiles.mjs";
import { refresh } from "./turn-watcher.mjs";

const { ApplicationV2 } = foundry.applications.api;

const CUSTOM = "__custom__";
const SLUG_LIST_ID = `${MODULE_ID}-condition-slugs`;
const actionKnown = (slug) => ACTION_CHOICES.some(([v]) => v === slug);

export class MonsterBrainEditor extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-editor`,
    classes: [MODULE_ID, "mb-dialog", "mb-editor"],
    window: { title: "Monster Brain: templates", resizable: true },
    position: { width: 640, height: 720 },
  };

  static #instance = null;

  /** Open the editor, optionally on a particular template. */
  static async open({ templateId = null, tab = "templates" } = {}) {
    const app = (this.#instance ??= new this());
    app.tab = tab;
    if (templateId && templateId !== app.selectedId) await app.select(templateId);
    return app.render({ force: true });
  }

  tab = "templates";
  list = [];
  selectedId = null;
  draft = null;
  isNew = false;
  dirty = false;
  readOnly = false;
  openRules = new Set();
  syncs = new Map();
  cap = { limited: true, value: 2 };

  constructor(options) {
    super(options);
    this.#refreshList();
    const first = this.list[0];
    if (first) this.#loadTemplate(first.id);
    this.#loadCampaign();
  }

  // ---- state ------------------------------------------------------------------------------------

  #refreshList() {
    this.list = listTemplates();
  }

  #loadTemplate(id) {
    const entry = this.list.find((t) => t.id === id);
    this.selectedId = id;
    this.draft = structuredClone(templateById(id) ?? { name: id, rules: [] });
    this.readOnly = entry?.source === "starter";
    this.isNew = false;
    this.dirty = false;
  }

  #loadCampaign() {
    const cap = D.capFromCampaign(getCampaign(), DEFAULT_POLICIES.maxSameActionPerTurn);
    this.cap = { limited: cap != null, value: cap ?? DEFAULT_POLICIES.maxSameActionPerTurn };
    this.capDirty = false;
  }

  async #confirmDiscard() {
    return !this.dirty || confirmDialog("You have unsaved changes to this template. Discard them?");
  }

  async select(id) {
    if (id === this.selectedId) return;
    if (!(await this.#confirmDiscard())) return;
    this.#loadTemplate(id);
    await this.render({ force: true });
  }

  async close(options) {
    if (this.dirty && !(await confirmDialog("Close the editor and discard unsaved changes?"))) return this;
    this.dirty = false;
    return super.close(options);
  }

  get title() {
    return this.tab === "campaign" ? "Monster Brain: campaign policies" : "Monster Brain: templates";
  }

  #touch(fn, { rerender = true } = {}) {
    this.draft = fn(this.draft);
    this.dirty = true;
    if (rerender) this.render({ force: true });
  }

  /** Edit rule `i`; text-like fields pass rerender:false and refresh just that card's summary. */
  #editRule(i, fn, { rerender = true } = {}) {
    this.#touch((t) => D.updateRule(t, i, fn(t.rules[i])), { rerender });
    if (!rerender) this.syncs.get(i)?.();
  }

  // ---- actions ----------------------------------------------------------------------------------

  async #newTemplate() {
    if (!(await this.#confirmDiscard())) return;
    const { id, template } = D.newTemplate(this.list.map((t) => t.id));
    this.selectedId = id;
    this.draft = template;
    this.readOnly = false;
    this.isNew = true;
    this.dirty = true;
    this.render({ force: true });
  }

  async #duplicate() {
    if (!this.draft || !(await this.#confirmDiscard())) return;
    const { id, template } = D.duplicateTemplate(this.draft, this.list.map((t) => t.id));
    this.selectedId = id;
    this.draft = template;
    this.readOnly = false;
    this.isNew = true;
    this.dirty = true;
    this.render({ force: true });
  }

  async #delete() {
    const name = this.draft?.name ?? this.selectedId;
    if (this.isNew) {
      // Never saved: just discard it.
      this.dirty = false;
      this.#refreshList();
      this.list[0] ? this.#loadTemplate(this.list[0].id) : ((this.draft = null), (this.selectedId = null));
      return this.render({ force: true });
    }
    const entry = this.list.find((t) => t.id === this.selectedId);
    const msg = entry?.source === "yours (overrides starter)"
      ? `Reset "${name}" to the shipped starter? Your changes will be lost.`
      : `Delete the template "${name}"? Tokens that use it will fall back to no template.`;
    if (!(await confirmDialog(msg))) return;
    await deleteTemplate(this.selectedId);
    this.dirty = false;
    this.#refreshList();
    const still = this.list.find((t) => t.id === this.selectedId);
    this.#loadTemplate((still ?? this.list[0])?.id);
    this.#reevaluate();
    return this.render({ force: true });
  }

  async #save() {
    if (!this.draft || this.readOnly) return;
    const template = D.setField(this.draft, "description", this.draft.description ?? "");
    await setTemplate(this.selectedId, template);
    this.isNew = false;
    this.dirty = false;
    this.#refreshList();
    ui.notifications?.info(`Monster Brain: saved template "${template.name ?? this.selectedId}"`);
    this.#reevaluate();
    return this.render({ force: true });
  }

  async #saveCampaign() {
    await setCampaign(D.campaignWithCap(getCampaign(), this.cap.limited ? this.cap.value : null));
    this.capDirty = false;
    ui.notifications?.info("Monster Brain: campaign policies saved");
    this.#reevaluate();
    return this.render({ force: true });
  }

  /** Templates and policies change what monsters suggest, so refresh a running combat's strip. */
  #reevaluate() {
    if (game.combat?.started) refresh(game.combat);
  }

  // ---- render -----------------------------------------------------------------------------------

  async _renderHTML() {
    this.syncs = new Map();
    const root = el("div", { cls: "mb-editor-body" });

    const slugs = el("datalist", { attrs: { id: SLUG_LIST_ID } });
    for (const s of CONDITION_SLUGS) slugs.append(new Option(s, s));
    root.append(slugs);

    const tabs = el("div", { cls: "mb-row mb-tabs" });
    for (const [value, label] of [["templates", "Templates"], ["campaign", "Campaign policies"]]) {
      tabs.append(button(label, () => ((this.tab = value), this.render({ force: true })), { cls: this.tab === value ? "mb-tab active" : "mb-tab" }));
    }
    root.append(tabs, this.tab === "campaign" ? this.#campaignTab() : this.#templatesTab());
    return root;
  }

  _replaceHTML(result, content) {
    const scroll = content.scrollTop;
    content.replaceChildren(result);
    content.scrollTop = scroll; // re-rendering must not throw the user back to the top
  }

  // -- campaign tab --

  #campaignTab() {
    const tab = el("div", { cls: "mb-form" });
    const sec = el("fieldset");
    sec.append(el("legend", { text: "Repeat cap" }));
    sec.append(el("p", { cls: "mb-meta", text: "Stops the module suggesting the same action again and again in one turn, so it does not default to \"Strike, Strike, Strike\". Applies to every monster unless a template or token changes it." }));
    const row = el("label", { cls: "mb-radio" });
    const limited = el("input", { cls: "mb-cap-limited", attrs: { type: "checkbox" } });
    limited.checked = this.cap.limited;
    limited.addEventListener("change", () => {
      this.cap.limited = limited.checked;
      this.capDirty = true;
      this.render({ force: true });
    });
    row.append(limited, document.createTextNode(" Limit the same action to at most "));
    const num = el("input", { cls: "mb-cap-value", attrs: { type: "number", min: 1, step: 1 } });
    num.value = this.cap.value;
    num.disabled = !this.cap.limited;
    num.addEventListener("input", () => {
      const n = Number.parseInt(num.value, 10);
      if (!Number.isNaN(n) && n >= 1) {
        this.cap.value = n;
        this.capDirty = true;
      }
    });
    row.append(num, document.createTextNode(" per turn"));
    sec.append(row);
    sec.append(el("p", { cls: "mb-meta", text: `Shipped default: ${DEFAULT_POLICIES.maxSameActionPerTurn}.` }));
    tab.append(sec);
    const footer = el("div", { cls: "mb-row mb-footer" });
    footer.append(button("Save", () => this.#saveCampaign(), { cls: "mb-primary-btn" }), button("Close", () => this.close()));
    tab.append(footer);
    return tab;
  }

  // -- templates tab --

  #templatesTab() {
    const tab = el("div", { cls: "mb-form" });

    // Picker and template-level buttons.
    const bar = el("div", { cls: "mb-row" });
    const picker = el("select", { cls: "mb-picker" });
    const rows = this.isNew ? [...this.list, { id: this.selectedId, name: `${this.draft?.name ?? "New"} (unsaved)`, source: "new" }] : this.list;
    for (const t of rows) picker.append(new Option(t.source === "starter" ? `${t.name} (starter)` : t.name, t.id));
    if (this.selectedId) picker.value = this.selectedId;
    picker.addEventListener("change", () => this.select(picker.value));
    bar.append(
      picker,
      button("New", () => this.#newTemplate()),
      button("Duplicate", () => this.#duplicate(), { disabled: !this.draft }),
      button(this.isNew ? "Discard" : "Delete", () => this.#delete(), { disabled: !this.draft || (this.readOnly && !this.isNew) }),
    );
    tab.append(bar);

    if (!this.draft) {
      tab.append(el("p", { cls: "mb-meta", text: "No templates yet. Click New to make one." }));
      return tab;
    }
    if (this.readOnly) tab.append(el("p", { cls: "mb-banner", text: "Starter templates are read-only. Click Duplicate to make an editable copy." }));

    // Everything below is disabled natively when read-only.
    const body = el("fieldset", { cls: "mb-body" });
    body.disabled = this.readOnly;

    body.append(this.#field("Name", this.#textInput(this.draft.name ?? "", (v) => this.#touch((t) => ({ ...t, name: v }), { rerender: false }))));
    const desc = el("textarea", { attrs: { rows: 2 } });
    desc.value = this.draft.description ?? "";
    desc.addEventListener("input", () => this.#touch((t) => ({ ...t, description: desc.value }), { rerender: false }));
    body.append(this.#field("Description", desc));

    body.append(this.#shippedSection());

    const rulesHead = el("div", { cls: "mb-row mb-ruleshead" });
    rulesHead.append(el("strong", { text: "Rules" }), el("span", { cls: "mb-meta", text: "Higher rules win. A rule is suggested when all its conditions hold." }));
    body.append(rulesHead);
    const warnings = D.validateTemplate(this.draft);
    this.draft.rules?.forEach((rule, i) => body.append(this.#ruleCard(rule, i, warnings)));
    body.append(button("+ Add rule", () => this.#touch((t) => D.addRule(t, this.list.map((x) => x.id)))));

    const general = warnings.filter((w) => !w.ruleId || !this.draft.rules.some((r) => r.id === w.ruleId));
    if (general.length) {
      const w = el("ul", { cls: "mb-warnlist" });
      for (const g of general) w.append(el("li", { text: g.message }));
      body.append(el("div", { cls: "mb-warn", text: "Template warnings:" }), w);
    }
    tab.append(body);

    const footer = el("div", { cls: "mb-row mb-footer" });
    footer.append(
      button("Save", () => this.#save(), { cls: "mb-primary-btn", disabled: this.readOnly || !this.dirty }),
      button("Revert", async () => (await this.#confirmDiscard()) && (this.isNew ? this.#delete() : (this.#loadTemplate(this.selectedId), this.render({ force: true }))), { disabled: this.readOnly || !this.dirty }),
      button("Close", () => this.close()),
    );
    tab.append(footer);
    return tab;
  }

  #field(label, input) {
    const row = el("label", { cls: "mb-field" });
    row.append(el("span", { cls: "mb-fieldlabel", text: label }), input);
    return row;
  }

  #textInput(value, onInput, { placeholder, cls } = {}) {
    const input = el("input", { cls, attrs: { type: "text", ...(placeholder ? { placeholder } : {}) } });
    input.value = value;
    input.addEventListener("input", () => onInput(input.value));
    return input;
  }

  #numberInput(value, { min, max, step }, onInput, cls) {
    const input = el("input", { cls, attrs: { type: "number", ...(min != null ? { min } : {}), ...(max != null ? { max } : {}), ...(step != null ? { step } : {}) } });
    input.value = value ?? "";
    input.addEventListener("input", () => onInput(input.value));
    return input;
  }

  /** The shipped rules this template can switch off (locked if the template replaces the rule itself). */
  #shippedSection() {
    const det = el("details", { cls: "mb-section" });
    det.open = this.openRules.has("__shipped__");
    det.addEventListener("toggle", () => (det.open ? this.openRules.add("__shipped__") : this.openRules.delete("__shipped__")));
    const off = (this.draft.disable ?? []).length;
    det.append(el("summary", { text: `Shipped default rules${off ? ` (${off} switched off)` : ""}` }));
    const own = new Set((this.draft.rules ?? []).map((r) => r.id));
    for (const rule of SYSTEM_LAYER.rules) {
      const label = el("label", { cls: "mb-rule" });
      const box = el("input", { attrs: { type: "checkbox" } });
      const replaced = own.has(rule.id);
      box.checked = replaced || !(this.draft.disable ?? []).includes(rule.id);
      box.disabled = replaced;
      box.addEventListener("change", () => this.#touch((t) => D.setShippedRuleEnabled(t, rule.id, box.checked)));
      label.append(box, el("span", { text: ` ${rule.label}` }), el("span", { cls: "mb-meta", text: replaced ? " replaced by this template" : ` (${D.ruleSentence(rule)})` }));
      det.append(label);
    }
    return det;
  }

  // -- rule card --

  #ruleCard(rule, i, warnings) {
    const card = el("details", { cls: "mb-rulecard" });
    card.open = this.openRules.has(rule.id);
    card.addEventListener("toggle", () => (card.open ? this.openRules.add(rule.id) : this.openRules.delete(rule.id)));

    const summary = el("summary");
    const title = el("strong", { cls: "mb-ruletitle" });
    const sentence = el("span", { cls: "mb-meta mb-rulesentence" });
    const warn = el("span", { cls: "mb-warn mb-rulewarn" });
    summary.append(title, document.createTextNode(" "), sentence, document.createTextNode(" "), warn);
    card.append(summary);

    const warnList = el("ul", { cls: "mb-warnlist" });
    const sync = () => {
      const r = this.draft.rules[i];
      title.textContent = r.label || r.id;
      sentence.textContent = D.ruleSentence(r);
      const mine = D.validateTemplate(this.draft).filter((w) => w.ruleId === r.id);
      warn.textContent = mine.length ? `⚠ ${mine.length}` : "";
      warnList.replaceChildren(...mine.map((w) => el("li", { text: w.message })));
    };
    this.syncs.set(i, sync);

    const edit = (fn, opts) => this.#editRule(i, fn, opts);
    const cur = () => this.draft.rules[i];

    card.append(
      this.#field("Name", this.#textInput(rule.label ?? "", (v) => edit((r) => D.setField(r, "label", v), { rerender: false }))),
      this.#field("Hint (shown to you, e.g. \"Back off to at least 15 ft\")", this.#textInput(rule.hint ?? "", (v) => edit((r) => D.setField(r, "hint", v), { rerender: false }))),
    );

    // When
    const when = el("fieldset");
    when.append(el("legend", { text: "When (all must be true)" }));
    (rule.when ?? []).forEach((cond, j) => when.append(this.#conditionRow(cond, j, edit, cur)));
    when.append(this.#addSelect("+ add condition", Object.entries(CONDITION_SCHEMA).map(([k, s]) => [k, s.label]), (type) => edit((r) => D.addCondition(r, type))));
    if (!(rule.when ?? []).length) when.append(el("div", { cls: "mb-meta", text: "No conditions: this rule always applies." }));
    card.append(when);

    // Do
    const doing = el("fieldset");
    doing.append(el("legend", { text: "Do, in order" }));
    (rule.do ?? []).forEach((slug, j) => doing.append(this.#actionRow(slug, i, j, edit)));
    doing.append(button("+ add action", () => edit((r) => D.addAction(r))));
    card.append(doing);

    // Target
    const target = el("fieldset");
    target.append(el("legend", { text: "Target preference, in order" }));
    (rule.target ?? []).forEach((entry, j) => target.append(this.#targetRow(entry, j, edit)));
    target.append(button("+ add preference", () => edit((r) => D.addTarget(r))));
    target.append(el("div", { cls: "mb-meta", text: "A suggestion always names a target. Leave this empty to use the default: someone in your reach first, then the weakest." }));
    card.append(target);

    // Limits
    const limits = el("fieldset");
    limits.append(el("legend", { text: "Limits" }));
    for (const f of LIMIT_FIELDS) {
      const row = el("label", { cls: "mb-rule" });
      if (f.kind === "boolean") {
        const box = el("input", { attrs: { type: "checkbox" } });
        box.checked = !!rule.limits?.[f.key];
        box.addEventListener("change", () => edit((r) => D.setLimit(r, f.key, box.checked), { rerender: false }));
        row.append(box, document.createTextNode(` ${f.label}`));
      } else {
        const num = this.#numberInput(rule.limits?.[f.key], f, (v) => edit((r) => D.setLimit(r, f.key, v), { rerender: false }), "mb-limit");
        row.append(num, document.createTextNode(` ${f.label}`));
      }
      limits.append(row);
    }
    card.append(limits);

    // Advanced
    const adv = el("details", { cls: "mb-section" });
    adv.append(el("summary", { text: "Advanced" }));
    const num = (key) =>
      this.#numberInput(rule[key], { step: 1 }, (v) => {
        const n = Number.parseFloat(v);
        edit((r) => D.setField(r, key, Number.isNaN(n) ? "" : n), { rerender: false });
      });
    adv.append(
      this.#field("Priority (lower goes first; overrides list order)", num("priority")),
      this.#field("Weight (higher wins ties)", num("weight")),
      el("div", { cls: "mb-meta", text: `Rule id: ${rule.id}` }),
    );
    card.append(adv);

    card.append(warnList);
    const tools = el("div", { cls: "mb-row" });
    tools.append(
      button("↑ Move up", () => this.#touch((t) => D.moveRule(t, i, -1)), { disabled: i === 0 }),
      button("↓ Move down", () => this.#touch((t) => D.moveRule(t, i, 1)), { disabled: i === (this.draft.rules?.length ?? 0) - 1 }),
      button("Delete rule", async () => (await confirmDialog(`Delete the rule "${rule.label ?? rule.id}"?`)) && this.#touch((t) => D.removeRule(t, i))),
    );
    card.append(tools);
    sync();
    return card;
  }

  #addSelect(placeholder, choices, onPick) {
    const select = el("select", { cls: "mb-addselect" });
    select.append(new Option(placeholder, ""));
    for (const [value, label] of choices) select.append(new Option(label, value));
    select.addEventListener("change", () => select.value && onPick(select.value));
    return select;
  }

  #conditionRow(cond, j, edit, cur) {
    const schema = CONDITION_SCHEMA[cond.type];
    const row = el("div", { cls: "mb-row mb-cond" });
    const not = el("input", { attrs: { type: "checkbox", title: "Negate: require the opposite" } });
    not.checked = !!cond.not;
    not.addEventListener("change", () => edit((r) => D.setConditionNot(r, j, not.checked)));
    row.append(el("label", { cls: "mb-not", text: "not " }), not);

    const type = el("select", { cls: "mb-condtype" });
    for (const [k, s] of Object.entries(CONDITION_SCHEMA)) type.append(new Option(s.label, k));
    if (!schema) type.append(new Option(`unknown: ${cond.type}`, cond.type));
    type.value = cond.type;
    type.addEventListener("change", () => edit((r) => D.setConditionType(r, j, type.value)));
    row.append(type);

    for (const p of schema?.params ?? []) {
      const set = (v, rerender = false) => edit((r) => D.setConditionParam(r, j, p.key, v), { rerender });
      if (p.kind === "number") {
        const input = this.#numberInput(cond[p.key], p, (v) => set(v), "mb-param");
        input.addEventListener("change", () => (input.value = cur().when[j][p.key]));
        row.append(input, el("span", { cls: "mb-meta", text: p.unit ?? "" }));
      } else if (p.kind === "select") {
        const sel = el("select", { cls: "mb-param" });
        for (const [v, label] of p.options) sel.append(new Option(label, v));
        sel.value = cond[p.key] ?? p.default;
        sel.addEventListener("change", () => set(sel.value));
        row.append(sel);
      } else {
        const input = this.#textInput(cond[p.key] ?? "", (v) => set(v), { cls: "mb-param", placeholder: "condition" });
        input.setAttribute("list", SLUG_LIST_ID);
        row.append(input);
      }
    }
    row.append(button("×", () => edit((r) => D.removeCondition(r, j)), { title: "Remove condition" }));
    return row;
  }

  #actionRow(slug, i, j, edit) {
    const row = el("div", { cls: "mb-row mb-action" });
    const known = actionKnown(slug);
    const sel = el("select", { cls: "mb-actionsel" });
    for (const [v, label] of ACTION_CHOICES) sel.append(new Option(label, v));
    sel.append(new Option("Custom slot…", CUSTOM));
    sel.value = known ? slug : CUSTOM;
    sel.addEventListener("change", () => edit((r) => D.setAction(r, j, sel.value === CUSTOM ? "custom-slot" : sel.value)));
    row.append(sel);
    if (!known) {
      const input = this.#textInput(slug, () => {}, { cls: "mb-customslot", placeholder: "slot name, e.g. flaming-arrow" });
      // Applied on blur/Enter, not per keystroke, so spaces and hyphens can be typed; no re-render.
      input.addEventListener("change", () => {
        edit((r) => D.setAction(r, j, input.value), { rerender: false });
        input.value = this.draft.rules[i].do[j]; // show the cleaned-up slug (a blank entry is ignored)
      });
      row.append(input);
    }
    row.append(
      button("↑", () => edit((r) => D.moveAction(r, j, -1)), { title: "Move earlier", disabled: j === 0 }),
      button("↓", () => edit((r) => D.moveAction(r, j, 1)), { title: "Move later" }),
      button("×", () => edit((r) => D.removeAction(r, j)), { title: "Remove action" }),
    );
    return row;
  }

  #targetRow(entry, j, edit) {
    const row = el("div", { cls: "mb-row mb-target" });
    const isRole = entry.startsWith("role:");
    const sel = el("select", { cls: "mb-targetsel" });
    for (const [v, label] of TARGET_CHOICES) sel.append(new Option(label, v));
    sel.value = isRole ? "role" : entry;
    sel.addEventListener("change", () => edit((r) => D.setTarget(r, j, sel.value === "role" ? "role:caster" : sel.value)));
    row.append(sel);
    if (isRole) {
      const input = this.#textInput(entry.slice(5), () => {}, { cls: "mb-roleinput", placeholder: "e.g. caster" });
      input.addEventListener("change", () => {
        const tag = input.value.trim().toLowerCase();
        edit((r) => D.setTarget(r, j, `role:${tag}`), { rerender: false });
        input.value = tag;
      });
      row.append(input);
    }
    row.append(
      button("↑", () => edit((r) => D.moveTarget(r, j, -1)), { title: "Move earlier", disabled: j === 0 }),
      button("↓", () => edit((r) => D.moveTarget(r, j, 1)), { title: "Move later" }),
      button("×", () => edit((r) => D.removeTarget(r, j)), { title: "Remove preference" }),
    );
    return row;
  }
}
