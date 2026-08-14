# Implementation Notes: Terrain Generation Overhaul

**Plan:** [2026-08-11--062--terrain-generation-overhaul.md](./2026-08-11--062--terrain-generation-overhaul.md)

**Review basis:** current `main` repository state as of 2026-08-11. The code is authoritative when it differs from the plan.

**Purpose:** repository-specific implementation guidance for a coding agent implementing 062. This document does not implement or pre-commit to a new terrain algorithm; it identifies the actual pipeline, the smallest coherent seams to change, and the places where the original plan is more specific than the current architecture justifies.

---

## 1. Scope and architectural intent

062 should improve the existing analytic terrain height function so the visible world has a clearer hierarchy of spatial scales:

```text
world-scale structure
    ↓
continentalness / ocean / coast
    ↓
mountain-region gate + ridge shape
    ↓
regional hills / valleys (only if required after tuning)
    ↓
local terrain detail
    ↓
water clamp + existing road/village terrain modifiers
    ↓
chunk tile / mesh / environment
```

The implementation must remain inside the existing terrain/chunk/worker architecture. Do **not** create another terrain generator, another biome system, another RNG, or another worker protocol.

The most important current architectural fact is that terrain is already a multi-field system, but the **height** itself is still effectively one local FBM plus additive macro bias and mountain ridge:

```text
n = FBM(height noise, warped at world scale)
regionBias = continentalness → height spline
mountainRidge = Worley ridge × mountain gate

floorH = (n × detailWeight + regionBias + mountainRidge × mountainGain) × heightScale
h = max(floorH, waterLevel)
```

There is currently **no dedicated hills/valleys regional height layer**. That is the main architectural gap relevant to 062.

The first implementation attempt should therefore be parameter/combination tuning of the existing formula. Only add a new medium-scale field if measured visual results show that the existing fields cannot provide broad hills/valleys without making local detail too dominant.

---

## 2. Verified current implementation

### Terrain generation

The primary implementation is `src/terrain/chunkHeightmap.ts`.

Important exported types/functions:

- `RegionParams`
- `ChunkTileParams`
- `RawSampleParams`
- `ChunkTileData`
- `sampleHeightAt()`
- `sampleFloorAt()`
- `sampleBiomeAt()`
- `sampleContinentalnessAt()`
- `sampleMoistureRegionAt()`
- `sampleMountainRidgeAt()`
- `computeChunkTile()`
- `apronOriginWorld()`
- `sampleApronGrid()` / `sampleApronGridWeighted()`
- terrain corridor helpers inside the same module.

The module is intentionally worker-safe: it contains numeric data/functions only and no Three.js scene objects.

### Current macro fields

`RegionParams` already contains:

- `continentScale` / `continentFbm`
- `mountainScale` / `mountainFbm`
- `mountainThreshold` / `mountainThresholdWidth`
- `worleyCellSize`
- `ridgeSharpness`
- `mountainGain`
- `oceanThreshold` / `coastThreshold`
- `oceanDetailWeight`
- `moistureRegionScale` / `moistureRegionFbm`
- desert/swamp thresholds and widths
- road and village terrain-modifier configuration.

Therefore the original plan's description that the generator already has continentalness, mountainness, Worley ridge, detail FBM/warp and moisture region is correct.

### Current default terrain configuration

`src/config/worldConfig.ts` currently defines:

```text
chunkSize: 64
resolution: 65
heightScale: 18
waterLevel: 0.45
noiseScale: 72

FBM:
  octaves: 5
  persistence: 0.55
  lacunarity: 2.0
  exponentiation: 2.4

Regions:
  continentScale: 2200
  mountainScale: 1800
  mountainThreshold: 0.62
  mountainThresholdWidth: 0.12
  worleyCellSize: 260
  ridgeSharpness: 2.2
  mountainGain: 0.75
  oceanThreshold: 0.32
  coastThreshold: 0.45
  oceanDetailWeight: 0.25
  moistureRegionScale: 2000
```

These are the current defaults, not immutable design requirements.

### FBM implementation

`src/terrain/fbm.ts` owns `fbm01()` and `FbmParams`.

Important detail: the implementation uses

```ts
gain = 2 ** -persistence
```

rather than the more common direct `amplitude *= persistence` convention.

It normalizes octave amplitudes and then applies:

```ts
Math.pow(normalized, exponentiation)
```

The module comment explicitly describes `exponentiation > 1` as producing flatter valleys and sharper peaks. Do not change this semantic or introduce a second FBM helper just for 062.

---

## 3. Relevant files and entry points

