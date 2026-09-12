# world-terrain-017 — Abandoned mountain mine landmark — implementation notes

## Recon baseline — 2026-09-12

`world-terrain-019-cave-heightfield-production-migration.md` is `done`; it is no longer a blocker for 017.

The important result is not that cave siting changed — it did not — but that Cave V2 now has a clear production spatial authority.

Current flow:

```text
pickLargeCaveSites()
→ LargeCaveSite
→ buildProductionCaveTopology()
→ CaveTopology
→ CaveHeightfieldRepresentation
→ terrain cutout / presentation / gameplay queries
```

Relevant files:

```text
src/world/largeCaves.ts
src/world/createCaves.ts
src/world/caves/productionTopology.ts
src/world/caves/caveIdentity.ts
src/world/caves/caveTopology.ts
src/world/caves/caveHeightfieldRepresentation.ts
src/world/caves/caveHeightfieldQuery.ts
src/world/caves/caveHabitat.ts
src/world/locations/worldLocationCatalog.ts
src/world/locations/worldLocationTypes.ts
```

## Cave siting — still the main architectural seam

`src/world/largeCaves.ts::pickLargeCaveSites()` remains the production siting owner.

Current generic policy:

- deterministic seed salt `0xca7e51`;
- fixed ring around home: `130..620` world units;
- default target count `10`;
- bounded attempts per cave;
- rejects settlements, nearby caves, coasts and roads;
- requires local slope;
- explicitly rejects `sampleMountainRidge(x, z) > 0.55`.

That last rule directly conflicts with the abandoned-mountain-mine requirement.

Do **not** reuse `pickLargeCaveSites()` unchanged as the mountain mine search algorithm and do not delete its mountain rejection globally just to make 017 work. It is valid generic cave-population policy.

Preferred implementation direction:

1. factor/reuse the generic site-safety pieces that are genuinely shared;
2. add a deterministic bounded mountain-site query/validation seam owned by the same cave/worldgen domain;
3. pass accepted mountain candidates through ordinary production topology acceptance;
4. keep one cave lifecycle after acceptance.

Do not create `MineCaveGenerator`, `GoldMineCave` or a second cave manager.

## Production cave authority after world-terrain-019

The old notes described the cave runtime as transitional. That is no longer accurate.

Current production facts from `src/world/createCaves.ts`:

- `CaveTopology` is the representation-neutral structural contract.
- `CaveHeightfieldRepresentation` is the sole production spatial authority.
- presentation, terrain mouth, ground/floor/ceiling, occupancy, interior and horizontal containment all derive from the heightfield.
- cave presentation is streamed, but topology/heightfield runtime data is constructed up front and remains available independently of presentation activation.
- cave mouth integration uses the normal Cave V2 recess + `TerrainCutout` lifecycle.

`CaveVolume` is no longer a production gameplay/spatial authority.

`topologyToCaveDefinition()` still exists because `Caves.definitions()` and a few consumers need a compatibility view / bounds. Do not design new mine logic around `CaveDefinition` internals when the required fact exists on topology/heightfield contracts.

## Stable cave identity

`src/world/caves/productionTopology.ts` derives cave identity through `makeCaveId(seed, site)` before recipe-specific structural RNG.

017 should preserve that ownership:

```text
site + world seed
→ stable caveId
→ topology
```

Do not use cave array order, runtime map iteration order, streaming activation or Three.js identity.

For the mine semantic identity keep:

```text
mineId != caveId
mine landmark → caveId
```

`mineId` should derive from a stable semantic mine slot/salt plus world seed (and any stable worldgen identity required by the catalog contract), not by simply prefixing the chosen `caveId` and treating both concepts as the same identity.

## Existing archetypes and interior contracts

Current production cave archetypes are:

```text
natural
adventure
```

owned by:

```text
src/world/caves/caveArchetype.ts
src/world/caves/productionTopology.ts
```

`adventure` is a longer/multi-section production recipe. It is **not** a semantic mine type.

Do not introduce a `mine` archetype in 017 unless another generic cave plan has already established that architecture before implementation starts.

