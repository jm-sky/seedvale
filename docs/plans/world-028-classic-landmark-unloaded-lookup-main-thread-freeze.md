# Plan: Classic landmark unloaded lookup main-thread freeze

**Created:** 2026-09-15
**Status:** `verification needed` 🔍
**Type:** fix
**Priority:** high · **Effort:** M
**Depends on:** ~~world-014~~
**Domain:** `world`
**Subdomains:** `places`
**Tags:** `landmarks` `performance` `chunks`
**Roadmap:** -
**Model:** Grok, Sonnet

## Problem

Plan `world-014` removed the cold Near Map freeze by giving `cemetery` a lightweight unloaded resolver. That scoped extraction left `monolith` / `stoneCircle` / `smallRuins` on the original full-generation fallback.

Observed production hitches:

```text
[PERF:PROPS] warning: findLandmarkNear:smallRuins (unloaded, full) hitch 8022.6 ms
[PERF:PROPS] warning: findLandmarkNear:monolith (unloaded, full) hitch 5272.6 ms
[PERF:PROPS] warning: findLandmarkNear:smallRuins (unloaded, full) hitch 8991.7 ms
[PERF:PROPS] warning: findLandmarkNear:monolith (unloaded, full) hitch 8146.0 ms
```

Multi-second `stoneCircle` misses occur on the same path.

`world-014`'s assumption that these kinds are not on a meaningful cold path is no longer true. Current production consumers include:

- systemic treasure sites (`RUINS_CHEST_KINDS`, `KEY_HOST_KINDS`),
- treasure key host lookup,
- landmark quests (`buildLandmarkQuests`),
- Lost Treasure Chronicles ruins binding,
- RPG `old-place-secret` matrix (`OLD_PLACE_LANDMARK_KINDS`).

`TREASURE_SITE_SEARCH_CHUNK_RADIUS = 10` and `LANDMARK_QUEST_SEARCH_CHUNK_RADIUS = 10` mean a miss can walk 441 chunks. Each unloaded chunk currently does:

```text
paramsFor(coord, [])
→ computeChunkTile()
→ computeChunkEnvironment()
→ search landmark
```

on the main thread.

This is a new plan. Do not retroactively expand `world-014`.

## Goal

Make unloaded `findLandmarkNear()` cheap for `monolith`, `stoneCircle`, and `smallRuins` without changing deterministic placement.

One shared resolver must own the placement rules. Normal `computeChunkEnvironment()` and unloaded lookup must consume that resolver. Unloaded lookup must pass a lightweight terrain view instead of materializing `ChunkTileData`.

## Recon (current code)

### Lookup path

`src/terrain/chunkManager.ts`:

- loaded `findLandmarkNear()` reads `rec.tile.environment` and returns on first `kind`+`id` hit,
- unloaded path calls exported `resolveUnloadedLandmark(kind, coord, paramsFor(coord, []))`,
- `cemetery` → `createLocalTerrainSampler` + `resolveCemeteryPlacement` (keep),
- authored `ruins` → `params.authoredExpeditionRuins` containment check (keep; cheap; not `smallRuins`),
- every other kind, including the three classic landmarks → `computeChunkTile()` + `computeChunkEnvironment(..., [])`.

Search order is `ringChunkOffsets(maxChunkRadius)` — center first, then expanding Chebyshev rings. Do not change it.

### Classic landmark placement

`src/terrain/chunkEnvironment.ts` `computeChunkEnvironment()` rolls the three kinds **after** rocks/logs/campfires, **outside** the home-chunk skip, on independent RNG streams. They do **not** depend on vegetation or earlier environment placements.

Per kind, exact current contract:

| Kind | RNG | Chance | Margin | Scale |
|---|---|---|---|---|
| `monolith` | `seed ^ hashChunk(cx, cz, 4) ^ 0x1d4b7` | `0.02` | `1.2` | `0.85 + r * 0.5` |
| `stoneCircle` | `seed ^ hashChunk(cx, cz, 5) ^ 0x3ea92` | `0.008` | `4` | `0.9 + r * 0.4` |
| `smallRuins` | `seed ^ hashChunk(cx, cz, 6) ^ 0x57c31` | `0.008` | `2.5` | `0.85 + r * 0.4` |