| File | Important symbols | Role in 062 |
|---|---|---|
| `src/terrain/chunkHeightmap.ts` | `RegionParams`, `RawSampleParams`, `sampleRawTexel`, `sampleHeightAt`, `computeChunkTile` | **Primary implementation seam.** Height formula and terrain tile fields live here. |
| `src/terrain/fbm.ts` | `FbmParams`, `fbm01` | Existing reusable FBM implementation. Reuse it. |
| `src/terrain/worleyNoise.ts` | `worleyRidge` | Existing mountain ridge shape. Keep it. |
| `src/config/worldConfig.ts` | `WorldConfig`, `baseConfig`, `applyStoredTerrain` | Source of default/tunable terrain parameters and persistence compatibility. |
| `src/ui/createDebugGui.ts` | `Terrain mesh`, `FBM`, `Regions` folders | Existing terrain tuning UI. Extend only for genuinely new independent parameters. |
| `src/terrain/chunkHeightmap.worker.ts` | worker `onmessage` | Existing worker boundary. No new worker. |
| `src/terrain/chunkHeightmapProtocol.ts` | `ChunkTileRequest`, `ChunkTileResult`, `ChunkTileResponse` | Existing transfer contract. Avoid protocol changes unless a new field is actually required by a consumer. |
| `src/terrain/chunkWorkerPool.ts` | `requestChunkTile`, pool | Existing persistent worker pool. Keep unchanged architecturally. |
| `src/terrain/chunkManager.ts` | `paramsFor`, `readField`, `sampleHeight`, `sampleBaseHeight` | Main-thread terrain owner/streaming facade. Should not become a new terrain generator. |
| `src/terrain/buildChunkGeometry.ts` | `buildChunkGeometry` | Converts worker tile heights/fields into Three.js mesh; must remain main-thread. |
| `src/terrain/waterBodies.ts` | `detectWaterBodies`, `computeBodyScale` | Water-body classification is downstream of generated/clamped heights. |
| `src/terrain/biomeRegions.ts` | `BiomeWeights`, `biomeWeightsAt` | Existing biome classification; 062 must not replace it. |
| `src/terrain/chunkVegetation.ts` | `computeChunkVegetation` | Consumes `heights`, `continentalness`, `mountainRidge`, `moistureRegion`; terrain changes affect placement eligibility. |
| `src/terrain/grass.ts` | grass generation | Consumes chunk tile terrain fields; verify after terrain changes. |
| `src/settlement/roadNetwork.ts` | `RoadNetworkContext`, route generation | Uses terrain samplers and supplies worker-safe road segments. Preserve its contract. |
| `src/settlement/villageClearing.ts` | clearing layout | Supplies terrain-modification data; do not move village logic into 062. |
| `src/settlement/findSettlementSite.ts` | settlement site search | Uses terrain queries; should continue to consume the improved terrain rather than gain special cases. |
| `src/settlement/settlementTerrain.ts` | settlement terrain classification | Existing terrain classification; do not duplicate it in 062. |
| `src/world/parseSeed.ts` | `createSeededRandom` | Existing deterministic seed utility. Reuse existing seed derivation. |

---

## 4. Current terrain-generation pipeline

### 4.1 World coordinates → analytic terrain sample

`sampleRawTexel(worldX, worldZ, noise, params)` is the central calculation.

It first computes two independent macro axes:

```text
c  = continent FBM at worldX / continentScale
mt = mountain FBM at worldX / mountainScale
```

`continentBiasSpline.get(c)` provides the broad elevation bias.

`landWeight = smoothstep(c, oceanThreshold, coastThreshold)` controls how strongly local detail participates and also gates mountain ridges.

### 4.2 Mountain ridge

The existing mountain path is:

```text
mountain FBM
    ↓
smoothstep threshold + width
    ↓
× landWeight
    ↓
Worley ridge field
    ↓
mountainRidge
    ↓
× mountainGain
```

Worley is sampled in warped world coordinates:

```text
wx + warp(wx * 0.0035, wz * 0.0035) * 90
```

This is intentionally low-frequency domain distortion of the ridge field and should remain the basis for connected mountain forms.

`src/terrain/worleyNoise.ts` is deterministic and continuous in world coordinates. It scans neighboring cells and derives `ridge01` from the F1/F2 distance difference.

### 4.3 Local terrain detail

The local height field uses a second, higher-frequency warp:

```text
wxw = wx + warp(wx * 0.02, wz * 0.02) * 12
wzw = wz + warp(wx * 0.02 + 40, wz * 0.02 + 40) * 12
```

Then:

```text
n = fbm01(heightNoise, wxw / noiseScale, wzw / noiseScale, fbm)
```

With the current `noiseScale = 72`, `octaves = 5`, `lacunarity = 2`, the detail FBM has considerably more spatial frequency than the 1800–2200 unit macro fields. This is the most important existing mechanism to inspect when diagnosing the visual problem.

### 4.4 Current height composition

The actual current formula is:

```text
nCombined = n * detailWeight
          + regionBias
          + mountainRidge * mountainGain

floorH = nCombined * heightScale
h = max(floorH, waterLevel)
```

There is **no explicit medium-scale hills/valleys term** between macro regional bias and local FBM.

That is the main factual correction to the conceptual model in 062: the plan's desired four-level hierarchy is not already represented by four height layers. The existing system is closer to:

```text
continental macro bias
        +
mountain ridge contribution
        +
local FBM detail
```

