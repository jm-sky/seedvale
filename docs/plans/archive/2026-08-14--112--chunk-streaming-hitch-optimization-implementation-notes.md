# Plan 112 — implementation notes

**Date:** 2026-08-14  
**Plan:** [2026-08-14--112--chunk-streaming-hitch-optimization.md](./2026-08-14--112--chunk-streaming-hitch-optimization.md)

## Code trace (confirmed)

`ChunkManager.update()` → `drainLoadQueue()` starts at most `CHUNKS_STARTED_PER_FRAME = 2` workers. `requestChunkTile()` completions used to run `buildAndAttachMesh()` + `scene.add()` in the promise continuation, so several ready tiles could finalize in one frame. That start cap did **not** limit the finalization stage.

## What landed

- Worker result stores the tile and waits on a small `finalizeQueue`.
- `update()` drains **1 × `buildAndAttachMesh()` per frame**, nearest-first (`pickNearestQueuedKey`), skipping stale/unloaded keys.
- `loadQueue` / start cap / cancellation / unload guards are unchanged.
- Digs are applied at finalize time (not enqueue) so a modification while queued still reaches the mesh.
- `waitForChunks` still waits for mesh attach. At init/rebuild (no game loop) it flushes the queue after ~48 ms idle so it cannot deadlock.

`modifyTerrain` / `levelTerrain` still rebuild ready meshes immediately (player action, not streaming).

## Not done

Browser `?benchmark=stream` vs review 012. Technical checks (`tsc`, lint, unit tests, `vite build`) are the verification in this session — do not treat that as hitch proof.

## Report

| | |
|---|---|
| **Źródło hitcha** | `requestChunkTile` continuation → `buildAndAttachMesh()` / `scene.add()`, not worker generation. |
| **Potwierdzenie** | `CHUNKS_STARTED_PER_FRAME` only caps starts; many completions could still attach in one frame. |
| **Rozwiązanie** | Existing `update()` + nearest-first ready-tile queue + 1 finalize/frame. |
| **Before → After** | hitch count 48 / avg 29.9 ms / max 53.6 ms → **pending** `?benchmark=stream` (same seed 42, Insane 193, load 3, High). |
| **Streaming latency** | Pending browser check. One extra frame per ready chunk by design. |
| **Kompromis** | Init/`waitForChunks` without a running game loop still flushes all ready meshes (same burst as before, behind loading). |
| **Follow-up** | A single Insane-193 `buildAndAttachMesh` can still be ~30 ms. Do not expand this plan; that is a separate geometry/upload bottleneck. |
