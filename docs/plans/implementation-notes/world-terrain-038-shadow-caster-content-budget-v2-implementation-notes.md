# Implementation notes — world-terrain-038 Shadow caster/content budget v2

## Current architecture to preserve

This plan is a **shadow-content** follow-up to archived plan 145. Do not redesign shadow-map cadence.

### Shadow-map update cadence already exists

`src/render/shadowBudget.ts` owns the pure pull-based update decision:

- `createShadowBudgetState()`
- `shouldUpdateShadowMap()`
- `recordShadowBudgetFrame()`
- `anyWithinRadius()`

`src/app/gameLoop.ts` owns the runtime integration and sets `renderer.shadowMap.needsUpdate` only when the existing budget says to refresh. Keep this ownership unchanged. The archived 145 notes confirm Three.js `WebGLShadowMap` consumes and resets `needsUpdate`; no second dirty scheduler or push-based invalidation system is required for this plan.

`NPC_SHADOW_DISTANCE` and `FAUNA_SHADOW_DISTANCE` are both existing presentation limits reused by `gameLoop.ts` when deciding whether moving agents make the shadow map dirty. Do not decouple the cadence logic from those existing constants unless the implementation explicitly changes the same presentation contract.

## Existing shadow-content mechanisms

### 1. GLTF small-mesh threshold

`src/assets/loadGltf.ts` already applies `SMALL_MESH_SHADOW_THRESHOLD = 0.5` using the authored mesh bounding-box diagonal and sets `mesh.castShadow` during GLTF preparation. `src/items/items.ts` reuses the same threshold for procedural item fallbacks.

This is already the generic small-object rule. Do **not** add another global size threshold in `shadowBudget.ts`.

Important limitation: the threshold is applied before later prop fitting/scaling. `src/settlement/propUtils.ts` therefore already has an explicit `noShadow` seam (`disableCastShadow()` via `loadPropOrFallback` / `loadPropTemplates`) for categories whose authored GLB dimensions do not represent their final in-world visual importance. Reuse that seam when a whole prop category should never cast.

### 2. Instanced prop shadow ownership

`src/render/instancedProps.ts` flattens template meshes into `PropPrimitive` and copies `primitive.castShadow` onto each generated `InstancedMesh`. Therefore shadow participation is naturally owned by the template/category before or while the bucket is created.

Do not add per-frame instance traversal. Also do not attempt per-instance `castShadow`: Three.js `InstancedMesh.castShadow` applies to the whole bucket. If only a subset of instances should cast, that requires splitting/rebucketing and is outside this plan unless the shadow census proves a large enough win to justify a separate design decision.

### 3. House static batches

`src/settlement/houseBuilder.ts` already batches static house parts:

- `flattenPart()` captures template `castShadow`,
- `instantiateStatics()` creates one `InstancedMesh` per `(assetId, primitive)` and copies `primitive.castShadow`,
- static house buckets are therefore all-or-nothing shadow casters per asset primitive.

Do not create distance-based per-house shadow mutation inside `instantiateStatics()` or `gameLoop.ts`. A content rule for house statics should operate at the asset/category/template level. Large structural house parts are expected to remain shadow casters unless the census unexpectedly proves they dominate and visual verification supports a narrower rule.

### 4. Agents

NPC/fauna already have explicit distance-based shadow presentation (`NPC_SHADOW_DISTANCE` / `FAUNA_SHADOW_DISTANCE`, currently 36). This is the correct seam for agent shadow range. If diagnostics show agents are still a major shadow-pass contributor, change these shared constants/rules rather than adding a second range check elsewhere.

Remember that changing these radii also changes `gameLoop.ts`'s `hasNearbyShadowCaster()` cadence signal because it intentionally reuses the same values.

## Diagnostic implementation: extend `sceneCensus`, do not build a new profiler

`src/perf/sceneCensus.ts` already owns:

- `SCENE_BUCKETS`,
- `classifyObject()` using object names/userData,
- draw-call estimation,
- triangle estimation,
- one bounded `scene.traverse()` via `censusScene()`.

