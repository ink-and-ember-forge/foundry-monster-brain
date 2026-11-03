# Decisions and verification checklist

Tracks the **[VERIFY]** and **[OPEN]** items from `design-brief.md`. Update as each is resolved, with evidence.

Evidence base: `foundryvtt/pf2e` `v14-dev` @ `0b3845d` (2026-11-03, system 8.6.1). Paths below are relative to `src/module/`. Re-check on the target branch before relying on any of these in code.

## Verify

| # | Item | Status |
|---|---|---|
| V1 | Target Foundry version | **Decided: v13 and v14** (see V1) |
| V2 | PF2e actor data | **Verified** (see V2) |
| V3 | Chat card flags | **Verified** (see V3) |
| V4 | Flanking | **Verified, deferred to v1.1** |
| V5 | UI framework | Leaning ApplicationV2 |
| V6 | Storage | Proposed: actor flags (profiles, PC tags), combatant flags (encounter overrides), world setting (templates, campaign policies) |
| V7 | Per-turn action budget | **Confirmed: module must track its own** |

### V1: Foundry version
The `foundryvtt/pf2e` branches disagree, which is easy to misread:

| Branch | System | Foundry |
|---|---|---|
| `v14-dev` (default branch) | 8.6.1 | min 14.361, verified 14.369 |
| `v13-dev` | 7.12.2 | min 13.348, verified 13.351 |
| `release` / `master` | 6.12.4 | 12.328 to 12.331 (stale) |

The live PF2e line is v14. A first read of `master` suggested v12; that was a stale branch.

**Decision:** support Foundry v13 and v14 (`module.json` min 13, verified 14). Use only ApplicationV2 APIs present in both, and test on both before release.

### V2: Actor and token data (PF2e)
- **HP:** `actor.system.attributes.hp` (`value`, `max`, `temp`).
- **Conditions:** `actor.hasCondition(...slugs)`; `actor.conditions.bySlug(slug, { active: true })`; `actor.conditions.active`. Slugs are PF2e `ConditionSlug` values (`actor/conditions.ts`, `item/condition/values.ts`).
- **Reach:** `actor.getReach({ action: "attack", weapon? })` (`actor/creature/document.ts`). Base reach is `attributes.reach.base`; weapon `reach` traits are considered.
- **Distance:** `token.distanceTo(otherToken, { reach })` (`canvas/token/object.ts`). It measures between squares/cuboids and respects elevation. Passing `reach` makes it reach-aware, so "enemy in melee reach" is `reach >= token.distanceTo(enemy, { reach })`, the same test PF2e uses in `canFlank`. Returns `NaN` if the canvas is not ready.
- **Allies and enemies:** `actor.alliance` is `"party" | "opposition" | null`; `isAllyOf()` and `isEnemyOf()` exist. **Resolves the brief's [OPEN] on "ally":** use PF2e alliance, not token disposition. Note `isEnemyOf` is false if either side is `null`.
- **Strikes:** `actor.system.actions` is `AttackAction[]`. `StrikeData` has `label`, `type: "strike"`, `item`, `ready`, `variants` (MAP variants), `altUsages`. Area/auto-fire entries have `type: "area-fire" | "auto-fire"`.
- **Melee vs ranged (for slot auto-bind):** `strike.item.isMelee` / `isRanged` on both weapon and NPC `melee` items.

### V3: Chat card flags (for auto-detecting actions)
Under `message.flags.pf2e` (`chat-message/data.ts`):
- `context.type`: `"attack-roll"`, `"damage-roll"`, `"spell-cast"`, `"skill-check"`, `"area-fire"`, `"auto-fire"`, `"self-effect"`, `"damage-taken"`.
- `context.actor` and `context.token` identify the actor; `context.item` the item; `origin` has `{ actor, type, uuid }`; `context.target` the target.
- A Strike is an `attack-roll` then a `damage-roll`: **count only the `attack-roll`** or each strike will register twice.
- The stored flag omits `context.action`, but `context.identifier` is `${itemId}.${attackSlug}.${melee|ranged}` for strikes, which tells melee from ranged. Skill-based actions carry an `action:<slug>` entry in `context.options`; plain skill checks do not, so they are not counted.
- Current-combatant test: `message.speaker.token === combatant.tokenId`, falling back to `context.token` (a UUID ending in the token id).
- Movement is not a chat card. Detect via `updateToken` on `x`/`y`.

### V4: Flanking (v1.1)
Available: `token.canFlank(flankee)`, `actor.attributes.flanking.{canFlank, flankable}`. Gated by the PF2e flanking automation setting.

### V7: Action budget
No per-turn action tracking found in PF2e (`encounter/`, `actor/base.ts`). The module keeps its own (`engine/budget.mjs`): base 3, minus slowed and stunned values, plus 1 for quickened, 0 if paralyzed or unconscious. Quickened's action restriction is ignored (GM corrects the log). Condition badge values come from `condition.value`.

