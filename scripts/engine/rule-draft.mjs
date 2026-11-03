/**
 * Editing operations for rules and templates (the rule editor is a thin view over these).
 * Pure and immutable: every function returns new objects and never mutates its input.
 */
import { CONDITION_SCHEMA, LIMIT_FIELDS } from "./schema.mjs";
import { describeCondition } from "./conditions.mjs";
import { actionLabel } from "./actions.mjs";
import { describeSelector, DEFAULT_SELECTOR } from "./targets.mjs";
import { resolveProfile } from "./cascade.mjs";
import { validate } from "./validate.mjs";
import { SYSTEM_LAYER } from "./default-rules.mjs";

const replaceAt = (arr, i, value) => arr.map((x, j) => (j === i ? value : x));
const removeAt = (arr, i) => arr.filter((_, j) => j !== i);

/** Move an item up (-1) or down (+1); out-of-range moves return the list unchanged. */
export function moveItem(arr, i, dir) {
  const j = i + dir;
  if (i < 0 || i >= arr.length || j < 0 || j >= arr.length) return arr;
  const copy = [...arr];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

export function slugify(text) {
  return String(text ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

/** base, base-2, base-3 ... first one not in `existing`. */
export function uniqueId(base, existing) {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// ---- rules ---------------------------------------------------------------------------------------

export function newRule(existingIds, label = "New rule") {
  return { id: uniqueId(slugify(label), existingIds), label, when: [], do: ["melee-strike"] };
}

export function setField(rule, key, value) {
  const r = { ...rule };
  if (value === "" || value == null) delete r[key];
  else r[key] = value;
  return r;
}

// conditions
export function defaultCondition(type) {
  const schema = CONDITION_SCHEMA[type];
  const c = { type };
  for (const p of schema?.params ?? []) if (p.default !== undefined) c[p.key] = p.default;
  return c;
}

export function addCondition(rule, type) {
  return { ...rule, when: [...(rule.when ?? []), defaultCondition(type)] };
}

export function removeCondition(rule, i) {
  return { ...rule, when: removeAt(rule.when ?? [], i) };
}

/** Changing the type resets the parameters to that type's defaults but keeps the negation. */
export function setConditionType(rule, i, type) {
  const old = rule.when[i];
  const next = defaultCondition(type);
  if (old?.not) next.not = true;
  return { ...rule, when: replaceAt(rule.when, i, next) };
}

export function setConditionNot(rule, i, not) {
  const { not: _drop, ...rest } = rule.when[i];
  return { ...rule, when: replaceAt(rule.when, i, not ? { ...rest, not: true } : rest) };
}

/** Numbers are parsed and clamped to the schema's bounds; unparseable input leaves the value unchanged. */
export function setConditionParam(rule, i, key, raw) {
  const cond = rule.when[i];
  const param = CONDITION_SCHEMA[cond.type]?.params.find((p) => p.key === key);
  let value = raw;
  if (param?.kind === "number") {
    value = Number.parseFloat(raw);
    if (Number.isNaN(value)) return rule;
    if (param.min != null) value = Math.max(param.min, value);
    if (param.max != null) value = Math.min(param.max, value);
  } else if (param?.kind === "condition") {
    value = String(raw).trim().toLowerCase();
  }
  return { ...rule, when: replaceAt(rule.when, i, { ...cond, [key]: value }) };
}

// actions
export function addAction(rule, slug = "melee-strike") {
  return { ...rule, do: [...(rule.do ?? []), slug] };
}
export function removeAction(rule, i) {
  return { ...rule, do: removeAt(rule.do ?? [], i) };
}
export function setAction(rule, i, slug) {
  if (!String(slug ?? "").trim()) return rule; // a blank name is not an action (slugify would invent "item")
  return { ...rule, do: replaceAt(rule.do, i, slugify(slug)) };
}
export function moveAction(rule, i, dir) {
  return { ...rule, do: moveItem(rule.do ?? [], i, dir) };
}

// target preferences (strings, see targets.mjs)
function withTarget(rule, target) {
  const r = { ...rule };
  if (target.length) r.target = target;
  else delete r.target;
  return r;
}
export function addTarget(rule, entry = "lowest-hp") {
  return withTarget(rule, [...(rule.target ?? []), entry]);
}
export function removeTarget(rule, i) {
  return withTarget(rule, removeAt(rule.target ?? [], i));
}
export function setTarget(rule, i, entry) {
  return withTarget(rule, replaceAt(rule.target ?? [], i, entry));
}
export function moveTarget(rule, i, dir) {
  return withTarget(rule, moveItem(rule.target ?? [], i, dir));
}

// limits
export function setLimit(rule, key, raw) {
  const field = LIMIT_FIELDS.find((f) => f.key === key);
  if (!field) return rule;
  const limits = { ...(rule.limits ?? {}) };
  if (field.kind === "boolean") {
    if (raw) limits[key] = true;
    else delete limits[key];
  } else {
    const n = Number.parseInt(raw, 10);
    if (Number.isNaN(n) || n < (field.min ?? 0)) delete limits[key];
    else limits[key] = n;
  }
  const r = { ...rule };
  if (Object.keys(limits).length) r.limits = limits;
  else delete r.limits;
  return r;
}

/** One readable line for a rule, shown in the collapsed card and the held-back/why text. */
export function ruleSentence(rule) {
  const when = (rule.when ?? []).length ? `When ${rule.when.map(describeCondition).join(" and ")}` : "Always";
  const doing = (rule.do ?? []).length ? (rule.do ?? []).map(actionLabel).join(", then ") : "(no actions)";
  // Every suggestion has a target; a rule with no preferences of its own uses the default.
  const own = (rule.target ?? []).length > 0;
  const target = describeSelector(own ? rule.target : DEFAULT_SELECTOR) + (own ? "" : " (default)");
  const l = rule.limits ?? {};
  const limits = [
    l.oncePerEncounter && "once per encounter",
    l.maxPerTurn != null && `max ${l.maxPerTurn} per turn`,
    l.cooldownRounds != null && `then wait ${l.cooldownRounds} round${l.cooldownRounds === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return `${when}: ${doing}. Target: ${target}${limits.length ? ` (${limits.join("; ")})` : ""}`;
}

// ---- templates -----------------------------------------------------------------------------------

export function newTemplate(existingIds, name = "New template") {
  return { id: uniqueId(slugify(name), existingIds), template: { name, description: "", rules: [] } };
}

export function duplicateTemplate(template, existingIds) {
  const name = `${template.name ?? "Template"} (copy)`;
  return { id: uniqueId(slugify(name), existingIds), template: { ...structuredClone(template), name } };
}

export function addRule(template, existingIds = []) {
  const ids = [...(template.rules ?? []).map((r) => r.id), ...existingIds];
  return { ...template, rules: [...(template.rules ?? []), newRule(ids)] };
}
export function updateRule(template, i, rule) {
  return { ...template, rules: replaceAt(template.rules, i, rule) };
}
export function removeRule(template, i) {
  return { ...template, rules: removeAt(template.rules ?? [], i) };
}
export function moveRule(template, i, dir) {
  return { ...template, rules: moveItem(template.rules ?? [], i, dir) };
}

/** Switch a shipped (system) rule off for this template. */
export function setShippedRuleEnabled(template, ruleId, enabled) {
  const disable = new Set(template.disable ?? []);
  if (enabled) disable.delete(ruleId);
  else disable.add(ruleId);
  const t = { ...template };
  if (disable.size) t.disable = [...disable];
  else delete t.disable;
  return t;
}

/**
 * Validation warnings for a template as it will be used: on top of the shipped rules, so that
 * `disable` and same-id replacements are checked against something real. Slot binding is per
 * creature, so it is not checked here.
 */
export function validateTemplate(template) {
  return validate(resolveProfile({ system: SYSTEM_LAYER, template }), null);
}

// ---- campaign policy -----------------------------------------------------------------------------

/** The per-turn repeat cap in effect: the campaign's value, or the shipped default when unset. */
export function capFromCampaign(campaign, shippedDefault) {
  const v = campaign?.policies?.maxSameActionPerTurn;
  return v === undefined ? shippedDefault : v;
}

/** null means "no limit" (the cascade treats a null policy as removed). */
export function campaignWithCap(campaign, cap) {
  const value = cap == null || Number.isNaN(Number(cap)) ? null : Math.max(1, Math.floor(Number(cap)));
  return { ...(campaign ?? {}), policies: { ...(campaign?.policies ?? {}), maxSameActionPerTurn: value } };
}
