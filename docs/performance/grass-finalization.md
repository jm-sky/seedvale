# Grass finalization — optimization status

**Updated:** 2026-09-14  
**Status:** closed / successful  
**Scope:** main-thread finalization of worker-generated grass chunks

## Result

The September 14 investigation confirmed that the recurring `grass generation` hitch was dominated by main-thread `THREE.InstancedMesh.computeBoundingSphere()` calls, especially for the dense near-field `filler` bucket.

The fix in commit `8f9b7482` keeps placement in the existing worker pipeline and extends `GrassBucketData` with conservative data-only bounds collected during the existing placement loop. `buildGrassChunkMeshes()` now assigns a ready `THREE.Sphere` on the main thread instead of rescanning every instance.

This preserves the graphics G17 ownership rule: workers produce data; Three.js objects and scene attachment remain on the main thread.

## Verified browser improvement

| Metric | Before | After |
|---|---:|---:|
| `buildGrassChunkMeshes()` avg | 14.96 ms | **4.51 ms** |
| `buildGrassChunkMeshes()` max | 33.30 ms | **9.80 ms** |
| bounds/finalize avg | 10.12 ms | **0.03 ms** |
| bounds/finalize max | 23.00 ms | **0.20 ms** |
| callback total avg | ~15 ms for non-empty builds | **4.91 ms** |
| callback total max | ~36 ms | **10.70 ms** |

Post-fix `grass generation` hitches in the 30 s stream benchmark were only `n=3`, avg **9.2 ms**, max **9.8 ms**.

Benchmark evidence: [`results/2026-09-14--018--benchmark-stream-grass-fixed.md`](./results/2026-09-14--018--benchmark-stream-grass-fixed.md).

## Decision

The optimization is considered successful and the grass-finalization investigation is closed.

Remaining finalization cost is mostly Three.js allocation/setup (`4.43 ms` avg, `9.60 ms` max in the verification run). Do **not** introduce incremental grass finalization, a new scheduler/finalization manager, or buffer pooling by default. Reopen this area only if a fresh benchmark shows grass streaming as a material bottleneck again.

The next performance work should follow current measurements rather than continue optimizing grass; the same verification run contained a much larger unattributed frame spike (`191 ms` frame max vs `9.8 ms` largest labelled hitch).
