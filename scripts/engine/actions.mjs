/** Action vocabulary: display labels and canonical keys. Pure. */

const ACTION_LABELS = {
  "melee-strike": "Melee strike",
  "ranged-strike": "Ranged strike",
  stride: "Stride",
  "stride-away": "Stride away",
  spell: "Cast a spell",
  signature: "Signature action",
  other: "Other action",
};

/** Slugs that count as the same action for repeat policies and tracking. */
const ALIASES = { "stride-away": "stride" };

export function actionLabel(slug) {
  if (ACTION_LABELS[slug]) return ACTION_LABELS[slug];
  const text = String(slug).replaceAll("-", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function actionKey(slug) {
  return ALIASES[slug] ?? slug;
}

/** Keys offered in the "add action" correction menu. */
export const MANUAL_ACTION_KEYS = ["melee-strike", "ranged-strike", "stride", "spell", "other"];
