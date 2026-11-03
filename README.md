# Monster Brain

A Foundry VTT module for the **Pathfinder 2e** system that gives GMs a rudimentary "AI" for monsters. It does not play the monsters. It advises.

- **Prep time:** design monster behaviour as prioritised rules, with reusable templates and per-creature tweaks.
- **Table time:** on each monster's turn, a GM-only panel suggests one or two actions and shows why.

Status: pre-alpha scaffold. See [`docs/design-brief.md`](docs/design-brief.md) for the full design, [`docs/decisions.md`](docs/decisions.md) for open questions, and the build order in brief section 14.

## Development

```bash
npm install
npm test
```

No build step. Link the repo into your Foundry `Data/modules/` folder as `monster-brain` and enable it in a PF2e world.

## Applying a template (per token)

Behaviour is set **per token**, so two goblins from the same actor sheet can act differently.

1. Right-click an NPC token on the map and click the **brain** button on the Token HUD. (No button? Select the token and run `game.modules.get("monster-brain").api.configure()` in the console, or make that a hotbar macro.)
2. Pick a **template**, switch individual **rules** off, and **bind slots** (e.g. pick which spell is the creature's `signature`). A live **preview** shows what it would suggest on this scene, with your unsaved changes.
3. Choose where it applies: **this token only** (default), or **every token of the actor** as a default that individual tokens can override. A token's own settings always win; its template replaces the actor's.
4. **Save.** If that token is acting right now, the strip updates straight away.

## Template and rule editor

Open it from **Game Settings > Configure Settings > Monster Brain > Open editor**, from **Edit templates…** in a token's Monster Brain dialog, or with `game.modules.get("monster-brain").api.editTemplates()`.

- **Templates tab:** create, duplicate, edit and delete templates. The ten starters are read-only; click **Duplicate** to make an editable copy. Each rule is a card showing a one-line sentence ("When … : … Target: …"). Open it to edit its **conditions** (all must hold; tick *not* to negate), the **actions** to do in order (including your own custom slots), **target preferences** in order, **limits** (once per encounter, max per turn, cooldown) and **hint** text. Higher rules win. You can also switch off any of the shipped default rules for the template. Warnings appear on the rule they belong to.
- **Campaign policies tab:** the repeat cap (stop suggesting the same action more than N times a turn), or turn it off.
- Saving updates a running combat's suggestion straight away. Tokens that use a template pick up changes automatically.

## Authoring (console)

Everything the dialog does is also available from the console. `setProfile(actor, ...)` sets the actor-wide default; `setTokenProfile(token, ...)` sets one token.

Rules are layered: system defaults, campaign, template, creature, encounter. A later layer replaces a rule with the same `id`, disables it with `disable`, or adds new rules, which rank ahead of rules from more general layers (so your template beats the shipped defaults; set `priority` on a rule to override position). Run these in the browser console (F12) as a GM:

```js
const mb = game.modules.get("monster-brain").api;

// A reusable template
await mb.setTemplate("my-sniper", {
  rules: [
    { id: "volley", label: "Volley",
      when: [{ type: "enemy-in-reach", not: true }, { type: "enemy-within", feet: 60 }],
      do: ["ranged-strike", "ranged-strike"], target: ["lowest-hp"] }
  ]
});

// Give a creature that template, turn off one shipped rule, and bind its signature action
const actor = game.actors.getName("Goblin Archer");
await mb.setProfile(actor, {
  template: "my-sniper",
  disable: ["last-stand"],
  slotBindings: { signature: actor.items.getName("Flaming Arrow").id }
});

// On your monster's turn: what does it suggest, what was held back and why, and any warnings?
mb.explain();
```

Slots like `melee-strike` and `ranged-strike` bind automatically to the creature's first matching attack. Other slots (e.g. `signature`) are never guessed; bind them with `slotBindings`. `mb.explain()` lists validation warnings. Edits take effect from the next evaluation (next turn, or any action taken).

## Starter templates and dry run

Ten starter templates ship with the module, named for **how the creature fights**. They are starting points to tweak. `signature` is a creature's one special move; where a style uses it, bind it to the right spell or action (the token dialog has a slot picker).

| Style | Fights like this | Needs |
|---|---|---|
| **Brawler** | Toe-to-toe. Charges within 40 ft, hits the weakest in reach, power attack every other round. | melee Strike, `signature` |
| **Berserker** | Reckless and relentless. Chases within 60 ft, goes all-in when badly hurt, never retreats. | melee Strike, `signature` |
| **Duelist** | Patient and precise. Exploits off-guard foes, feints on a cooldown, only steps in within 25 ft. | melee Strike, `signature` |
| **Skirmisher** | Hit and fade. Darts in on soft targets, strikes, slips away. | melee Strike |
| **Ambusher** | Devastating opener on a soft target, then hit and vanish. | melee Strike, `signature` |
| **Sniper** | Shoots from range, backs away when engaged, prefers casters. | ranged Strike |
| **Spellslinger** | Stays out of melee and leads with its main spell. | `signature` (its spell) |
| **Hexer** | Debuffs the toughest unafflicted enemy before damaging anyone. Edit the condition to match your debuff. | `signature` (its debuff) |
| **Coward** | Runs when hurt or frightened; only pokes when cornered. | melee Strike |
| **Swarmer** | Mindless minions: rush the nearest enemy and attack. No tactics. | melee Strike only |

Earlier versions called four of these Brute, Archer, Caster and Skittish. Those old ids still work and map to Brawler, Sniper, Spellslinger and Coward.

```js
const mb = game.modules.get("monster-brain").api;
mb.listTemplates();                                   // what's available and where it comes from
await mb.setTokenProfile(canvas.tokens.controlled[0], { template: "sniper" });   // one token
await mb.setProfile(game.actors.getName("Goblin Archer"), { template: "sniper" });  // or every token of the actor
await mb.installStarterTemplates(["sniper"]);         // copy a starter into your world to edit it
mb.dryRun(canvas.tokens.controlled[0]);               // preview one token, no combat needed
mb.dryRun("Goblin Archer");                           // or by actor name (uses its first token)
mb.dryRun("Goblin Archer", { round: 3 });
```

`dryRun` evaluates the creature against the visible hostile tokens on the current scene and prints what it would suggest, why, what was held back, and any warnings. It needs a token for the creature on the scene to know distances; without one, reach and distance rules cannot fire (the report says so). Casters and anything using `signature` need that slot bound (`slotBindings`).

## Role tags and targets

Tag your PCs so rules can prefer them. **Right-click a PC token and click the tag button on the Token HUD** (or select it and run `game.modules.get("monster-brain").api.tagRoles()`). Tick suggested roles or type your own (free-form; suggested: caster, healer, squishy, frontliner, ranged, support), then choose where it applies:

- **The character in every encounter** (the default), or
- **This encounter only**, which overrides the default for that fight (available when the token is in the current combat; or tick "use the default roles" to drop the override).

The same thing from the console:

```js
const mb = game.modules.get("monster-brain").api;
await mb.setActorRoles(game.actors.getName("Mira"), ["caster"]);   // campaign default
await mb.setCombatantRoles(game.combat.combatants.getName("Mira"), ["caster", "squishy"]); // this encounter only
await mb.setCombatantRoles(game.combat.combatants.getName("Mira"), null);                  // remove the override
```

A rule's `target` is an ordered list of preferences, applied in order: `["role:caster", "lowest-hp"]` means casters first, then lowest HP among them. Other entries: `highest-hp`, `nearest`, `farthest`, and `in-reach` (enemies the creature can hit now; use it in melee rules). An encounter override replaces the PC's default tags for that combat.

## Installing from a release

In Foundry: **Add-on Modules > Install Module > Manifest URL**, then paste:

```
https://github.com/ink-and-ember-forge/foundry-monster-brain/releases/latest/download/module.json
```

Note: GitHub's `latest` ignores pre-releases (tags containing `-`, like `v0.1.0-rc1`). To install one, use its tag URL: `.../releases/download/v0.1.0-rc1/module.json`.

## Cutting a release

```bash
git tag v0.1.0
git push origin v0.1.0
```

The Release workflow runs lint and tests, stamps the version into `module.json`, and attaches `module.json` and `module.zip` to a GitHub release. The repository must be public for Foundry to fetch it.
