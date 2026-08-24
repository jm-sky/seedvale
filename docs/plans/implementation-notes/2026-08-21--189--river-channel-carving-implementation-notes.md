# Implementation notes — plan 189: River Channel Carving

**Implemented:** 2026-08-21 · **Plan:** [2026-08-21--189--river-channel-carving.md](./2026-08-21--189--river-channel-carving.md)

## 1. Architecture (matches the plan's preferred ordering exactly)

```text
base terrain height (sampleRawTexel)
      ↓
regional smoothing (village)                    existing, unchanged
      ↓
road/clearing corridor blend (applyTerrainCorridors)   existing, unchanged
      ↓
river channel carving (applyRiverChannel)        NEW — this plan
      ↓
final floorHeights / heights
```

River carving is a third `computeChunkTile` stage, added the same way roads/clearings already are: a plain, worker-safe `RiverChannelSegment[]` field (`ChunkTileParams.riverSegments`, excluded from `RawSampleParams` for the same circular-dependency reason `roadSegments`/`clearings`/`regional` are) resolved on the main thread and carried into the (possibly worker-side) `computeChunkTile` call. No new hydrology system, no second river path, no worker added.

## 2. Key design decision: no explicit "monotonic correction" pass

The plan describes correcting local uphill bumps in the channel bed so it "musi zachowywać spadek w kierunku przepływu." Investigating `hydrology.ts`/`riverNetwork.ts` showed this doesn't need a new correction step:

