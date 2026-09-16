# Implementation notes: fauna-031 — Wildlife habitat pressure assessment

**Implemented:** 2026-09-16 · plan: [fauna-031](../fauna-031-wildlife-habitat-pressure-assessment.md)

Landed as a fauna-owned derived read model. `src/fauna/habitatPressure.ts` owns the snapshot contract, pure scoring, one-pass agent scan, TTL cache check and the lazy resolver. `createFauna()` holds a runtime-only `Map` and exposes `Fauna.getHabitatPressure`. The inert `WorldBundle` fauna stub returns `null`. Nothing is written to `SaveData`.

## Deviations from the plan

- Own-habitat predators (`spawnPointId === habitatId`) are excluded from the nearby-predator count. Without that, a wolf den would score its own pack as predator pressure on itself. External predators in the bounded radius still count.
- Grass forage is queried only when the spawner species actually has `diet.grass` *and* a `GrassForageService` is injected. A wolf/fox/bear habitat never calls `queryNear()`; a missing service on deer/stag is scored as food-not-applicable, not famine.

## Verified current-code facts

- `src/fauna/createFauna.ts` already owns the exact runtime ingredients this read model needs: `agents`, `spawners`, a stable `spawnerById: Map<string, PreySpawner>`, the persistent-occupant registry, and the injected `GrassForageService`. Keep pressure lookup inside this ownership boundary rather than introducing another manager.
- `Fauna` is the public façade returned from `createFauna()`. Add `getHabitatPressure(spawnerId, nowDays)` there. `src/app/worldBundle.ts` also has an inert/stub `Fauna` object for background boot, so that stub must gain the same method returning `null`.
- `AnimalSpawner.ts::updateSpawners()` already computes ordinary capacity as `ordinaryHabitatCapacity(effectiveMaxPreyCount(spawner), reservedPersistentSlots)`; pressure population capacity must use the same semantic formula instead of raw `maxPreyCount`.
- `persistentOccupants.ts::PersistentOccupantRegistry.slotCountFor(habitatId)` is the authoritative reserved-slot count. A reserved live/corpse/tombstone slot reduces ordinary habitat capacity even when there is no ordinary live animal occupying it.
- `AnimalAgent.spawnPointId` is public readonly and intentionally identifies animals actually spawned/respawned by a managed `PreySpawner`; ring spawns/livestock leave it undefined. `AnimalAgent.isDead()` is the public death check. Species role comes from `ANIMAL_DEFS[kind].role`; use the existing taxonomy instead of a hardcoded wolf/bear list.
- `GrassForageService.queryNear(x, z, radius, nowDays)` is not a trivial lookup: it regenerates deterministic patch candidates and evaluates terrain suitability (`sampleHeight` + open-ground predicate) before filtering sparse depletion overrides. It is therefore the expensive part of a pressure refresh and must never be called on every consumer read.
- Current performance work (`fauna-028`) showed candidate scans are cheap compared with movement/presentation terrain/water/collider work. One linear live-agent pass on an uncached request is acceptable; recurring background scans are not.

## Recommended implementation shape

### `src/fauna/habitatPressure.ts`

Keep this module pure and Three.js-free. It should own:

- `HabitatPressureKind` / `HabitatPressureSnapshot`;
- pressure normalization constants and deterministic tie ordering;
- a pure input shape for scoring, e.g. population/capacity, spawner state, deaths/threshold, nearby predator count, forage count;
- `scoreHabitatPressure(...)` (name may vary) returning the immutable derived snapshot fields;
- constants for pressure thresholds, predator normalization, forage sufficiency and cache TTL/radii when they are genuinely domain values.

Do **not** pass `AnimalAgent`, `PreySpawner`, `GrassForageService`, `Scene`, terrain samplers or quest objects into the pure scoring function. `createFauna()` adapts runtime objects into primitive inputs.

### `src/fauna/createFauna.ts`

Add a runtime-only cache such as:

```ts
Map<string, { atDays: number; snapshot: HabitatPressureSnapshot }>
```

`getHabitatPressure(spawnerId, nowDays)` should:

1. resolve `spawnerById.get(spawnerId)`; unknown id returns `null` before any agent or forage work;
2. return the cached entry while `nowDays - atDays < TTL`;
3. compute effective ordinary capacity using the exact existing spawner path:
   `ordinaryHabitatCapacity(effectiveMaxPreyCount(spawner), persistentRegistry.slotCountFor(spawner.id))`;
4. perform **one** pass over `agents` to gather both:
   - live members whose `spawnPointId === spawner.id` (and, defensively, whose kind matches the spawner kind),
   - live predator count inside the configured pressure radius using squared X/Z distance;
5. perform at most one `grassForage?.queryNear(spawner.x, spawner.z, FOOD_RADIUS, nowDays)` call;
6. feed primitives into the pure scorer, cache, return.

