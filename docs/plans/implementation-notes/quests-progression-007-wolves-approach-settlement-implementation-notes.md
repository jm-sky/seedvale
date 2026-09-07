# Implementation notes: quests-progression-007 wolves approach settlement

## Verified current-code facts

- `src/fauna/AnimalSpawner.ts` owns the generic habitat-spawner lifecycle. `SpawnerType` includes `wolfDen`; `PreySpawner` owns stable `id`, `kind`, `respawnIntervalDays`, `maxPreyCount`, `state`, `deathsThisCycle` and `disabledAtDay`. `WOLF_DEN_ID = 'wolf-den'` is the current stable den identity.
- `wolfDen` currently opts out of `updateSpawners()` respawn with `respawnIntervalDays: Infinity`. Its pack still carries `spawnPointId`, contributes deaths to depletion, and can be destroyed through the generic depleted-spawner interaction.
- `SavedSpawnPointState` currently persists only lifecycle data; extending source-owned durable state must go through the same spawn-point persistence path rather than a quest-owned registry.
- Generic habitat recovery is `disabled → recovering → active` after the existing recovery window. The problem den needs a source-owned way to opt out without changing ordinary cave/thicket semantics.
- Wild-fauna individuals are not persisted. `pressure` / `humanTaste` must therefore remain authoritative on the den/spawner and be re-derived or propagated to reconstructed wolves.
- `src/fauna/predatorHumanDecision.ts` is the pure predator-human decision seam. Reuse it for `humanTaste`; do not add a second human-hunting FSM.
- Runtime `frenzied` is separate from rabies and is runtime-only. Reuse its integration lessons, not its state ownership.
- NPC animal defense already exists through normal defend/flee/combat logic.
- fauna-016 provides species-specific roaming and a `trip`/destination seam suitable for settlement-directed wolf travel.
- `clear_wolf_den` currently means the initial pack is dead. Preserve that semantic for existing `wilcza-jama`.
- `QuestManager` remains an observer of world state, not fauna authority.

## Final V1 contracts

### Activation

The den exists from world start but the authored problem activates at the start of game day 2 if the den has not already been permanently destroyed:

```text
pressure = 0.75
humanTaste = true
```

This is world-state activation, not quest activation. Acceptance/dialogue must never enable or disable the problem.

Use existing world-day/time ownership. No real-time/frame timer.

### Durable den state

Source-owned fields/concepts:

```ts
pressure: number       // bounded 0..1
humanTaste: boolean
canRecover: boolean
```

For this den, `canRecover = false`.

Prefer extending the existing spawn-point snapshot contract over introducing a separate `WolfProblemState` registry unless the current code at implementation time proves the spawner cannot coherently own these fields.

### Pressure scaling

Keep baseline config distinct from effective values.

Use pure effective calculations:

```text
effectiveCap = baseCap + round(pressure * 4)
```

For `pressure > 0`:

```text
effectiveRespawnIntervalDays = lerp(3.0, 1.5, pressure)
```

For `pressure === 0`, preserve the den's baseline behaviour rather than trying to interpolate from `Infinity`.

Current V1 numbers:

```text
baseCap = 2
pressure = 0.75
effectiveCap = 5
effectiveRespawnIntervalDays ≈ 1.9
```

### `humanTaste`

`humanTaste` is boolean, not numeric.

Thread it into the existing predator-human decision input/scoring seam so:

```text
false → current behaviour
true  → lower effective human fear contribution
        + higher human-oriented attack/appetite score
```

Do not eliminate fire/crowd/self-preservation behaviour. Do not implement `questActive` or global wolf-kind exceptions.

Source-to-individual propagation belongs at the current wolf creation/spawn integration point in `createFauna.ts` or the nearest current constructor/config seam. Do not make `QuestManager` iterate animals and mutate them.

### Settlement-directed trips

This is mandatory in V1, not a post-playtest fallback.

Extend fauna-016's existing trip/destination ownership:

```text
source: active wolfDen with pressure > 0
destination: settlement outskirts
max concurrent settlement-directed trips per den: 1
minimum opportunity cooldown: 0.5 game day
traveller: one normal wolf from the den
```

The trip itself does not force combat. Once near people, normal predator-human/NPC decision logic decides the reaction, with `humanTaste` modifying its scores.

No teleporting, no spawning by the village, no parallel movement pipeline.

### Permanent destruction

Reuse the existing lifecycle and destroy interaction:

```text
active → depleted → [E] Zniszcz → disabled
```

For this den, `canRecover = false`, so `disabled` is permanent.

Do not add a new lifecycle state unless the current code during implementation provides a clearly better generic representation. Do not globally change ordinary habitat recovery.

Remaining live wolves are not despawned after destruction.

## Quest integration

Add generic objective:

```ts
{ type: 'destroy_spawn_point', spawnerId: string }
```

Keep `clear_wolf_den` unchanged for compatibility with `wilcza-jama`.

`destroy_spawn_point` succeeds only on the real persistent destruction state. It must not complete on:

- kill count,
- `depleted`,
- `isWolfDenCleared()` alone.

The new authored quest contract is:

```text
id: wilki-pod-osada
giver: Anna
availability: Anna / trusted
```

Flow:

1. Anna reports increasing wolf attacks.
2. Anna points the player toward the nearby den as the likely source.
3. Player reaches the real den.
4. Player reduces the pack enough to unlock the existing destroy interaction.
5. Player destroys the den.
6. `destroy_spawn_point` clears and the quest becomes reportable.
7. Anna confirms the source is gone.

No tracking/investigation subsystem in V1.

## Reward contract

No EXP.

No required physical item reward.

Use current relation/social-consequence ownership, mapping these values into the then-current quest outcome model:

```text
Anna relation: +2
competence: +20
courage: +22
benevolence: +8
renown: +35
```

Do not reintroduce legacy EXP fields if the quest reward model has evolved before implementation.

## Persistence integration points

Preflight current versions of:

```text
src/fauna/AnimalSpawner.ts
src/fauna/createFauna.ts
src/app/saveState.ts
src/persistence/saveData.ts
src/app/createApp.ts
```

Persist enough source state to reconstruct:

- `pressure`,
- `humanTaste`,
- `canRecover` or equivalent non-recoverable source contract,
- lifecycle state,
- activation state only if it cannot be deterministically derived from world day + destruction state.

Do not persist individual wild wolves.

If the saved spawn-point shape changes, follow the then-current `CURRENT_SAVE_VERSION` / migration rules rather than relying on accidental parser defaults.

## Behaviour/combat integration points

Preflight:

```text
src/fauna/predatorHumanDecision.ts
src/fauna/faunaDecision.ts
src/fauna/AnimalAgent.ts
src/fauna/createFauna.ts
src/ai/npcAnimalThreat.ts
src/fauna/faunaCombat.ts
```

Reuse existing intent refresh cadence and bounded NPC candidate lists. No extra per-frame settlement scan.

## Movement integration points

Preflight the fauna-016 trip implementation and extend its existing reason/destination ownership rather than adding a wolf-only movement subsystem.

Pin these limits in tests:

- at most one settlement-directed trip from the den at once,
- at least `0.5` game day between opportunities,
- destination is settlement outskirts rather than settlement center.

## Existing content compatibility

Before coding, inspect current:

```text
src/quests/quests.ts
src/quests/QuestManager.ts
src/quests/QuestManager.test.ts
```

Add regression coverage proving `grozny-wilk` and especially `wilcza-jama` preserve current behaviour.

Do not silently strengthen `clear_wolf_den` to permanent destruction semantics.

## Implementation order

1. Pin source-owned den state and persistence (`pressure`, `humanTaste`, non-recovery).
2. Add deterministic day-2 world activation.
3. Add pure pressure-derived effective cap/respawn values.
4. Propagate `humanTaste` from source to spawned/rebuilt wolves and integrate it with existing predator-human scoring.
5. Add pressure-driven settlement-directed trips through fauna-016's trip mechanism.
6. Add permanent destroy handling while preserving ordinary habitat recovery.
7. Add generic `destroy_spawn_point` objective and world-state resolver/event seam.
8. Add `wilki-pod-osada` content, Anna hint/report flow and social consequences without EXP.
9. Add focused persistence/regression tests.

## Pitfalls

- Do not use active quest state as pressure authority.
- Do not activate the problem before day 2.
- Do not use `frenzied` as persisted authority.
- Do not model `humanTaste` as rabies.
- Do not persist wild wolves for this scenario.
- Do not globally turn wolves into settlement attackers.
- Do not broaden generic habitat destruction to permanent destruction.
- Do not complete on kill count or `depleted` alone.
- Do not despawn surviving wolves on quest completion.
- Do not introduce `WolfManager`, quest spawn registry or second population system.
- Do not add EXP reward.

## Verification focus

Automated tests should pin:

- no activation on day 1,
- day-2 activation to `pressure = 0.75`, `humanTaste = true`,
- `pressure = 0.75` → effective cap `5`,
- `pressure = 0.75` → respawn interval about `1.9` game days,
- boolean `humanTaste` modifies fear and attack/appetite scoring while preserving other fear/self-preservation inputs,
- settlement-directed trip concurrency/cooldown,
- persistence round-trip,
- no recovery after permanent destruction,
- `destroy_spawn_point` semantics,
- unchanged `clear_wolf_den` / `wilcza-jama` behaviour,
- no EXP reward.

Manual browser verification remains the user's responsibility; no AI browser verification.