with moisture being a separate environmental axis, not a height layer.

### 4.5 Downstream chunk tile stages

`computeChunkTile()` samples the raw terrain for every point of an **apron-inclusive** `(resolution + 2) × (resolution + 2)` grid.

Then, in order:

1. raw analytic terrain;
2. village regional smoothing;
3. road/path/clearing corridor height modification;
4. water clamp for `heights`;
5. preserve `floorHeights` below water;
6. copy macro/environment fields;
7. detect water bodies and compute `bodyScale`.

The road/village modifications are intentionally **not** part of `sampleRawTexel()` because route/clearing targets need an ambient, road-agnostic height function. Preserve this separation.

---

## 5. Current procedural/noise architecture

### Noise implementation

The project uses `simplex-noise` for the main 2D noise fields.

`NoiseHandles` currently contains:

```ts
height
warp
biome
continent
mountain
moistureRegion
```

`noiseHandlesFor(seed)` caches these handles per world seed. Every handle is created from `createSeededRandom()` with a distinct XOR salt.

Do not add a second random architecture. If 062 adds one independent medium-scale field, follow the existing pattern:

```text
new noise handle
→ deterministic seed XOR salt
→ existing `fbm01`
→ world-coordinate sampling
→ cached per world seed
```

Pick a distinct stable XOR salt and keep it local to `chunkHeightmap.ts`; do not expose a new global RNG service.

### Determinism

`createSeededRandom()` in `src/world/parseSeed.ts` is Mulberry32-based and deterministic.

The height generator is explicitly designed around one global seed and world-space coordinates. The code comments in `chunkHeightmap.ts` state that two chunks sampling the same world point must produce bit-identical results.

This must remain true after 062.

### Existing biome/environment noise

`biome` is a separate **fine-grained** moisture-like FBM used for the existing arid↔humid local blend.

`moistureRegion` is a separate macro field introduced by plan 028 and used by `biomeWeightsAt()` to derive desert/swamp/forest weights.

062 must not reinterpret `moistureRegion` as terrain height or modify its semantics. 063 should continue to consume it as an environmental axis.

---

## 6. Plan vs current implementation

### Correct assumptions in 062

The plan is correct that:

- `src/terrain/chunkHeightmap.ts` is the primary height-generation seam;
- macro `continentalness` already exists;
- mountain gating + Worley ridge already exists;
- detail FBM + warp already exists;
- `moistureRegion` already exists independently;
- roads, paths, clearings and village-wide smoothing modify terrain later;
- terrain generation already runs in the worker pool;
- `WorldConfig`/lil-gui is the right tuning surface;
- deterministic world-coordinate sampling is the required model;
- the worker protocol should not be redesigned.

### Important corrections / clarifications

#### 1. There is no current dedicated hills/valleys layer

The plan's proposed `regionalTerrain` is genuinely new if needed. It is not an existing stage that can simply be exposed.

**Recommendation:** first tune `height` FBM, warp and existing macro contributions. Add a dedicated medium-scale field only if broad hills/valleys cannot be produced without local detail continuing to dominate.

#### 2. `continentalness` does not directly hard-classify ocean height

It contributes through `continentBiasSpline`, while `landWeight` controls detail suppression and mountain gating. Final `h` is clamped to `waterLevel`.

Do not replace this with a hard ocean threshold unless visual evidence shows the current approach is inadequate. Hard thresholds are specifically contrary to 062's smooth-transition goal.

#### 3. `mountainRidge` is already spatially connected

The Worley implementation is not simply creating independent Voronoi peaks. `ridge01` is derived from F1/F2 and therefore follows connected cell-boundary networks. The plan's concern about isolated sharp peaks should therefore be evaluated against the **combination** of ridge sharpness, gate width, gain and local FBM, not assumed to be a flaw in Worley itself.

#### 4. `moistureRegion` is not part of terrain height

It is an environment/biome signal. Do not change it to make terrain look better.

#### 5. Current vegetation is already macro-aware

`chunkVegetation.ts` is not purely random local placement. It already uses world-space `clumpNoise` and `meadowNoise`, plus `moistureRegion`, `continentalness`, `mountainRidge`, slope and altitude. This matters when evaluating 062: some perceived "terrain/forest" irregularity may actually come from vegetation distribution rather than the height field itself.

---

## 7. Proposed terrain-generation pipeline

Implement 062 incrementally around the existing `sampleRawTexel()`.

### Stage A — baseline the existing formula

Before changing code, capture a visual baseline for several seeds and distances from origin.

At minimum record:

- default seed `42`;
- three additional deterministic seeds;
- nearby chunks and at least one macro-scale traversal far enough to cross a region/mountain boundary.

Use the baseline to separate:

- local FBM bumps;
- broad continental relief;
- mountain ridge contribution;
- actual chunk seam artifacts;
- downstream visual effects from grass/vegetation.

### Stage B — tune existing local detail first

The first code iteration should remain within existing parameters/functions.

