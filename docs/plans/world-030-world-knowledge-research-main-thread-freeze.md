# Plan: World-knowledge research main-thread freeze

**Created:** 2026-09-16
**Status:** `verification needed` 🔍
**Type:** fix
**Priority:** high · **Effort:** L
**Depends on:** ~~quests-progression-047~~ ~~world-028~~
**Domain:** `world`
**Subdomains:** `places`
**Tags:** `world-knowledge` `landmarks` `performance` `worker`
**Roadmap:** -
**Model:** Grok, Sonnet

## Problem

Plan `quests-progression-047` deferred landmark lookup to a background worker job. Accepting Anna Kowalska's `slad-przy-monolicie` still froze the main thread for ~30 seconds.

The quest lifecycle is already fire-and-forget. The stall is **request preparation** before `postMessage`:

```text
Accept
→ QuestManager.request_world_knowledge
→ WorldKnowledgeResearch.dispatch
→ host.buildParams()          ← MAIN THREAD, synchronous
→ ChunkManager.buildWorldKnowledgeWorkerParams
    → collectSettlementRefsNear (radius covering the whole scan ring)
    → settlementDefFor × ~361 cells
    → villageSegmentsNear / segmentsNear with an oversized AABB
→ requestChunkWorldKnowledge
→ worker scanWorldKnowledge
```

For `landmarkKinds: ['monolith']` the cemetery gather is unused. Origin-centered corridor arrays are also not equivalent to unloaded `paramsFor(coord, [])`, which gathers per chunk.

This is a new plan. Do not retroactively expand `quests-progression-047`.

## Goal

Starting world-knowledge research must be cheap on the main thread. Heavy deterministic reconstruction belongs in the existing `worldKnowledge` worker job.

```text
MAIN THREAD: clone seed/config/query → postMessage → return
WORKER: epoch/cache guard → per-chunk corridors → resolveUnloadedLandmark
```

Same seed + terrain config + origin + radius + landmark kinds must still resolve the same `id/x/z`.

## Recon (current code)

- [`src/world/locations/worldKnowledgeResearch.ts`](../../src/world/locations/worldKnowledgeResearch.ts) — `buildParams` runs before enqueue.
- [`src/terrain/chunkManager.ts`](../../src/terrain/chunkManager.ts) `buildWorldKnowledgeWorkerParams` — always gathers cemetery + roads for the whole ring.
- [`src/terrain/worldKnowledgeScan.ts`](../../src/terrain/worldKnowledgeScan.ts) — worker already walks `ringChunkOffsets` and calls `resolveUnloadedLandmark`.
- Classic resolver ([`resolveClassicLandmarkPlacement`](../../src/terrain/chunkEnvironment.ts)) needs `createLocalTerrainSampler` `roadTint` from corridor arrays, not a live `findLandmarkNear`.
- [`src/settlement/roadNetwork.ts`](../../src/settlement/roadNetwork.ts) owns `segmentsNear` / `villageSegmentsNear` and a module-level IndexedDB adapter. Worker must not activate or invalidate that adapter.
- [`src/settlement/settlementTerrain.ts`](../../src/settlement/settlementTerrain.ts) and [`src/terrain/naturalResources.ts`](../../src/terrain/naturalResources.ts) VALUE-import `MathUtils` from Three.js.
- Worker pool survives `WorldBundle` rebuild; `disposeChunkWorkerPool` is app teardown only. Worker-side settlement/road caches must reset on seed/epoch change.
- [`src/quests/worldKnowledgeResolver.ts`](../../src/quests/worldKnowledgeResolver.ts) `poseFor()` can still call `findLandmarkNear` from synchronous `describe()`.

## Scope

1. Cheap O(1) `WorldKnowledgeWorkerParams` (config + query + `localSearchRadius` + `homeChunks` + optional authored ruins). No settlement/road gather on main.
2. Worker reconstructs per-chunk corridors with existing `segmentsNear` / `villageSegmentsNear` / `settlementDefFor`, matching unloaded `paramsFor(coord, [])` (`riverSegments: []`).
3. Kind-branch in the worker: classic skips cemetery gather; cemetery adds local cemetery inputs; authored `ruins` only needs the site blob.
4. Keep IndexedDB road-route persistence on the main thread. Worker uses in-memory caches only.
5. Replace Three.js `MathUtils` on the settlement-generation import graph so the worker does not pull `three`.
6. Remove `findLandmarkNear` from `describe()` / `poseFor()`.
7. Small PERF labels: `worldKnowledge:prepare` (main hitch) plus queue/worker/total timings.

## Determinism

Do not change landmark salts, chances, ring order, search radius, terrain gates, or identity.

Keep unloaded hydrology skip (`riverSegments: []`).

## Non-goals

`setTimeout` / microtask, hitch-threshold changes, smaller radius, rarity changes, first-hit cache, eager targets, a separate monolith worker, copying `ChunkManager`, `shipwreck`/`tower` full environment, scheduler changes.

## Tests

Contract tests, not wall-clock timings. See implementation notes.

## Verification

Automated: targeted Vitest, `pnpm type-check`, lint, `pnpm build`.

Manual — user, not AI:

```text
New Game → Anna Kowalska → „Ślad przy monolicie” → Przyjmij
```

No noticeable freeze; dialogue returns immediately; research continues in the worker; after the authored world-hour delay Anna gives the correct route.

## Implementation status

Implemented as scoped: cheap main-thread snapshot + worker per-chunk corridor reconstruction.

- `WorldKnowledgeTerrainSnapshot` is config/query only; cemetery/road arrays are gone.
- `ChunkManager.buildWorldKnowledgeWorkerParams` clones terrain config; authored ruins blob only when `ruins` is requested.
- `scanWorldKnowledge` reconstructs `paramsFor(coord, [])`-equivalent corridors in the worker, cemetery gather only for cemetery queries.
- IndexedDB road-route persistence is attached from `worldBundle.ts`; the worker uses in-memory caches and resets them on epoch change.
- `describe()` / `poseFor()` never call `findLandmarkNear`.
- PERF: `worldKnowledge:prepare` via `recordHitch`; queue/worker/total as debug console lines when the monitor is enabled.

## Documentation

JSDoc public scan/request helpers with `@domain world-terrain`. Update world-locations current-state docs. Do not run `pnpm docs:sync`.
