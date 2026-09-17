# Implementation notes — settlements-019 Settlement render submission budget

## Current architecture to preserve

The benchmark evidence is strong, but the current `settlement` scene bucket is too coarse to identify the real source of ~1900 settlement submissions. Do **not** start by changing rendering paths. First add a bounded settlement-specific census and use `settlement-heavy` to select the target.

Relevant existing seams:

- `src/perf/sceneCensus.ts`
  - `censusScene()` already traverses the scene once after benchmark collection and estimates meshes / draw calls / triangles.
  - `classifyObject()` collapses everything below the settlement root into one `settlement` bucket.
  - Reuse its counting conventions; do not create a live per-frame profiler.
- `src/perf/benchmark.ts`
  - calls `censusScene(host.isolation.scene)` after the measured run, outside the steady-state sample.
  - This is the correct lifecycle for a more detailed settlement census as well.
- `src/settlement/props.ts::buildSettlementProps()`
  - owns the settlement root (`group.name = 'settlement'`) and most placement/materialization paths.
  - already uses `buildInstancedProps()` for several repeated prop classes, including plaza cobbles and existing settlement prop batches.
- `src/render/instancedProps.ts::buildInstancedProps()`
  - generic repeated-prop path using shared geometry/material and deterministic placement data.
  - preserves `castShadow` / `receiveShadow`, supports keyed removal, LOD count changes and safe disposal of instance buffers.
- `src/settlement/houseBuilder.ts`
  - `instantiateStatics()` already batches repeated static parts inside a house.
  - `createHouseStaticBatch()` then ingests per-house static `InstancedMesh` content and merges identical geometry+material into settlement-owned buckets.
  - interactive doors remain outside the static batch by design.

Do not create another settlement renderer or another house batching layer before measuring what remains outside these paths.

## Diagnostic seam

Preferred shape: add a **benchmark-only settlement submission census** next to `sceneCensus.ts` (or as a small extension if it stays clean), invoked from `benchmark.ts` after the measured run.

The census should report at least:

- house static batch (`house-static-batch:*`),
- house interactive/dynamic meshes,
- settlement forest/living trees,
- already-instanced repeated props,
- fences / pasture / paddock / palisade content,
- storage / market / workplace props,
- torches / campfires / effects,
- landmarks / one-off structures,
- unclassified settlement remainder.

For every category report the same useful dimensions as `sceneCensus`: mesh count, instanced mesh count, rendered instances, estimated draw calls and triangles.

Classification should prefer stable ownership/name/userData already produced at creation time. If a high-volume path has no reliable identifier, add one small diagnostic name/userData tag at its creation seam rather than re-deriving meaning from geometry or world transforms.

Keep this census one-shot/post-run. No persistent traversal in `gameLoop`.

## Important finding: settlement trees are not equivalent to ordinary decorative props

`src/settlement/props.ts` defines `SettlementTreeLandmark` with a live `mesh` reference. `SettlementLandmarks.trees` explicitly documents that mesh as the live prop used for stump swaps.

`src/world/treeHarvest.ts::applyHarvestVisual()` mutates that contract directly:

```text
opts.landmark.mesh = applyTreeStageVisual(opts.landmark.mesh, stage)
```

`groundActions.ts` and NPC work paths also resolve settlement trees by stable `TreeId` through `landmarks.trees`.

Therefore:

- do not simply replace settlement living trees with `InstancedMesh` as the first optimization;
- first let the census prove whether they dominate submissions;
- if they are the dominant category, reuse the **chunk living-tree precedent** from archived plan 087 (`InstancedPropGroup.removeByKey(treeId)` + authoritative per-tree state), but treat that as the higher-complexity branch of this plan because the current settlement landmark contract exposes a live mesh;
- preserve `TreeId`, tree lifecycle, harvest/stump transitions and NPC/player work eligibility. Rendering must adapt to those systems, not become a second authority.

If another static category can remove hundreds of submissions without touching this contract, prefer that first.

## House batching guardrails

`createHouseStaticBatch()` already performs the intended settlement-wide merge:

- key is geometry UUID + material UUID(s),
- matrices are transformed into world space during `ingest()`,
- original per-house static `InstancedMesh` buffers are disposed,
- one settlement-owned `InstancedMesh` per bucket is created at `commit()`,
- doors/interactives stay separate.

Do not duplicate this with a generic `buildInstancedProps()` pass over completed house meshes. If the census says houses still dominate, first determine **which content is outside `staticGroup`** and why. Good candidates are static content that is currently classified as interactive/dynamic only for historical reasons; true doors, stateful storage visuals, lamps/lights and animated parts must remain separate.

Do not batch by reading final mesh transforms when source placement/assembly data already exists.

## Existing repeated-prop path

For ordinary static repeated props, prefer `buildInstancedProps()` rather than adding a new batch implementation. It already:

- flattens prepared templates once,
- shares geometry/material,
- creates one bucket per `(speciesIndex, primitiveIndex)`,
- preserves instance matrices and culling bounds,
- owns/disposes only the instance buffers,
- supports stable keyed removal when needed.

Use this only where all instances have compatible material/shadow semantics and no unique animation or mutable per-instance material state.

## Suggested implementation order

1. Add settlement-specific census + tests for classification/counting.
2. Run `settlement-heavy` manually (user) and capture the new category breakdown.
3. Choose **one** dominant batchable category or at most a tightly-related set sharing the same rendering seam.
4. Extend the existing assembly/placement path for that category.
5. Add focused tests proving:
   - renderable/draw-count reduction at assembly level,
   - transforms preserved,
   - interactive/stateful objects remain separate,
   - disposal does not free shared cached geometry/material.
6. Stop and benchmark before attempting a second category.

The plan's “1–3 categories” is a ceiling, not a requirement. One category removing hundreds of submissions is preferable to several speculative changes.

## Candidate priority after census

Use this ordering only after measured counts are available:

1. static repeated props/fences/decorations already represented by placement arrays,
2. static house content accidentally left outside settlement-wide `HouseStaticBatch`,
3. other repeated static landmarks/workplace/storage shells where interaction is anchored separately from the render mesh,
4. settlement living trees only if they are a dominant measured source and the simpler categories cannot deliver the required reduction.

Avoid batching torches/fire/light controllers, animated doors, stateful storage-stage meshes or unique interactive visuals unless their existing controller clearly separates state from the static render shell.

## Tests / verification contract

AI implementation checks:

- unit tests for the new census,
- existing `houseBuilder.test.ts` / relevant prop tests,
- focused tests for any new batching seam,
- type-check/lint/test/build,
- no browser verification.

User verification after each production optimization:

- `?benchmark=settlement-heavy`,
- compare detailed settlement census, total draw calls, `RENDER`, FPS avg and frame p95,
- visually inspect a large settlement,
- specifically exercise any category whose render path changed (doors/interactions, harvestable trees, storage stages, fences etc.).

## Success / stop rule

Keep production changes only when the detailed census identifies a large batchable source and the implementation removes a meaningful number of settlement submissions without widening ownership or breaking interactions.

If the detailed census shows that most of the ~1900 settlement submissions are genuinely dynamic/interactive content, stop after diagnostics and feed that evidence into a separate presentation/LOD decision rather than forcing unsafe instancing here.