Candidate controls, in order of likely impact:

1. `fbm.exponentiation` — current `2.4` is a strong remap and should be tested lower;
2. `noiseScale` — current `72` is relatively local compared with chunk/macro scales;
3. `persistence` / `lacunarity` — control how much high-frequency detail remains;
4. warp amplitude/frequency in `sampleRawTexel()`;
5. `heightScale` only after shape/frequency is correct.

Do not blindly set exponentiation to one of the example values from the plan. Measure/inspect the resulting distribution and visual shape.

Important: `heightScale` scales **everything** after combination, including continental bias and mountain contribution. It is therefore not a substitute for controlling local-detail amplitude.

### Stage C — constrain local detail relative to macro structure

The current formula has no explicit local-detail amplitude parameter. `detailWeight` only interpolates between `oceanDetailWeight` and `1` based on continentalness.

If tuning shows that the local FBM is the root cause, prefer introducing a clearly named, semantically meaningful parameter for its amplitude rather than hiding the effect in unrelated `heightScale` or thresholds.

For example, conceptually:

```text
macroHeight
+
localDetail * localDetailAmplitude
```

The exact parameter name/value should be chosen during implementation to fit existing config conventions.

Do not add a slider merely because a constant exists. Only expose a parameter if it represents an independent tuning dimension.

### Stage D — add medium-scale hills/valleys only if required

If A–C cannot create broad, coherent hills without flattening mountains/oceans or making detail too weak, add one medium-scale regional signal.

Preferred shape:

```text
regionalTerrain = FBM(world / mediumScale, mediumFbm)
```

or an equivalent reuse of an existing field if it can provide the required spatial scale without semantic coupling.

The important properties are:

- much lower frequency than `height` detail;
- world-coordinate based;
- deterministic from the existing seed;
- continuous across chunks;
- modest amplitude relative to macro structure;
- independent enough from continentalness/mountainness that hills do not become a second copy of the continent field.

Do **not** introduce hydraulic erosion, geology, soil, climate, rivers, or another world simulation system as part of this step.

### Stage E — mountain tuning

Tune the existing mountain system as a unit:

```text
mountainThreshold
mountainThresholdWidth
mountainScale
worleyCellSize
ridgeSharpness
mountainGain
```

The goal is a broad mountain region with readable connected ridges, while keeping non-mountain terrain dominated by the lower-frequency hill/detail structure.

Do not remove `mountainRidge` or replace Worley unless visual testing demonstrates a concrete failure that cannot be corrected by its existing controls.

### Stage F — transitions

Keep the existing smoothstep-based transitions:

- continent → land;
- mountain gate;
- biome weights;
- corridor falloff.

For any new blend use `smoothstep`/`lerp` consistently with the existing code. Avoid new hard terrain classification thresholds inside the height function.

### Stage G — downstream verification

After changing raw height, verify the existing downstream stages in this order:

```text
sampleRawTexel
    ↓
computeChunkTile
    ↓
road/village modifiers
    ↓
water body detection
    ↓
buildChunkGeometry
    ↓
vegetation/items/environment/grass
    ↓
settlements / NPC / fauna consumers
```

Do not add compatibility hacks to these consumers merely because the terrain changed.

---

## 8. Chunk/world-coordinate considerations

### Chunk layout

`src/terrain/chunkGrid.ts` defines:

```ts
worldToChunk(x, z, chunkSize)
→ Math.round(x / chunkSize)
```

Chunks are centered on multiples of `chunkSize`.

For `chunkSize = 64`, a chunk centered at `cx = 0` spans approximately `[-32, +32]`, while the next chunk spans `[+32, +96]`.

### Apron sampling

`apronOriginWorld()` creates an apron-inclusive grid with one extra sample on each side.

For resolution `R`:

```text
step = chunkSize / (R - 1)
apronRes = R + 2
origin = chunkCenter - chunkSize/2 - step
```

This is important: **do not change chunk sampling to local coordinates for new noise.** All terrain fields must be sampled from absolute world coordinates.

### Seam guarantees

`buildChunkGeometry.ts` computes normals on the apron geometry, then copies the appropriate normals onto the trimmed core mesh. The core mesh must not call `computeVertexNormals()` independently.

Therefore 062 should not change the apron/normal mechanism unless a separate seam bug is demonstrated.

The invariant to preserve is:

```text
same seed
+ same terrain config
+ same world coordinates
= same analytic terrain sample
```

regardless of chunk generation order or worker assignment.

### Road/village modifications

`sampleHeightAt()` and `sampleFloorAt()` are intentionally **raw analytic** samplers. They do not include roads/clearings.

`computeChunkTile()` applies:

1. `applyRegionalSmoothing()`;
2. `applyTerrainCorridors()`.

Do not fold these modifications into the new raw terrain formula. `roadNetwork.ts` and village planning depend on an ambient, road-agnostic analytic terrain function.

### Runtime dig/level overlay

