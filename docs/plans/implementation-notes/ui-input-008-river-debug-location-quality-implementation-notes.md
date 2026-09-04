# Implementation notes — ui-input-008: River debug location quality

## Relevant code

- `src/debug/locationQueries.ts`
  - `riverNearest(origin, config)` converts `WorldConfig` with `rawSampleParamsFromWorld(config)`, computes river tiles directly with `computeRiverTile()`, and currently delegates each non-empty tile to `nearestChainPoint()`.
  - `nearestChainPoint()` treats every `RiverChain.points[]` element as equally valid and returns the one with minimum Euclidean distance to the player origin.
  - `RIVER_SEARCH_MAX_TILE_RADIUS = 4`; keep this bounded tile-ring policy unless measurements show it is insufficient.

- `src/debug/locationSearch.ts`
  - `searchNearest()` intentionally returns the first non-null probe result in ring/point order (`nearest-by-ring`, not globally nearest by exact distance).
  - Do not change this shared policy just to repair river semantics; mountain/forest/village/ocean rely on the same deterministic behavior.
  - A river tile whose chains contain no acceptable debug candidate should therefore make the river probe return `null`, allowing `searchNearest()` to continue.

- `src/terrain/riverNetwork.ts`
  - `RiverPoint = { x, z, elevation, accumulation }` already contains enough canonical hydrology data to grade/select a debug point without rendered terrain or Three.js.
  - `computeRiverTile()` is pure/deterministic and is intentionally called directly by debug code. Do not use `riverTileCache.retain/release` because it is ref-counted and bound to chunk streaming.
  - `canonicalWaterHeight()`, `flowFactor()` and related helpers derive river geometry from the same point data if a quality criterion needs flow/water context.
  - `buildChains()` accepts a terminal `SINK`/`BOUNDARY_EXIT` when backed by `HydrologyFlag.OCEAN_OUTLET`.

- `src/terrain/hydrology.ts`
  - `OCEAN_OUTLET` is broader than its historical name: a closed depression at/below `waterLevel` is marked as a genuine water-body receiver too. Therefore river chains legitimately terminate in both ocean and inland lakes.
  - Do not change this behavior for the debug fix.

- `src/debug/npcDebugApi.ts`
  - `locations.riverNearest()` is the sole query used by `teleportTo.riverNearest()`.
  - Keep teleport delegation unchanged; repair candidate selection in the location query layer.

- `src/debug/locationQueries.test.ts`
  - Existing river tests mock `computeRiverTile()` and currently assert only first qualifying tile + nearest chain point behavior.
  - Extend these mocks to include submerged/terminal and interior dry-land points. Avoid integration-heavy terrain generation tests unless unit coverage cannot express the regression.

## Recommended implementation shape

Introduce a small pure helper local to `locationQueries.ts` (or export only if tests/another debug query need it) that selects the best debug-worthy point from `RiverChain[]`.

Prefer a two-stage rule over a complex score:

1. reject points that represent the global standing-water zone (using canonical point elevation / `RawSampleParams.waterLevel` with a small explicit safety margin),
2. among remaining points prefer chain-interior points and then deterministic nearest distance to `origin`.

Keep the margin named and documented as a **debug teleport quality margin**, not a hydrology constant. It must not leak into terrain generation.

If using endpoint exclusion, do not blindly discard a fixed large number of points: short valid chains must still be able to produce a candidate. A proportional or minimal interior preference with fallback to qualifying endpoints is safer.

Do not resample `sampleContinentalness`, scene water meshes, chunk heights, or floor heights unless the point data proves insufficient. The current bug can be repaired using the canonical river chain data already in hand.

## Architectural constraint

The fix belongs to the debug projection semantics, not to world simulation. River generation must continue to model legitimate outlets into lakes/ocean independently of player/debug tooling.

## Verification focus

The key regression test is not merely `elevation > waterLevel`; it is behavior of the tile probe:

- a non-empty river tile with only bad candidates must return `null` from the probe so the bounded ring search continues,
- a mixed chain must pick a useful interior land candidate,
- `teleportTo.riverNearest()` must continue to call exactly the location query result rather than reimplementing selection.
