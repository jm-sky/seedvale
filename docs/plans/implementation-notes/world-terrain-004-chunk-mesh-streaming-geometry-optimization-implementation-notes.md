# Implementation Notes: Chunk mesh streaming geometry optimization

**Plan:** `world-terrain-004-chunk-mesh-streaming-geometry-optimization.md`
**Last reviewed:** 2026-09-02

## Current-code findings

- The plan's pipeline is accurate at a high level, but the current mesh build is not a standalone Three.js-only step. `ChunkManager.attachChunkMesh()` first applies all runtime `modifications`, then `buildAndAttachMesh()` calls `buildChunkGeometry()`, and only afterwards creates chunk water/river and marks the record `ready`. Keep those lifecycle boundaries unchanged.
- `buildChunkGeometry()` currently creates `THREE.PlaneGeometry`, rotates it, fills its position Y, then computes normals, vertex colors and `aBareGround`. The expensive loop is therefore data generation, not Three.js object creation alone.
- The worker already owns the canonical tile generation path: `chunkHeightmap.worker.ts` calls `computeChunkTile()`, vegetation/items/environment/crops are generated there, and the tile numeric grids are transferred to the main thread. `ChunkWorkerPool` has one shared priority queue/pool with tile priority over grass and cancellation-by-discard.
- `ChunkTileData` is apron-inclusive (`resolution + 2`). The render geometry is core-only. The apron is essential for seam-safe central-difference normals and must remain part of the mesh-data calculation.
- `floorHeights`, not `heights`, drives render Y/normals/seabed color. This distinction is already enforced by terrain modification code and tests.
- Terrain vertex color is not a simple lookup: it combines `biomeWeightsAt()`, `colorForTerrain()`, slope/mountain/ocean tint, deterministic `sandBandAt()`, micro tint, road tint and scorch. Preserve this exact ordering/semantics when moving it off-thread.

## Recommended worker boundary

Prefer extending the existing **tile job** so mesh-data is produced in the same worker invocation, before the tile arrays are transferred back. Do not send the already-transferred tile back from main to the worker just to build the mesh; that would create an unnecessary ownership/copy round-trip.

The worker-side sequence should conceptually be:

`computeChunkTile(params) → compute mesh data from tile + mesh-relevant runtime modifications → post tile + ChunkMeshData`

The main thread then only performs:

`ChunkMeshData → BufferAttributes/BufferGeometry → Mesh`

This avoids a second worker system and avoids transferring large tile grids twice.

Runtime modifications are currently applied on main because the resulting tile is also needed for sampling/collision/content. Do **not** mutate the worker result merely to build the mesh. Either:
- calculate the effective mesh sample values from the immutable tile + modifications in the worker, or
- use a worker-local modified copy if that is materially simpler and bounded.

The important ownership rule is that the main-thread `ChunkTileResult` must remain available for `sampleHeight`, water creation, grass requests and later terrain queries.

## Data-only extraction

The new worker-safe computation should produce only what the final terrain geometry needs, at minimum:

- core vertex positions/Y,
- core normals,
- core vertex colors,
- core `aBareGround`.

Use typed arrays directly. The current regular `PlaneGeometry` grid is deterministic, so there is no need to reproduce Three.js geometry construction in the worker.

Do not import Three.js into the worker. In particular, avoid mechanically moving `buildChunkGeometry.ts` there.

Some current color helpers depend on Three.js types/functions. If they block the move, extract small pure numeric/data-only helpers rather than introducing a broad terrain rendering abstraction. Keep the existing public behavior and tests around the original helpers where practical.

For normals, preserve the current apron-based central-difference calculation exactly. Do not replace it with `computeVertexNormals()` on the core geometry.

## Runtime modification semantics

This is the most important integration detail missing from a naive worker migration.

Current modifications include:
- radial `dig` / `scorch`,
- exact grid-aligned `prepare`,
- persistent caller-owned `config.modifications`.

They can affect both geometry and color/grass eligibility. The worker mesh result therefore needs the same modification inputs that currently affect `buildChunkGeometry()`.

Do not make the cache key depend only on seed/chunk coordinates while ignoring runtime modifications.

A useful split is:
- deterministic base mesh identity from terrain parameters + chunk coordinate,
- a separate deterministic revision/fingerprint for mesh-affecting runtime modifications.

Avoid serializing the whole modification array into every cache key if a cheap stable revision can be owned by `ChunkManager`. The revision must change whenever any mesh-affecting modification changes and must be included in worker request/cache identity.

Be careful with `prepare`: it writes exact sample values and `roadTint = 1` only at supplied grid points. Reimplementing it as a radial approximation would change the visual result.

## Main-thread finalization

