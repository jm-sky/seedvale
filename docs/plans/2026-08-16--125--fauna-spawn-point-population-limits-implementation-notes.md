# Plan: Fauna — limity populacji i wyczerpywanie spawn pointów — implementation notes

**Created:** 2026-08-16
**Status:** `planned` 📋
**Priority:** medium · **Effort:** L
**Depends on:** ~~110~~ ~~118~~

## Review summary

Plan 125 is **not implemented**. The repository already has the core spawn-point mechanism, interaction representation, animal death hook, world-day clock and reusable fire/terrain systems, so this should be an extension of those systems rather than a new population manager.

Important current-state discrepancies:

- `PreySpawner.maxPreyCount` is currently only a **live nearby-animal cap**. `updateSpawners()` counts prey inside `SPAWNER_RADIUS` and calls `onRespawn` when below the cap; it has no historical population/death state.
- `PreySpawner` has no stable ID, lifecycle state, death counter, recovery timestamp or spawn-point association.
- `AnimalAgent` has stable `animalId`, but it is currently generated as `${kind}-${nextAnimalId++}` inside one `createFauna()` build. It is therefore not a stable world identity across rebuilds/reloads and is not a spawn-point identity.
- `createFauna()` currently has three actual `PreySpawner` specs: cave/deer, thicket/stag and the one-time `wolfDen`. The larger `SPAWNS` ring/herd system is separate and does not create `PreySpawner`s. Do not accidentally apply the new lifecycle to every ring spawn.
- Herd/juvenile spawning from plan 118 is implemented for ring spawns via `herdId`/`lifeStage`/`motherId`; spawner-driven respawns are currently solitary. The plan's acceptance criterion about herd/juvenile limits therefore needs to be interpreted as: any future herd/juvenile created **from a managed spawn point** must carry that spawn point identity and count against its limit.
- Spawner interaction already exists as `Interactable.kind === 'spawner'`; currently it only opens generic inspection/quest flavor text. There is no destructive action.
- Player-built `PlacedFires` and `VillageFire` already provide a reusable fire pipeline. A world fire does not need a new fire system.
- Terrain mutation already exists through `ChunkManager.modifyTerrain()`. The plan's burned-ground visual should reuse it or existing prop/tree lifecycle mechanisms, not introduce a shader system.

## Relevant files / ownership

### Primary

- `src/fauna/AnimalSpawner.ts` — extend `PreySpawner`; keep ownership of lifecycle state and population accounting here. `SPAWNER_RADIUS` is already the correct local spatial scale.
- `src/fauna/createFauna.ts` — create stable spawn-point IDs/state, pass `spawnPointId` into animals created by a spawner, perform respawn through the existing `updateSpawners()` callback, create/update the spawner visuals and expose the spawner state through `Fauna.getSpawners()`.
- `src/fauna/AnimalAgent.ts` — add only the minimal optional `spawnPointId` data needed by an animal and keep the existing `onDeath(animalId)` lifecycle hook. Death must report once; despawn/removal is not a death event.
- `src/app/interactables.ts` — change the existing spawner candidate prompt based on lifecycle state; do not create another interaction system.
- `src/interaction/Interactable.ts` — extend the existing `spawner` variant only if the interaction handler needs explicit action/state data. Prefer passing the existing `PreySpawner` object rather than duplicating state.
- `src/interaction/resolveInteraction.ts` — only for inspection/flavor/quest integration if needed. Destructive action needs inventory access, so it is more appropriate in the existing `gameLoop.ts` / `createApp.ts` interaction path, analogous to fire/corpse/deposit actions.
- `src/app/gameLoop.ts` / `src/app/createApp.ts` — handle the `[E] Zniszcz` branch, branch inventory cost and fire placement using the existing player interaction/action pipeline.
- `src/settlement/PlacedFires.ts` + `src/settlement/VillageFire.ts` — reusable fire implementation. Prefer a `pit`/large existing campfire representation unless review of the current props shows a better existing "large" fire asset.
- `src/terrain/chunkManager.ts` / terrain modification API — local burned-ground modification.
- `src/world/treeLifecycle.ts` and existing prop/tree APIs — use only if a small number of nearby trees/props need a burned state; avoid creating a new vegetation lifecycle.
- `src/world/worldContext.ts`, `src/world/dayNight.ts`, `src/app/worldBundle.ts` — existing world-day access (`elapsedDays` / `getWorldDays`) and world rebuild/lifetime wiring.
- `src/persistence/saveData.ts` and `src/app/createApp.ts` persistence wiring — likely required if disabled/depleted spawn state must survive reloads; see recommendation below.