`ChunkManager.modifyTerrain()` / `levelTerrain()` mutate the cached tile only and reapply modifications to regenerated chunks. The procedural base remains untouched.

062 must preserve this distinction.

---

## 9. Worker and performance considerations

The existing worker architecture is already appropriate:

```text
ChunkManager.paramsFor()
        ↓
ChunkWorkerPool
        ↓
chunkHeightmap.worker.ts
        ↓
computeChunkTile()
        ↓
computeChunkVegetation()
computeChunkItems()
computeChunkEnvironment()
        ↓
transferable typed arrays + placement data
        ↓
ChunkManager
        ↓
Three.js mesh/props on main thread
```

### Worker details

- Worker pool size defaults to `min(6, max(2, hardwareConcurrency - 1))`.
- Workers stay alive for the pool lifetime.
- Chunk results are cancelled logically by discarding results; the worker itself is not recreated per cancellation.
- Terrain arrays (`Float32Array`) are transferred.
- Three.js objects are created only on the main thread.

Do not change this architecture for 062.

### Cost of an additional noise field

A new medium-scale FBM would add a per-texel noise loop for every apron texel of every generated chunk.

At default resolution 65:

```text
67 × 67 = 4,489 samples/chunk
```

With 5-octave detail FBM, terrain generation already performs substantial noise work. A second 3–5 octave field is not free, especially across several concurrent workers.

Therefore:

1. first attempt to solve the visual problem by changing existing formula/parameters;
2. if a new field is necessary, keep its octave count low and justify it by visible improvement;
3. do not send an extra derived grid to the main thread unless another runtime consumer actually needs it.

If a medium-scale value is used only inside `sampleRawTexel()` and does not feed vegetation/biome/runtime queries, it can remain generation-internal and does **not** need a new `ChunkTileData` field or worker transfer.

### Memory/GC

Prefer existing `Float32Array` grids when a field must be shared downstream. Avoid allocating temporary arrays per texel or per noise octave.

Do not cache height values globally: deterministic analytic sampling is already the project's preferred model, and chunk-local arrays already exist for loaded terrain.

---

## 10. Determinism and seed handling

Current determinism has three layers:

1. world seed from `WorldConfig` / `parseSeed.ts`;
2. deterministic noise handles cached per seed in `chunkHeightmap.ts`;
3. world-coordinate sampling independent of chunk/worker order.

The worker and main-thread analytic samplers both use the same seed and algorithm.

If a new noise handle is introduced:

```text
same world seed
    ↓
existing `createSeededRandom(seed ^ stableSalt)`
    ↓
existing `createNoise2D`
    ↓
world-coordinate sample
```

Do not use `Math.random()` in terrain generation. Do not derive a terrain seed from `cx/cz`.

The existing `chunkVegetation.ts` is allowed to use a per-chunk deterministic hash for candidate placement, but its low-frequency cluster/meadow fields are explicitly world-space. 062 should follow the same principle for terrain.

### Important config determinism

`src/config/worldConfig.ts` merges stored terrain configuration field-by-field so older saved/stored configurations can keep new defaults. If 062 adds new terrain config fields, update `applyStoredTerrain()` so missing fields retain current defaults.

Do not wholesale-replace nested `region`/`fbm` objects in a way that makes old saves/stored config produce `undefined` values.

---

## 11. Relationship with 063 Forest Regions

063 is planned immediately after 062 and explicitly depends on a terrain-generation improvement.

### Existing shared environmental signals

The current code already exposes:

```text
continentalness
mountainRidge
moistureRegion
height / altitude
slope (derived from height/normals)
biomeWeightsAt()
```

`ChunkManager` already exposes runtime samplers:

```text
sampleHeight
sampleContinentalness
sampleMountainRidge
sampleMoistureRegion
sampleForestFactor
sampleTreeEnv
```

`sampleForestFactor()` is currently derived from:

```text
biomeWeightsAt(moistureRegion, altitude01, region).forest
```

This is the most important boundary to preserve.

### 062 responsibility

062 should own **physical terrain structure**:

- height;
- macro elevation/continent structure;
- mountain regions/ridges;
- smooth terrain transitions;
- the raw deterministic signals needed to describe that terrain.

It should not implement forest density or tree ecology.

### 063 responsibility

063 should own **forest-region distribution**:

```text
terrain/environment signals
    ↓
forest suitability / forest density
    ↓
vegetation density
    ↓
future habitat consumers
```

063 should not recalculate a second terrain or biome pipeline.

### Important review finding

The 063 plan says the current vegetation system works mainly as local tree placement. That is directionally true, but the current code is already more sophisticated than that description:

- world-space `clumpNoise` creates cross-chunk species/density patches;
- `meadowNoise` creates cross-chunk flower/meadow patches;
- `moistureRegion` and `biomeWeightsAt()` already provide macro biome context;
- slope, altitude, mountain ridge, water clearance and roads are already placement constraints.

Therefore 063 should extend the existing `computeChunkVegetation()` density calculation rather than replace it.

### 063 should not be blocked on a new 062 data grid

