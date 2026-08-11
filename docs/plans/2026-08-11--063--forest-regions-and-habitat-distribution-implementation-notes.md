# Implementation Notes: Forest Regions and Habitat Distribution

**Plan:** [063 — Forest Regions & Habitat Distribution](./2026-08-11--063--forest-regions-and-habitat-distribution.md)
**Reviewed:** 2026-08-11
**Implemented:** 2026-08-11
**Verified:** 2026-08-11 (browser — density tuned; moisture canopy band kept at original width)

## Implementation summary (2026-08-11)

- Added pure `forestDensityAt(...)` in `src/terrain/biomeRegions.ts` — peaked moisture canopy on top of `biomeWeightsAt`, gated by land/altitude/ridge. No new noise axis, no transferred forest grid.
- `ChunkManager.sampleForestFactor()` now delegates to `forestDensityAt` (fauna forest/meadow profiles unchanged).
- `computeChunkVegetation()` uses the same signal for acceptance probability, candidate budget (`16 + 90·fd`), tree-vs-bush mix, and initial mature/scale bias. Existing water/slope/treeline/ridge/road rejection preserved. Deep forest ~6–7 m mean spacing.
- Unit tests: `src/terrain/biomeRegions.test.ts`.
- Technical + browser verification passed (2026-08-11).

## 1. Scope and architectural intent

063 should make the existing procedural vegetation read as **large spatial forest regions**, while also exposing a reusable environmental signal for future habitat consumers.

The important correction to the original plan is that Seedvale already has a macro biome/environment layer and already exposes a forest-related runtime sampler. The missing piece is not a new forest subsystem; it is that the existing **macro forest classification is not currently driving tree density strongly enough**.

The intended architecture should therefore remain:

```text
existing terrain / macro region fields
        ↓
existing biome/environment classification
        ↓
forest density / suitability
        ↓
existing chunk vegetation placement
        ↓
existing fauna consumers
        ↓
058 tree lifecycle later consumes the same environment signal
```

Do not introduce `ForestManager`, a second biome system, a second RNG, a global forest-region registry, or a separate forest-generation pipeline.

063 is primarily a **generation/data-flow extension**. It is not a runtime forest simulation and it does not implement tree lifecycle, fauna population logic, settlement logic or new rendering technology.

## 2. Verified current implementation

The current repository is more advanced than the original 063 plan's "Stan obecny" section suggests.

### Macro biome/environment already exists

`src/terrain/chunkHeightmap.ts` already defines `RegionParams` with:

- `continentScale` / `continentFbm`
- `mountainScale` / `mountainFbm`
- mountain thresholds and ridge parameters
- `moistureRegionScale` / `moistureRegionFbm`
- desert/swamp thresholds

`ChunkTileData` already carries apron-inclusive grids for:

- `continentalness`
- `mountainRidge`
- `moistureRegion`

The macro moisture field is generated from a dedicated seeded noise handle, independent of the fine `biome` noise.

### Biome classification already exists

`src/terrain/biomeRegions.ts` already provides:

```ts
export type BiomeWeights = {
  desert: number
  swamp: number
  forest: number
}

biomeWeightsAt(moistureRegion, altitude01, region)
```

The `forest` weight is currently the remainder after desert/swamp weights. It is therefore already a continuous macro environmental classification, not merely a per-tree local random choice.

### Vegetation already has world-space low-frequency clustering

`src/terrain/chunkVegetation.ts` already has cached, world-space noise fields for:

- `clumpNoise` — species/density variation, frequency `0.015`
- `meadowNoise` — flower meadow patches, frequency `0.018`

These are seeded from the world seed and are deliberately shared across chunk boundaries.

The tree placement itself currently uses `CANDIDATES_PER_CHUNK = 18` and a per-candidate density formula based mainly on:

- fine `tile.biomes`
- `continentalness`
- `biome.desert`
- `clumpValue`

`moistureRegion` currently affects biome/species selection, but it is **not the primary macro control for tree density**. This is the main architectural gap 063 should address.

### Fauna already consumes a forest signal

`src/terrain/chunkManager.ts` already exposes:

```ts
sampleForestFactor(x, z)
```

and `src/fauna/createFauna.ts` already accepts this callback.

Current fauna profiles include `forest` for boar and `meadow` for rabbit. The forest profile currently checks `sampleForestFactor(x, z) > 0.45`; meadow checks `< 0.35`.