### Context already verified

`docs/plans/README.md` lists plan 125 as `planned`, medium priority, effort L, dependent on completed plans 110 and 118. `docs/STATE.md` confirms prey spawners, animal IDs/death hooks, herd/juvenile mechanics, placed fires and terrain systems already exist. fileciteturn3file0 fileciteturn4file0

## Recommended architecture

Keep `PreySpawner` as the owner of all spawn-point state. Do **not** add `SpawnPointManager`.

Suggested shape (adapt names to repository conventions):

```ts
type SpawnPointState = 'active' | 'depleted' | 'disabled' | 'recovering'

type PreySpawner = {
  id: string
  x: number
  z: number
  type: SpawnerType
  kind: AnimalKind
  respawnTime: number
  maxPreyCount: number
  timeSinceLastRespawn: number
  state: SpawnPointState
  deathsThisCycle: number
  disabledAtDay: number | null
}
```

Prefer reusing `maxPreyCount` as the **configured population cap** instead of introducing another parallel numeric cap. The current implementation already uses it for the live nearby count. Add historical state separately because live count and deaths are intentionally different concepts.

Centralise species tuning in `AnimalSpawner.ts`, e.g. a `Partial<Record<AnimalKind, number>>`, but make the actual cave/thicket `maxPreyCount` values explicit after checking current spawn behaviour. Current defaults are cave/deer = 3 and thicket/stag = 2; do not blindly use the plan's example values 6/4/etc. fileciteturn6file0 fileciteturn25file0

## Stable identity

Current spawner objects are created as `{ ...pos, ...spec, timeSinceLastRespawn: 0 }` and have no ID. Add an ID derived from deterministic world inputs, not runtime counters.

Recommended: derive it from the stable settlement/world seed context + spawner type + deterministic ordinal/index. If the current `createFauna()` API lacks a stable settlement ID, prefer passing the settlement's existing stable identity into `buildFauna()`/`createFauna()` rather than hashing floating-point coordinates as the primary identity.

`AnimalAgent.spawnPointId?: string` should be metadata only. The spawner remains the owner of population state. `spawnAgent()` should accept an optional `spawnPointId` and pass it to `AnimalAgent`; only animals actually generated by a managed `PreySpawner` should receive it.

## Death accounting

Reuse the existing `AnimalAgent.collapse()` → injected `onDeath(animalId)` path from plan 110. Do not add a second death event system. `createFauna()` already forwards `onAnimalDeath` into every spawned `AnimalAgent`. fileciteturn25file0

The missing piece is resolving `animalId -> spawnPointId` without a global manager. Best minimal option:

- maintain a local `Map<string, PreySpawner>`/`Map<string, string>` inside `createFauna()` or the spawner-owner closure;
- register an animal when a spawner creates it;
- in the existing death callback, increment the owning spawner's `deathsThisCycle` exactly once;
- remove the mapping when the animal is disposed/despawned;
- never increment on `readyToRemove()` alone.

If the existing death callback is already needed by quests, compose the callback rather than replacing it.

A death should count even when caused by predator/lifecycle/other systems, because plan 110 deliberately makes the death hook cause-independent. `AnimalAgent`'s existing lifecycle is the right source of truth. fileciteturn4file0

## 50% threshold

Use the configured `maxPreyCount` as the reference population for the spawn-point cycle, not the instantaneous nearby count.

For integer populations, define the threshold explicitly and test it. The plan says “>50%”; for `limit = 3`, this means 2 deaths, while `limit = 2` means 2 deaths. Avoid ambiguous `>= limit / 2` semantics for odd numbers; use a helper with tests and document the rounding rule.

Reset `deathsThisCycle` when the point becomes active again after recovery.

## Respawn integration

`updateSpawners()` is currently generic and does one live-count query per spawner. Extend its predicate so only `state === 'active'` spawners may respawn. Keep the existing `SPAWNER_RADIUS` query; do not add a per-frame global animal scan. Current code already filters prey and maps only `{kind,x,z}` before calling the callback. fileciteturn6file0