If 062 adds a medium-scale terrain-only signal, 063 should not automatically receive it as a new `ChunkTileData` field. Only expose a new terrain field if it has a real cross-system consumer.

For forest distribution, existing `moistureRegion`, altitude, mountain ridge and slope are already available. A future `forestDensity` can be computed in the vegetation/environment layer using those signals plus a single appropriately scaled forest field if visual testing proves it necessary.

### 063 implementation notes status

No `2026-08-11--063--forest-regions-and-habitat-distribution-implementation-notes.md` file exists in the current repository at the time of this review. Therefore the 063 boundary above is based on the current 063 plan and current code, not on a completed 063 implementation review.

---

## 12. Relationship with vegetation/tree systems

### `chunkVegetation.ts`

The current placement path is worker-side and consumes the generated tile directly.

It currently rejects candidates based on:

- water clearance;
- slope (`SLOPE_REJECT = 0.9`);
- treeline altitude;
- mountain ridge;
- road/path corridor;
- deterministic density derived from fine `biomes`, `continentalness`, macro `biomeWeightsAt()`, desert weight and clump noise.

062 can change where these checks succeed because height/slope/mountain regions change. That is expected.

Do not add compensating thresholds here just to hide a bad terrain parameter.

### `buildChunkGeometry.ts`

Terrain color uses:

```text
biomeWeightsAt(moistureRegion, altitude01)
```

and then slope/mountain/ocean/road tint.

A new terrain height distribution will therefore also alter:

- altitude-dependent biome weights;
- mountain rock application;
- slope rock;
- bare-ground weighting for detail normals.

This is a useful integration check, not a reason to fork terrain classification.

### Plan 058

`docs/plans/2026-08-10--058--living-forest-tree-lifecycle.md` is `verification needed` and already states that tree growth can consume:

- height;
- `continentalness`;
- `mountainRidge`;
- `moistureRegion`;
- biome weights.

The current runtime `ChunkManager.sampleTreeEnv()` exposes exactly these signals through `TreeEnvSample`.

062 must therefore preserve the semantic meaning and continuity of these fields. Do not implement any tree lifecycle behavior in 062.

The current procedural tree placement already carries `growthStage` and is resolved through `TreeLifecycle` during chunk instantiation. Terrain changes should flow into that existing environment input naturally.

---

## 13. Relationship with village generation

Relevant existing plans:

- 031 — village generation, done;
- 036 — difficult-terrain village siting, only partially implemented and `verification needed`;
- 047 — village-generation overhaul, planned;
- 032 — natural resources/economy, `verification needed`.

### Current terrain/village coupling

`src/settlement/findSettlementSite.ts` uses terrain queries to select a site.

`src/settlement/villageClearing.ts` and `src/settlement/roadNetwork.ts` then derive worker-safe terrain modifiers:

- clearing segments;
- village-wide regional smoothing;
- local paths;
- inter-settlement roads.

`computeChunkTile()` applies those modifications after the raw terrain sample.

### 062 rule

Do not move any settlement placement or village planning into `chunkHeightmap.ts`.

Improving the raw terrain is sufficient: the existing settlement systems will sample the new terrain and react through their existing scoring/query mechanisms.

### Future 047 compatibility

Plan 047 explicitly wants the village planner to evaluate:

- terrain;
- slope;
- water;
- forest;
- resources;
- road feasibility;
- larger settlement footprint.

062 should therefore preserve the current cheap analytic terrain samplers rather than replacing them with a runtime-only mesh query.

The future planner needs terrain queries even when the relevant chunk is not loaded. `ChunkManager` already falls back to analytic `sampleHeightAt()`/region samplers for this reason.

### 036 compatibility

Plan 036 documents a real current limitation: settlement site search evaluates a small local area, while houses/props can extend farther. 062 should **not** attempt to solve that. It is a settlement-siting concern, not a terrain-generation concern.

---

## 14. Required code changes

The exact final diff should be kept small. A likely implementation sequence is:

### Required / likely

1. `src/terrain/chunkHeightmap.ts`
   - adjust the existing raw height composition;
   - possibly add one medium-scale terrain signal only if tuning proves necessary;
   - preserve all existing exported analytic samplers;
   - preserve the road/village post-processing stage.

2. `src/config/worldConfig.ts`
   - tune defaults;
   - add only genuinely independent terrain parameters;
   - update `applyStoredTerrain()` for any new persisted config fields.

3. `src/ui/createDebugGui.ts`
   - expose genuinely independent tuning parameters;
   - keep them under the existing `Terrain`/`Regions`/`FBM` hierarchy;
   - avoid slider proliferation.

### Only if a new shared terrain field is actually required

4. `src/terrain/chunkHeightmap.worker.ts`
   - destructure/transfer the new `ChunkTileData` field **only if another consumer needs it**.

5. `src/terrain/chunkHeightmapProtocol.ts`
   - type the new field through the existing `ChunkTileResult` path automatically via `ChunkTileData`; do not create a parallel message shape.

