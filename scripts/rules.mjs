/**
 * The rules popout: opens PF2e's own entry for an action, so the GM reads the real rules text for the
 * version they are running instead of a copy of it in this module. Entry names come from the catalog
 * (engine/action-catalog.mjs `compendium`); the pack is the PF2e system's actions compendium.
 *
 * If the pack or the entry cannot be found (another language, a renamed entry, a stripped-down world) it falls
 * back to a small window with the catalog's one-line summary, so the button never does nothing.
 */
import { actionInfo, actionTooltip } from "./engine/action-catalog.mjs";
import { escapeHtml } from "./dom.mjs";

export const ACTIONS_PACK = "pf2e.actionspf2e";

/** The index entry for a name, ignoring case and stray spaces. Pure. */
export function matchEntry(entries, name) {
  const wanted = String(name ?? "").trim().toLowerCase();
  if (!wanted) return null;
  for (const entry of entries) if (String(entry?.name ?? "").trim().toLowerCase() === wanted) return entry;
  return null;
}

let indexPromise = null;

/** The pack's index, fetched once. Null when the pack does not exist. */
async function packIndex() {
  const pack = game.packs?.get(ACTIONS_PACK);
  if (!pack) return null;
  indexPromise ??= pack.getIndex().catch((err) => {
    indexPromise = null;
    throw err;
  });
  return { pack, entries: [...(await indexPromise)] };
}

/** The PF2e action document for a catalog slug, or null. */
export async function findActionDocument(slug) {
  const name = actionInfo(slug)?.compendium;
  if (!name) return null;
  const found = await packIndex();
  if (!found) return null;
  const entry = matchEntry(found.entries, name);
  return entry ? found.pack.getDocument(entry._id) : null;
}

async function showSummary(slug) {
  const info = actionInfo(slug);
  const body = (actionTooltip(slug) ?? info?.label ?? "").split("\n").slice(0, -1); // drop the "open the ? button" line
  const content = body.map((line, i) => (i === 0 ? `<p><strong>${escapeHtml(line)}</strong></p>` : `<p>${escapeHtml(line)}</p>`)).join("");
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (DialogV2?.prompt) {
    await DialogV2.prompt({ window: { title: info?.label ?? "Action" }, content, ok: { label: "Close" }, rejectClose: false });
  } else {
    globalThis.ui?.notifications?.info(body.join(" "));
  }
}

/**
 * Open the rules for an action. Resolves true if PF2e's own entry was opened, false if the fallback summary was
 * shown (or there is nothing to show).
 */
export async function openRules(slug) {
  if (!actionInfo(slug)) return false;
  try {
    const doc = await findActionDocument(slug);
    if (doc) {
      doc.sheet.render({ force: true });
      return true;
    }
  } catch (err) {
    console.warn(`monster-brain | could not open the PF2e entry for "${slug}"`, err);
  }
  await showSummary(slug);
  return false;
}