### New: turn hooks
PF2e fires `pf2e.startTurn(combatant, encounter, userId)` and `pf2e.endTurn(...)` (`encounter/combatant.ts`) after its own turn-start effects run. Prefer these over raw `combatTurn`. Note `onStartTurn` runs per represented actor for troops.

## Decided

- **Ranking:** rule order is priority; an explicit `priority` (lower first) overrides position; higher `weight` breaks ties. Implemented in `scripts/engine/evaluate.mjs`.
- **"Ally":** PF2e actor alliance (V2). A monster is an `opposition` actor; its enemies are actors for which `isEnemyOf` is true.
- **Reach and distance semantics:** `enemy-in-reach` is a global any-enemy check (negated: no enemy in reach), matching the brief's `volley` rule. `enemy-within` narrows eligible targets. Unknown distance (`null`: canvas not on that scene, token missing, NaN) is excluded from `enemy-within` even when negated, and counts as not-in-reach. Reach test mirrors PF2e's `canFlank`: `reach >= token.distanceTo(target, { reach })`.
- **What "Took it" does:** records every action in the suggestion as taken (source `suggestion`) and records a use of that rule, which is what rule limits count. Auto-detected actions never count as rule uses, because a chat card can't be tied to a rule. After any history change the suggestion is re-evaluated.
- **Limit semantics:** `cooldownRounds: N` after a use in round R makes the rule available again in round R+N. `maxPerTurn` counts uses in the current round. `oncePerEncounter` counts any use.
- **Policy semantics:** `maxSameActionPerTurn` holds back a rule if actions already taken this turn plus the (budget-trimmed) bundle would exceed the cap for any one action key. `stride-away` and `stride` are one key. Provisional default: 2.
- **Bundle vs budget (partial answer to the adaptive-bundle [OPEN]):** the bundle is trimmed to the actions remaining; no "strike x remaining" syntax yet.
- **Storage:** history lives in a Combat flag (`flags.monster-brain.history`), written only by the active GM (`game.users.activeGM`) so two GM clients never double-write.
- **Movement:** any `x`/`y` update to the current monster's token counts as a Stride; updates within 4 s merge into one.
- **Cascade layers (build step 3):** a layer is `{ rules?, disable?, policies?, slots?, slotBindings? }`; templates and creatures add `template` and so on. Same-id rules replace in place (position is priority, so a replacement keeps its slot), new ids append, `disable` switches rules off (a later layer supplying the id re-enables it), policies merge by key (`null` removes), slot bindings merge with the more specific layer winning. Templates do not extend other templates in v1.
- **Slots:** derived from the `do` lists of enabled rules (plus any declared), excluding movement (`stride`, `stride-away`). Strike slots auto-bind to the first matching strike in `actor.system.actions`; other slots are never guessed. A GM binding (`slotBindings`: slot to item id) always wins. A rule needing a strike slot the creature cannot fill is **held back** (the creature lacks that attack); other unbound slots only **warn** and the rule stays with a generic label.
- **Storage (V6, as built):** creature profile in a flag on the base actor (shared by all tokens); encounter overrides in a combatant flag; templates and campaign in world settings. Layers are replaced by unset-then-set, because flags merge on write.
- **Validation (partial):** unknown condition, unbound or missing slot binding, empty `do`, `oncePerEncounter` with other limits, unknown disable target, duplicate id in a layer, missing template. Not yet: unreachable rules.
- **Context shape:** `{ round, self: { name, hpPercent, conditions[] }, enemies: [{ id, name, hpPercent, conditions[] }] }`, built by `scripts/adapter.mjs`. Defined in `scripts/engine/conditions.mjs`.

## Build progress

| Step | Status |
|---|---|
| 1. Skeleton, turn hook, strip | Done, tested in Foundry |
| 2. Condition engine | **Partial.** Done: `enemy-in-reach`, `enemy-within`, `self-hp-below`, `self-has-condition`, `enemy-has-condition`, `round`. Reach and distance conditions done (untested in a live scene). Remaining: allies-down, "ability used" (needs step 5). |
| 3. Data model and cascade | **Done** (pure merge, slots, validation; flags/settings storage; console API). No editor yet (step 8); untested live. |
| 4. Targets and role tags | Stub only: enemy conditions narrow targets, then lowest HP. |
| 5. Action tracking, log, correction | **Done in strip UI** (chat cards and movement; untested live). Expanded card is step 7. |
| 6. Policies and limits | **Done** (`oncePerEncounter`, `maxPerTurn`, `cooldownRounds`; `maxSameActionPerTurn`). Policy defaults still provisional. |
| 7-8 | Not started |

Known gaps: the adapter, tracker and panel (`scripts/adapter.mjs`, `tracker.mjs`, `panel.mjs`) are untested outside Foundry; spells always cost one tracked action (3-action spells and metamagic are not modelled; correct via the log); a Strike made as a reaction on the monster's own turn is indistinguishable and counts; action slots are shown as plain labels (no binding to real items).

## Open design questions
Adaptive bundle syntax, initial role tags, built-in policy defaults, template sharing format. See brief section 15.
