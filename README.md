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