For the respawn callback:

1. create the animal with `spawnPointId`;
2. register the animal→spawner association;
3. add it to `agents`.

A `depleted` point should stop respawning immediately. `disabled` and `recovering` should also never respawn.

`wolfDen` must remain non-respawning and quest-compatible. It currently uses `respawnTime: Infinity` and has separate initial-pack tracking. Do not make the new population lifecycle accidentally turn `wolfDen` into a renewable prey habitat. fileciteturn25file0

## Lifecycle transitions

Recommended transition logic:

- `active`: existing respawn behaviour; count deaths.
- `depleted`: entered once the death threshold is reached; suppress respawn; keep the spawner/prop in the world; interaction offers `Zniszcz`.
- `disabled`: after destruction; set `disabledAtDay = getWorldDays()`; suppress respawn.
- `recovering`: after `RECOVERY_DAYS` have elapsed, only when the local same-species living count is at least 2. If condition fails, remain `disabled` and retry on a low-frequency day tick.
- `active`: recovery succeeds; reset cycle counters and resume normal respawn.

The plan's `depleted → disabled → recovering → active` wording should not imply a one-frame transitional state. A simple `tryRecovery(nowDays, nearbyAnimals)` function is enough; `recovering` can be an observable state for UI while checking the condition, but no separate long-running recovery manager is needed.

## Recovery performance

Do not scan all animals every frame. `Fauna.update()` already owns the active animal array and runs per-frame. Add a low-frequency recovery check (for example when `elapsedDays` changes, or at most once per in-game day) and count only animals within `SPAWNER_RADIUS` with matching `kind`.

The plan's condition should use the same local scale as `SPAWNER_RADIUS`, as it already requests. Do not introduce a second arbitrary radius. `SPAWNER_RADIUS` is currently 12. fileciteturn6file0

## Interaction

`buildInteractables()` already exposes every `PreySpawner` as `kind: 'spawner'`, and `Interactable.ts` already carries the actual `PreySpawner`. The current prompt is always `Zbadaj: ...`. Change only the prompt/state behaviour:

- active: current inspection prompt;
- depleted: `[E] Zniszcz`;
- disabled/recovering: inspection/status text, or no destructive action.

The existing interaction pipeline should remain the single source. `resolveInteraction()` currently treats `spawner` as inspection/quest flavor and has no inventory context. Keep generic inspection there; route destruction through the existing game-loop/createApp action handling, just like campfire, corpse and deposit actions. fileciteturn10file0 fileciteturn12file0 fileciteturn15file0

Use the existing inventory item kind for branches and the same mutation/notification path used by other player actions. Do not create a fauna-specific resource inventory mechanism.

## Fire / burned visual

Reuse `PlacedFires`/`VillageFire` rather than creating another fire type. `PlacedFires.place(x, z, kind)` already creates a world campfire and reuses `createVillageFire`; `pit` is the existing stone-ring variant. `VillageFire` already supports ignition/refuel/update. fileciteturn17file0 fileciteturn18file0

The plan asks for a “large fire”. First inspect the current `createCampfire()`/prop scale before changing anything. If the existing pit is visually sufficient, place a `pit` and avoid adding another asset. If it is too small, prefer a small scale/visual extension of the existing campfire prop rather than a new fire subsystem.

Important: the plan says the fire is created after consuming 4 branches. `PlacedFires.place()` itself does not charge inventory; the caller must consume the exact 4 branches once, then place the fire. Avoid double-charging.

## Burned terrain / props

Use `ChunkManager.modifyTerrain()` for a small local dark/burned patch only if the current terrain modification API can express the required visual without creating persistent per-frame cost. For props/trees, reuse existing tree lifecycle/prop mechanisms only where they already support a state change.

Do not remove arbitrary trees from the world unless an existing API can persist that change safely. The plan's v1 acceptance can be satisfied by a visible local burned patch + fire + a small amount of existing burned/dry prop treatment. Avoid a new shader or world-wide fire biome system.

## Persistence — plan gap to resolve before implementation

