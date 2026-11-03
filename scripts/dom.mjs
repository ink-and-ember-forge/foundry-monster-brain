/** Tiny DOM helpers shared by the panel and the configure dialog. Text always goes in as textContent. */

export function el(tag, { cls, text, title, attrs } = {}) {
  const node = document.createElement(tag);
  if (cls) node.classList.add(...[].concat(cls).flatMap((c) => c.split(/\s+/)).filter(Boolean));
  if (text != null) node.textContent = text;
  if (title) node.title = title;
  for (const [k, v] of Object.entries(attrs ?? {})) node.setAttribute(k, v);
  return node;
}

export function button(text, onClick, { title, disabled, cls } = {}) {
  const b = el("button", { text, title, cls, attrs: { type: "button" } });
  b.disabled = !!disabled;
  b.addEventListener("click", onClick);
  return b;
}

/** Escape text for use inside an HTML string. */
export function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = String(text);
  return d.innerHTML;
}

/** Ask the GM to confirm. Uses Foundry's DialogV2 when present, else the browser's confirm. Resolves true/false. */
export async function confirmDialog(message, title = "Monster Brain") {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (DialogV2?.confirm) {
    const result = await DialogV2.confirm({ window: { title }, content: `<p>${escapeHtml(message)}</p>`, rejectClose: false, yes: { default: false } });
    return result === true;
  }
  return globalThis.confirm(message);
}