Do not build temporary filtered agent arrays. A single `for...of` with integer counters is enough and avoids needless allocations in a potentially repeated diagnostic path.

For predator classification, use `ANIMAL_DEFS[agent.kind].role === 'predator'`; do not use `dangerSignificance`, aggression state, quest traits or a species switch.

Use X/Z position data already exposed/used by current fauna code. Do not call movement, navigation, water, terrain or collider APIs merely to assess pressure.

### Food semantics

V1 food pressure is meaningful only for habitat species whose definition actually has `diet?.grass`. Deer/stag do. If `grassForage` is absent (tests/inert construction) or the spawner species has no grass diet, do not fabricate a shortage from `0 available`; model the food signal as neutral/not-applicable in the scorer. Prefer an explicit optional/availability input over silently interpreting missing service as famine.

`queryNear()` already returns currently available patches, so use its count directly. Do not run `isAvailable()` per returned patch and do not run animal-specific walkability filtering.

Choose one small habitat-level radius. There is no current shared constant that exactly means "food pressure radius"; define it in `habitatPressure.ts` instead of reusing an unrelated visual radius. Keep it near the managed-spawner locality scale (`SPAWNER_RADIUS` is 12 m) rather than a settlement/world radius.

### Population and mortality semantics

Population pressure should compare live managed animals with the **effective ordinary capacity**, not raw `maxPreyCount`. The snapshot can expose that effective capacity as `population.capacity`.

`deathsThisCycle` / `depletionThreshold(effectiveMaxPreyCount(spawner))` are the mortality source. Do not create death history. `depleted` / `recovering` should strengthen condition scoring but must not overwrite the component values — consumers still need to see why the result is bad.

Be careful when ordinary capacity is `0` due to persistent reserved slots. Avoid division-by-zero and do not label the habitat population as catastrophically empty solely because all capacity is reserved. Define/test this explicitly in the pure scorer.

### Cache semantics

Use world days, not seconds/frames. One in-game hour is `1 / 24` day and is a reasonable V1 TTL.

Do not add mandatory invalidation hooks in death/respawn/forage mutation paths. TTL is the correctness/performance contract for V1. If implementation can invalidate a cached entry locally at an existing spawner mutation call with no new cross-system wiring, it is optional, but do not expand the plan around it.

Time moving backwards (new world/rebuild/test clock reset) should make an entry stale rather than indefinitely fresh; the cache check should require `nowDays >= atDays` as well as the TTL bound.

## Tests

Prefer a new `src/fauna/habitatPressure.test.ts` for pure scoring. Cover component normalization, state effects, zero-capacity handling, deterministic ties and neutral food when unavailable/not applicable.

For runtime/cache behaviour, either add focused tests around an extracted small resolver helper or extend the lightest existing `createFauna` test seam. Avoid constructing a full rendered fauna world solely to test TTL. Required assertions:

- unknown spawner does no agent/forage work;
- one uncached request scans the provided agents once and calls forage at most once;
- repeated request inside TTL reuses the exact cached result/no forage query;
- request after TTL recomputes;
- dead animals and another `spawnPointId` do not count;
- predator radius uses X/Z distance and ignores dead predators;
- missing grass service is neutral, not a false food shortage.

`worldBundle.ts` inert-fauna typing/build coverage should catch omission of the new façade method; add an explicit test only if existing type/build checks do not.

## Performance verification

No new benchmark framework is needed. The important structural checks are code-level and unit-testable:

- no call to pressure assessment from `Fauna.update()`;
- no per-frame cache refresh;
- one `agents` pass per uncached single-habitat request;
- one or zero `GrassForageService.queryNear()` calls per refresh;
- cached reads do not invoke terrain/water/collider sampling through this feature.

Do not extend `agentCpuDiag` unless implementation unexpectedly needs a counter to prove a regression. Existing benchmark tooling is sufficient for later manual/browser comparison by the User.

## Integration / future consumers

`fauna-031` should expose only the fauna read seam. Do not import quests. The later Brotherhood plan can bind to a stable spawner id and ask `Fauna.getHabitatPressure(...)` when it needs to choose/validate a hunting-ground situation.

This same seam is suitable later for NPC Hunter decisions and settlement diagnostics, so keep outcome text, quest thresholds and narrative labels outside the fauna module.

## Implementation order

1. Add pure `habitatPressure.ts` types/scoring + unit tests.
2. Add `Fauna.getHabitatPressure` and runtime cache in `createFauna.ts` using existing `spawnerById`, `agents`, persistent slot counts and `grassForage`.
3. Update the inert `Fauna` stub in `worldBundle.ts`.
4. Add focused cache/runtime tests.
5. Typecheck/lint/targeted tests; do not run browser verification.

Add concise JSDoc with `@domain fauna` to the public snapshot/scoring seam and `Fauna.getHabitatPressure` so preflight/code-map discovery remains effective.