Reuse the existing `finalizeQueue`. Do not add another mesh queue.

After the migration, the existing one-slot finalize budget should remain the guard around main-thread work. The mesh stage should become primarily geometry/object creation rather than terrain math.

Keep the existing order:
1. apply/resolve mesh-relevant runtime state,
2. create/attach terrain mesh,
3. create water,
4. create river,
5. mark chunk ready,
6. existing grass/content scheduling.

Do not accidentally move water/river/content generation into the mesh worker.

The existing `STREAMING` hitch marker currently wraps `buildAndAttachMesh()`; after the migration it should still measure the relevant main-thread mesh-finalization cost. Add a separate worker timing only if useful for diagnostics, rather than redefining the existing benchmark category.

## Transfer and allocation

Transfer every mesh-data ArrayBuffer that is no longer needed by the worker after `postMessage`. The existing tile arrays already demonstrate the intended ownership pattern.

On the main thread, construct typed-array views directly over received buffers and pass them to `THREE.BufferAttribute`. Do not copy into fresh arrays first.

The existing `PlaneGeometry` allocation should disappear from the hot path if the new data-only result contains all required core attributes. Keep Three.js creation explicit and simple.

Remember that geometry disposal is already owned by `ChunkRecord.meshDispose` / `unload()`; the new cache must not change that ownership.

## Cache

There is no obvious generic bounded/LRU cache abstraction in the terrain code to reuse. `riverTileCache` is domain-specific and reference-counted, so it should not be repurposed for mesh data.

Cache `ChunkMeshData`, never Three.js objects.

Because cache entries contain several large typed arrays, use an explicit byte/entry budget rather than an unbounded `Map`. Eviction should remove complete entries.

Prefer a deterministic key/fingerprint that includes:
- seed,
- chunk coordinate,
- resolution/chunk size,
- every terrain parameter that can affect mesh output,
- mesh-affecting runtime modification revision.

Also account for config values used by color generation, notably terrain/region parameters and water/height scale. Do not assume only heightmap parameters matter: vertex colors are part of the cached mesh result.

A cache hit must still create a fresh `BufferGeometry`/mesh because Three.js object lifecycle remains owned by the current `ChunkRecord`.

## Cancellation / stale results

`ChunkWorkerPool` cancellation currently discards late results rather than terminating workers. Preserve this behavior.

A mesh result must never be attached to a newer terrain state. Validate the request identity/revision at the same boundary where `ChunkManager` currently validates that the chunk still exists.

If a newer request for the same chunk supersedes an older mesh job, follow the existing namespaced-key cancellation semantics instead of adding a second cancellation mechanism.

## Testing focus

Add focused pure tests for the new data-only builder rather than browser tests. The most valuable assertions are:

- same input → byte/equivalent output,
- adjacent chunks still have seam-compatible normals/colors,
- output matches the pre-migration `buildChunkGeometry()` numerically for representative fixtures,
- `dig`, `scorch` and `prepare` produce the same effective mesh samples as the current implementation,
- transferred buffers have expected lengths/types.

Do not weaken existing `chunkHeightmap` / `chunkManager` modification tests to accommodate the migration.

## Important discrepancy with the plan

The plan says “`ChunkManager → existing worker → ChunkMeshData`” but the current worker protocol's tile request has no mesh-data phase and the tile result is transferred immediately after generation. The cleanest implementation is therefore to extend the **existing tile job/protocol** so one worker invocation returns both tile data and mesh data, rather than creating a separate mesh worker/job.

The plan also says cache invalidation should cover “relevant runtime terrain modifications”; in the current code those modifications are applied only after the worker returns. This must be explicitly resolved during implementation, otherwise the worker/cache path will either produce visually stale meshes or require an expensive tile round-trip.

## Useful existing symbols

- `buildChunkGeometry()` — current visual/data contract to preserve.
- `applyModificationToTile()` — authoritative runtime terrain modification semantics.
- `apronOriginWorld()`, `apronGridWeights()`, `sampleApronGridWeighted()` — existing apron/grid math.
- `colorForTerrain()`, `applySlopeRock()`, `applyMountainRock()`, `applyOceanDepthTint()`, `applyMicroTint()`, `applyRoadTint()`, `sandBandAt()` — current vertex-color pipeline.
- `ChunkWorkerPool.requestTile()` / tile protocol — existing worker boundary and cancellation.
- `ChunkManager.attachChunkMesh()`, `buildAndAttachMesh()`, `waitForFinalizeSlot()`, `runFinalize()` — lifecycle/finalization ownership.
- `ChunkManagerConfig.modifications` — caller-owned runtime terrain state; do not duplicate ownership.
- `ChunkRecord.meshDispose` / `unload()` — current Three.js geometry lifetime.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
