/**
 * Editing helpers for a PC's role tags. Pure and immutable; the roles dialog is a thin view over these.
 * Tags are free-form lowercase strings (see targets.mjs); suggested ones are just shortcuts.
 */
import { normaliseRoles } from "./targets.mjs";

/** Split free text on commas and whitespace, then normalise. "Caster, squishy  healer" gives three tags. */
export function parseTags(text) {
  return normaliseRoles(String(text ?? "").split(/[\s,]+/));
}

export function toggleRole(tags, role, on) {
  const set = new Set(normaliseRoles(tags));
  const tag = normaliseRoles([role])[0];
  if (!tag) return [...set];
  if (on) set.add(tag);
  else set.delete(tag);
  return [...set];
}

export function addTags(tags, text) {
  return normaliseRoles([...(tags ?? []), ...parseTags(text)]);
}

/**
 * Checkbox rows: every suggested role first, then any custom tags already on the character, so a
 * custom tag never disappears from the list.
 */
export function roleChoices(suggested, tags) {
  const have = new Set(normaliseRoles(tags));
  const known = new Set(suggested);
  return [
    ...suggested.map((tag) => ({ tag, checked: have.has(tag), custom: false })),
    ...[...have].filter((tag) => !known.has(tag)).map((tag) => ({ tag, checked: true, custom: true })),
  ];
}
