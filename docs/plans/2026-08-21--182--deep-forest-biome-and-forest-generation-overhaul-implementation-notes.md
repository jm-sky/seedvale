# Implementation Notes: Deep Forest Biome & Forest Generation Overhaul

**Plan:** [182 — Deep Forest Biome & Forest Generation Overhaul](./2026-08-21--182--deep-forest-biome-and-forest-generation-overhaul.md)
**Reviewed:** 2026-08-22
**Status:** review complete — implementation not started

## 1. Review outcome

The plan is architecturally aligned with Seedvale, but its "current state" section is already partially outdated.

The repository already has:

- a continuous `forestDensityAt(...)` signal in `src/terrain/biomeRegions.ts`;
- deterministic worker-side vegetation generation in `computeChunkVegetation()`;
- world-space `clumpNoise` and `meadowNoise` shared across chunk boundaries;
- `16 + 90 * forestDensity` vegetation candidate budgeting;
- deterministic tree `TreeLivingAge` + `TreeSizeClass` generation;
- region-level vegetation batching in `src/terrain/vegetationRegionBatcher.ts`;
- an existing `fallenLog` environment prop and renderer path;
- fauna already consuming `ChunkManager.sampleForestFactor()`.

Therefore 182 should be treated as an **extension/refinement of existing systems**, not as introduction of a new forest generator.

The most important architectural decision is to keep one continuous environmental signal and derive the explicit Deep Forest classification from it. Do not add a forest-region registry, per-chunk biome state, or a second forest noise field.

## 2. Current architecture to reuse

### `src/terrain/biomeRegions.ts`

This is the correct owner for pure forest/environment calculations.

Current `forestDensityAt(...)` already combines:

- `moistureRegion`;
- `biomeWeightsAt(...).forest`;
- `continentalness` / land suitability;
- altitude suitability;
- mountain-ridge suitability.

It returns a continuous `[0, 1]` value and is already covered by `src/terrain/biomeRegions.test.ts`.

Extend this seam rather than moving forest logic into `chunkVegetation.ts`.

Recommended API shape:

```ts
export type ForestBiome = 'open' | 'forest' | 'deepForest'

export function forestBiomeAt(forestDensity: number): ForestBiome
```

or an equivalent name. Keep the continuous `forestDensityAt()` value as the underlying source of truth.

Do **not** add `deepForest` directly to `BiomeWeights` unless there is a concrete need to propagate it through every existing biome consumer. `BiomeWeights` currently represents weighted macro categories (`desert`, `swamp`, `forest`); Deep Forest is better modelled as a classification of forest density than as a fourth independent weight.

If external systems need a world query, expose one shared pure classification function and have `ChunkManager` delegate to it. Avoid duplicating threshold logic in quests, fauna, vegetation, etc.

### `src/terrain/chunkVegetation.ts`

This is the existing worker-side placement pipeline and should remain the only world vegetation generator.

Current important behaviour:

```text
center forest density
    -> candidate budget
    -> world-position sampling
    -> terrain rejection
    -> continuous density acceptance
    -> kind/species selection
    -> tree age/size selection
```

The current candidate budget is already:

```ts
BASE_CANDIDATES_PER_CHUNK = 16
FOREST_EXTRA_CANDIDATES = 90
```

Do not blindly multiply this budget for Deep Forest. The plan explicitly wants to avoid a 5x tree-count spike, and the existing 106-candidate maximum is already designed to produce roughly 6–7 m spacing in strong forest conditions.

Prefer changing:

- acceptance curve;
- tree-vs-bush weighting;
- age/size distribution;
- local clump response;

before increasing candidate count.

Important: the candidate budget is currently based on the **chunk centre** `forestDensity`. This is acceptable for the existing system but can make a chunk straddling a strong forest edge behave more uniformly than the underlying world field. Do not replace it with a per-chunk biome label. If edge quality is insufficient, prefer a cheap multi-sample/average density for the candidate budget while keeping per-candidate world-space density acceptance.

### World-space noise

`chunkVegetation.ts` already caches two seeded noise fields:

- `clumpNoise` at frequency `0.015`;
- `meadowNoise` at frequency `0.018`.

They are based on the world seed, not chunk-local seeds, so they naturally cross chunk boundaries.

Do not create `deepForestNoise` unless browser testing demonstrates that the existing macro fields cannot produce sufficiently large forest complexes. The preferred solution is to tune the existing moisture-region / forest-density mapping and use `clumpNoise` only for local variation.

### `src/world/treeLifecycle.ts`

Current living ages are exactly:

