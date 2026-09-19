# Implementation Notes: Medicinal herb meadow patches

**Reviewed:** 2026-09-19  
**Plan:** `world-terrain-042-medicinal-herb-meadow-patches.md`  
**Status:** `implementation notes`  
**Source of truth:** current code on `main` + tests/build configuration.

## Current code reality

- `src/terrain/chunkItems.ts::computeChunkItems()` already owns the physical `mint` / `yarrow` / `herb` placements. It runs worker-side after `computeChunkVegetation()`, uses a dedicated flora RNG stream and stable `cx:cz:fN` ids.
- `src/terrain/renewableWorldItems.ts` already owns renewable depletion/respawn. Do not add meadow persistence or another lifecycle.
- Herbalist gathering already goes through `src/world/herbalGathering.ts` -> `ChunkManager.findNearestWorldItem(s)` -> `src/terrain/chunkWorldItems.ts`. The off-screen path recomputes `computeChunkTile -> computeChunkVegetation -> computeChunkItems`, so new ordinary item placements automatically remain visible to NPC gathering if they stay in that pipeline.
- Flower meadows and forest clearings share the same low-frequency `meadowNoise` in `src/terrain/chunkVegetation.ts`, but the noise cache, salt, `fieldAt()`, frequency and `flowerMeadowPatches()` are currently module-private. The plan cannot reuse that signal from `chunkItems.ts` or a main-thread world query without exposing/extracting it.
- `chunkItems.ts` currently rejects flora for water/shore and steep slope, but it does **not** currently reject `roadTint`; only vegetation does. It also has no generic settlement/building-footprint query beyond returning no items for `isHomeChunk`. Do not assume those gates already exist.

## Recommended ownership

Create one small pure, worker-safe terrain module for the shared semantic, e.g. `src/terrain/medicinalMeadow.ts`.

It should own:

- the existing meadow-field sampling needed by both vegetation and medicinal suitability (preserve the current meadow seed salt/frequency so flower meadows and clearings do not move),
- `MedicinalMeadowSample` / suitability classification,
- productive threshold/tier,
- deterministic patch identity/candidate-key helpers.

`chunkVegetation.ts` should consume the extracted meadow-field helper rather than keep a second copy. `chunkItems.ts` consumes the same helper/suitability. Main-thread lookup should use the same pure semantic through `ChunkManager` / `WorldContext`, not duplicate the formula.

Do not make `medicinalMeadow.ts` depend on Three objects, loaded chunks, item meshes or mutable save state.

## Stable patch contract

`quests-progression-070` already depends on this plan and requires stable meadow identity. The lookup should therefore return a ref, not only an arbitrary point:

```ts
type MedicinalMeadowRef = {
  patchKey: string
  x: number
  z: number
}
```

`patchKey` must come from deterministic integer candidate/lattice identity (or equivalent stable generated candidate identity), not formatted runtime floats. Same seed + lookup context must reproduce the same ref across save/load and `WorldBundle` rebuild.

This is derived identity only; do not persist a registry.

## Suitability inputs

Reuse only deterministic terrain inputs already available in worker/main-thread paths:

- meadow field,
- `moistureRegion`,
- altitude / water clearance,
- `mountainRidge`,
- `forestDensityAt()` for open/edge character,
- local slope.

For the public semantic query/lookup, prefer seed-derived terrain sampling (`sampleBaseHeight` plus deterministic moisture/continental/ridge samplers) rather than runtime-mutated `sampleHeight`; digging/leveling must not move or rename a procedural meadow.

Forest edge should be derived from the continuous forest-density band, not `nearTree()`: `nearTree()` is same-chunk placement data and is unsuitable for unloaded lookup/cross-chunk continuity.

Road avoidance can be enforced in the actual patch-item placement using `tile.roadTint`. Do not add a settlement-manager dependency to the pure suitability module; quest-specific distance/core exclusions belong in the bounded lookup caller/filter contract.

## Item placement and save compatibility

Keep the existing `fN` flora RNG stream/order intact as much as possible. Changing the shared flora weights/order can remap an old `fN` id from a finite item to a renewable herb (or vice versa); because persistence keys collection/depletion by placement id, that creates avoidable save aliasing.

Preferred implementation:

1. leave ordinary flora candidate positions and kind roll ordering unchanged;
2. if needed for abundance compensation, apply deterministic **post-selection retention only to medicinal results** rather than changing all flora weights;
3. add a separate, bounded medicinal-patch candidate stream with its own salt and id namespace, e.g. `cx:cz:mN`;
4. generate that extra stream only for chunks whose cheap suitability probes indicate a meaningful patch.

The new `mN` placements are still normal `ItemPlacement` records, so `collectItem()`, renewable overrides, loaded rendering and off-screen Herbalist queries need no new ownership path.

## Economy calibration

Do not guess constants from the plan text. First record a deterministic baseline over representative chunks/seeds from current `main`:

- total `mint`, `yarrow`, `herb`,
- per-species ratios,
- medicinal placements per area.

Then tune ordinary medicinal retention + bounded patch candidates so:

- strong patches are visibly denser locally,
- scattered medicinal finds remain,
- total medicinal count stays roughly near baseline,
- `herb` remains materially rarer.

Put the statistical sample in tests; avoid a brittle assertion on one seed/chunk. Also assert a hard per-chunk upper bound for the new patch stream.

## Lookup shape

Implement lookup over a bounded deterministic candidate lattice/rings around the origin. It should evaluate the same suitability/productivity function used by generation and rank stable candidates; it must not call `proceduralChunkItems()`, `computeChunkTile()` for whole chunks, or materialize chunks merely to find a meadow.

Expose the query at the existing world-query seam (`ChunkManager`, and `WorldContext` if consumers need it). Keep optional preferences generic: min/max distance, forest-edge preference and a caller-supplied exclusion predicate are sufficient; do not import quest code.

## Tests worth adding

Prefer focused tests in/near `src/terrain/chunkItems.test.ts` plus a dedicated pure `medicinalMeadow.test.ts`:

- same seed/point -> same suitability and patch ref;
- cross-chunk positions sample the same continuous field;
- productive lookup is bounded and deterministic;
- runtime terrain modification does not change derived patch identity;
- patch placements use the independent id prefix and are renewable through existing helpers;
- baseline-vs-new statistical abundance stays within an explicit tolerance;
- productive areas materially exceed surrounding medicinal density;
- ordinary scattered medicinal results still occur;
- off-screen `proceduralChunkItems()` sees the same patch placements as worker generation.

Existing `renewableWorldItems.test.ts` should remain unchanged except for a regression only if needed; the renewable kinds/respawn table do not change.

## Implementation order

1. Extract/shared meadow field + pure medicinal suitability/productivity/identity.
2. Add deterministic bounded lookup through the world-query seam.
3. Add independent patch item stream and economy compensation/calibration.
4. Add distribution/identity/off-screen regression tests.

Do not touch Herbalist planner/lifecycle unless a regression test reveals an integration break; its current shared world-item query path already consumes these resources.