6. `src/terrain/chunkWorkerPool.ts`
   - transfer the new `Float32Array` only if it is actually in `ChunkTileData` and consumed on main.

7. `src/terrain/chunkManager.ts`
   - expose a sampler only if a runtime consumer needs the new field.

### Files that should normally NOT change for 062

- `src/terrain/chunkGrid.ts`
- `src/terrain/buildChunkGeometry.ts`
- `src/terrain/waterBodies.ts`
- `src/terrain/biomeRegions.ts`
- `src/terrain/chunkVegetation.ts`
- `src/terrain/grass.ts`
- `src/settlement/roadNetwork.ts`
- `src/settlement/villageClearing.ts`
- `src/settlement/findSettlementSite.ts`
- `src/settlement/settlementTerrain.ts`

These should be verification targets, not automatic modification targets. Change them only if a concrete regression or required shared output is demonstrated.

---

## 15. Implementation order

1. **Baseline current terrain visually.** Use default seed + at least three other seeds and inspect several macro distances.
2. **Read/measure `sampleRawTexel()` behavior.** Identify whether the dominant problem is local FBM frequency/amplitude, exponentiation, warp, or mountain contribution.
3. **Tune existing FBM first.** Do not add a new field yet.
4. **Tune mountain contribution separately.** Keep mountain ridge connected and distinct from ordinary hills.
5. **Verify coast/ocean behavior.** `floorH` may remain below `waterLevel`, while `heights` is clamped; water-body detection depends on the resulting clamped grid.
6. **If broad hills remain impossible, add one medium-scale regional terrain field.** Keep it worker-local unless another system actually needs it.
7. **Update `WorldConfig` defaults and debug GUI** only after the algorithm stabilizes.
8. **Run deterministic/chunk tests.** Include direct analytic samples and worker-generated tile samples.
9. **Verify roads, village clearings and regional smoothing.** Ensure the raw sampler remains road-agnostic.
10. **Verify vegetation/grass/tree environment.** Confirm terrain changes produce sensible downstream behavior without special cases.
11. **Run full technical checks.**
12. **Manual browser verification** across several seeds and terrain types before marking the plan done.

---

## 16. Tests and verification

The repository uses Vitest (`*.test.ts`) for pure logic. There is no separate terrain-generation test framework.

### 16.1 Determinism tests

Add focused pure tests around `chunkHeightmap.ts` if there is currently no suitable coverage:

- same `RawSampleParams` + same `(x,z)` → identical `sampleHeightAt()`;
- same inputs → identical `sampleFloorAt()` and region samplers;
- same seed/config → identical `computeChunkTile()` arrays;
- changing only chunk coordinates while sampling the same world coordinate through the analytic function does not change the result;
- generation order cannot affect the result.

Prefer direct function tests over spinning up browser workers.

### 16.2 Chunk seam tests

For adjacent chunks A/B:

- compare their overlapping apron edge samples at identical world coordinates;
- assert the raw analytic values match;
- assert the generated tile's shared edge values match;
- verify no gap is introduced in the mesh coordinate assumptions.

Also verify normals visually because `buildChunkGeometry.ts` relies on the apron normal strategy.

### 16.3 Terrain-shape tests

Do not try to encode "natural-looking" as a brittle exact numeric snapshot.

Use bounded/invariant tests where practical:

- height remains finite;
- generated arrays contain no NaN/Infinity;
- ocean/deep-low terrain still reaches/below the configured water level through `floorHeights`;
- mountain contribution remains gated by the mountain field;
- the new medium-scale layer, if added, stays within its configured amplitude bounds;
- changing chunk generation order does not alter values.

Visual acceptance remains necessary for the qualitative goals of 062.

### 16.4 Water verification

`detectWaterBodies()` is run per generated chunk on the clamped `heights` grid.

Verify:

- coastlines do not acquire unwanted noisy spikes;
- large ocean bodies remain large;
- small inland water bodies remain possible;
- `bodyScale` remains valid;
- no new water seams are introduced.

Do not rewrite `waterBodies.ts` as part of terrain tuning unless a specific regression is proven.

### 16.5 Worker verification

Verify that:

- the worker still returns the same `ChunkTileResult` shape unless a real new field is required;
- transferred arrays remain valid after `postMessage`;
- the worker pool still reuses workers;
- cancellation/discard semantics remain unchanged;
- main-thread mesh creation remains in `ChunkManager` / `buildChunkGeometry`.

### 16.6 Integration verification

At minimum verify:

- player grounding remains stable;
- roads and paths remain on the terrain;
- village clearings still flatten correctly;
- settlement site generation still finds viable locations;
- trees/vegetation still obey slope/water/treeline rules;
- grass still rejects unsuitable terrain;
- tree lifecycle receives sensible `TreeEnvSample` values;
- fauna and NPC movement remain valid;
- chunk streaming/unloading/reloading reproduces the same world.

### 16.7 Performance verification

Measure before/after at the same:

```text
seed
config
resolution
load radius
```