- D8 flow direction (`computeHydrologyRegion`) only ever steps to a **strictly lower** neighbour (`slope > bestSlope`, `bestSlope` starts at 0). A chain's own `elevation` sequence is therefore always strictly decreasing along the flow direction — already asserted by the existing `riverNetwork.test.ts` "D8 invariant" test, which still passes unmodified.
- Flow accumulation is monotonically **non-decreasing** along any single flow path by construction (accumulation only ever adds downstream, never subtracts).
- `depthFromAccumulation` (new, mirrors `widthFromAccumulation`'s `flowFactor` curve) is monotonically non-decreasing in accumulation.

So `bed = elevation - depthFromAccumulation(accumulation)` is the difference of a strictly-decreasing sequence and a non-decreasing one — **strictly decreasing by construction**, with no extra pass, no new state on `RiverPoint`, and no touching of `hydrology.ts`/the chain-building/smoothing/meandering pipeline in `riverNetwork.ts`. Chaikin smoothing and meandering already only interpolate/reposition existing `(elevation, accumulation)` pairs, so the monotonic relationship survives them unchanged (verified in `riverNetwork.test.ts` via `riverChannelSegmentsNear`'s "bed elevation strictly decreases downstream" test).

The remaining plan concern — a fine-grained terrain ripple between two coarse (8 m-spaced) hydrology samples reading as locally uphill even though the chain's own values don't — is handled by the corridor-style blend itself: `applyRiverChannel` always blends the *actual* per-texel `floorH` toward the (linearly interpolated, still-monotonic) segment bed, so any such ripple is carved toward the lower trend regardless of the coarse samples.

## 3. Width, depth, bank width — single source of truth

`riverChannelSegmentsNear` (`riverNetwork.ts`) builds `RiverChannelSegment[]` directly from the same canonical, already-meandered/Chaikin-smoothed `RiverChain[]` the water ribbon renders (`riverGeometry.ts`'s `clipChainToRect`/`buildRiverRibbonGeometry`) — never a second path:

- Half-width reuses the existing `widthFromAccumulation` unchanged (plan requirement: terrain channel width and river geometry width share one source).
- Depth is a new `depthFromAccumulation`, built on the same `flowFactor` curve, bounded `[0.15, 2.4]` world units.
- Bank width (how far the carve tapers back to natural terrain beyond the water edge) is `max(1.5, depth / 0.45)` — deeper channels get proportionally more taper so a bank never reads as a cliff, still bounded by depth's own bound.

`applyRiverChannel`/`riverChannelCandidate` (`chunkHeightmap.ts`) is structurally the same "nearest/strongest segment, projected onto the segment, smoothstep falloff" shape as `applyTerrainCorridors`'s `roadCandidate`, with one addition: the blend target is clamped with `Math.min(bedH, floorH)`, so carving can only ever lower terrain, never raise it (guards against a segment's bed sitting above a natural dip the coarse hydrology grid didn't sample at that lateral offset).

## 4. Continuity (chunk / river-tile boundaries), determinism, no chunk-load-order dependency

`ChunkManager.ensureLoaded` now retains a chunk's overlapping river tiles (`overlappingRiverTiles` + `riverTileCache.retain`, moved into a new `retainRiverTilesFor` helper) **before** dispatching the tile request, builds `riverSegments` from those chains right there, and passes them into `paramsFor`/`requestChunkTile`. `attachChunkMesh` no longer retains a second time — it reuses `record.riverChains` (cached on the `ChunkRecord`) for the water ribbon, keeping the ref-counted retain/release exactly 1:1 (`unload`'s existing release code was untouched and already keys off `record.riverTiles`).

Because `riverChannelSegmentsNear` rejects by each segment's own reach (half-width + bank), not by whether its endpoints fall inside the chunk rect, a segment whose points sit just outside a chunk but whose bank still overlaps it is still included — two chunks straddling the same segment (or two river tiles' chains, via the existing tile halo) resolve the *same* `(aBedH, bBedH, …)` data, so carving matches exactly at the seam (covered by a `chunkHeightmap.test.ts` shared-seam test and a `riverNetwork.test.ts` "two chunks straddling the same segment" test). No `Math.random()` anywhere in the new code; determinism is inherited from the already-deterministic chain data.

The one accepted pre-existing limitation, unchanged by this plan: a chain point very close to its own tile's *core* edge can have bank influence spill a few units into a neighbouring tile's territory that a chunk on the far side of that specific boundary won't see (that chunk only retains the *other* tile). This is the same limitation the water ribbon geometry already has today (both use `overlappingRiverTiles(chunkRect)`), bounded by the small bank-width cap, and out of scope for this plan per "nie przebudowywać hydrology.ts bez potrzeby."

## 5. What was deliberately not touched

- `hydrology.ts`, D8, accumulation — unchanged.
- `riverNetwork.ts`'s chain building/Chaikin smoothing/meandering — unchanged; `RiverPoint` has no new field.
- `riverGeometry.ts`, `riverWaterMaterial.ts`, `RIVER_SURFACE_OFFSET` — unchanged. The water ribbon already samples the *actual rendered* terrain Y (`sampleTerrainY` over `tile.floorHeights`) rather than the hydrology chain's own cached elevation, so once carving lowers `floorHeights` along the channel, the existing ribbon logic automatically follows the carved bed — no water-side change needed to satisfy "woda na dnie koryta."
- No worker added; carving runs inside the existing `computeChunkTile` (worker or main thread, same as roads/clearings).

## 6. Verification

- `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run test` (full suite, 171 files / 1475 tests), `pnpm run build` all pass.
- New tests: `riverNetwork.test.ts` (`depthFromAccumulation` bounds; `riverChannelSegmentsNear` — zero segments below the stream threshold, strictly-decreasing bed downstream, width/depth grow together, determinism, bank overlap into a neighbouring chunk, identical segment data on both sides of a shared boundary) and `chunkHeightmap.test.ts` (carving lowers `floorHeights` near the centerline, never raises terrain anywhere in the tile, no effect outside the channel's reach, determinism, matching values on the shared seam of two adjacent chunks carrying the same river segment).
- Browser/manual verification (small streams, medium/large rivers, steep terrain, valleys, mountain foothills, chunk/tile boundaries, previously-uphill-looking rivers) is **not done by this session** — left for manual playtest per the workflow.
