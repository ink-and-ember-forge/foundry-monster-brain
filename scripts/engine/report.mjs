/**
 * Plain-text report of an evaluation, for the dry-run and the console. Pure.
 * @param report { name, templateName, round, suggestions, held, warnings, notes? }
 */
import { stripText, actionsText, heldLines, warningLines, whyLines } from "./suggestion.mjs";

export function formatReport(report) {
  const out = [];
  const where = [report.templateName ?? "no template", report.round != null ? `round ${report.round}` : null].filter(Boolean);
  out.push(`${report.name} (${where.join(", ")})`);
  for (const note of report.notes ?? []) out.push(`  note: ${note}`);
  if (report.suggestions.length === 0) out.push("  Suggests: nothing");
  report.suggestions.forEach((s, i) => {
    out.push(`  ${i === 0 ? "Suggests" : "Then    "}: ${stripText(s)}`);
    const detail = actionsText(s);
    if (detail) out.push(`      actions: ${detail}`);
    if (i === 0) for (const line of whyLines(s)) out.push(`      ${line}`);
    if (s.hint) out.push(`      hint: ${s.hint}`);
  });
  const held = heldLines(report.held);
  if (held.length) out.push("  Held back:", ...held.map((l) => `    - ${l}`));
  const warnings = warningLines(report.warnings);
  if (warnings.length) out.push("  Warnings:", ...warnings.map((l) => `    - ${l}`));
  return out.join("\n");
}