Compare:

- generation time per chunk;
- concurrent worker throughput;
- time to fill the initial visible ring;
- transferred bytes per result;
- approximate memory footprint of terrain arrays;
- rebuild time after GUI terrain changes.

A new noise layer should have an explicit visual benefit sufficient to justify its CPU cost.

---

## 17. Guardrails / things NOT to implement

Do **not**:

- create a second terrain generator;
- create a `TerrainManager` just for 062;
- create a second biome/environment classification;
- create a second RNG/random-seed service;
- replace `simplex-noise` with another library without a demonstrated technical need;
- replace the existing Worley ridge system without evidence that its algorithm is the problem;
- add hydraulic/geological erosion;
- add climate/seasons/weather simulation;
- add soil/groundwater simulation;
- redesign water bodies/ocean rendering;
- move Three.js objects into workers;
- add a new worker protocol;
- make road/village modifiers part of the raw height function;
- change tree lifecycle or forest lifecycle;
- implement 063 forest density/habitat distribution;
- implement village generation/047's `VillagePlan`;
- add fauna spawning/population logic;
- compensate for terrain changes by scattering special-case thresholds across vegetation/NPC/settlement code;
- make terrain depend on chunk generation order;
- derive terrain seeds from chunk coordinates;
- store a global cache of every generated height in the world.

Prefer:

```text
existing noise
+
existing seed
+
world coordinates
+
existing chunk worker
+
existing analytic samplers
+
small, measurable changes
```

---

## 18. Final implementation checklist

Before implementation is considered complete:

- [ ] Current `sampleRawTexel()` formula was verified against this document.
- [ ] Baseline was captured on multiple seeds.
- [ ] Existing FBM/warp parameters were tested before adding a new noise field.
- [ ] If a medium-scale field was added, its independent role is documented and justified.
- [ ] `continentalness`, `mountainRidge`, and `moistureRegion` semantics remain intact.
- [ ] World-coordinate deterministic sampling is preserved.
- [ ] Adjacent chunk edge samples remain identical.
- [ ] Apron-based normal generation remains unchanged.
- [ ] Raw terrain remains separate from road/village/runtime terrain modifications.
- [ ] Worker pool architecture remains unchanged.
- [ ] Three.js mesh creation remains on the main thread.
- [ ] Existing water detection still behaves correctly.
- [ ] Vegetation and grass remain valid without special-case compensation.
- [ ] `TreeEnvSample` remains meaningful for plan 058.
- [ ] 063 can continue using existing terrain/environment signals without a second pipeline.
- [ ] Future village planning can still use analytic terrain samplers for unloaded locations.
- [ ] `npx tsc --noEmit` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] `npm run test` passes.
- [ ] Manual browser verification was performed on several seeds and macro regions.
- [ ] Performance was compared before/after if a new noise calculation was introduced.

---

## Review conclusion

The original 062 plan is directionally correct, but its biggest implicit assumption needs to be made explicit before implementation:

> **The current terrain already has strong macro axes, but it does not yet have a dedicated medium-scale hills/valleys layer.**

The smallest coherent implementation is therefore **not** "build the proposed four-layer generator". It is:

```text
1. measure current height composition
2. tune existing detail FBM / warp / mountain contribution
3. only if necessary, add one medium-scale regional height term
4. preserve all existing world-space fields and downstream modifiers
```

This keeps 062 small, deterministic and compatible with 063, 058, village generation and the current worker/chunk architecture.

---

## Implementation record (2026-08-11)

Implemented on current code:

- Softened local detail: `noiseScale` 105, FBM octaves 4 / persistence 0.65 / exponentiation 1.35, gentler hardcoded detail warp (`0.012 × 6`).
- Added `detailAmplitude` (default `0.65`) so local FBM cannot dominate macro structure.
- Added generation-internal medium-scale hills/valleys (`hillsScale` / `hillsAmplitude` 0.34 / `hillsFbm` + dedicated noise handle). Not exposed as a `ChunkTileData` field.
- Light mountain gate/ridge retune: threshold width `0.14`, ridge sharpness `2.0`, gain `0.88`.
- Debug GUI: Detail amplitude + Hills/valleys folder.
- Tests: `src/terrain/chunkHeightmap.test.ts` (determinism, hills amplitude bound, adjacent-chunk seams, generation-order independence).

### Follow-up polish (browser feedback)

- Variable beach width via `sandBandAt(wx, wz, seed)` in `[0.6, 3.0]` — shared by mesh coloring, bare-ground weight, grass shoreline reject, and dig sand classification.
- Grass foothills: hard `mountainRidge` reject replaced with smooth density fade (`smoothstep` 0.05→0.5).
- Gentle anti-monotony defaults: higher detail/hills amplitude, slightly tighter `noiseScale`, slightly higher `mountainGain`.

**Technically verified:** `tsc`, lint, full Vitest, production build (after follow-up).

**Browser / manual verification:** confirmed by user 2026-08-11 — plan marked `done`.