The smallest useful diagnostic is a **shadow caster census using the same classification and counting rules**, restricted to currently visible renderable meshes with `castShadow === true`.

Recommended shape:

- add a reusable census helper rather than duplicate `classifyObject`, `drawCallsFor` and `triangleCount` logic;
- report the same `SceneBucket` rows for shadow-casting meshes;
- include at least `meshes`, `instancedMeshes`, `instances`, estimated `drawCalls`, and `triangles`;
- run it only as part of benchmark/report collection, not every frame;
- add unit coverage in `src/perf/sceneCensus.test.ts` for `castShadow=false`, normal mesh, instanced mesh and classification inheritance.

If the existing benchmark/report wiring requires a new report field, keep it inside the current perf pipeline (`src/perf/benchmark.ts`, `src/perf/report.ts`, `src/perf/types.ts`) rather than logging ad-hoc output from render code.

The census is an **upper-bound content estimate**, not measured GPU time. It answers which content participates in the shadow map and how much submission/geometry it represents; the browser isolation delta remains the runtime evidence.

## Expected diagnostic interpretation

Use `?benchmark=settlement-heavy` as the primary fixture. The 2026-09-17 result showed `full ~46.5 ms` vs `no-shadows ~22.7 ms`; this is a ceiling, not an additive attribution.

Prioritize categories only after the new shadow census confirms their participation:

1. settlement props / fences / decorative landmarks,
2. vegetation/environment,
3. NPC/fauna,
4. terrain,
5. structural house geometry only if still necessary.

Do not infer the winning category from the main-pass scene census alone. `settlement` having many main-pass draws does not prove all those meshes cast shadows.

## Likely production seams after the census

### Settlement decorative props

Start in `src/settlement/props.ts`, `src/settlement/propUtils.ts`, `src/settlement/landmarkProps.ts`, `src/settlement/campfireProps.ts` and any specific prop factory identified by the census.

Prefer one of these existing shapes:

- template/category `noShadow` at load time,
- explicit `castShadow = false` in a procedural decorative factory,
- a small shared category helper applied at creation time.

Do not perform a per-frame distance walk over the settlement group.

Fence/paddock/palisade content should only be changed if the census shows material contribution. Collision ownership is separate; disabling shadows must not change OBB/collider registration or navigation semantics.

### Vegetation/environment

Region vegetation already uses `src/terrain/vegetationRegionBatcher.ts` + `src/render/instancedProps.ts`. A region bucket has one `castShadow` flag per primitive, so prefer template/species/category decisions. Do not create a second vegetation batcher, per-shadow-pass region tree, or per-instance visibility structure here.

Existing `noShadow` examples for reeds/lilies/seaweed are the preferred precedent for tiny/low-value vegetation.

### Terrain

Terrain is intentionally last. Changing terrain shadow participation can materially alter grounding/readability and may affect a large contiguous shadow source. Only touch it when the census says terrain remains a dominant shadow contributor after cheaper content rules.

## `shadowBudget.ts` scope

Despite the plan name, production content policy does **not** need to live inside `shadowBudget.ts` if the correct ownership is at asset/prop creation. Keep `shadowBudget.ts` focused on map-update cadence unless a small pure helper genuinely represents a shared shadow-content policy.

Do not turn it into a God Object containing settlement/vegetation knowledge.

## Guardrails

- Main-camera visibility must not change.
- Simulation, colliders, interactions and settlement state must not depend on shadow eligibility.
- No material mutation per frame.
- No `scene.traverse()` in the game loop for content budgeting.
- No separate shadow-only scene graph.
- No duplicated NPC/fauna distance policy.
- No new global visibility subsystem.
- Do not change water mirror layers or reflection ownership as part of this plan.
- House/vegetation instancing must stay intact; do not de-instance content to gain per-object shadow control.
- Add JSDoc with `@domain world-terrain` only for genuinely architectural/public helpers introduced by this work.