The plan does not explicitly specify persistence, but its gameplay semantics strongly imply that a destroyed habitat should remain disabled after reload. Current save data persists placed fires and world/player state, while fauna runtime state is not a full simulation snapshot. fileciteturn4file0

Recommendation: persist only the **small spawn-point lifecycle state**, not animals. Add a compact optional save collection keyed by stable `spawnPointId`, containing at minimum `state`, `deathsThisCycle` and `disabledAtDay` (and any data strictly required to restore the current cycle). On load, deterministic spawn points are regenerated from the seed and their saved lifecycle overlay is applied.

If the team intentionally wants this feature to reset on reload, that decision should be made explicit in the plan before implementation; otherwise a player can burn a habitat, reload, and silently restore it, undermining the intended persistent consequence.

## Edge cases / risks

- **Odd population limits:** define exact 50% rounding semantics.
- **Animal dies after the spawner is rebuilt:** death callback can arrive only while the old `Fauna` instance is alive; ensure disposal prevents stale callbacks mutating a new spawner instance.
- **Animal despawn/corpse removal:** never count removal as death. The existing `collapse()` hook is the event source.
- **One animal registered twice:** use a `Set`/map guard so one `animalId` can increment a spawner only once.
- **Animal moves away before death:** it still counts toward the spawn point because identity, not current proximity, determines ownership.
- **Animal born/created outside a spawner:** no `spawnPointId`, therefore no population accounting.
- **Herd juveniles:** only count them when they actually originate from a managed spawn point; do not retroactively attach ring herds to cave/thicket points.
- **wolfDen:** preserve one-time quest semantics; likely keep lifecycle permanently active/non-managed or explicitly exclude `wolfDen` from population depletion.
- **Recovery same-species animals:** do not spawn artificial animals to satisfy the “2 nearby” condition.
- **Multiple settlements:** IDs must distinguish identical spawner types in different settlements.
- **World rebuild:** stable spawn-point identity is especially important because `animalId` is currently a per-build counter.
- **Terrain persistence:** if burned terrain is meant to survive reload, use the existing terrain override persistence rather than an ephemeral mesh/material mutation.
- **Branches:** consume exactly four only after the interaction is confirmed and before placing the fire; handle inventory failure atomically.

## Recommended implementation order

1. Extend `PreySpawner` with stable identity + lifecycle/population fields and central species limit configuration.
2. Add deterministic spawn-point identity at `createFauna()` construction time.
3. Add optional `AnimalAgent.spawnPointId` and thread it only through spawner-created animals.
4. Wire existing `onDeath(animalId)` into local spawn-point death accounting with duplicate protection.
5. Make `updateSpawners()` state-aware and stop respawn for depleted/disabled/recovering points.
6. Implement low-frequency recovery using `getWorldDays()` and `SPAWNER_RADIUS`.
7. Add the existing interaction prompt/action for depleted points and consume four branches through the existing player action path.
8. Reuse `PlacedFires`/`VillageFire` for the burned-site fire.
9. Add the smallest possible burned-ground/prop visual using existing terrain/prop mechanisms.
10. Add compact persistence for spawn-point lifecycle if persistent consequence is confirmed; avoid persisting individual animals.
11. Add focused unit tests for threshold, state transitions, death de-duplication, recovery eligibility and `updateSpawners()` state gating.

## Verification focus

Technical:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`

Browser/manual scenarios:

- verify current cave/deer and thicket/stag spawn limits;
- kill animals by player and by predator/lifecycle and confirm one death increments once;
- cross the 50% threshold and confirm no further respawn;
- interact with a depleted point, verify exactly 4 branches are consumed and the fire appears;
- verify burned visual is local and persists for the intended lifecycle;
- advance time past recovery period with fewer than 2 local same-species animals → remains disabled;
- with at least 2 existing same-species animals nearby, verify recovery and normal respawn;
- verify wolf den quest behaviour remains unchanged;
- verify no measurable per-frame scan proportional to total fauna/spawner count is introduced.

## Final recommendation

The plan is architecturally sound, but before Claude implements it, clarify two points in the plan/implementation: **whether spawn-point lifecycle state is persisted** and **whether `wolfDen` is explicitly excluded from the depletion lifecycle**. Everything else can be implemented cleanly by extending `PreySpawner` + `createFauna()` and reusing the existing interaction, fire, terrain and death-hook systems.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
