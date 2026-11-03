/**
 * Per-turn action budget (PF2e does not track this; verified in docs/decisions.md V7).
 * Base 3. Slowed N and stunned N each remove N actions; quickened adds 1.
 * Paralyzed or unconscious: none. The quickened bonus is restricted to certain actions in the rules;
 * we ignore the restriction and let the GM correct the log.
 * @param {Record<string, number>} conditionValues slug to badge value (1 for unbadged)
 */
export function actionBudget(conditionValues = {}) {
  if (conditionValues.paralyzed || conditionValues.unconscious) return 0;
  const lose = (conditionValues.slowed ?? 0) + (conditionValues.stunned ?? 0);
  const gain = conditionValues.quickened ? 1 : 0;
  return Math.max(0, 3 - lose + gain);
}
