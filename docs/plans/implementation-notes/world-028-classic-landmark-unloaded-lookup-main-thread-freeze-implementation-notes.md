# Implementation Notes: Classic landmark unloaded lookup main-thread freeze

**Reviewed:** 2026-09-15
**Plan:** `world-028-classic-landmark-unloaded-lookup-main-thread-freeze.md`

## Review conclusion

`world-014` left a real remaining main-thread exception. `resolveUnloadedLandmark()` is already the right seam. Cemetery and authored `ruins` are already cheap. The three classic kinds still call `computeChunkTile()` + `computeChunkEnvironment()` per inspected unloaded chunk.

Do not duplicate the placement algorithm. Extract the existing blocks from `computeChunkEnvironment()` into one pure resolver and have both callers consume it.

Do not solve this by lazy quest creation. The primitive is `findLandmarkNear()`.

## 1. Exact files and symbols

- `src/terrain/chunkEnvironment.ts`
  - `computeChunkEnvironment()` lines for monolith / stoneCircle / smallRuins (currently after campfires, before cemetery).
  - `landmarkChanceBias()`, `LandmarkBiasKind`, `deriveLandmarkId()`, `hashChunk()` (module-private).
  - `CemeteryTerrainSampler` — keep as `{ heightAt, roadTintAt }`.
  - `resolveCemeteryPlacement` — do not rebuild.
- `src/terrain/chunkHeightmap.ts`
  - `computeChunkTexel()` already returns `h`, `roadTint`, `mountainRidge`, `moistureRegion`.
  - `createLocalTerrainSampler()` — add only `mountainRidgeAt` / `moistureRegionAt`; keep bilinear `sampleApronGrid` weights + per-texel cache.
  - `createWorldTerrainSampler()` — cemetery assignment; do not extend.
- `src/terrain/chunkManager.ts`
  - `resolveUnloadedLandmark()` — add the three-kind lightweight branch; keep cemetery and `ruins`.
  - `findLandmarkNear()` — loaded path stays `rec.tile.environment`; hitch labels must not emit `(unloaded, full)` for these three kinds.
  - `ringChunkOffsets()` — unchanged.
  - `paramsFor(coord, [])` — keep empty river segments.
- Tests: `chunkEnvironment.test.ts`, `chunkHeightmap.test.ts`, `chunkManager.test.ts`.

Do not put placement logic in `WorldLocationCatalog`, `treasureSites.ts`, or `quests.ts`.

## 2. Shared resolver shape

Keep it in `chunkEnvironment.ts` (same owner as the current blocks). Do not add a parallel file.

```ts
export type LandmarkTerrainSampler = CemeteryTerrainSampler & {
  mountainRidgeAt: (wx: number, wz: number) => number
  moistureRegionAt: (wx: number, wz: number) => number
}

export function resolveClassicLandmarkPlacement(
  kind: LandmarkBiasKind,
  coord: ChunkCoord,
  params: ChunkTileParams,
  terrain: LandmarkTerrainSampler,
): EnvironmentPlacement | null
```

Internal spec table (do not change values):

| kind | chunk-hash salt | xor salt | chance | margin | scale |
|---|---|---|---|---|---|
| monolith | 4 | `0x1d4b7` | `MONOLITH_CHANCE` | `MONOLITH_MARGIN` | `0.85 + r * 0.5` |
| stoneCircle | 5 | `0x3ea92` | `STONE_CIRCLE_CHANCE` | `STONE_CIRCLE_MARGIN` | `0.9 + r * 0.4` |
| smallRuins | 6 | `0x57c31` | `SMALL_RUINS_CHANCE` | `SMALL_RUINS_MARGIN` | `0.85 + r * 0.4` |

Copy the current RNG/gate order verbatim. Slope uses the same `SLOPE_SAMPLE_STEP = 1.5` formula as cemetery. Chance bias samples ridge/moisture **at the candidate point only**, then `biomeWeightsAt(moisture, altitude01, params.region)`.

`computeChunkEnvironment()` builds one `LandmarkTerrainSampler` from its existing apron `sample()` closure and calls the resolver three times in the current order: monolith, stoneCircle, smallRuins. Home-chunk skip stays around rocks/logs/campfires only.

## 3. Lightweight terrain — do not over-extend

`createLocalTerrainSampler` already has the right evaluation model. Cemetery only needs two fields; the classic resolver needs four. `ChunkTexel` already has all four.

Return type becomes the four-field sampler. `CemeteryTerrainSampler` remains a structural subset, so cemetery call sites keep compiling without using the extra accessors.

Do not:

- allocate a full apron grid,
- call `sampleHeightAt()` / raw analytic samples (parity trap from world-014),
- extend `createWorldTerrainSampler`,
- sample continentalness / biomes / floorHeights.