`ChunkManager.sampleForestFactor()` currently derives its value directly from `biomeWeightsAt(...).forest`.

This means 063 **must not create a second `ForestHabitat`/`ForestDensity` system alongside `sampleForestFactor`**. The existing hook should be upgraded or backed by a shared pure function with clearer semantics.

### Settlement forests are a separate existing path

`src/settlement/props.ts::buildSettlementProps()` can create a bespoke forest belt around the home settlement (`plantForest`). It creates clustered trees and stores their positions in `SettlementLandmarks.trees`.

Non-home streamed settlements skip this bespoke forest belt because their surrounding chunks already receive worker-generated vegetation.

This settlement forest is intentionally local to settlement presentation/landmarks and should **not** be converted into the world-scale forest-region generator in 063.

## 3. Relevant files and entry points

Primary implementation points:

### `src/terrain/chunkHeightmap.ts`

Important existing types/functions:

- `RegionParams`
- `ChunkTileParams`
- `RawSampleParams`
- `ChunkTileData`
- `sampleRawTexel()`
- `sampleHeightAt()`
- `sampleContinentalnessAt()`
- `sampleMoistureRegionAt()`
- `sampleMountainRidgeAt()`

This is the source of the existing macro terrain/environment fields. Do not duplicate their noise calculations elsewhere.

### `src/terrain/biomeRegions.ts`

Primary shared classification seam:

```ts
biomeWeightsAt(moistureRegion, altitude01, region)
```

If 063 needs a more explicit forest-density calculation, this is the preferred home for the **pure data-only environmental calculation**, rather than `chunkVegetation.ts` or a new manager.

A likely shape is a small function alongside `biomeWeightsAt`, e.g. a `forestDensityAt(...)` helper, but only introduce it if the implementation genuinely needs semantics beyond the existing `forest` weight. The function must remain independent of Three.js and worker-safe.

### `src/terrain/chunkVegetation.ts`

Primary tree placement entry point:

```ts
computeChunkVegetation(coord, tile, params)
```

This is already executed inside the terrain worker and returns pure `VegetationPlacement[]`.

063 should extend this existing algorithm rather than introduce another tree-placement path.

### `src/terrain/chunkHeightmap.worker.ts`

Current worker order:

```text
computeChunkTile
    ↓
computeChunkVegetation
    ↓
computeChunkItems
    ↓
computeChunkEnvironment
```

No new worker is needed.

### `src/terrain/chunkHeightmapProtocol.ts`

`ChunkTileResult` is currently `ChunkTileData` plus vegetation/items/environment placements.

Avoid adding a new transferred `forestDensity` grid unless profiling or a concrete consumer proves that the grid must be transferred. The current macro grids are already sufficient inputs from which the value can be calculated locally.

### `src/terrain/chunkManager.ts`

Important existing API:

```ts
sampleForestFactor(x, z)
```

This is already the main-thread bridge for runtime consumers such as fauna.

If a shared forest-density helper is introduced, `sampleForestFactor()` should use it instead of reproducing the calculation.

`paramsFor()` already passes the complete `RegionParams` and all vegetation species counts to workers.

### `src/fauna/createFauna.ts`

Existing consumers of `sampleForestFactor()`:

- `forest` spawn profile → currently boar
- `meadow` spawn profile → currently rabbit
- the callback is also sampled during fauna update and passed into `AnimalAgent.update()` as `forestFactor`

063 should **not** add species-specific spawning rules here. The existing consumer should simply receive a better environmental signal.

### `src/terrain/chunkEnvironment.ts`

`computeChunkEnvironment()` already uses `biomeWeightsAt()` for fallen-log frequency and receives the same `ChunkTileData` as vegetation.

This is evidence that the existing environment classification is intended to be shared. Do not create a parallel forest classification for fallen logs or other environmental props.

### `src/terrain/grass.ts`

Grass already consumes terrain tile data and biome/environment signals. 063 should not create a separate forest-floor renderer.

### `src/settlement/props.ts`

Contains the bespoke settlement forest belt and `plantTreeCluster()`.

Keep this path separate from world forest-region generation. Existing clearing/path/road rejection must remain intact.

### `src/config/worldConfig.ts`

`WorldConfig.terrain.region` already owns macro region parameters. Current defaults include:

```text
moistureRegionScale: 2000
moistureRegionFbm: octaves 3 / persistence 0.5 / lacunarity 2 / exponentiation 1
```

