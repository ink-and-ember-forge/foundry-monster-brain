# Monster Brain: agent guide

Foundry VTT module, **PF2e only**. Advises the GM on monster turns; never moves tokens, rolls dice or applies effects.

Source of truth: `docs/design-brief.md`. Open questions and verification status: `docs/decisions.md`. Build order: brief section 14.

## Rules of the road
- Do not guess the PF2e data model: read the `foundryvtt/pf2e` source and record findings in `docs/decisions.md`.
- `scripts/engine/` is pure logic with no Foundry globals; Foundry data enters via an adapter as a plain context object. Cover engine code with vitest.
- GM client only: guard UI and hooks with `game.user.isGM`.
- Keep the JSON model portable (rules have stable IDs; cascade: system, campaign, template, creature, encounter).
- Stay within the v1 vocabulary (seven conditions). Out-of-scope items are listed in brief section 3.

## Commands
- `npm install`, `npm test`, `npm run lint`
- No build step: plain ES modules loaded directly by Foundry. Symlink or copy the repo into `Data/modules/monster-brain` to try it.
