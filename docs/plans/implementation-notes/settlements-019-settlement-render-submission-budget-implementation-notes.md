# Implementation notes — settlements-019 Settlement render submission budget

## Current architecture to preserve

Aktualna decyzja dla tego planu jest dwuetapowa:

1. najpierw wykonać bezpieczny, statycznie uzasadniony batching **wells + gardens/crops**,
2. dopiero po benchmarku użytkownika dodać szczegółowy census pozostałych main-pass sources, jeśli settlement nadal jest istotnym kosztem.

Nie rozszerzać pierwszego etapu na trees, storage goods, torches/campfires ani houses.

Relevant existing seams:

- `src/settlement/props.ts::buildSettlementProps()`
  - owns the settlement root (`group.name = 'settlement'`) and most placement/materialization paths.
  - already uses `buildInstancedProps()` for several repeated prop classes.
- `src/render/instancedProps.ts::buildInstancedProps()`
  - generic repeated-prop path using shared geometry/material and deterministic placement data.
  - flattens a prepared template once, creates one `InstancedMesh` per primitive/species bucket, preserves `castShadow` / `receiveShadow`, and owns only instance buffers.
- `src/settlement/houseBuilder.ts`
  - house statics are already settlement-wide batchable through `createHouseStaticBatch()`; do not duplicate this path.
- `src/settlement/settlementStructures.ts::layoutCropsGarden()`
  - currently clones the complete prepared crops template once per bed.
- current wells in `props.ts`
  - one prepared `wellTemplate`, then `clone(true)` for central / household / pasture placement.

## Stage 1 target A — wells

Known facts from current code and the completed `world-terrain-038` recon:

- `well.glb` has 5 render primitives.
- Central, household and pasture wells reuse one template but are materialized as individual `clone(true)` object trees.
- Household wells intentionally have no shadow casting after `world-terrain-038`; central/pasture wells still cast.
- Interaction/collider/queue state is conceptually separate from rendering, but the current code still passes `well.prop` into `buildWellInteractionQueueConfig()`.

Implementation direction:

- represent settlement well render placement as data, not one live render clone per well;
- reuse `buildInstancedProps()` if its existing placement contract is sufficient;
- if shadow policy requires it, use separate instanced groups for:
  - central/pasture (casting),
  - household (non-casting);
- preserve exact ground placement, yaw, scale and asset-template transform;
- preserve stable gameplay landmark positions, queue IDs, colliders and drink interaction.

Before removing the individual render clone, inspect the exact `buildWellInteractionQueueConfig()` contract. If it uses the object only to derive footprint/transform, replace that dependency with explicit world data rather than keeping a fake invisible render object. Do not move gameplay authority into `InstancedMesh`.

## Stage 1 target B — gardens / crops beds

Known facts:

- `crops.glb` is prepared once.
- `layoutCropsGarden(template, beds)` currently does `template.clone(true)` per bed.
- The template has 6 render primitives.
- `disableGardenPlantCastShadow()` mutates the prepared template once: plant meshes do not cast; Dirt stays as the caster.
- cultivation anchors are separate gameplay data.

Implementation direction:

- replace clone-per-bed materialization with placement data feeding the same instanced-prop seam;
- preserve exact spacing from `GARDEN_BED_W` / `GARDEN_BED_GAP`;
- preserve the parent garden/world rotation, scale and ground placement;
- preserve primitive-level shadow flags inherited from the prepared template;
- do not change cultivation anchors or settlement layout semantics.

If local bed offsets cannot be expressed without reconstructing transforms incorrectly, prefer a small general extension of `PropPlacement` / `buildInstancedProps()` over adding a garden-specific renderer. The extension must remain generic and create-time only.

## Shared batching guardrails

Do not introduce `InstancedWellsManager`, `InstancedGardensManager` or a second settlement renderer.

Prefer one of:

- direct reuse of `buildInstancedProps()`,
- a minimal generic extension to that seam if required by local placement/shadow semantics.

Keep:

- settlement ownership and unload lifecycle,
- shared cached geometry/material ownership,
- disposal limited to instance buffers,
- no per-frame traversal or transform synchronization,
- no reconstruction from already-created clones when source placement data is available.

Add JSDoc to any important new generic assembly/batching function; use `@domain settlements` where it improves preflight discovery.

## Explicitly out of Stage 1

### Settlement trees

`SettlementTreeLandmark` exposes a live `mesh` reference and `treeHarvest.ts` swaps that visual during lifecycle transitions. Do not touch in this stage.

### Food storage representatives

`storageVisuals.ts` has dynamic per-kind pools and visibility driven by inventory state. It may be expensive, but it needs evidence and a separate design after the first benchmark.

### Torches / campfires

They include light/VFX/controller state. Not part of static landmark batching.

### Already-batched categories

Do not spend time on:

- house statics,
- fences/palisades,
- barrels,
- troughs,
- hay,
- settlement bushes,
- plaza cobbles.

These already use instancing/static batching seams.

## Stage 1 implementation order

1. Trace all well creation call sites and `well.prop` consumers.
2. Convert wells to settlement-owned instanced rendering while preserving gameplay contracts.
3. Convert crops bed clones to settlement-owned instanced rendering.
4. Add focused tests:
   - expected number of InstancedMesh buckets for repeated placements,
   - transforms/spacing preserved,
   - household well shadow semantics differ correctly from central/pasture,
   - cultivation anchors unchanged,
   - well interaction/queue config no longer depends on a unique render clone if that refactor is needed,
   - disposal does not dispose shared geometry/material.
5. Run relevant automated checks: focused tests, type-check, lint, test/build as appropriate.
6. Stop. Do not implement diagnostics or another category in the same pass.
7. User performs browser benchmark/manual verification.

## Stage 2 — diagnostics only after user benchmark

If the post-Stage-1 benchmark still shows a material settlement main-pass cost, add a benchmark-only settlement submission census next to `sceneCensus.ts`, invoked after measured collection from `benchmark.ts`.

Reuse existing counting semantics and current settlement classification tags. Keep it one-shot/post-run, never per-frame.

The census should distinguish enough categories to choose the next target, especially:

- house static vs interactive,
- living trees/decor,
- storage goods,
- remaining landmarks/workplaces,
- torches/fire/effects,
- unclassified remainder.

Only after measured counts should the plan consider another production category.

## Tests / verification contract

AI agent for Stage 1:

- focused unit/assembly tests for wells and gardens,
- existing relevant settlement/render tests,
- type-check/lint/test/build,
- no browser verification.

User after Stage 1:

- run `?benchmark=settlement-heavy`,
- compare total draw calls, settlement census, `RENDER`, FPS avg and frame p95,
- inspect central/household/pasture wells,
- verify drink/queue interaction,
- inspect S/M/L gardens and cultivation interactions.

## Success / stop rule

Stage 1 succeeds when wells and crops beds no longer materialize one full render object tree per repeated placement, while gameplay contracts and visuals remain equivalent.

After that, stop production work. Continue with diagnostic Stage 2 only if the user's benchmark shows settlement main-pass cost remains worth pursuing.