```ts
'sapling' | 'young' | 'mature' | 'old'
```

Current size classes are:

```ts
'small' | 'medium' | 'large'
```

`HEIGHT_RANGE_M.old` already reaches 25 m.

`rollLivingAge()` is caller-configurable for sapling/young probabilities, while `OLD_SPAWN_CHANCE` is currently a shared 0.5 value for medium/large trees.

For 182, first use the existing `large` + `old` distribution. **Do not add `VeryOld` by default.** A new living-age enum value would propagate through lifecycle/rendering code and is not justified merely to make Deep Forest look older. Only introduce it if browser inspection proves the existing 25 m old-tree range and size-class distribution cannot produce the required silhouette, and then review all exhaustive `TreeLivingAge`/stage mappings before doing so.

A safer Deep Forest approach is:

```text
higher forestDensity
    -> lower sapling/young probability
    -> higher large-size probability
    -> higher old probability
```

Keep this as deterministic initial generation data. Do not create a new persistent tree state.

## 3. Deep Forest classification

The plan correctly requires a classification that other systems can query, but the classification should not become another simulation layer.

Recommended flow:

```text
world position
    -> existing macro terrain fields
    -> forestDensityAt(...)
    -> forestBiomeAt(...)
        -> open / forest / deepForest
```

The exact thresholds should be chosen from the existing value distribution and visual testing, not arbitrary constants copied from the plan.

Add tests for:

- deterministic classification;
- boundary behaviour;
- no hard discontinuity in `forestDensityAt()`;
- deepForest only when forest density is high;
- water/desert/swamp/high ridge cannot accidentally classify as Deep Forest;
- classification is independent of chunk coordinates / load order.

Avoid a `deepForest` boolean stored in `ChunkTileData`. The classification is cheap to derive from already available fields.

## 4. Fauna integration

`ChunkManager.sampleForestFactor()` already exists and is consumed by fauna. This is an important existing integration seam.

Do not create `deepForestWolfSpawnRate`, `deepForestDeerSpawnRate`, or another fauna-specific system.

If `sampleForestFactor()` is updated to delegate to `forestDensityAt()`, existing fauna automatically sees the improved forest signal.

If a later feature genuinely needs to distinguish Deep Forest from ordinary forest, expose the shared classification through the world/terrain query layer instead of teaching `createFauna.ts` how to infer it from density/noise.

The current fauna system should otherwise remain unchanged by 182.

## 5. Natural resources

The plan's intent to reuse existing natural resources is correct.

Before touching `src/terrain/naturalResources.ts`, inspect whether its current suitability already uses the forest signal or macro biome weights. If it does, avoid changing it just to mention Deep Forest.

Only add Deep Forest awareness when there is a concrete gameplay requirement, and make the existing suitability function consume the shared classification/signal rather than adding a `DeepForestBerrySystem` or equivalent.

## 6. Deadwood: important correction to the plan

A fallen-log system already exists.

`src/terrain/chunkEnvironment.ts` currently generates `fallenLog` placements using:

- `biomeWeightsAt()`;
- forest suitability;
- proximity to generated trees;
- deterministic per-kind RNG;
- flat-ground and road rejection.

`src/terrain/chunkManager.ts` already loads `FALLEN_LOG_SPECS`, creates fallen-log meshes and includes `fallenLog` in the environment rendering path.

`src/terrain/vegetationRegionBatcher.ts` already batches `fallenLog` as a region-level instanced kind.

Therefore **do not add another deadwood placement pipeline**.

Instead, tune/extend the existing `fallenLog` probability so it increases with the shared forest/deep-forest signal and, if useful, with old-forest characteristics. Preserve:

- deterministic placement;
- no interaction/resource ownership;
- existing instancing/batching;
- existing collision/render conventions;
- existing road/slope/water constraints.

This is likely a small change in `chunkEnvironment.ts`, not a new environment system.

## 7. Meadow / clearing interpretation

The plan says to reuse `meadowNoise`, which is correct, but the current implementation needs to be understood precisely.

`meadowNoise` currently drives **flower/meadow patches**, not a general tree-clearing mask. It must not automatically be repurposed as a hard tree-removal field because that could change existing meadow vegetation behaviour.

If Deep Forest needs stronger irregular clearings, prefer using the existing meadow field as a soft modifier to tree acceptance/density. Keep:

- world-space continuity;
- irregular shapes;
- gradual influence;
- no chunk-local clearing boundaries.

Do not add hand-authored circular clearing objects or per-chunk clearing RNG.