Do not create a separate forest configuration root. Only add configuration if 063 proves that an independent forest parameter represents a genuinely independent concept.

## 4. Current generation/data flow

The actual flow is:

```text
WorldConfig
    ↓
ChunkManager.paramsFor()
    ↓
ChunkTileParams
    ↓
requestChunkTile()
    ↓
existing worker pool
    ↓
chunkHeightmap.worker.ts
    ↓
computeChunkTile()
    ↓
ChunkTileData
    ├── heights
    ├── continentalness
    ├── mountainRidge
    ├── moistureRegion
    └── other terrain fields
    ↓
computeChunkVegetation()
    ↓
VegetationPlacement[]
    ↓
ChunkManager
    ↓
Three.js vegetation groups on main thread
```

The same environment data is also available to runtime systems through `ChunkManager` analytic/fallback samplers.

This is already the correct architectural shape for 063.

## 5. Plan vs current code

### Requirement: large forest regions

**Plan:** currently described as missing macro forest regions.

**Reality:** the macro `moistureRegion` axis and `BiomeWeights.forest` already provide a large-scale forest-capable classification. The missing connection is that `computeChunkVegetation()` still bases density mostly on the fine `biomes` field and local `clumpNoise`.

**Implementation consequence:** strengthen the existing vegetation density formula with the shared macro forest signal. Do not add a second macro forest noise system unless visual testing proves the existing moisture-region field cannot provide sufficient spatial structure.

### Requirement: continuous `forestDensity`

**Plan:** introduce a continuous forest density/suitability value.

**Reality:** `sampleForestFactor()` already exists, but its current implementation is simply `biomeWeightsAt(...).forest`. Its public comment describes `0 = open / 1 = dense forest`, while the actual value is closer to **macro forest biome weight** and does not encode all terrain suitability.

**Correction:** treat `sampleForestFactor()` as the existing integration seam. Either:

1. keep the API and change its implementation to use a shared forest-density function, or
2. introduce a shared pure `forestDensityAt()` helper and make `sampleForestFactor()` delegate to it.

Do not add a parallel runtime `ForestHabitat` object/manager.

### Requirement: forest density affects tree placement

**Reality:** this is the key missing implementation.

The existing density calculation in `chunkVegetation.ts` should be extended rather than replaced. Preserve:

- candidate sampling,
- water/shoreline rejection,
- slope rejection,
- treeline rejection,
- mountain-ridge rejection,
- road/path rejection,
- desert/swamp species logic,
- clump/species clustering.

The macro forest signal should become the dominant large-scale density control, while existing local fields continue to provide variation.

### Requirement: forest edge gradient

The current `moistureRegion` and smooth biome weights already provide continuous values. The vegetation probability should map that continuous value into density instead of converting it into a hard `forest/not forest` decision.

Do not introduce hard forest borders.

### Requirement: tall/mature trees in deep forest

The current placement already has deterministic scale variation and an `isSapling` visual scale variant.

Do **not** implement lifecycle or maturity state in 063. Plan 058 owns that responsibility.

063 may adjust the **initial procedural distribution** of placement scale only if needed for the visual goal, but should avoid assigning persistent maturity semantics to `VegetationPlacement.scale`.

### Requirement: fauna habitat

The current fauna system already consumes `sampleForestFactor()`.

063 should provide a better shared environmental signal; it should not add new fauna spawning counts, population caps, species rules, or AI behaviour.

### Requirement: roads/clearings

The worker vegetation path already rejects `tile.roadTint > 0.15`.

Settlement forest props have their own clearing/path/road checks in `props.ts`.

Preserve both mechanisms. Do not replace them with a generic forest-specific clearing system.

## 6. Relationship with 062 Terrain Generation

Plan 062 is not implemented yet. No separate 062 implementation-notes file was found in the repository at review time.

The current 062 plan explicitly preserves the existing macro axes:

- `continentalness`
- `mountainRidge`
- `moistureRegion`

and changes the height/detail composition rather than replacing the terrain architecture.

### What 063 should consume from 062

063 should consume the existing shared terrain/environment outputs, not reimplement terrain generation:

```text
height / floor height
continentalness
mountainRidge
moistureRegion
```

`ChunkTileData` already provides the first three macro arrays needed by worker-side vegetation, while analytic `ChunkManager` samplers provide runtime access.

### No new shared terrain representation is currently required

