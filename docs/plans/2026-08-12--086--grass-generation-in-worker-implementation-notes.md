# Implementation Notes: Grass Generation in Worker

**Plan:** [2026-08-12--086--grass-generation-in-worker.md](./2026-08-12--086--grass-generation-in-worker.md)

## Status (2026-08-13)

**Implemented + technically verified** (`tsc`/`lint`/`test`/`build` green after every phase):

- **Phase 1** — `src/terrain/grassPlacement.ts`: pure `computeChunkGrass(params, grids)` extracted from `grass.ts`'s old `createChunkGrass`, byte-for-byte identical generation logic. `grass.ts` is now presentation-only: `buildGrassChunkMeshes(data, x, z)` turns a `GrassChunkData` into `InstancedMesh`es; `createChunkGrass` is a thin sync wrapper (`computeChunkGrass` + `buildGrassChunkMeshes`) kept for compatibility. `grassPlacement.test.ts` has a golden/determinism test suite (`toMatchSnapshot` per chunk + a byte-identical-output test) that must stay green through every later phase — it's the mechanical proof phases 2-4 didn't change what gets generated.
- **Phase 2** — `InstanceBucket` in `grassPlacement.ts` now starts at `max(1024, candidatesPerChunk * 0.15)` and grows ×1.7 on overflow instead of pre-allocating every bucket to the full candidate count (was ~25 MB transient allocation/chunk). Golden test stayed green — confirms the buffer-layout change didn't alter output.
- **Phase 3** — `chunkHeightmapProtocol.ts`'s request/response types are now a `kind: 'tile' | 'grass'` union. `chunkHeightmap.worker.ts` dispatches on `kind`; grass requests carry the tile grids as **copies** (no transfer — main thread keeps its own `tile.heights` etc. for `sampleHeight`/dig overlays) and the response transfers each bucket's typed arrays back zero-copy. `chunkWorkerPool.ts` now has two priority queues (`queueTile` always drained before `queueGrass`) with namespaced cancel keys (`tile:`/`grass:`) so cancelling one kind never clobbers the other, plus `MAX_INFLIGHT_GRASS = max(1, size - 1)` so grass work can never fully starve tile generation. New pool methods: `requestChunkGrass`/`cancelChunkGrass`.
- **Phase 4** — `chunkManager.ts`: `ChunkRecord.grassPending` tracks an in-flight request. `ensureGrass` now calls `requestChunkGrass` instead of building meshes inline; on resolution it re-fetches the record by key (handles unload-while-generating) and re-checks distance against the **current** player position (handles the player having moved back out of `grassUnloadRadius` before the result arrived) before calling `buildGrassChunkMeshes`. `removeGrass` cancels a pending request via `cancelChunkGrass` in addition to disposing a built mesh. `syncGrassForRecord`'s LOD math is unchanged, factored into `grassLodForDistance` (shared by the sync in-range path and the async completion callback).

Worker bundle grew from ~21 KB to ~61 KB (`dist/assets/chunkHeightmap.worker-*.js`) — expected per the plan (§1: pulling `THREE.Matrix4`/`Quaternion`/`Vector3` + `simplex-noise`'s `createNoise2D` into the worker for grass placement).

## Phase 0 / Phase 5 — perf measurement (2026-08-13, user on live dev server)

`Simulate (ms)` baseline while walking is **~3-5 ms** (debug GUI, `?debug=1` → Performance folder). No grass-correlated spike observed while crossing chunk/grass boundaries — consistent with the goal (grass placement no longer runs synchronously on the main thread). No pre-086 "before" number was captured in this session (086 was implemented and measured in the same sitting), so this isn't a rigorous before/after diff, but a healthy steady-state baseline with no spike at grass boundaries is the expected outcome.

A separate ~89 ms spike was observed, tied to a settlement streaming into view rather than grass — traced to synchronous settlement prop building (`buildSettlementProps`, `props.ts`) and filed as [issue 027](../issues/2026-08-13--027--settlement-streaming-main-thread-freeze.md); out of scope for this plan (and also outside plan 087's declared scope — see that issue for detail).

## Browser/visual verification

- ✅ **Grass appears/disappears correctly** crossing the load/unload boundary repeatedly (confirmed by user) — exercises the `grassPending` cancel-on-unload path that has no automated coverage.
- Not explicitly re-confirmed: same-seed layout pixel-identity (positions/colors/density/LOD) and whether the round-trip delay (§3.4 of the plan) is visually noticeable while running. Worth a quick look if anything about grass appearance looks off, but not blocking given the golden test covers the data half and the boundary-crossing behavior above is already confirmed.

## Remaining (not blocking; deferred)

- **Phase 6 (Should)** — integration test comparing `computeChunkGrass` called directly vs. through the worker path (Vitest, no real `Worker`).
- **Phase 7 (Nice to have)** — raising `grass.radius` now that headroom exists; explicitly out of scope for this plan.
