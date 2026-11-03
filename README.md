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
