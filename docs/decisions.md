# Decisions and verification checklist

Tracks the **[VERIFY]** and **[OPEN]** items from `design-brief.md`. Update as each is resolved; record the evidence.

## Verify (check against real source before building)

| # | Item | Status | Notes |
|---|---|---|---|
| V1 | Target Foundry version(s) | **Provisional** | `module.json` says min/verified 12. On 2026-11-03 `foundryvtt/pf2e` `master` `static/system.json` declared min 12.328, verified 12.331, max 12 (system 6.12.4), which conflicts with the brief's mention of v14 docs. Check current release branches before settling. |
| V2 | PF2e actor data: HP, conditions, items, reach | Open | Read `foundryvtt/pf2e` source (`src/module/actor/`) |
| V3 | PF2e chat card flags for strikes/spells/actions | Open | Needed for action auto-detection (step 5) |
| V4 | Flanking data exposure | Open | v1.1, low priority |
| V5 | UI framework | Leaning ApplicationV2 | Available from v12 |
| V6 | Storage | Proposed | Actor flags (profiles, PC tags), combatant flags (encounter overrides), world setting (templates, campaign policies) |
| V7 | Per-turn action budget | Open | PF2e does not track it; module keeps its own (slowed/quickened adjust) |

## Open design questions

Ranking (rule order vs weights), adaptive bundle syntax, initial role tags, definition of "ally", built-in policy defaults, template sharing format. See brief section 15.