Existing `createLocalTerrainSampler` tests should also assert ridge/moisture parity against full-tile bilinear sampling.

## 4. Unloaded lookup wiring

In `resolveUnloadedLandmark()`:

1. `cemetery` — unchanged lightweight path.
2. `ruins` — unchanged authored containment path. Label hits `(unloaded, lightweight)` so they are not mistaken for full generation.
3. `monolith` / `stoneCircle` / `smallRuins` — `resolveClassicLandmarkPlacement(kind, coord, params, createLocalTerrainSampler(coord, params))`.
4. remaining kinds (`shipwreck` / `tower` / …) — keep full `computeChunkTile` + `computeChunkEnvironment` fallback.

Loaded `findLandmarkNear()` should keep reading `rec.tile.environment`. Extract a tiny pure helper, e.g. `landmarkFromEnvironment(environment, kind)`, so the loaded contract is unit-testable without constructing a Three.js `ChunkManager`.

Hitch labels:

- loaded hit: `findLandmarkNear:${kind} (loaded)` (existing),
- lightweight hit: `findLandmarkNear:${kind} (unloaded, lightweight)`,
- remaining full fallback: `findLandmarkNear:${kind} (unloaded, full)`,
- miss: `findLandmarkNear:${kind} (miss)`.

Production must not emit `(unloaded, full)` for monolith / stoneCircle / smallRuins.

## 5. River discrepancy — keep, do not hide

Unloaded lookup still uses `paramsFor(coord, [])`. Streamed generation can pass real river segments. That mismatch already exists for cemetery and the current full fallback. Keep it. Document it on the shared resolver / `resolveUnloadedLandmark` JSDoc.

Parity tests must compare lightweight vs `computeChunkEnvironment()` **with the same `ChunkTileParams`**, including empty `riverSegments`. That is the contract this plan preserves.

## 6. Call-site cost after the primitive

Startup can still issue many radius-10 queries (441 chunks on a miss):

- treasure ruins + key hosts + chronicle ruins in `worldBundle.ts`,
- landmark quests + per-settlement RPG kinds in `createApp.ts`.

That is acceptable for this plan if each inspected chunk is a handful of cached texels instead of a full tile + vegetation + all environment families. If eager call-sites still dominate startup after this, record a follow-up. Do not change quest lifecycle here.

Out-of-scope remaining full path: `buildLandmarkQuests` also resolves `shipwreck` and `tower` at radius 10. Different terrain inputs. Follow-up if they still hitch.

## 7. Tests

Mirror world-014 cemetery tests; extend rather than invent a new harness.

`chunkEnvironment.test.ts`:

- for each of the three kinds, scan enough seeds **and** chunks that both a hit and a miss occur,
- resolver vs `computeChunkEnvironment()` exact field equality,
- full-tile-backed sampler vs `createLocalTerrainSampler`,
- query-order independence across two chunks.

`chunkManager.test.ts`:

- spy `computeChunkTile`: cemetery, ruins, and the three classic kinds must not call it,
- keep a remaining-kind assertion that monolith-class full fallback is gone and some other kind (e.g. `tower`) still uses full generation if queried,
- authored `ruins` still returns the authored id without generation,
- `landmarkFromEnvironment` reads the provided array and does not generate,
- existing `ringChunkOffsets` tests stay.

`chunkHeightmap.test.ts`:

- extend local-sampler parity to `mountainRidgeAt` / `moistureRegionAt`.

No wall-clock thresholds.

## 8. Implementation order

1. Widen `createLocalTerrainSampler` by the two needed accessors; extend its tests.
2. Extract `resolveClassicLandmarkPlacement`; switch `computeChunkEnvironment()` onto it; prove no behavior change with parity tests.
3. Wire `resolveUnloadedLandmark()`; update hitch labels; prove no `computeChunkTile()` on the three kinds.
4. Cemetery / ruins / ring-offset regression tests.
5. Typecheck, lint, targeted tests, build.
6. Mark the plan `verification needed`. Leave browser verification to the user.

## 9. Things not to do

- Do not copy the three RNG blocks into `chunkManager.ts`.
- Do not merge authored `ruins` with procedural `smallRuins`.
- Do not change cemetery.
- Do not change salts, chances, `ringChunkOffsets`, or search radii.
- Do not add a landmark registry or first-hit cache.
- Do not run `pnpm docs:sync`.

## JSDoc / preflight

Export the resolver and `LandmarkTerrainSampler` with `@domain world-terrain`. State:

> unloaded classic-landmark lookup and normal streamed environment generation consume the same deterministic placement rules and the same apron-texel terrain semantics without materializing a full chunk tile on the main thread.
