/**
 * Chat-message shapes as the PF2e system creates them, derived by reading the source (not captured from a
 * live game). Evidence base: foundryvtt/pf2e `v13-dev` @ f38e9796 (system 7.9.1). The v14-dev diff does not
 * touch the fields used here (checked for getReach, distanceTo, the strike identifier and chat-message/data.ts).
 *
 * Each builder returns the parts of a ChatMessage this module reads: `speaker.token` and `flags.pf2e`.
 * Replace these with captured data after a live session, and keep the source references as a changelog.
 */

const TOKEN = "t1"; // the acting combatant's token id

const speaker = (token = TOKEN) => ({ token });

/**
 * A Strike's attack roll. system/check/check.ts:283-300 builds the context flag: `identifier` is
 * `${item.id}.${attackSlug}.${melee|ranged}` (actor/helpers.ts:604), `item` is always undefined on a check,
 * `actor` and `token` are bare ids (not UUIDs) and `identifier` is null when absent.
 * `options` is left empty on purpose: a character's Strike carries `action:strike` (character/document.ts:1290),
 * but that has NOT been verified for an NPC's Strike, so nothing here asserts it.
 */
export function strikeAttackCard({ item = "claw9", slug = "claw", kind = "melee", token = TOKEN } = {}) {
  return {
    speaker: speaker(token),
    flags: {
      pf2e: {
        context: {
          type: "attack-roll",
          identifier: `${item}.${slug}.${kind}`,
          item: undefined,
          actor: "a1",
          token,
          options: [],
        },
      },
    },
  };
}

/**
 * The card SpellPF2e#toMessage creates when a spell is cast (item/spell/document.ts:770-800).
 *  - `flags.pf2e.origin` comes from ItemPF2e#getOriginData (item/base/document.ts:432): { actor, uuid, type }.
 *  - `flags.pf2e.casting` is set for every cast with a spellcasting entry, and ONLY by that method.
 *  - `flags.pf2e.context` ({ type: "spell-cast" }) is added ONLY when the spell has a `defense` (a save or an
 *    attack). Buffs, heals, summons and other spells without one produce a card with NO context at all.
 */
export function spellCastCard({ item = "fire", withDefense = true, token = TOKEN } = {}) {
  const pf2e = {
    origin: { actor: "Actor.a1", uuid: `Actor.a1.Item.${item}`, type: "spell" },
    casting: { id: "entry1", tradition: "arcane" },
  };
  if (withDefense) pf2e.context = { type: "spell-cast", domains: ["spell-dc"], options: [], rollMode: "roll" };
  return { speaker: speaker(token), flags: { pf2e } };
}

/**
 * The attack roll made from a spell card's button (SpellPF2e#rollAttack, item/spell/document.ts:943). It goes
 * through the spellcasting entry's Statistic, whose check type is "attack-roll" (item/spellcasting-entry/
 * document.ts:183), so it is indistinguishable from a Strike by `type`. It has no identifier and no item
 * (check.ts:286), but `action:cast-a-spell` is passed as an extra roll option (spell/document.ts:951) and
 * survives into `options` (statistic.ts:509-519). `check:type:attack-roll` is added there too (statistic.ts:513).
 * Other options a real card carries are not asserted.
 */
export function spellAttackRollCard({ token = TOKEN } = {}) {
  return {
    speaker: speaker(token),
    flags: {
      pf2e: {
        context: {
          type: "attack-roll",
          identifier: null,
          item: undefined,
          actor: "a1",
          token,
          options: ["action:cast-a-spell", "check:type:attack-roll"],
        },
      },
    },
  };
}