Do **not** introduce a second intermediate terrain representation solely for 063.

If 062 changes the internals of `sampleRawTexel()`, it should preserve the existing exported sampler/data contracts unless the 062 implementation notes explicitly justify a contract change.

That means 063 can remain a consumer of the existing `ChunkTileData`/sampler seam.

### Sequencing

The project discussion treats 062 → 063 as the preferred implementation sequence because 062 changes the terrain shape that forest suitability depends on. This is primarily a **tuning/visual dependency**, not a compile-time dependency: 063 can technically consume the current terrain API before 062 lands.

For final implementation quality, implement/tune 063 against the 062 terrain result. Otherwise slope/altitude/forest-edge tuning may need to be redone after 062.

Do not duplicate any 062 height/noise calculations in 063.

## 7. Relationship with 058 Living Forest

The boundary is:

```text
062 Terrain
    ↓
063 Forest regions / environmental suitability
    ↓
initial tree placement
    ↓
058 Tree lifecycle
    ↓
growth / harvesting / regeneration
```

### 063 owns

- where forest-capable regions occur,
- continuous forest density/suitability,
- how initial procedural tree density responds to that signal,
- the environment signal exposed to future habitat consumers.

### 058 owns

- stable tree identity,
- `TreeState`,
- sapling/young/mature lifecycle state,
- growth progress,
- canopy competition as lifecycle/environment logic,
- harvesting,
- stump/dead wood state,
- regrowth,
- sparse lifecycle overrides and persistence.

### Important current interaction

Today `chunkVegetation.ts` uses `isSapling` only as a visual scale choice. 063 must not turn that into lifecycle state. 058 implementation notes already define that procedural placement remains the source of deterministic initial placement and that lifecycle state is a separate layer.

Therefore, if 063 changes initial tree scale distribution, keep it purely as generation-time presentation data. Do not add `TreeState` or persistence to 063.

## 8. Forest-region representation

Prefer **not** storing a separate forest-region object per chunk.

The most appropriate representation is a deterministic continuous function of existing world/environment data:

```text
world position
    ↓
existing macro fields
    ↓
forest density/suitability [0..1]
```

A shared pure helper is preferable to a new region registry. It can be evaluated:

- from worker `ChunkTileData` during vegetation placement,
- analytically on the main thread for fauna/runtime consumers.

### Avoid a transferred forest grid unless necessary

`ChunkTileData` already transfers several Float32 grids. Adding another full apron-inclusive Float32 grid has a real structured-transfer/memory cost for every generated chunk.

Prefer recomputing a cheap function from already-transferred fields. Only add a grid if profiling or a concrete downstream requirement shows that recomputation is materially more expensive.

### Semantics

The value should mean approximately:

```text
0 = poor/open forest habitat
1 = strong forest environment
```

It should be continuous, not a binary biome flag.

Do not make `forestDensity = 0` synonymous with "trees are forbidden". The existing placement should retain a baseline chance for isolated trees outside strong forest regions.

## 9. Habitat/environment suitability

Use existing environmental signals rather than introducing a new terrain classification.

A reasonable decomposition for implementation is:

```text
macro forest tendency
×
land / water suitability
×
altitude suitability
×
mountain/ridge suitability
```

with slope and roads/clearings continuing to act as **placement constraints** in `computeChunkVegetation()` rather than being baked into every forest sample.

### Macro forest tendency

Use the existing `moistureRegion` + `biomeWeightsAt()` as the first source.

Do not add another moisture/climate noise field just to obtain forests.

If testing shows that `forest` is too broad because it is currently simply the remainder of desert/swamp, the correction should be a small, explicit forest-density mapping in the existing biome/environment module—not a new biome system.

### Terrain suitability

Use existing values:

- `altitude01`
- `mountainRidge`
- `continentalness`
- height/water state

Existing placement checks already reject steep slopes and ridge crests. Keep those checks rather than making the forest field itself perform expensive slope sampling for every candidate.

### Water

Ocean/water should produce zero forest habitat.

Note that current fauna placement already filters water before applying the forest profile. The shared forest signal should nevertheless have sane land semantics rather than relying on every consumer to remember the water check.

## 10. Generation algorithm and implementation order

Recommended implementation order:

1. **First verify 062's final terrain outputs.** Confirm `continentalness`, `mountainRidge`, `moistureRegion`, height and water semantics remain usable.
2. **Define the shared forest-density calculation** in `src/terrain/biomeRegions.ts` or a very small adjacent pure module. Reuse `biomeWeightsAt()` and existing region parameters.
3. **Update `ChunkManager.sampleForestFactor()`** to use the shared calculation. Keep the public seam used by fauna unless a rename is genuinely necessary.
4. **Update `computeChunkVegetation()`** to use the same macro forest value for tree-density modulation.
5. Preserve the current local `clumpNoise` so forest regions still contain natural density variation instead of becoming uniform carpets.
6. Tune the baseline candidate/density relationship. `CANDIDATES_PER_CHUNK = 18` is a real current constraint: a probability multiplier alone cannot create more than 18 ordinary vegetation candidates per chunk. If deep forest still reads too sparse, address candidate budget/density deliberately rather than adding another placement system.
7. Keep the existing rejection rules for water, slope, treeline, mountain ridge and roads.
8. Preserve existing desert/swamp species selection and flower meadow generation.
9. Verify fauna's existing `forest`/`meadow` profiles against the new signal. Do not add species-specific spawning logic in 063.
10. Only after the above is visually correct, consider whether an additional low-frequency forest modulation field is actually necessary. Prefer not adding it if `moistureRegion` already produces sufficiently large regions.

### Important candidate-budget observation

Current `CANDIDATES_PER_CHUNK = 18` means a dense forest cannot become arbitrarily dense by changing only a probability multiplier. At `chunkSize = 64`, 18 candidate rolls per 4096 m² is deliberately sparse.

If visual testing shows the forest is still too open after the macro mask is applied, the smallest coherent change is to make the **existing candidate budget respond to forest density** or increase the baseline candidate budget—not to create a second tree generator.

Any change must preserve deterministic RNG usage and avoid unnecessary per-candidate noise calls.

## 11. Determinism

The repository already uses a world-seeded deterministic model.

### Existing mechanisms to reuse

- `createSeededRandom()` from `src/world/parseSeed.ts`
- simplex-noise handles in `chunkHeightmap.ts`
- `noiseHandlesFor(seed)` with fixed seed XOR salts
- world-space `clumpNoise` in `chunkVegetation.ts`
- deterministic per-chunk RNG derived from `seed ^ hashChunk(...)`

Do not introduce another RNG library or random source.

### Required property

For fixed:

```text
seed + world coordinates + generation parameters
```

the forest-density result must be identical.

Chunk A and neighboring chunk B must evaluate the same world-space forest field on both sides of their boundary.

Do not derive forest-region state from the order in which chunks were generated.

### RNG caution

If candidate count or candidate acceptance changes, keep the existing per-chunk seeded RNG architecture. Do not use `Math.random()` in worker generation.

`props.ts::cloneProp()` currently uses `Math.random()` for initial rotation, but `chunkManager.ts` immediately overrides `rotation.y` from deterministic `VegetationPlacement.rotationY`; do not copy that `Math.random()` pattern into worker-side forest generation.

## 12. Chunk/worker/performance considerations

063 fits the existing worker architecture directly.

### Worker boundary

Keep CPU-only generation here:

```text
chunkHeightmap.worker.ts
  → computeChunkTile
  → computeChunkVegetation
```

No new worker, message type, worker pool or global forest scan is required.

### Cost considerations

A forest-density function should be cheap enough to evaluate per vegetation candidate and for runtime fauna queries.

Prefer:

- existing tile fields,
- existing macro noise already calculated by `computeChunkTile`,
- simple arithmetic/smoothstep/lerp,
- reuse of `biomeWeightsAt()`.

Avoid:

- new noise sampling for every tree candidate if the same macro signal is already available,
- flood fill/cluster detection across chunks,
- scanning loaded trees globally,
- generating a forest-region mesh/data structure,
- per-frame forest updates.

### Transfer cost

Current worker transfer already includes eight Float32 grids (`heights`, `floorHeights`, `biomes`, `bodyScale`, `continentalness`, `mountainRidge`, `moistureRegion`, `roadTint`). A new forest grid would increase memory and transfer volume for every chunk.

Do not add one by default.

### Runtime fauna

`sampleForestFactor()` is called from fauna updates. Keep its calculation O(1) and analytic. Do not make it search neighboring chunks or inspect every tree.

## 13. Integration points

### Vegetation

Primary consumer:

```text
src/terrain/chunkVegetation.ts
computeChunkVegetation()
```