If the existing meadow patches are visually too small to read as Deep Forest clearings, tune their scale/threshold only after checking their effect on ordinary meadows.

## 8. Tree canopy / darkness

Do not implement physical light simulation or per-tree dynamic lighting.

Before changing shaders, inspect the actual tree assets and current lighting/material setup. The desired effect can likely be obtained mostly from:

- more large/old trees;
- higher canopy overlap;
- existing tree variants;
- existing ambient/fog/environment lighting;
- reduced visible sky due to geometry.

Avoid adding a new per-tree shader branch unless the visual test proves existing materials cannot provide the required contrast.

If a ground-darkening effect is needed, prefer a cheap existing terrain/grass/environment signal based on `forestDensity` rather than a new light/shadow simulation.

## 9. Rendering and performance constraints

The performance baseline makes this plan sensitive to tree count.

Current architecture already provides the correct scaling mechanisms:

- worker-side deterministic placement;
- `InstancedMesh`;
- region-level vegetation batching;
- distance LOD / instance count reduction;
- frustum culling;
- shared GLTF templates/resources.

`vegetationRegionBatcher.ts` groups vegetation by region and kind. Its default region size is 3×3 chunks (~192 m at the default 64 m chunk size). This is exactly the mechanism that should absorb a denser forest without creating one object per tree.

Do not introduce:

- per-tree `Object3D` instances;
- a global forest mesh;
- a second batching system;
- forest-specific expensive shaders;
- global vegetation batches that destroy culling.

### Performance verification

A Deep Forest benchmark should explicitly compare at least:

```text
FPS
frame p50/p95
render time
draw calls
triangles
loaded chunks
vegetation instance counts
chunk vegetation generation time
chunk attach/finalization time
```

Compare a representative open scene, ordinary forest and strong Deep Forest. The goal is a stronger visual biome without a disproportionate rendering cost.

## 10. Determinism and chunk boundaries

All procedural choices must be functions of world seed + world position (or an explicitly stable world-coordinate hash).

Do not use chunk-local random state to decide whether a location is Deep Forest.

Existing `createSeededRandom(params.seed ^ hashChunk(...))` is appropriate for candidate ordering, but world-space fields must remain responsible for spatial continuity.

A good rule is:

```text
classification -> world-space environmental function
placement -> deterministic candidate stream + world-space environmental tests
local variation -> existing world-space noise
```

The result must be identical when chunks are loaded in different orders.

## 11. Chunk-edge issue to watch

There are two separate edge concerns:

1. **classification continuity** — already naturally solved by world-space terrain fields;
2. **candidate budget continuity** — currently the budget uses chunk-centre density.

Do not confuse these.

A forest can be perfectly continuous at the classification level while still looking slightly blocky in tree density if neighbouring chunks have very different centre densities. If visual testing exposes this, adjust the candidate-budget sampling strategy rather than introducing chunk-level biome state.

Potential safe approach:

```text
sample forest density at several fixed world-space points
-> derive one chunk-average/upper-biased budget
-> keep per-candidate density acceptance
```

Keep it cheap because this runs for every generated chunk in the worker.

## 12. Settlement forest boundary

Home settlement chunks have a separate bespoke forest/prop path in `src/settlement/props.ts` and are intentionally excluded from normal worker vegetation generation.

Do not merge settlement forest generation into the new Deep Forest system.

Deep Forest classification can still exist on the terrain around a settlement, but settlement-specific trees/clearings remain owned by the settlement presentation path.

## 13. Asset considerations

Before adding any asset, inspect the existing `TREE_SPECS` and tree GLB variants in `src/settlement/props.ts` / asset registries.

The current tree lifecycle already scales the same prepared tree templates to the requested world height. This makes the existing assets much more useful than introducing a new "old tree" asset immediately.

For deadwood, reuse the existing `FALLEN_LOG_SPECS` / `createFallenLog()` path.

Only add assets if the existing variants genuinely cannot produce enough visual distinction.

## 14. Recommended implementation order

1. **Shared classification**
   - add the smallest possible pure `open/forest/deepForest` classification next to `forestDensityAt()`;
   - keep thresholds centralized;
   - add unit tests.

2. **Runtime world query**
   - expose the classification through the existing `ChunkManager` terrain-query seam if required;
   - keep fauna on the existing `sampleForestFactor()` API.

3. **Tree density/shape tuning**
   - tune `chunkVegetation.ts` using the shared density/classification;
   - preserve current candidate budget initially;
   - increase tree ratio and large/old distribution in Deep Forest;
   - preserve all terrain/road/water rejection rules.

