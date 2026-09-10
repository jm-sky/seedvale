# Implementation Notes: World location discovery hitch and progress

**Reviewed:** 2026-09-10
**Plan:** `world-022-world-location-discovery-hitch-and-progress.md`

## Review conclusion

Focused recon confirms the remaining hitch is abandoned-cemetery discovery, not lake/peak scan (`world-013`) and not settlement-cemetery `findLandmarkNear` (`world-014`). Do not redo that work. Do not create a parallel resolver for merchant/NPC.

## Confirmed current flow

Merchant (`src/app/inventoryWiring.ts`):

```text
applyLocationMap()
→ landmarksInBand()
→ WorldLocationCatalog.landmarksInRange()
→ cemeteryCandidates()
```

- Near: `0–20 km` (`NEAR_RANGE_KM`)
- Far: `60–200 km` (`MEDIUM_RANGE_KM` … `FAR_RANGE_KM`)

NPC/guard:

```text
onAskAboutArea()
→ locationCatalog.landmarksWithin(..., MEDIUM_RANGE_KM)
→ 0–60 km
```

`WORLD_UNITS_PER_KM = 20`. Default `chunkSize = 64`.

## Hotspot (current code)

`src/world/locations/worldLocationCatalog.ts` — `cemeteryCandidates()`:

- settlement cemeteries: canonical `resolveCemeteryForSettlement` + cache (keep)
- abandoned: bounding square `floor((origin ± maxKmWorld) / chunkSize)`, then **every** chunk calls `getChunkManager().probeAbandonedCemeteryAtChunk({ cx, cz })`
- actual `km <= minKm` / `km > maxKm` runs **after** probe

`src/terrain/chunkManager.ts` — `probeAbandonedCemeteryAtChunk()`:

```ts
const params = paramsFor(coord, [])
const placement = resolveAbandonedCemeteryForChunk(
  coord, params, createLocalTerrainSampler(coord, params),
)
```

`src/terrain/cemeteryPlacement.ts` — `resolveAbandonedCemeteryForChunk()` starts with:

```ts
abandonedRoll(seed, cx, cz)  // createSeededRandom(seed ^ hashString(`${cx},${cz}:abandoned`))()
ABANDONED_CEMETERY_CHANCE = 0.012
```

`abandonedRoll` is module-private. Placement point:

```ts
coord.cx * chunkSize + (random() * 2 - 1) * (half - margin)
```

Abandoned size is `SM` (70%) or `MD` (30%). `CEMETERY_MARGIN_BY_SIZE.SM = 6` is the **largest** possible offset from chunk center (MD margin is 9). Chunks are centered on `cx * chunkSize` (`chunkGrid.worldToChunk` uses `Math.round`).

Approximate bounding-square chunk counts from origin, `chunkSize=64` (before pruning):

| Query | maxKm | square chunks |
| --- | --- | --- |
| Near 0–20 | 20 | ~14×14 ≈ 196 |
| Guard 0–60 | 60 | ~38×38 ≈ 1444 |
| Far 60–200 | 200 | ~126×126 ≈ 15876 |

Far currently also probes the inner ~1444 chunks that cannot satisfy `(60, 200]`.

## What to reuse

- One resolver: `resolveAbandonedCemeteryForChunk` (streamed `resolveCemeteriesForChunk` already calls it). Extract/share the roll gate; do not copy hash/RNG.
- `paramsFor(coord, [])` ownership stays in `ChunkManager` (same river caveat as `world-014`).
- `createLocalTerrainSampler` stays the lightweight terrain view.
- Catalog API: add range+roll pruning inside `cemeteryCandidates()`; keep `landmarksInRange` / `landmarksWithin` / `landmarksInBand`.
- Diagnostics: extend `LocationScanDiagnostics` / `emptyDiagnostics()`; reset via existing `invalidateScanCache()`. Integer increments only.
- Progress UI: `showBusy` / `hideBusy` in `src/ui-vue/store.ts`, rendered by `BusyOverlay.vue` when `ui.busy.progress !== null`. Do **not** use `BusyAction`.
- Merchant settle is currently sync (`MerchantScreen.onTrade` → `onSettleTransaction`). NPC `NpcDialogueMenu.askAboutArea` is sync. If catalog gains async, these two call sites are the only UI adapters — not new scanners.
- `LocationKnowledge.reveal` stays in `applyLocationMap` / `onAskAboutArea` **after** the full location list exists.

