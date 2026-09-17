# Implementation notes — world-terrain-040 Vegetation render budget v2

## Status

Recon completed against current `main`. Implementation not started.

## Current architecture / confirmed facts

- `src/terrain/vegetationRegionBatcher.ts` is the single renderer-side aggregation mechanism for living trees, bushes, cacti, reeds, ferns, lilies, seaweed and selected environment props (`largeRock`, `rockCluster`, `fallenLog`).
- Regions are fixed **3×3 chunks** (`REGION_CHUNKS = 3`). Chunk remains the world ownership / streaming unit; region is rendering-only.
- Each `(region, kind)` owns one `InstancedPropGroup` rebuilt when member chunk contributions change.
- `syncLod(chunkCoord, fraction)` stores one scalar fraction per contributing chunk, and the region applies `maxFraction()` — nearest contributing chunk wins. This is deliberately conservative.
- `src/terrain/chunkManager.ts::syncInstancedLodForRecord()` currently computes one common fraction via:

```ts
const dist = chebyshevDistance(record.coord, playerChunk)
const frac = vegetationLodForDistance(dist)
vegetationRegionBatcher.syncLod(record.coord, frac)
```

- `vegetationLodForDistance()` delegates to `densityLodFraction(dist, config.loadRadius, lodScale)`. Therefore **all vegetation/environment kinds currently receive the same source LOD fraction** before region `max()` is applied.
- `InstancedPropGroup.setLodFraction()` narrows `InstancedMesh.count`; it does not rebuild buffers. This is the existing cheap LOD seam and should be reused.
- Reflection visibility already has a separate conservative per-region path (`syncReflectionVisibility` + `REFLECTION_DISTANT_LAYER`). Do not merge main-pass LOD and mirror visibility into one policy.
- Existing 3×3 region batching solved the old per-chunk submission problem. Do not introduce another batching layer or global vegetation megabatch.

## Performance evidence

From `2026-09-17--021--benchmark-settlement-heavy.md`:

- vegetation census: ~214 draws / ~760.9k triangles,
- `full`: ~46.5 ms,
- `hide-vegetation`: ~28.7 ms.

From `2026-09-17--022--benchmark-stream.md`:

- `full`: ~10.8 ms,
- `hide-vegetation`: ~6.8 ms.

These isolation deltas are upper bounds and overlap with shadows/post-processing. They justify recon, not a promised gain.

## Recommended implementation shape

### R1 — bounded per-kind vegetation census

Extend diagnostics rather than changing rendering first.

Preferred location:

- extend `src/perf/sceneCensus.ts` or add a small vegetation-specific helper beside it,
- consume existing object names emitted by `vegetationRegionBatcher` (`chunk-vegetation-region-...`, `chunk-environment-region-...`),
- if current names do not expose `kind`, add a stable `userData` diagnostic tag on the region group / instanced meshes at build time rather than parsing fragile table-key strings.

For each `VegetationKind`, report at least:

- active `InstancedMesh` count / estimated draw calls,
- active instance count (`mesh.count`),
- full capacity if cheap/available,
- triangles at active count,
- number of active region-kind groups,
- `castShadow` participation,
- applied LOD fraction.

Diagnostics must be sampled only for benchmark/report generation. Do not add a per-frame traversal in normal gameplay.

### R2 — expose current applied region/kind LOD cheaply

The batcher already owns the authoritative applied LOD state. Prefer exposing a **diagnostic snapshot method** from `VegetationRegionBatcher` rather than re-deriving it from scene transforms.

Example shape (exact naming flexible):

```ts
export type VegetationRegionDiagRow = {
  kind: VegetationKind
  regions: number
  sourceChunks: number
  activeInstances: number
  fullInstances: number
  appliedFractionMin: number
  appliedFractionMax: number
}

snapshotDiagnostics(): VegetationRegionDiagRow[]
```

This should read existing maps/buckets only when called by benchmark/report code.

Do not make diagnostic state a second source of truth.

### Gate A — choose exactly one production lever

After R1/R2 and one fresh `settlement-heavy` + `stream` benchmark, classify the dominant remaining cost:

1. excessive active instances / triangles for small vegetation,
2. conservative region `max()` keeping distant small vegetation dense,
3. shadow participation,
4. rebuild work during streaming,
5. something else.

Implement **one** lever only, then re-benchmark.

## Preferred production lever if census confirms triangle/instance pressure

### R3 — per-kind LOD policy inside existing region batcher

The strongest current architectural candidate is a per-kind multiplier/policy applied to the already-computed chunk fraction before region aggregation.

Do **not** change the public world-level `lodScale` meaning and do not create a second visibility system.

Preferred flow:

```text
chunkManager
  computes existing base vegetation fraction
        ↓
vegetationRegionBatcher.syncLod(chunkCoord, baseFraction)
        ↓
for each contributed kind:
  kindFraction = applyVegetationKindBudget(kind, baseFraction)
  store per chunk/kind
        ↓
region applies existing max(nearest-member-wins)
        ↓
InstancedPropGroup.setLodFraction(kindFraction)
```

This preserves all existing call sites and moves kind knowledge to the module that already owns kinds.

Start with conservative policy classes rather than ten unrelated magic constants:

- **structural / silhouette:** `tree-living`, `largeRock`, `fallenLog` → close to current fraction,
- **medium vegetation:** `bush`, `cactus`, `rockCluster` → moderately reduced at partial LOD,
- **small/detail:** `reed`, `fern`, `lily`, `seaweed` → more aggressive reduction once base fraction drops below 1.

Exact multipliers/curves must come from the benchmark census. Do not hard-code speculative values in the plan.

A pure helper in `vegetationRegionBatcher.ts` (or a tiny adjacent module if tests become cleaner) is preferred:

```ts
function vegetationKindLodFraction(kind: VegetationKind, baseFraction: number): number
```

Requirements:

- clamp `[0, 1]`,
- deterministic,
- no allocations,
- no distance calculation duplication,
- keep at least the existing `InstancedPropGroup` minimum-one-instance behavior for non-empty buckets unless visual verification proves a category may fully disappear.

### Why not change `REGION_CHUNKS`

Do not tune 3×3 → 2×2/4×4 as the first production change.

Changing region size simultaneously changes:

- draw submissions,
- frustum granularity,
- conservative nearest-member LOD behavior,
- rebuild size/frequency,
- reflection visibility granularity.

That makes causality poor and can trade one bottleneck for another. Only revisit region size if diagnostics show `max()` over-retention is dominant and per-kind policy cannot recover enough cost.

## Alternative lever if region conservatism dominates

If census proves a region is commonly held at fraction `1` by one near edge chunk while most instances lie far away, do not add per-instance distance checks.

Prefer a bounded improvement to existing region aggregation, e.g. a region-kind distance/fraction derived from already-known member chunk fractions with an explicit conservative rule. Any alternative to `max()` must preserve nearby vegetation and be unit-tested for region-edge transitions.

Do not iterate all placements/instances per frame.

## Alternative lever if rebuild work dominates `stream`

Only pursue this if fresh instrumentation shows rebuild CPU/hitches are material.

Current rebuild does:

- dispose previous `InstancedPropGroup`,
- concatenate member chunk placements,
- rebuild all `(species, primitive)` buckets,
- recompute bounding spheres.

Possible work must stay inside the existing rebuild-on-change contract. Do not introduce a new worker protocol or incremental GPU allocator unless the measured rebuild cost justifies a separate larger plan.

A cheap first diagnostic is counts + duration around `rebuild()` sampled only under perf diagnostics.

## Shadows interaction

`world-terrain-038` owns shadow content policy. Avoid duplicating shadow rules here.

If plan 038 already removes small/distant vegetation from shadow maps before this implementation lands, vegetation-040 should measure **main-pass** benefit separately and not add a second `castShadow` policy.

If 038 is not implemented yet and census says vegetation shadow cost dominates, record that dependency/result and defer the production fix to 038 rather than duplicating it here.

## Files expected to change

Likely:

- `src/terrain/vegetationRegionBatcher.ts`
- `src/terrain/vegetationRegionBatcher.test.ts`
- `src/perf/sceneCensus.ts` / `src/perf/sceneCensus.test.ts` or one small adjacent vegetation diagnostic module
- `src/perf/types.ts`
- `src/perf/report.ts` / tests if the new census becomes part of saved benchmark output

Only if required by the chosen lever:

- `src/terrain/chunkManager.ts` — preferably unchanged for per-kind policy; keep the existing `syncLod(record.coord, frac)` call contract.

Avoid unrelated changes to placement/worldgen, worker mesh generation or grass.

## Tests

Add unit coverage for:

- every `VegetationKind` maps to the expected policy class,
- fraction clamps and monotonicity,
- `baseFraction = 1` preserves full detail where intended,
- region nearest-member aggregation still behaves deterministically,
- diagnostic snapshot counts region/kind records correctly,
- `removeByKey` / rebuild preserves the active LOD policy after rebuild,
- reflection visibility semantics remain independent.

If `syncLod` internal storage becomes per-kind, explicitly test that one chunk contribution can produce different applied fractions for e.g. `tree-living` vs `fern` without changing chunk ownership.

## Technical verification

AI agent:

```text
pnpm test -- <focused vegetation/perf tests>
pnpm typecheck / project-equivalent type check
pnpm lint
pnpm build
```

Use repository-standard commands from `package.json`/`CLAUDE.md`; do not run browser verification.

User browser verification:

1. Run `?benchmark=settlement-heavy` before/after.
2. Run `?benchmark=stream` before/after.
3. Compare:
   - vegetation draws,
   - vegetation active instances/triangles per kind,
   - `RENDER`, FPS, frame p95,
   - region rebuild diagnostics if added.
4. Visually inspect while walking/turning across region boundaries:
   - near trees never thin unexpectedly,
   - bushes/reeds/ferns do not visibly pulse,
   - no 3×3 region-shaped popping,
   - reflection behavior unchanged.

## Success / stop gate

Keep a production LOD change only if it yields a repeatable render win and the visual transition remains acceptable.

Prefer a meaningful reduction in vegetation active instances/triangles with unchanged or lower draw submissions. If the only measurable gain requires obvious vegetation popping or extensive new architecture, stop and document the result.

## Explicit non-goals

- second/global vegetation batching system,
- changing world/chunk ownership,
- per-frame iteration over placements/instances,
- GPU-driven/indirect rendering,
- occlusion framework,
- settlement vegetation rewrite,
- grass filler optimization,
- shadow-policy duplication with world-terrain-038.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