4. **Natural clearings**
   - use the existing `meadowNoise` as a soft density modifier only if visual testing needs stronger clearings.

5. **Deadwood**
   - tune the existing `fallenLog` generation in `chunkEnvironment.ts` rather than adding a new placement system.

6. **Visual canopy**
   - first use existing assets/scales/materials;
   - only then consider a lightweight rendering adjustment.

7. **Benchmark and browser tuning**
   - compare open/forest/deepForest scenes;
   - tune thresholds and probabilities from actual generated worlds.

## 15. Tests to add/update

At minimum:

### `src/terrain/biomeRegions.test.ts`

Add coverage for:

- Deep Forest classification at high density;
- ordinary forest classification;
- open classification;
- exact/near threshold behaviour;
- deterministic result;
- invalid/out-of-range input clamping if the new helper accepts raw values.

### Vegetation generation tests

If existing tests cover `computeChunkVegetation()`, add deterministic cases for:

- same seed + same chunk => identical placements;
- different chunk load order cannot affect placement;
- Deep Forest favours trees over bushes;
- Deep Forest increases large/old tree distribution;
- no new candidate explosion beyond the intended budget;
- road/water/slope/treeline/ridge constraints remain effective.

### Environment tests

If practical, cover the `fallenLog` probability change without making the test depend on a fragile exact random placement count.

## 16. Important pitfalls

### Do not add `VeryOld` prematurely

It looks attractive in the plan, but it expands an existing lifecycle contract. Existing `TreeLivingAge`, height ranges and renderer mappings already support 25 m old trees.

### Do not turn Deep Forest into a fourth biome weight

That would force unnecessary changes across `BiomeWeights` consumers. It is a classification derived from forest density, not an independent environmental axis.

### Do not create another noise field

The current macro moisture region is already at a 2000 m scale and provides large coherent areas. `clumpNoise` provides local structure. A third Deep Forest noise would risk creating a second, drifting notion of where forests are.

### Do not use chunk-centre classification for gameplay queries

Gameplay queries such as "is this position in Deep Forest?" must evaluate the actual world position, not inherit a chunk's label.

### Do not equate visual tree age with persistent lifecycle state

Initial procedural age/size distribution belongs to generation. Runtime lifecycle and saved overrides belong to `treeLifecycle`.

### Do not increase tree count just to make the forest look deeper

Large/old trees, better acceptance and canopy overlap are cheaper than multiplying candidates. Existing region batching helps, but draw calls and triangle count still matter.

### Do not duplicate fallen-log rendering

`fallenLog` is already an environment kind, has GLB specs, is rendered by `ChunkManager`, and is included in regional batching.

## 17. Dependencies / sequencing

Plan 063 is already implemented and archived. Its implementation notes explicitly established the current `forestDensityAt()` architecture and the `16 + 90·fd` vegetation candidate model.

Plan 182 should therefore be implemented against the **current code**, not against the older pre-063 plan assumptions.

Plan 062 is relevant only if its terrain changes are still pending and are expected to alter the terrain/noise distributions used by forest suitability. If 062 has not landed, avoid spending excessive time on final numeric tuning; implement the architectural seam and tune against the resulting terrain.

No new worker is needed. No new save-schema field is needed for procedural Deep Forest classification.

## 18. Verification checklist

Technical:

- `npx tsc --noEmit`
- `pnpm run lint:fix`
- `pnpm run test`
- `pnpm run build`

Browser/manual:

- find a large Deep Forest in a fresh deterministic world;
- cross several chunk boundaries inside it;
- confirm no visible chunk seams in forest density;
- confirm natural transition from open terrain → forest → Deep Forest;
- inspect canopy density and visible sky;
- inspect old/large tree frequency;
- inspect irregular clearings;
- inspect deadwood frequency;
- check roads/settlements remain clear;
- compare performance against ordinary forest;
- verify a world query at several positions returns the expected classification.

Do not treat a successful build/test run as proof of the Three.js visual result.

## 19. Bottom line for the implementation agent

The implementation should be a **small extension of the existing forest signal**, not a forest rewrite.

The key architecture is:

```text
existing terrain fields
        ↓
forestDensityAt()
        ↓
forestBiomeAt()
   ┌────┼──────────────┐
   ↓    ↓              ↓
queries vegetation  environment
        ↓              ↓
   existing batching  fallenLog
        ↓
 existing tree lifecycle
```

Reuse first. Keep Deep Forest classification pure, deterministic and position-based. Tune the existing vegetation and environment pipelines rather than introducing parallel systems.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