Shared RNG order (must stay exact):

1. candidate `wx`,
2. candidate `wz`,
3. terrain gates (no RNG),
4. acceptance roll only if terrain accepted,
5. on success: `scale`, `rotationY`, `variant`,
6. `id` from `deriveLandmarkId(seed, cx, cz, kind, 0)` (no RNG).

Shared terrain gates:

- `h > waterLevel + 0.3`,
- `roadTint <= ROAD_TINT_REJECT` (`0.15`),
- `slope <= SLOPE_REJECT_LANDMARK` (`0.6`), slope from heights at `wx/wz ± 1.5`,
- chance multiplied by `landmarkChanceBias(kind, …)` from `mountainRidge`, altitude, slope, and biome weights derived from `moistureRegion` via `biomeWeightsAt`.

`ChunkTileData` fields actually read: `heights`, `roadTint`, `mountainRidge`, `moistureRegion`. No vegetation, no continentalness, no previous placements, no geometric road-segment tests.

### Lightweight terrain

`createLocalTerrainSampler` already evaluates only the apron texels a bilinear query touches, through `computeChunkTexel()`, with a per-texel cache. It currently exposes `heightAt` / `roadTintAt` for cemetery.

Do not mechanically dump extra fields onto it. The smallest shared view the classic resolver needs is:

```ts
heightAt / roadTintAt / mountainRidgeAt / moistureRegionAt
```

`ChunkTexel` already computes those four. Add only those accessors. Keep `CemeteryTerrainSampler` as the two-field subset. Do not extend `createWorldTerrainSampler`. Do not allocate a full apron grid or call `computeChunkTile()` on this path.

### Call sites (do not rebuild)

- `src/app/worldBundle.ts` `collectLandmarksNear()` — treasure ruins (`smallRuins`/`ruins`, radius 10), key hosts (`monolith`/`stoneCircle`/`smallRuins`/`ruins`/`cemetery`, radius 5), chronicle ruins (same ruins kinds, radius 10).
- `src/app/createApp.ts` — `buildLandmarkQuests` (`smallRuins`/`monolith`/`cemetery`/`shipwreck`/`tower`, radius 10) and RPG `OLD_PLACE_LANDMARK_KINDS` per settlement (radius 10).
- `src/quests/quests.ts` `buildLandmarkQuests` — injected resolver only.
- `WorldLocationCatalog` — cemetery only; already lightweight.

Fix the primitive first. Do not lazy-create quests in this plan. After the primitive is cheap, note remaining eager startup cost as a follow-up if it is still material.

`shipwreck` / `tower` still use full unloaded generation. They are out of scope here (different terrain inputs: continentalness, shoreline, footprints). Record them as a follow-up if they still hitch after this fix.

## Scope

1. Extract one shared classic-landmark resolver from `computeChunkEnvironment()`.
2. Have `computeChunkEnvironment()` consume it.
3. Have unloaded `resolveUnloadedLandmark()` consume it with the lightweight terrain view.
4. Keep cemetery and authored ruins paths unchanged.
5. Keep loaded `findLandmarkNear()` on `tile.environment`.
6. Keep `PERF:PROPS` hitch labels; production path for these three kinds must report `(unloaded, lightweight)` or `(loaded)` / `(miss)`, never `(unloaded, full)`.
7. Keep `paramsFor(coord, [])` river semantics (pre-existing unloaded/streamed discrepancy). Do not pull hydrology onto the lookup path.

## Determinism

For the same seed / config / chunk, do not change occurrence, position, id, scale, rotation, or variant.

Do not change salts, chances, margins, slope/road/water constants, `ringChunkOffsets()`, or rarity as a performance lever.

## Tests

Contract tests, not wall-clock timings:

