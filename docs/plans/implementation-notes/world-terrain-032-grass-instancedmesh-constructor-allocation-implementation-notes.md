# Implementation notes: world-terrain-032 grass InstancedMesh constructor allocation

## Verified current path

Main target: `src/terrain/grass.ts`, `buildGrassChunkMeshes()`.

For each grass bucket the current order is:

```text
worker-owned GrassBucketData
→ four InstancedBufferAttribute wrappers for phase/colors/wind
→ buildTierGeometry('near')
→ new THREE.InstancedMesh(geometry, material, bucket.count)
→ replace mesh.instanceMatrix with bucket.matrices
→ assign worker-computed boundingSphere
→ apply filler count / LOD later
```

`GrassBucketData` is defined in `src/terrain/grassPlacement.ts` and already contains the canonical `Float32Array` matrices plus phase/color/wind arrays. Do not regenerate or copy them on the main thread.

## Important Three.js r185 behavior

Seedvale currently depends on `three ^0.185.1`.

`InstancedMesh` r185 constructor does this internally:

```ts
this.instanceMatrix = new InstancedBufferAttribute(
  new Float32Array(count * 16),
  16,
)

for (let i = 0; i < count; i++) {
  this.setMatrixAt(i, identity)
}

this.count = count
```

Seedvale then immediately executes:

```ts
mesh.instanceMatrix = new THREE.InstancedBufferAttribute(bucket.matrices, 16)
```

So the constructor-owned float buffer and its identity initialization are dead work.

The dense filler bucket makes this disproportionately expensive: benchmark 018 observed up to ~184k filler instances in one bucket. A constructor buffer of that size is ~11.8 MB (`184000 * 16 * 4`) before the worker buffer is attached.

## Preferred implementation

Use the smallest possible local change in `buildGrassChunkMeshes()`:

```ts
const mesh = new THREE.InstancedMesh(geometryForTier('near'), material, 0)
mesh.instanceMatrix = new THREE.InstancedBufferAttribute(bucket.matrices, 16)
mesh.instanceMatrix.needsUpdate = true
mesh.count = bucket.count
```

Then leave the rest of the existing setup unchanged.

Why `0`:

- constructor allocates only an empty matrix array,
- constructor identity loop has zero iterations,
- Three.js object type/lifecycle remains a normal `InstancedMesh`,
- no subclass/fork/custom renderer is required,
- final public `count` and `instanceMatrix` still match the canonical bucket.

Do not use `1` as a workaround unless a real r185/WebGL constraint requires it; that would still be harmless but is unnecessary dead initialization.

## Filler semantics

Current code later does:

```ts
if (isFiller) mesh.count = 0
```

Preserve this exactly. The intended sequence is therefore:

```text
constructor count 0
→ attach canonical matrix attribute
→ set count = bucket.count
→ assign bounds
→ filler only: set count = 0
```

`fullCount` continues to store `bucket.count`, so `setLodFraction()` can restore the appropriate filler draw count later.

## Ownership / disposal

No ownership change:

- worker-generated typed arrays become backing arrays of Three.js attributes,
- `WorldGrassChunk.dispose()` still disposes built geometries and calls `sub.mesh.dispose()`,
- the empty constructor-created attribute is never rendered/uploaded because it is replaced before scene attachment,
- do not add explicit disposal for that temporary zero-length attribute.

## Geometry is not the target

`buildTierGeometry()` currently creates a per-chunk `BufferGeometry` and clones the small template `position` and `index`. This is intentionally out of scope for this plan.

Likewise, the four per-instance attributes (`aPhase`, `aBaseColor`, `aTipColor`, `aWindFactor`) already wrap worker arrays without copying them. Do not introduce pooling or shared mutable attributes across chunks.

## Existing diagnostics

`src/perf/grassFinalizationDiag.ts` already separates:

- `allocation/setup`,
- `instanceMatrix bind`,
- `bounds/finalize`,
- LOD apply,
- scene attach.

No new profiler is needed. The expected win should appear primarily in `allocation/setup`, because the expensive constructor work currently occurs before `tAlloc1`.

## Relevant evidence

`docs/performance/grass-finalization.md` records the post-bounds-fix baseline:

- build avg 4.51 ms,
- build max 9.80 ms,
- allocation/setup avg 4.43 ms,
- allocation/setup max 9.60 ms,
- bounds avg 0.03 ms.

Benchmark: `docs/performance/results/2026-09-14--018--benchmark-stream-grass-fixed.md`.

The performance document previously closed the investigation because bounds had been fixed and warned against broader mechanisms such as incremental finalization or pooling. This plan deliberately stays inside that constraint: one local removal of proven dead Three.js constructor work, then stop and benchmark.

## Tests

Look first for existing grass system tests before creating a new file. The useful contract assertions are:

- non-filler mesh ultimately exposes the same instance count as the bucket,
- `instanceMatrix.array` is the exact `bucket.matrices` object,
- filler starts at `count === 0` but `setLodFraction(..., fillerFraction)` restores a count derived from `fullCount`,
- `setGeometryLod()` still swaps geometry without replacing the shared instance attributes,
- build with zero total instances still returns `null`.

Avoid asserting private Three.js constructor internals in Seedvale tests.

## Verification order

1. Implement only the constructor-count/attachment change.
2. Run focused grass tests.
3. Run `pnpm type-check`.
4. Run `pnpm build`.
5. Do not perform browser verification; user runs the deterministic stream benchmark.
6. Compare `allocation/setup`, `build total`, callback max and grass hitch count/max with benchmark 018.

If this does not produce a material reduction, do not continue into pooling, incremental finalization or geometry reuse in the same task.

## Result

Implemented exactly as described above: `buildGrassChunkMeshes()` in `src/terrain/grass.ts` now constructs `new THREE.InstancedMesh(geometryForTier('near'), material, 0)`, binds `bucket.matrices` as `instanceMatrix`, then sets `mesh.count = bucket.count` before the existing filler/bounds handling. No changes to `GrassBucketData`, worker pipeline, LOD, density, or shaders.

Extended `src/terrain/grassBounds.test.ts` (existing grass-system test file, no new file created) with two focused cases:

- non-filler bucket: `mesh.count === bucket.count`, `mesh.instanceMatrix.array === bucket.matrices` (no copy), count survives `setGeometryLod`,
- filler bucket: `mesh.count === 0` right after build, `fullCount` equals the bucket count, `setLodFraction(1, fillerFraction)` restores/zeroes the filler draw count.

Verification: `pnpm vitest run src/terrain/grassBounds.test.ts` (7/7 pass), `pnpm type-check` (clean), `pnpm build` (succeeds). Browser/manual `?benchmark=stream` verification left to the user per the plan.
