# Engine

Pure logic: conditions, cascade merge, ranking, policies, validation.
No `game`, `canvas`, `Hooks` or other Foundry globals here. Foundry/PF2e data is
gathered by an adapter into a plain context object and passed in. This keeps the
engine unit-testable (`npm test`) and the JSON model portable.