Use forest density to modify tree probability while preserving non-tree vegetation and existing biome-specific logic.

### Fauna

Existing seam:

```text
ChunkManager.sampleForestFactor()
        ↓
createFauna()
        ↓
forest/meadow spawn filters
        ↓
AnimalAgent.update(... forestFactor ...)
```

063 should improve the value at the seam, not own fauna behaviour.

### Natural resources

`src/terrain/naturalResources.ts` already composes existing environment axes through `biomeWeightsAt()` for resource preferences. Do not add a second resource↔forest classifier in 063.

Future resource/economy work can consume the same environmental signal if useful.

### Ambient audio

`src/audio/ambientWeights.ts` already derives a forest ambient gain from `biomeWeightsAt()` and terrain samplers.

Do not couple forest-density generation directly to audio. If 063 changes the semantics of the shared forest value, verify that ambient audio still behaves sensibly, but keep the audio module's domain-specific weighting separate.

### Settlement generation

Do not add village placement/scoring to 063.

Existing settlement generation already has resource/environment-aware placement and its own clearings. 063 should only ensure world vegetation respects the existing clearing/road constraints.

### 049 landmarks

`src/terrain/chunkEnvironment.ts` already generates landmarks/decorations in the same worker pipeline and already uses biome weights for fallen-log frequency.

No new forest landmark pipeline is needed. Forest density can influence future environmental decoration only if a later plan explicitly requires it.

## 14. Tests and verification

### Pure logic tests

If a shared forest-density helper is introduced, add focused unit tests for it, preferably alongside `src/terrain/biomeRegions.ts` or in a dedicated `biomeRegions.test.ts` if that is the repository's chosen convention.

At minimum verify:

- output remains within `[0, 1]`,
- deterministic output for identical inputs,
- zero/near-zero over water,
- high suitability in intended forest conditions,
- reduced suitability at high mountain/ridge conditions,
- smooth/continuous response around thresholds,
- no hard `forest/not forest` boundary.

### Vegetation tests

There is currently no dedicated `chunkVegetation.test.ts` found in the repository. If adding tests, keep them pure and data-oriented rather than trying to unit-test Three.js rendering.

Useful checks:

- same seed/chunk/config gives identical placements,
- neighboring chunks remain deterministic,
- increasing forest density increases tree placement probability statistically,
- non-forest areas still allow some isolated trees,
- road/water/slope/treeline rejection still works,
- desert/swamp species rules remain intact.

### Technical verification

Run the repository's normal checks:

```text
npx tsc --noEmit
npm run lint
npm run build
npm run test
```

### Browser verification

This is a visual Three.js change, so technical checks are insufficient.

Use several seeds and inspect:

- open terrain,
- forest edge,
- deep forest,
- transitions across chunk boundaries,
- forests on hills/valleys,
- highland/mountain boundaries,
- roads and settlement clearings,
- fauna around forest/non-forest transitions.

The important visual acceptance test is not a particular tree count. From a distance the player should be able to identify a coherent multi-chunk forest region with a readable edge.

## 15. Guardrails / things NOT to implement

Do not implement any of the following in 063:

- `ForestManager` or another global forest service,
- a second biome/climate classification system,
- a second RNG/random architecture,
- a parallel terrain-generation pipeline,
- a new worker architecture,
- global forest-region flood fill or cluster scanning,
- global per-tree forest membership state,
- per-tree lifecycle state,
- `TreeState`, harvesting, stumps, growth, maturation or regeneration from 058,
- NPC tree-chopping behaviour,
- new fauna AI or population/spawn rules,
- hardcoded animal counts such as "10 in forest / 2 outside",
- settlement placement/scoring logic,
- settlement clearing/path redesign,
- a new forest-floor renderer,
- new terrain materials solely for forests,
- persistent forest-region state for static procedural data,
- per-frame forest simulation,
- unrelated rendering or Three.js refactors.

### Most important implementation rule

**Extend the existing `moistureRegion → biomeWeightsAt → vegetation/fauna` chain. Do not create another chain beside it.**

The expected result is a stronger coupling:

```text
terrain / macro environment
        ↓
existing biome/environment signal
        ↓
shared forest density
   ↙             ↘
vegetation       fauna

058 later consumes the same environmental inputs for tree lifecycle.
```

This preserves the architecture already established by plans 028, 032, 044, 049 and 058 while giving 063 a clear, limited responsibility.
