/**
 * Foundry/PF2e to plain-context adapter. The only place the rules pipeline touches game data.
 * Data paths verified in docs/decisions.md (V2).
 */

function hpPercent(actor) {
  const hp = actor.system?.attributes?.hp;
  if (!hp || !(hp.max > 0)) return 100;
  return (hp.value / hp.max) * 100;
}

function conditionSlugs(actor) {
  return actor.conditions.active.map((c) => c.slug);
}

/** @param combatant the monster whose turn it is @param combat the encounter */
export function buildContext(combatant, combat) {
  const actor = combatant.actor;
  const enemies = combat.combatants
    .filter((c) => c.actor && !c.isDefeated && c.id !== combatant.id && actor.isEnemyOf(c.actor))
    .map((c) => ({
      id: c.id,
      name: c.name,
      hpPercent: hpPercent(c.actor),
      conditions: conditionSlugs(c.actor),
    }));
  return {
    round: combat.round,
    self: { name: combatant.name, hpPercent: hpPercent(actor), conditions: conditionSlugs(actor) },
    enemies,
  };
}
