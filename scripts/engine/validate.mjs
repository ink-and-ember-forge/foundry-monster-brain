/**
 * Validation messages (brief section 12). Pure. Returns warnings; never throws.
 * @param resolved result of resolveProfile
 * @param binding result of bindSlots
 * @returns {{ level: "warn", ruleId: string|null, message: string }[]}
 */
import { CONDITIONS } from "./conditions.mjs";

export function validate(resolved, binding) {
  const out = [];
  const warn = (ruleId, message) => out.push({ level: "warn", ruleId, message });

  for (const issue of resolved.issues ?? []) {
    if (issue.type === "unknown-disable") warn(issue.id, `${issue.layer} layer disables "${issue.id}", but no such rule exists`);
    if (issue.type === "duplicate-id") warn(issue.id, `${issue.layer} layer defines "${issue.id}" more than once; the last one wins`);
  }
  for (const slot of binding?.missing ?? []) warn(null, `slot "${slot}" is bound to an item this creature no longer has`);

  const usedUnbound = new Set();
  for (const rule of resolved.rules) {
    if (rule.enabled === false) continue;
    for (const cond of rule.when ?? []) {
      if (!CONDITIONS[cond.type]) warn(rule.id, `unknown condition "${cond.type}"`);
    }
    if ((rule.do ?? []).length === 0) warn(rule.id, "rule has no actions");
    const l = rule.limits;
    if (l?.oncePerEncounter && (l.cooldownRounds != null || l.maxPerTurn != null)) {
      warn(rule.id, "oncePerEncounter makes cooldownRounds and maxPerTurn redundant");
    }
    for (const slug of rule.do ?? []) {
      if (binding?.unbound.includes(slug) && !usedUnbound.has(`${rule.id}:${slug}`)) {
        usedUnbound.add(`${rule.id}:${slug}`);
        warn(rule.id, `slot "${slug}" is not bound on this creature`);
      }
    }
  }
  return out;
}
