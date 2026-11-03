# Foundry VTT module: GM tactical assistant for PF2e (working title)

Status: design brief v0.1, written from a design conversation. Intended as the starting spec for implementation in Claude Code. Items marked **[VERIFY]** are assumptions about Foundry or the PF2e system that must be checked against the real source before building. Items marked **[OPEN]** are undecided.

## 1. Purpose

A Foundry VTT module for the **Pathfinder 2e system only** that gives a GM rudimentary "AI" for monsters. It does **not** play the monsters. It advises the GM.

- **Prep time:** the GM designs monster behaviour in advance as rules (with optional reusable templates and per-creature tweaks).
- **Table time:** on each monster's turn, the module evaluates those rules against the live game state and suggests **one or two actions** in a GM-only panel. The GM accepts, adjusts or ignores them.

The idea is to move cognitive load from live play into prep, and to make monsters behave more consistently and characterfully, beyond "Strike, Strike, Strike".

## 2. Design principles

- **Advise, don't act.** The module never moves tokens, rolls dice or applies effects.
- **Think in prep, glance at the table.** Authoring effort is acceptable; table-time friction is not.
- **Transparent.** The GM can always see why something was suggested and why something else was held back.
- **One cascade for all customisation.** Defaults at the general level, overrides at the specific level, using the same merge logic everywhere.
- **Small vocabulary, done well.** The quality of the condition library matters more than the sophistication of the engine.

## 3. Scope

### In scope for v1
- PF2e only.
- Prioritised rule lists with templates and per-creature overrides.
- Seven conditions (section 6), target selection by GM-defined role tags, action slots with auto-binding.
- Global policies (repeat caps, cooldowns).
- Auto-detection of actions taken, with a visible log and one-click correction.
- Floating GM-only panel: slim strip by default, expandable to a full card.
- Schema-driven form editor for authoring, plus a dry-run button, validation messages and starter templates.

### Out of scope for v1
- Optional named states / phases (planned later; rules are designed so states can wrap them).
- Flanking conditions (planned v1.1).
- Line of sight and cover.
- Multi-turn intent ("lure them toward the ambush").
- Group or compact multi-monster views (v1 shows one monster at a time).
- Configurable panel placement.
- Import/export UI (the JSON model should stay portable so this is cheap later).
- Any system other than PF2e.
- Automating anything: no token movement, no rolls.

## 4. Core concepts

- **Rule:** an ID, a label, a list of conditions (all must hold; any condition may be negated), a target selector, an action bundle, a weight or priority, and optional limits (max per turn, once per encounter, cooldown in rounds).
- **Condition:** a computed yes/no question about the game state, with parameters (section 6).
- **Target selector:** an ordered list of preferences, e.g. "casters first, then lowest HP".
- **Action bundle:** an ordered list of actions, e.g. Stride away, then ranged strike. A bundle may adapt to remaining actions (e.g. "strike x remaining"). **[OPEN]** exact syntax for this. *(As built, bundles are also checked against the world: see `docs/decisions.md`, "Action feasibility".)*
- **Action slot:** an abstract action reference used in templates ("primary melee strike", "ranged strike", "signature") that resolves to a real item on each creature.
- **Policy:** a global rule about suggestions themselves, e.g. "no action suggested more than twice per turn".
- **Template:** a named, reusable rule set (e.g. Skirmisher).
- **Creature profile:** extends a template, then adds, modifies or disables rules, and binds slots.
- **Role tag:** a label on a PC (caster, healer, squishy, frontliner, ...) used by target selectors. **[OPEN]** the initial tag list; it should be extensible.

## 5. Evaluation pipeline

Run when a monster's turn begins, and re-run after each detected action.

1. **Gather context:** the actor, its tokens and the enemies, positions and distances, HP, conditions, round number, and tracked action history.
2. **Resolve the profile** through the cascade (section 8).
3. **Candidates:** rules whose conditions are all true.
4. **Filters:** rule-level limits, then global policies. Record what was held back and why.
5. **Rank** the remaining candidates. **[OPEN]** priority order versus weights; suggested default is rule order as priority, with weight as a tie-breaker.
6. **Output** the top one or two suggestions, each with its resolved target, plus the held-back list with reasons.

