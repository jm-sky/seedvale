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

## Stage 1 — implemented (2026-09-18)

Both targets done in `src/settlement/props.ts` (`buildSettlementProps`), reusing `buildInstancedProps()` directly — no new manager/renderer added.

### Wells

- `wellTemplate` is now flattened into instanced buckets instead of `clone(true)`-ed per well. A one-time `wellTemplateNoShadow = disableCastShadow(wellTemplate.clone(true))` gives household wells their own flatten-cache root (`flattenPropTemplate` in `render/instancedProps.ts` caches by root object identity, so two shadow policies need two distinct roots even though geometry/material stay shared).
- Three separate `buildInstancedProps()` calls/groups (not one merged bucket): `settlement-well-central` (shadow-casting), `settlement-well-household` (no-shadow), `settlement-well-pasture` (shadow-casting) — kept distinct rather than merging central+pasture so the existing `landmarkWellCentral` / `landmarkWellHousehold` / `landmarkWellPasture` census kinds (`perf/sceneCensus.ts`) stay exactly as before; each group's root is tagged via the existing `tagSettlementShadowKind()`.
- New pure helper `settlementStructures.ts::wellPropPlacement(x, z, groundY, key?)` builds the `PropPlacement` (fixed `rotationY: 0`, `scale: 1` — wells are never rotated/rescaled individually, only `placeOnGround`-translated).
- **Interaction queue decoupled from the render clone**: `buildWellInteractionQueueConfig()` (`wellInteractionQueue.ts`) was *not* changed — its `settlement:well` anchor is `space: 'assetLocal'` (`assets/assetAnchorData.ts`), so it only ever reads the passed root's own `matrixWorld`, never traverses into child meshes. `SettlementWellLandmark.prop` / `landmarks.wellProp` are now `wellTemplate.clone(false)` (shallow — copies only position/quaternion/scale, zero children/meshes) + `placeOnGround()`, instead of the old full render clone. Verified this produces an identical anchor to the old full-mesh clone (`wellInteractionQueue.test.ts`'s new "bare Object3D" test). This object is never added to `group`/the scene — it exists purely as a transform carrier for the queue anchor math, so gameplay never depends on the `InstancedMesh` batch.
- Colliders/positions/queue IDs were already reading `well.position`/`well.queueId` everywhere (`createSettlement.ts`, `interactables.ts`, `placementActions.ts`, `NpcAgent.ts`) — none of those needed changes.

### Gardens / crops

- `layoutCropsGarden()` (clone-per-bed) removed from `settlementStructures.ts` — it had exactly one call site. Replaced by `cropsBedPlacements(gardenX, gardenZ, groundY, beds, keyPrefix?)`, a pure function reproducing the same spacing math (`GARDEN_BED_W`/`GARDEN_BED_GAP`), returning `PropPlacement[]` instead of a cloned `THREE.Group`.
- `props.ts` collects every garden's bed placements into one array across the whole settlement and calls `buildInstancedProps()` once (`settlement-garden-crops`) — so total draws for crop beds are fixed at `cropsTemplate`'s primitive count (6) regardless of garden count/size, not `beds × 6`.
- `groundY` is sampled once per garden (matching the old behavior: the removed code sampled height once via `placeOnGround` on the bed-group parent, not per bed).
- The `crops.glb`-load-failure fallback (`createGarden(scale)`, procedural cones) is untouched — still one `THREE.Group` per garden added directly, since it's an edge case outside this plan's scope (GLB path only).
- Cultivation anchors (`cultivationAnchorFromSettlementGarden`) were already position-only and untouched.

### Not touched (by design)

`SettlementLandmarks`/`SettlementWellLandmark` type shapes are unchanged (only doc comments updated to describe `prop` as an anchor-only transform carrier, not a rendered mesh). No changes to `render/instancedProps.ts` — the existing `PropPlacement`/`buildInstancedProps()` contract was sufficient for both targets, so no generic extension was needed. Disposal needed no new code: `disposeSettlementGroup()` already calls `disposeObject3D(group)`, which already recurses into `InstancedMesh` children (frees only the instance buffer, skips `sharedGpu`-flagged geometry/material) — the same path barrels/troughs/hay already rely on.

### Tests added

- `settlementStructures.test.ts` (new): `wellPropPlacement`/`cropsBedPlacements` pure-function coverage (spacing, centering, shared `groundY`, key prefixing, `GardenScale` bed counts), plus a `buildInstancedProps` test proving the central/household well split keeps `castShadow` different per bucket while both buckets reference the *same* geometry/material object (no GPU duplication from the one-time `clone(true)`).
- `wellInteractionQueue.test.ts`: added a test proving `buildWellInteractionQueueConfig` returns an identical anchor for a full-mesh `createWell()` root vs. a bare childless `Object3D` at the same transform — the concrete evidence for "gameplay does not depend on the render clone".

### Verification run

`pnpm vitest run` (7423 tests, all green), `npx tsc --noEmit` (clean), `pnpm lint` on changed files (clean), `pnpm run build` (clean; pre-existing >500kB chunk warning unrelated to this change). No browser verification performed — left to the user's `?benchmark=settlement-heavy` pass per this plan's Verification section.
