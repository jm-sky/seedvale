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

## Implementation status (2026-09-05)

### Implemented

- `src/debug/locationQueries.ts`: `nearestChainPoint()` replaced by `qualifyingChainPoint(chains, origin, waterLevel)` — rejects any `RiverPoint` with `elevation <= waterLevel + RIVER_DEBUG_LAND_MARGIN` (`0.5`, same order of magnitude as other "clearance above water" margins in the codebase, e.g. `naturalResources.ts`'s `LAND_MARGIN`), then prefers a chain-interior point over a chain terminal, then nearest distance to `origin`. `riverNearest()` now calls this instead of the old unconditional-nearest helper; `searchNearest()`/the tile-ring policy in `locationSearch.ts` are untouched.
- `riversNearby(origin, config, maxResults = 6)` (new export) — runs the same bounded tile-ring scan as `riverNearest()` but collects every chain in the whole radius, groups chains that look like the same physical river split across a tile boundary via `groupContinuousChains()` (endpoint proximity + relative accumulation match — `isChainContinuation()`), then picks one `qualifyingChainPoint()` candidate per group. No parallel hydrology model or persistent registry; everything is recomputed per call from `computeRiverTile()`.
- `debug.locations.riversNearby()` and `debug.teleportTo.nextRiver()` added to `src/debug/npcDebugApi.ts`. `nextRiver()`'s cursor (`{ seed, candidates, index }`) is a plain closure variable local to `installNpcDebugApi()` — never read by the simulation — recomputed from the player's current position the first time it's needed and whenever `config.seed` changes, matching the existing `config.seed`-as-rebuild-signal convention already used in `gameLoop.ts`'s `getSeed`.
- `HELP_TEXT` and both API types (`LocationsDebugApi`, `TeleportToDebugApi`) updated to document the two new entry points.
- Tests: `locationQueries.test.ts` gained land-vs-submerged, bounded-search-continues-past-a-bad-tile, interior-vs-terminal-preference, determinism, and `riversNearby` grouping/dedup/empty cases (all via the existing `computeRiverTile` mock, so accumulation/position values are fully controlled rather than depending on real hydrology noise). `npcDebugApi.test.ts` gained a `teleportTo.nextRiver()` describe block covering cycling order, wraparound, no-qualifying-river, and cursor reset on `config.seed` change.

### Technically verified

- `npx tsc --noEmit` — clean.
- `npm run lint:fix` — clean (one auto-fixed import-order change in the test file).
- `npx vitest run` — 276 files / 3031 tests passed.
- `npm run build` (`vue-tsc --noEmit && vite build`) — succeeds.

### Browser/manual verified

- Not done — per the plan's own "Poza zakresem"/"Manual verification" notes, browser verification of `teleportTo.riverNearest()`/`teleportTo.nextRiver()` belongs to the player, not the implementing agent.

### Deliberate scope decisions worth flagging

- "Same river" identity for `riversNearby()`/`nextRiver()` is a lightweight endpoint-continuity heuristic over already-computed `RiverPoint` data (position + accumulation), not a persistent chain-tracing model — this matches the plan's explicit "lekki, deterministyczny klucz" option and its "no parallel hydrology model" constraint. It can in principle under-merge (treat two fragments of one very long, oddly-shaped river as separate) but should not over-merge two genuinely distinct nearby rivers, since both a tight distance bound (`1.5 × RIVER_CELL_STEP`) and a relative accumulation-match bound (25%) must hold simultaneously.
- `riversNearby()` always scans the full `RIVER_SEARCH_MAX_TILE_RADIUS` tile-ring (same bound `riverNearest()` already uses in its worst case) rather than short-circuiting once `maxResults` distinct rivers are found — grouping requires seeing every chain's endpoints up front to dedupe correctly across tile boundaries. This is a manual/debug-console-triggered call, not a per-frame one, so the extra `computeRiverTile()` calls in the common case were judged an acceptable, still-bounded cost rather than a performance risk.
