# world-terrain-017 — Abandoned mountain mine landmark — implementation notes

## Current-state blocker

`world-terrain-008-underground-caves-v2.md` is still **in progress** on current `main`. Do not implement 017 against the present cave contracts and then preserve them for compatibility.

Current cave runtime is transitional:

- `src/world/createCaves.ts` renders accepted caves through Cave V2 (`CaveTopology` + SDF/Sweep presentation), but its authoritative `definitions()` still come from `generateCaveDefinitions()`.
- `src/world/caveGenerator.ts` still expands legacy `LargeCaveSite` candidates into `CaveDefinition` and performs the pre-V2 overburden validation.
- `src/world/largeCaves.ts::pickLargeCaveSites()` is still the siting owner. It samples a fixed ring around origin, targets a fixed cave count and explicitly rejects `sampleMountainRidge(x, z) > 0.55`.

That last rule directly conflicts with the abandoned-mountain-mine requirement. Phase 1 of 017 must therefore happen only after 008 exposes its production siting/topology/spatial contracts. The implementing agent should reconfirm those exact symbols then; do not build the mine around `LargeCaveSite`, `topologyToCaveDefinition()` or the current spike-test topology merely because they exist today.

## World-location ownership

`WorldLocationCatalog` is still the canonical deterministic semantic-place owner:

- `src/world/locations/worldLocationCatalog.ts`
- `src/world/locations/worldLocationTypes.ts`
- `src/world/locations/worldLocationNames.ts`

The catalog is created once and survives `WorldBundle` rebuilds; its dependencies (`getSeed`, `getCaves`, `getChunkManager`, `getSampleParams`) are thunks specifically so lookup remains correct after the bundle swaps its internals. Preserve that lifetime model for the mine. Do not capture a cave instance, seed or terrain sampler at catalog construction time.

`WorldLocation` currently contains only `id/kind/x/z/name/discoveryWeight`; it has no source-reference metadata such as `caveId`. 017 therefore needs a small catalog-owned semantic contract for the mine instead of pretending the generic location shape already carries the required binding. Keep the binding in the world-location domain (for example a mine-specific value returned/resolved by the catalog) and derive the ordinary `WorldLocation` view from it. Do **not** add a separate runtime `MineRegistry`.

`WorldLocationKind` currently has only `settlement | cave | cemetery | lake | mountainPeak`; adding the mine kind also requires updating `WORLD_LOCATION_KINDS` / `worldLocationKindFromId()` and any exhaustive UI/map/name handling found by TypeScript/tests.

Keep identities separate:

- `mineId`: semantic landmark identity, derived from seed + stable semantic slot/salt, not from selected `caveId`.
- `caveId`: Cave V2 identity selected by worldgen.

`WorldLocationCatalog.getById()` is expected to reconstruct deterministic places from self-describing IDs without a persisted global index. The mine should keep that property. Do not persist its geometry or `mineId → caveId` binding in `SaveData` if it can be deterministically reconstructed.

## Terrain/massif evaluation

Use `src/terrain/chunkHeightmap.ts` analytic samplers and the same `RawSampleParams` path already consumed by `WorldLocationCatalog`; do not instantiate chunks to classify candidates.

Important current fact: `sampleMountainRidgeAt()` is only a connected-ridge-strength signal. It is intentionally not a semantic "massif id" and its meaning is reused by vegetation/resources. Do not change its semantics for this feature.

Massif suitability should therefore be a bounded local analysis over existing samplers, not a new noise field. At minimum use several samples over a fixed-radius pattern and combine ridge presence with relief/elevation/coherence. Keep sample count and radii explicit constants so startup/catalog cost is bounded and tests can assert it.

The existing coarse location scan/cache (`locationsCoarseCache.ts`) is optimized for reusable lake/mountain-cell classification. Do not automatically put the unique mine-selection result into that tile cache. The persistent worldgen cache is disposable and correctness must not depend on it. Only extend that cache if profiling/recon shows the mine actually reuses the same coarse-cell product.

## Candidate search and cave integration

Do not reuse `pickLargeCaveSites()` as the mine search algorithm. Its current origin-centred `130..620` ring, fixed attempt budget and ordering-dependent separation against already placed caves are implementation details of generic V1 siting, not a regional landmark-selection contract.

After 008 is complete, prefer a pure/cheap Cave V2 query surface that can answer candidate availability/suitability without building Three.js geometry. The mine selector should operate on deterministic cave metadata/topology/spatial summaries only; presentation remains lazy in `createCaves()`.

If 008 does not expose a way to request/guarantee a valid cave at a chosen massif, extend the shared Cave V2 siting seam there. Do not special-case a second cave generator inside world locations.

The current cave mouth uses `ChunkManager.modifyTerrain(..., 'system')` for the small entrance recess. That existing Cave lifecycle detail is not the macro-terrain fallback prohibited by the plan. Do not remove/reimplement the normal Cave V2 entrance integration as part of 017; the prohibition is against creating the massif through runtime terrain edits.

## Macro-terrain fallback

Treat this as the last phase and as a scope checkpoint.

`chunkHeightmap.ts::sampleRawTexel()` is the actual analytic source of mountain massifs and is mirrored through worker-based chunk generation/off-screen sampling. Any guaranteed massif must enter that deterministic input path before downstream sampling. A local `ChunkManager.modifyTerrain()` patch is wrong because it would not become the same macro feature for analytic classification, workers and unloaded terrain.

Before adding a new generic authored-feature framework, first check whether a narrow seed-derived macro constraint can be threaded through existing `RawSampleParams`/region params without duplicating terrain ownership. If this requires widening the terrain-generation contract across main thread + worker payloads + cache fingerprints, stop and reassess the plan effort as instructed by 017 rather than hiding that expansion inside landmark code.

## Conflicts / siting constraints

Reuse existing spatial owners rather than duplicating approximations:

- roads: current cave creation gets corridors through `ChunkManager.roadCorridorsNear()`;
- settlements: use current settlement definitions/footprints, not a second settlement noise test;
- coast: reuse the existing continentalness/coast placement rules;
- cave overburden/entrance/topology validation: use final Cave V2 validation from 008.

Do not overconstrain the selector with future quest needs. The only semantic requirement here is a believable, accessible mountain mine landmark with a Cave V2 binding.

## Tests worth adding

Focus on pure deterministic contracts rather than rendering:

- same seed/config ⇒ same `mineId`, `caveId` and representative position;
- different streaming/query order does not change selection;
- selected natural candidate passes bounded massif suitability and Cave V2 suitability;
- fallback order is stable: natural massif+cave → natural massif+guaranteed cave → guaranteed massif;
- mine identity remains unchanged when cave arrays/order are perturbed;
- `WorldLocationCatalog` resolves the mine correctly after dependency thunks switch to a rebuilt `WorldBundle`;
- no quest/discovery/save state participates in selection.

Avoid browser verification in the implementation agent; browser verification remains manual.