An existing natural or adventure cave may be selected if it satisfies the mine's structural/spatial suitability requirements.

Current useful `Caves` APIs include:

```text
archetypeOf(caveId)
contentAnchorsOf(caveId)
resolveHabitat(caveId, entityHeight)
queryGroundIn(caveId, x, y, z)
resolveHorizontalIn(caveId, ...)
```

`resolveHabitat()` is especially useful evidence that production now has a cave-scoped, presentation-independent interior/traversal contract. Do not reintroduce mesh scans or random-bounds probing for mine suitability.

For purely structural capacity checks, prefer `CaveTopology` nodes/segments before paying for richer spatial queries.

## World-location ownership

`WorldLocationCatalog` remains the canonical deterministic semantic-place owner:

```text
src/world/locations/worldLocationCatalog.ts
src/world/locations/worldLocationTypes.ts
src/world/locations/worldLocationNames.ts
```

Its rebuild contract is still important: the catalog is long-lived while seed/caves/chunk-manager/sample params are read through thunks. New mine lookup must preserve this pattern.

Do not capture a `Caves` instance, seed or terrain sampler once at catalog construction.

Current `WorldLocationKind` is:

```text
settlement | cave | cemetery | lake | mountainPeak | ruins
```

The previous notes were stale because they omitted `ruins`.

If 017 adds `abandonedMine`, update:

- `WorldLocationKind`;
- `WORLD_LOCATION_KINDS`;
- `worldLocationKindFromId()` behaviour through the shared list;
- `landmarkName()` / naming data;
- map marker/exhaustive switches;
- relevant location-discovery filtering/tests.

`WorldLocation` still has only generic semantic/location fields (`id/kind/x/z/name/discoveryWeight`) and no source-reference metadata such as `caveId`.

Therefore keep a small catalog-owned mine-specific semantic value/resolver and derive the normal `WorldLocation` view from it. Do not create a runtime `MineRegistry` and do not stuff cave topology into `WorldLocation`.

`WorldLocationCatalog.getById()` is intentionally able to reconstruct deterministic places from self-describing IDs without a persisted global index. Preserve that property for the mine.

Do not persist `mineId → caveId` in `SaveData` if it can be deterministically reconstructed.

## Terrain / massif evaluation

Use the analytic terrain path in `src/terrain/chunkHeightmap.ts` through `RawSampleParams`.

Do not instantiate chunks to classify mountain candidates.

`sampleMountainRidgeAt()` is only a ridge-strength signal. It is reused by other terrain/vegetation/resource logic and is not a semantic massif identifier. Do not change its meaning.

Massif suitability should be a bounded local analysis over existing samplers.

Recommended shape:

```text
candidate center
→ fixed deterministic neighbourhood samples
→ ridge/mountain presence
→ elevation + relief
→ coherence / extent
→ suitability score + reason
```

Keep sample count/radii/thresholds explicit constants. Prefer a pure helper with focused tests.

Do not automatically reuse `locationsCoarseCache.ts`. The unique mine choice does not naturally match its reusable lake/mountain-cell product, and cache correctness must remain optional.

## Candidate selection

Do not first select the numerically strongest massif and only then look for caves.

Rank combined candidates so an already-valid cave can beat a slightly stronger massif that would require cave generation.

Required priority:

```text
existing suitable massif + accepted suitable cave
> existing suitable massif + guaranteed cave
> generated massif + suitable/guaranteed cave
```

Useful candidate factors:

- neighbourhood massif score;
- accepted cave entrance inside/at the massif edge;
- structural capacity from topology;
- overburden/topology acceptance already guaranteed by production builder;
- usable entrance approach;
- coast / road / settlement conflicts;
- stable deterministic tie-break.

Do not overfit to future quest staging or gold placement.

## Cave guarantee

A guaranteed mine cave must still be an ordinary accepted production cave.

Preferred flow:

```text
selected massif
→ deterministic bounded mountain-site candidates
→ shared siting safety validation
→ buildProductionCaveTopology(...)
→ first/best accepted production topology by stable ranking
→ normal createCaves heightfield/runtime lifecycle
```