1. `monolith` / `stoneCircle` / `smallRuins` shared resolver parity with `computeChunkEnvironment()` across many seeds and chunks.
2. Each kind must exercise a real hit and a real miss.
3. Compare full placement: `id`, `x`, `z`, `scale`, `rotationY`, `variant`.
4. Lightweight-sampler result equals full-tile-backed sampler result.
5. Query-order independence.
6. `resolveUnloadedLandmark()` for these three kinds must not call `computeChunkTile()`.
7. Loaded lookup still reads `tile.environment` (testable helper, no full Three.js `ChunkManager`).
8. Cemetery lightweight path without regression.
9. Authored `ruins` without regression; not merged with `smallRuins`.
10. `ringChunkOffsets()` semantics without regression.

If a parity test exposes a river / `paramsFor(coord, [])` difference, do not hide it. Document it and keep current unloaded semantics unless a small non-hydrology fix exists.

## Non-goals

- reducing search radius,
- increasing rarity,
- disabling quests,
- removing perf warnings or raising hitch thresholds,
- worker offload,
- global landmark registry,
- a cache whose only job is to hide the first lookup,
- unrelated terrain/world refactor,
- rebuilding cemetery or authored ruins,
- quest-lifecycle / lazy-quest redesign,
- extracting `shipwreck` / `tower` / `boat` / `wagon` / `oldTree` in this plan.

## Documentation / discoverability

JSDoc the shared resolver: ownership, determinism contract, difference from full chunk generation, parity with streamed environment generation. `@domain world-terrain`.

Update `docs/state/terrain-and-world-generation.md` so landmark lookup is no longer described as cemetery-only lightweight.

Do not run `pnpm docs:sync`.

## Verification

Automated:

```text
targeted Vitest tests
pnpm typecheck
lint (repo)
pnpm build
```

Manual — user, not AI:

1. new game,
2. startup / world initialization,
3. treasure / quest landmark resolution,
4. no multi-second `PERF:PROPS` hitches for `monolith` / `stoneCircle` / `smallRuins`,
5. benchmark / performance trace.

## Implementation status

Implemented as scoped: classic-landmark extraction only. Cemetery and authored `ruins` stay on their existing cheap paths. No worker, no registry, no radius/rarity change.

- `src/terrain/chunkEnvironment.ts`: monolith / stoneCircle / smallRuins RNG/gating/identity extracted verbatim into `resolveClassicLandmarkPlacement(kind, coord, params, terrain: LandmarkTerrainSampler)`. `computeChunkEnvironment()` consumes it with an apron-grid sampler. Independent RNG streams and call order unchanged.
- `src/terrain/chunkHeightmap.ts`: `createLocalTerrainSampler` now also exposes `mountainRidgeAt` / `moistureRegionAt` (already present on `ChunkTexel`). Cemetery still uses the two-field subset. `createWorldTerrainSampler` unchanged.
- `src/terrain/chunkManager.ts`: `resolveUnloadedLandmark` uses the shared resolver + local sampler for the three classic kinds. Loaded `findLandmarkNear` still reads `tile.environment` via `landmarkFromEnvironment`. Hitch labels emit `(unloaded, lightweight)` for cemetery / ruins / classic kinds; remaining kinds keep `(unloaded, full)`.
- River segments: unchanged `paramsFor(coord, [])` on the unloaded path. Documented on the resolver and `resolveUnloadedLandmark`.
- Tests: classic-kind hit+miss parity against `computeChunkEnvironment` (id/x/z/scale/rotationY/variant), lightweight vs full-tile sampler, query-order independence, no `computeChunkTile()` on classic/cemetery/ruins unloaded paths, authored ruins not merged with `smallRuins`, loaded-environment helper, `ringChunkOffsets` unchanged, local-sampler ridge/moisture parity.
- Automated: targeted Vitest, `pnpm type-check`, `pnpm run lint:fix`, `pnpm build`.
- Not done (user): browser verification of new-game startup, treasure/quest landmark resolution, and absence of multi-second `PERF:PROPS` hitches.

Follow-up, not in this plan: `buildLandmarkQuests` still resolves `shipwreck` / `tower` through the full unloaded fallback at radius 10. Eager radius-10 call-sites remain; they should now be cheap per chunk, but if startup is still dominated by many misses, that is a separate call-site plan.