Expected target resolution for a rule: if no valid target exists for the selector, the rule is not a candidate.

## 6. v1 condition vocabulary

Seven conditions. All read from Foundry/PF2e data or from the module's own tracking. Difficulty is a rough estimate.

| Condition | Parameters | Notes | Difficulty |
|---|---|---|---|
| My HP below X% | threshold | Reads actor HP | Easy |
| I have a condition | PF2e condition slug | e.g. frightened, prone, grabbed | Easy |
| Enemy has a condition | condition slug | Applies to a candidate target | Easy |
| Allies down / outnumbered | count or fraction | **[OPEN]** how "ally" is defined (suggest: same token disposition, in this combat) | Easy |
| Round number / ability used | round comparison; action or slot used this encounter | "Used" depends on action tracking | Easy to medium |
| Enemy in melee reach | none | Uses the creature's actual reach **[VERIFY]** | Medium |
| Enemy within X ft | distance | Canvas distance measurement | Medium |

Deferred: flanked / can flank (v1.1), line of sight, cover.

## 7. Target selection

- Enemies are, from the monster's perspective, tokens hostile to it (normally the PCs and their allies).
- **Role tags** live on PC actors as campaign defaults, with **per-encounter overrides** on the combatant.
- A selector is an ordered list: tag preferences first, then a tiebreaker (nearest, lowest HP, etc.).
- If the module cannot choose a target, the suggestion shows the action only and the GM picks. *(As built, at the GM's request: every suggestion names a target, using a default when a rule gives none; with no enemies there is no suggestion. See `docs/decisions.md`.)*

## 8. Customisation cascade

Layers, general to specific:

1. System defaults (shipped with the module)
2. Campaign: global policies and default PC role tags
3. Template
4. Creature
5. Encounter: per-combatant overrides

**Merge logic:** rules have stable IDs. A lower layer can replace a rule with the same ID, disable it, or add a new one. Policies merge by key. Role tags follow the same layering (campaign default, then encounter override).

**Action slots:** templates reference abstract slots. The module **auto-binds** each slot to a real item on the creature using heuristics (e.g. first melee strike, first ranged strike). The GM overrides binds per creature where the guess is wrong. Unbound slots produce a validation warning.

## 9. Illustrative data (not a final schema)

```json
{
  "template": "ambusher",
  "slots": ["ranged-strike", "melee-strike", "signature"],
  "rules": [
    {
      "id": "retreat-and-shoot",
      "label": "Retreat and shoot",
      "when": [{ "type": "enemy-in-reach" }],
      "do": ["stride-away", "ranged-strike"],
      "target": ["role:caster", "lowest-hp"],
      "limits": { "maxPerTurn": 1, "cooldownRounds": 2 }
    },
    {
      "id": "volley",
      "label": "Volley",
      "when": [
        { "type": "enemy-in-reach", "not": true },
        { "type": "enemy-within", "feet": 60 }
      ],
      "do": ["ranged-strike", "ranged-strike"],
      "target": ["role:caster", "lowest-hp"]
    },
    {
      "id": "last-stand",
      "label": "Desperate last stand",
      "when": [
        { "type": "self-hp-below", "percent": 25 },
        { "type": "self-has-condition", "slug": "frightened", "not": true }
      ],
      "do": ["melee-strike", "signature"],
      "limits": { "oncePerEncounter": true }
    }
  ]
}
```

Creature override example: disable `last-stand` (a cowardly archer) and bind `signature` to the creature's "Flaming Arrow" item.

Global policy example: the same action may not be suggested more than twice per turn.

**[OPEN]** default values for built-in policies.

## 10. Action tracking

The module must know what a monster actually did, for repeat caps, cooldowns, "ability used", and action budget.

- **Auto-detect** from chat cards (strikes, spells, skill actions) and from token position changes (movement).
- Only count actions from the **current combatant**; ignore reactions and other combatants' actions.
- **Known blind spots:** free-form actions the GM narrates (Interact, Aid, improvised actions) will not register.
- **Safety net:** the panel shows a log of detected actions for the turn as chips, with one-tap "add action" and "remove/fix". A "Took suggestion" button records a suggested action as taken.
- **[VERIFY]** PF2e does not natively track actions spent per turn, so the module must keep its own budget (3 actions per turn, adjusted for conditions like slowed or quickened).
- Mis-tracking silently skews counters, which is why the log must be visible and correctable.

## 11. Panel UX

- A **floating window** (GM client only; never rendered for players).
- **Default:** a slim one-line strip, e.g. "Retreat and shoot -> Mira". Auto-appears on a monster's turn, hides on PC turns.
- **Expanded card** on click: creature name and template, round, action pips (remaining budget), the primary suggestion (actions, target, hint), one alternative, "Took suggestion" and "Something else" buttons, the "this turn" action log, and a collapsed "why this one / held back" section.
- Remembers its position. Should avoid covering the combat tracker and hotbar. The GM plays **online on a single screen**, so the strip must carry most of the value on its own.
- **One monster at a time** (the current combatant). Movement suggestions are hints only (e.g. "back off to at least 15 ft"), never destinations.
- Re-evaluates after each detected action; if a different rule now wins, the panel updates.
- A mockup of the expanded card exists from the design conversation; treat it as a sketch, not a final design.

## 12. Prep UX

- **Schema-driven form editor** for templates and creature profiles. The form is a view onto the JSON model, generated from a schema of conditions, targets and action slots, so that model changes mean editing the schema, not rebuilding screens. Limit the form to the v1 vocabulary.
- **Dry-run button:** pick a creature during prep and see what it would suggest against the current scene.
- **Validation messages:** logic problems (unreachable rules, unbound slots, unknown condition, conflicting limits).
- **Starter templates:** about five (Brute, Skirmisher, Archer, Caster, Skittish) for the GM to tweak. *(As built: ten, named for fighting style; see `docs/decisions.md`.)*
- Import/export is not a v1 feature, but the JSON model should stay portable.

## 13. Technical notes and things to verify

**Confirmed from Foundry's published API docs:** Foundry exposes combat lifecycle hooks (`combatStart`, `combatRound`, `combatTurn`, `updateCombat`), which is enough to detect "it is now this combatant's turn". The API docs now cover Foundry v14.

**[VERIFY] before building** (assumptions, not confirmed):
- The current stable Foundry version, and which version(s) to target. Check PF2e system compatibility.
- How the PF2e system exposes actor HP, conditions, items (strikes, spells), reach, and distance data. **Read the PF2e system source repository (the `foundryvtt/pf2e` project) rather than guessing the data model.**
- What the PF2e chat card flags look like for strikes, spells and actions, for auto-detection.
- Whether PF2e exposes anything usable for flanking (needed for v1.1).
- Which UI framework to use for the panel and form (Foundry's ApplicationV2 is the likely candidate).
- Where to store data: flags on actors (creature profiles, PC tags), flags on combatants (encounter overrides), and a world setting or journal for templates and campaign policies.

## 14. Suggested build order

1. Module skeleton, turn hook, slim strip showing a hardcoded suggestion.
2. Condition engine and the seven conditions, evaluated against real combat data.
3. Data model with the cascade, stored in flags.
4. Target selection and role tags.
5. Action tracking, log and correction.
6. Policies and limits.
7. Expanded card, "why / held back".
8. Form editor, dry-run, validation, starter templates.

## 15. Open questions

- Ranking: rule order, weights, or both? (section 5)
- Syntax for adaptive bundles ("strike x remaining actions").
- Initial role tag list, and how it is extended.
- Definition of "ally" for the allies-down condition.
- Default values for built-in policies.
- Which Foundry version(s) to target.
- Template storage and sharing format.
