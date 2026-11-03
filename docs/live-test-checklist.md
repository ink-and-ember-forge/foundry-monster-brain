# Live test checklist

Everything since build step 1 has only been tested against stand-in objects, so this is the first real run. Test on **Foundry v13 and v14** with the PF2e system. Take notes as you go: "worked", or what you saw instead.

## Setup
- Install: link or copy the repo into `Data/modules/monster-brain` (or install from a release if one exists), enable it in a PF2e world, reload.
- Open the browser console (F12) and keep it open. The module logs `monster-brain | ...` lines; copy any red errors.
- Scene: one monster (an opposition-aligned NPC with a melee Strike), two PCs. Put the monster ~30 ft from both PCs, then start a combat with all three.
- `const mb = game.modules.get("monster-brain").api;` in the console as a GM.

## 1. Strip and turn hooks
- [ ] Console shows `monster-brain | ready (GM)`; no errors on load.
- [ ] On the monster's turn the strip appears; on a PC's turn it hides.
- [ ] Drag the strip, reload, start a turn: it reappears where you left it.
- [ ] Round 1 text is sensible (expected: "Open with signature").

## 2. Conditions and targets
- [ ] Monster 30 ft away, nobody adjacent, round 3+: "Close the distance → [a PC]".
- [ ] Move a PC adjacent (re-run via the next turn or any tracked action): suggestion changes (expected: "Strike, strike").
- [ ] Knock a PC prone: "Punish the prone → that PC".
- [ ] Reduce the monster below 25% HP: "Desperate last stand" (once only).
- [ ] `mb.setActorRoles(game.actors.getName("<PC>"), ["caster"])`, then "Close the distance" targets that PC; `mb.setCombatantRoles(<combatant>, ["squishy"])` overrides it for this combat.

## 3. Action tracking
- [ ] Roll a monster Strike: one "Melee strike ×" chip, one action dot empties, damage roll adds nothing.
- [ ] Drag the monster's token: one "Stride ×" chip (even if the drag fires several updates).
- [ ] "Took it" adds the suggested actions as chips; the suggestion changes.
- [ ] Click a chip's ×: removed; "+ add action" adds one.
- [ ] Add the slowed condition to the monster: it shows 2 dots at turn start.
- [ ] Do a reaction Strike on a PC's turn: nothing is logged.
- [ ] Two clients as GM (if you can): only one set of chips appears, not doubled.

## 4. Expanded card
- [ ] Arrow expands the card; it remembers expanded/collapsed after reload.
- [ ] "Why this one" shows the rule, its layer, conditions and the target explanation.
- [ ] "Held back" lists rules with sensible reasons.
- [ ] "Something else" cycles suggestions; taking an action resets it.
- [ ] Layout: is 380px wide enough? Does it cover the combat tracker or hotbar?

## 5. Profiles, templates, dry run
- [ ] `mb.listTemplates()` lists brute, skirmisher, archer, caster, skittish.
- [ ] Give an archer NPC a profile: `await mb.setProfile(actor, { template: "archer" })`; on its turn "Volley" or "Retreat and shoot" appears, with the bow named, e.g. "Ranged strike (Shortbow)".
- [ ] A monster with no ranged attack and the archer template: archer rules are held back with "no ranged attack".
- [ ] `await mb.setProfile(actor, { template: "caster", slotBindings: { signature: actor.items.getName("<a spell or action>").id } })`; the strip names it.
- [ ] `mb.dryRun("<monster name>")` prints a report; with no token on the scene it says distances are unknown.
- [ ] `mb.explain()` on a monster's turn returns held-back reasons and any warnings.

## 6. Send back
- Foundry version and PF2e system version.
- Anything unchecked, with the exact console error (red lines) and what you did just before.
- Screenshots of the strip and the expanded card if layout looks off.
- Anything that felt wrong even though it "worked" (confusing text, wrong target, suggestion you disagreed with).
