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