## Recommended helpers

In `cemeteryPlacement.ts` (canonical RNG owner):

```ts
chunkPassesAbandonedCemeteryRoll(seed, cx, cz): boolean
abandonedCemeteryMaxOffsetFromCenter(chunkSize): number  // half - SM margin
```

`resolveAbandonedCemeteryForChunk` uses the same roll helper.

Probe/catalog materialization wrapper (name can follow local style): only call `paramsFor` + `createLocalTerrainSampler` after the roll passes. Streamed generation already has a sampler; it still uses the same helper to skip physical search.

In catalog (km conversion lives in `locationConfig`, not terrain): AABB of possible cemetery positions vs `(minKm, maxKm]`:

- reject if minDist to AABB > maxWorld
- reject if maxDist to AABB <= minWorld (`km <= minKm` is excluded)

Expand the iteration bbox by `abandonedCemeteryMaxOffsetFromCenter` so a cemetery near a chunk edge at `maxKm` is not missed.

## Cooperative async (only if still needed after pruning)

Cheap roll + annulus prune should drop Far expensive probes from ~16k to ~O(1% of annulus) (~100–150). That can still hitch if each remaining probe pays `paramsFor`.

Prefer:

- keep sync `landmarksInRange` as the reference implementation
- add `landmarksInRangeAsync` on the **same** catalog (not a merchant/NPC scanner)
- collect cheap-eligible coords first (sync, cheap)
- if remaining probes are few (Near/Guard), finish synchronously
- if many (Far), batch + `requestAnimationFrame` / `setTimeout(0)` yield
- `onProgress(done / total)` monotonic, final `1`
- overlay via `showBusy(..., progress)` delayed ~80ms so Near/NPC do not flicker
- reveal/toast only after the async query resolves; re-entrancy guard on Trade / Ask About Area (`BusyOverlay` is `pointer-events-none`)

Do not Worker-offload the catalog.

## Tests — where

- `src/terrain/cemeteryPlacement.test.ts` (new): roll helper ≡ resolver gate; fail-roll does not materialize sampler; pass-roll still calls `resolveAbandonedCemeteryForChunk`; streamed `resolveCemeteriesForChunk` abandoned presence/id/position parity with the resolver
- `src/world/locations/worldLocationCatalog.test.ts`: range prune (minKm/maxKm kept, Far inner + corners skipped); Near/Guard/Far determinism and query order; async ≡ sync; progress monotonic ends at `1`; fake `probeAbandonedCemeteryAtChunk` call counts
- Do not add wall-clock assertions

## Pitfalls

- Catalog tests inject abandoned cemeteries via fake `ChunkManager`. If the catalog cheap-rolls with `getSeed()`, fixtures must sit on chunks that **pass** `chunkPassesAbandonedCemeteryRoll` for that seed — or the fake will never be called.
- Do not import `locationConfig` from `cemeteryPlacement.ts` (terrain ↛ world-locations). Keep km-band AABB in the catalog.
- Do not move `minKm` ahead of `MAX_CEMETERY_SETTLEMENTS_SEARCHED` for **settlement** cemeteries (`world-013` notes §5). This plan only prunes the abandoned chunk scan.
- `BusyAction` is the wrong progress source. Inventory wiring comment currently says these handlers never open a busy channel — update if overlay is used.
- `onSettleTransaction` returning `Promise<TradeResult>` requires `MerchantScreen.onTrade` to await and guard double-submit.

## Implemented (2026-09-10)

Cheap roll + annulus prune + `resolveAbandonedCemeteryAfterRoll` + `landmarksInRangeAsync` (yield when probes > 24) + delayed `showBusy` on merchant/NPC.

Measured expensive probes, seed 42, origin `(0,0)`, `chunkSize=64`:

| Query | Before square | After probes |
| --- | --- | --- |
| Near | 196 | 2 |
| Guard | 1444 | 19 |
| Far | 15876 | 124 |

