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

## 5a. Configure dialog (per token)
- [ ] Right-click an NPC token: a brain button appears on the Token HUD. (If not, `game.modules.get("monster-brain").api.configure()` with the token selected should open it; tell me the HUD layout you see.)
- [ ] Put two tokens of the same actor on the map. Give token A the `sniper` template, leave token B alone. On their turns A suggests sniper rules and B does not.
- [ ] In the dialog, the preview changes as you change template, untick a rule, or bind a slot (before saving).
- [ ] "This token only" vs "Every <actor> token": saving at actor level affects both tokens, and a token-level template still wins on A.
- [ ] Reopen the dialog on a saved token: the saved choices are shown.
- [ ] Save while that token is the current combatant: the strip updates without waiting for the next turn.
- [ ] "Clear this setting" then Save removes the token's override.

## 5b. Role tagging (PC tokens)
- [ ] Right-click a PC token: a tag button appears on the Token HUD. (Fallback: select it and run `game.modules.get("monster-brain").api.tagRoles()`.)
- [ ] Tick "caster", add a custom tag, Save, reopen: both are remembered.
- [ ] With a monster using a `role:caster` rule (e.g. archer or the shipped "Close the distance"), the caster PC becomes the target.
- [ ] In a combat, choose "This encounter only", untick "use the default roles", pick different roles, Save: the target changes immediately, and a new combat is unaffected.
- [ ] "Clear" then Save at default scope removes the character's roles.
- [ ] The "In effect now" line matches what actually happens.

## 5d. The ten fighting styles
Pick two or three styles that match monsters you actually run, put each on a token, and watch a few turns:
- [ ] Does each one behave like its name says (Brawler charges, Duelist waits for an opening, Ambusher opens big then hides, Swarmer just rushes)?
- [ ] Is the one-line description in the token dialog enough to know what you're picking?
- [ ] Anything that feels wrong for the style (a rule too eager, a wrong target, a missing move)? Send me the style and the situation.
- [ ] A token you configured before the rename (brute, archer, caster or skittish) still works and shows the new name.

## 5c. Template and rule editor
- [ ] Game Settings > Configure Settings > Monster Brain > "Open editor" opens it (also: "Edit templates…" in a token's dialog, and `api.editTemplates()`).
- [ ] Starters show as read-only; Duplicate makes an editable copy.
- [ ] Edit a rule: rename it, add a condition, change its parameters, add/reorder actions, add a role target preference, set a limit. Typing in a field keeps focus; the summary sentence updates as you type.
- [ ] Click Save straight after typing in a field (without clicking elsewhere): the change is saved (this was a deliberate design point).
- [ ] Apply the copy to a token (token dialog > template), run the dry run or start a combat: it behaves as the sentence describes.
- [ ] Save while a combat is running: the strip changes without waiting for the next turn.
- [ ] Switch off a shipped rule for a template; confirm it stops appearing for tokens using it.
- [ ] Unsaved changes: switching templates or closing asks to confirm.
- [ ] Delete a template; a token that used it shows a "template does not exist" warning rather than breaking.
- [ ] Campaign policies tab: change the repeat cap, set "no limit", and see the effect on suggestions.
- [ ] Does the 640px window feel usable? Anything you'd have to scroll for too often?

## 5. Profiles, templates, dry run
- [ ] `mb.listTemplates()` lists the ten styles: brawler, berserker, duelist, skirmisher, ambusher, sniper, spellslinger, hexer, coward, swarmer.
- [ ] Give a sniper NPC a profile: `await mb.setProfile(actor, { template: "sniper" })`; on its turn "Volley" or "Retreat and shoot" appears, with the bow named, e.g. "Ranged strike (Shortbow)".
- [ ] A monster with no ranged attack and the sniper template: sniper rules are held back with "no ranged attack".
- [ ] `await mb.setProfile(actor, { template: "caster", slotBindings: { signature: actor.items.getName("<a spell or action>").id } })`; the strip names it.
- [ ] `mb.dryRun("<monster name>")` prints a report; with no token on the scene it says distances are unknown.
- [ ] `mb.explain()` on a monster's turn returns held-back reasons and any warnings.

## 6. Send back
- Foundry version and PF2e system version.
- Anything unchecked, with the exact console error (red lines) and what you did just before.
- Screenshots of the strip and the expanded card if layout looks off.
- Anything that felt wrong even though it "worked" (confusing text, wrong target, suggestion you disagreed with).
