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

## Authoring (console, until the editor exists)

Rules are layered: system defaults, campaign, template, creature, encounter. A later layer replaces a rule with the same `id`, disables it with `disable`, or adds new rules, which rank ahead of rules from more general layers (so your template beats the shipped defaults; set `priority` on a rule to override position). Run these in the browser console (F12) as a GM:

```js
const mb = game.modules.get("monster-brain").api;

// A reusable template
await mb.setTemplate("archer", {
  rules: [
    { id: "volley", label: "Volley",
      when: [{ type: "enemy-in-reach", not: true }, { type: "enemy-within", feet: 60 }],
      do: ["ranged-strike", "ranged-strike"], target: ["lowest-hp"] }
  ]
});

// Give a creature that template, turn off one shipped rule, and bind its signature action
const actor = game.actors.getName("Goblin Archer");
await mb.setProfile(actor, {
  template: "archer",
  disable: ["last-stand"],
  slotBindings: { signature: actor.items.getName("Flaming Arrow").id }
});

// On your monster's turn: what does it suggest, what was held back and why, and any warnings?
mb.explain();
```

Slots like `melee-strike` and `ranged-strike` bind automatically to the creature's first matching attack. Other slots (e.g. `signature`) are never guessed; bind them with `slotBindings`. `mb.explain()` lists validation warnings. Edits take effect from the next evaluation (next turn, or any action taken).

## Starter templates and dry run

Five starter templates ship with the module: **brute, skirmisher, archer, caster, skittish**. They are starting points to tweak.

```js
const mb = game.modules.get("monster-brain").api;
mb.listTemplates();                                   // what's available and where it comes from
await mb.setProfile(game.actors.getName("Goblin Archer"), { template: "archer" });
await mb.installStarterTemplates(["archer"]);         // copy a starter into your world to edit it
mb.dryRun("Goblin Archer");                           // preview, no combat needed
mb.dryRun("Goblin Archer", { round: 3 });
```

`dryRun` evaluates the creature against the visible hostile tokens on the current scene and prints what it would suggest, why, what was held back, and any warnings. It needs a token for the creature on the scene to know distances; without one, reach and distance rules cannot fire (the report says so). Casters and anything using `signature` need that slot bound (`slotBindings`).

## Role tags and targets

Tag your PCs so rules can prefer them (tags are free-form; suggested: caster, healer, squishy, frontliner, ranged, support):

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