## Suggested implementation order

1. Extend `sceneCensus` with shadow-caster census + tests.
2. Wire it into the existing benchmark report and run automated checks.
3. Stop here for browser measurement if the implementation agent cannot determine a clearly dominant category statically; browser verification belongs to the user.
4. From the measured census, implement **one smallest content rule** with the best ROI.
5. Add focused tests for the policy/helper where practical.
6. Leave the plan at `verification needed` after automated checks; user reruns `?benchmark=settlement-heavy` and performs visual verification.

Do not stack several speculative content cuts before the first post-change benchmark. The purpose is to preserve the repository's `measure → one change → benchmark` loop.

## Relevant files

Primary:

- `src/perf/sceneCensus.ts`
- `src/perf/sceneCensus.test.ts`
- `src/perf/benchmark.ts`
- `src/perf/report.ts`
- `src/perf/types.ts`
- `src/render/shadowBudget.ts`
- `src/app/gameLoop.ts`
- `src/assets/loadGltf.ts`
- `src/render/instancedProps.ts`
- `src/settlement/propUtils.ts`
- `src/settlement/houseBuilder.ts`

Category-specific only if selected by measurement:

- `src/settlement/props.ts`
- `src/settlement/landmarkProps.ts`
- `src/settlement/campfireProps.ts`
- `src/terrain/vegetationRegionBatcher.ts`
- `src/terrain/chunkManager.ts`
- `src/ai/NpcAgent.ts`
- `src/fauna/AnimalAgent.ts`

Evidence / historical contract:

- `docs/performance/results/2026-09-17--021--benchmark-settlement-heavy.md`
- `docs/performance/results/2026-09-17--022--benchmark-stream.md`
- `docs/plans/archive/2026-08-17--145--shadow-budget-optimization.md`
- `docs/plans/archive/2026-08-17--145--shadow-budget-optimization-implementation-notes.md`
- `docs/architecture/GRAPHICS.md`

## Automated verification

At minimum:

- targeted `sceneCensus` tests,
- `pnpm type-check`,
- `pnpm lint`,
- `pnpm test`,
- `pnpm build`.

Do not run browser verification. User owns the before/after `settlement-heavy` benchmark and visual check of near building/fence/NPC/livestock/vegetation shadows.

## Implementation log — 2026-09-18 (Gate A diagnostics only)

Shipped diagnostic plumbing; **no production shadow-content rule**.

### Code

- `censusShadowCasters(scene)` in `src/perf/sceneCensus.ts` — same buckets/counting as `censusScene`, filtered to visible renderables with `castShadow === true`. Shared `accumulateMesh` helper. JSDoc `@domain world-terrain`.
- Benchmark wires `shadowCasters` beside `scene` (`src/perf/benchmark.ts`).
- Report field `shadowCasters?: SceneCensus` (`types.ts`); text section `Shadow casters (one-pass estimate):` (`report.ts`).
- Unit tests: `sceneCensus.test.ts` (false/true/instanced/classification) + `report.test.ts` (section + JSON).

### Not changed

- `shadowBudget.ts` / shadow-map cadence, NPC/fauna distance constants, settlement/vegetation `castShadow`/`noShadow`, no per-frame scene traversal in the game loop.

### Gate / recon

- Gate A **not decided** — requires user runtime report from `?benchmark=settlement-heavy`.
- Needed fields: full `Shadow casters (one-pass estimate):` block; context: `Scene (one-pass estimate):` plus Isolation `full` and `no-shadows` `render=` lines.
- After that measurement: either one content rule at create/load ownership, or close as diagnostic-only if no clear winner.

### Automated checks (this stage)

- `sceneCensus` + `report` unit tests: pass.
- `pnpm type-check`: pass.
- `pnpm lint`: pass.
- `pnpm test`: one unrelated failure in `src/world/clouds.test.ts` (fog tint vs clear); not touched by this change.
- `pnpm build`: pass.
- No browser verification; no `pnpm docs:sync`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