Important integration warning: `createCaves()` currently starts from one `sites` array, then calls `assignCaveArchetypes(seed, sites, buildTopology)`.

Adding/removing/reordering generic sites can affect which existing candidate receives the guaranteed home `adventure` archetype. 017 must not accidentally reshuffle unrelated cave archetype assignment merely because it needs one landmark cave.

Before implementation choose an explicit stable integration strategy, for example:

- keep the existing generic site list/order unchanged and add the landmark-required site through a separate shared siting input that has explicit recipe/acceptance handling; or
- extend the archetype assignment contract so landmark-required candidates are deterministic and do not perturb the existing home guarantee/roll semantics.

Do not simply prepend the mine site to `pickLargeCaveSites()` output.

Whatever strategy is chosen, mine semantics stay outside `CaveArchetype` and the resulting cave joins the same runtime map/lifecycle.

## Macro-terrain fallback

This remains the highest-risk part of the plan and the reason the `M` estimate must be re-evaluated during implementation if the seam is broad.

The massif cannot be created with `ChunkManager.modifyTerrain()` because correctness must exist before chunks load and be identical for analytic/off-screen sampling.

A valid fallback must enter the same deterministic terrain input path used by `sampleRawTexel()` / analytic sampling and chunk generation.

If a new macro constraint is added to shared terrain params, audit at least:

- `RawSampleParams` / `ChunkTileParams` propagation;
- worker-safe payloads / chunk generation inputs;
- `rawSampleParamsFromWorld()` and other analytic samplers;
- terrain/location cache fingerprints based on `RawSampleParams`;
- seed/persistent-worldgen cache invalidation assumptions.

Do not widen these contracts speculatively. First implement bounded search and prove a macro fallback is actually needed for required seed coverage.

If the fallback needs a broad new shared terrain contract, update plan effort from `M` to `L` before coding that phase.

## Existing cave mouth terrain edits are not the forbidden fallback

`createCaves()` still uses the normal cave lifecycle for the entrance:

- local mouth recess via `ChunkManager.modifyTerrain(..., 'system')`;
- persistent `TerrainCutout` for the real opening.

Do not remove/rewrite this in 017.

The plan prohibition concerns creating the **mountain massif** with runtime edits. Normal Cave V2 mouth integration is allowed and should be reused.

## Tests worth adding

Prioritise pure deterministic contracts:

- same seed/config ⇒ same `mineId`, `caveId`, entrance position;
- selection is unchanged by cave presentation activation / streaming order;
- cave array/map order does not define mine identity;
- bounded massif classifier distinguishes coherent mountain terrain from isolated ridge/hill/steep lowland;
- combined ranking prefers an existing suitable cave over generation in a comparable massif;
- fallback order is stable: natural massif+cave → natural massif+guaranteed cave → guaranteed massif;
- guaranteed mountain site passes `buildProductionCaveTopology()` instead of bypassing it;
- introducing the mine guarantee does not perturb unrelated generic cave identities/archetype assignment;
- catalog lookup still works after its dependency thunks point at a rebuilt `WorldBundle`;
- no quest/discovery/save state participates in selection.

For macro fallback add a deterministic test proving analytic terrain and generated chunk/worker path observe the same massif parameters.

## Implementation-agent recon boundary

A future implementing agent should not repeat a repo-wide cave recon.

Start with:

```text
CLAUDE.md
docs/STATE.md
docs/plans/world-terrain-017-abandoned-mountain-mine-landmark.md
this file
src/world/largeCaves.ts
src/world/createCaves.ts
src/world/caves/productionTopology.ts
src/world/caves/caveArchetype.ts
src/world/caves/caveIdentity.ts
src/world/caves/caveHabitat.ts
src/world/locations/worldLocationCatalog.ts
src/world/locations/worldLocationTypes.ts
src/terrain/chunkHeightmap.ts
```

Only widen recon if the chosen macro fallback or bootstrap integration requires it.

Browser/gameplay verification remains manual by the User.