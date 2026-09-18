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

## Implementation log — 2026-09-18 (settlement shadow sub-census)

Evidence from `docs/performance/results/2026-09-18--023--benchmark-settlement-heavy.md`:

- Isolation: `full 47.6 ms` → `no-shadows 42.0 ms` (measurable shadow cost).
- Top-level shadow casters: settlement `1702 draws / 1.77M tris`; vegetation 202; environment 265; NPC+fauna only 27 — **no agent distance changes**.

### Code

- `SETTLEMENT_CONTENT_KINDS` + `classifySettlementContent` + `censusSettlementShadowCasters` in `src/perf/sceneCensus.ts`.
- Report section `Settlement shadow casters (one-pass estimate):` + JSON `settlementShadowCasters`.
- `tagSettlementShadowKind` in `propUtils.ts`; create-time tags on unlabeled wells/stockpiles/storage/market/workplace/campfire/torches/trees/flowers in `props.ts`.
- Existing instanced/house/fence names continue to drive classification without new runtime registry.

### Not changed

- No broad settlement `castShadow=false`, no `shadowBudget` cadence changes, no NPC/fauna shadow distances.
- Top-level `SCENE_BUCKETS` / `hide-settlement` unchanged.

### Gate

- Waiting on user re-run of `?benchmark=settlement-heavy` for the new settlement sub-census section before choosing one production content rule.

### Automated checks (this stage)

- `sceneCensus` + `report` unit tests: pass.
- `pnpm type-check`: pass.
- `pnpm lint`: pass.
- `pnpm test`: one unrelated failure in `src/world/clouds.test.ts` (fog tint vs clear); not touched by this change.
- `pnpm build`: pass.
- No browser verification; no `pnpm docs:sync`.

## Implementation log — 2026-09-18 (storageGoods no-shadow)

Evidence from updated `docs/performance/results/2026-09-18--023--benchmark-settlement-heavy.md` (Generated 09:10Z):

- Isolation: `full 45.8 ms` → `no-shadows 35.4 ms` (−10.5 ms / −23%).
- Settlement shadow: `other 601/65.4k`, `storage 418/534.7k`, `landmark 206/434.6k`, `decor 197/391.6k`, `houseStatic 145/259.2k`.
- NPC+fauna still tiny — unchanged.

### Recon

- **other (~601 draws, ~65.4k tris):** mostly untagged meshes under settlement — dominant source is `createFoodStorageVisual` item piles (`createItemMesh` GLB/procedural submeshes on household + settlement crates). Also house chest / exterior+interior lamps parented under `house:*` outside `house-static`/`house-interactive`.
- **storage (~418 / 534.7k):** tagged stockpiles, wood-pile extras, household wood, instanced barrels/hay/storage/troughs (`settlement-*` names).
- **decor (~197 / 391.6k):** tagged trees/flowers + `settlement-bushes` / plaza cobble/paving names.

### Production change (exactly one)

- `createFoodStorageVisual` materialize: `tagSettlementShadowKind(..., 'storageGoods')` + `castShadow = false` on all meshes.
- New census kind `storageGoods` (diagnostic). Classification-only tags on house chest (`storage`) and house lamps (`fireLight`) so remaining `other` is clearer — no castShadow change there.
- Did not touch houseStatic/Interactive, fence, terrain, shadowBudget cadence, NPC/fauna distances.

### Gate

- User re-runs `?benchmark=settlement-heavy` to measure shadow/render impact of storageGoods cut.

> **Zrób git commit i push do main, rebase jeżeli trzeba**


## Implementation log — 2026-09-18 (storage + fireLight ROI diagnostics)

Follow-up recon after benchmark 024:

- `storage = 474 shadow draws / ~535.4k tris` is an aggregate, not one oversized wood pile. It mixes wood piles, storage containers/chests, barrels, hay and troughs.
- Settlement wood presentation still has a plausible independent simplification opportunity: one progressive `wood_pile_progressive.glb` already encodes five quantity bands (`Pile_01/05/10/18/29`), while `createWoodPileVisual` can additionally show up to three full overflow piles above 20/40/60 units. LG/XL also has `stockpileSecondary`; household wood piles represent separate household state and should not be removed casually.
- `fireLight = 320 draws / ~21.6k tris` is submission-heavy relative to geometry. The bucket includes house exterior fixtures, interior table-lamp meshes, village torches and settlement campfire presentation; PointLight objects themselves are not mesh draw calls, so this needs mesh-source attribution rather than light-count guesses.

Diagnostic split added to the existing settlement shadow census:

Storage:
- `storageWood`
- `storageContainer`
- `storageBarrel`
- `storageHay`
- `storageTrough`
- `storageGoods` (already no-shadow; retained for diagnostic completeness)
- `storage` remains only as fallback for still-unclassified storage content.

Fire/light:
- `fireHouseExteriorLamp`
- `fireHouseInteriorLamp`
- `fireVillageTorch`
- `fireCampfire`
- `fireLight` remains only as fallback.

Classification uses the same existing create-time tag / instanced-name mechanism; no runtime registry and no per-frame traversal were added.

Next user measurement: rerun `?benchmark=settlement-heavy`. The decision should be based on the largest concrete subcategory by shadow draws / triangles and the visual/system cost of reducing it. In particular:

1. if `storageWood` dominates, evaluate removing settlement overflow piles first while preserving the single five-stage progressive pile and household-owned piles;
2. if `storageBarrel` / `storageHay` / `storageTrough` dominate, prefer template/category shadow cuts or count reduction rather than changing storage semantics;
3. if `fireVillageTorch` or house lamp fixtures dominate, inspect their child-mesh hierarchy and shadow eligibility before reducing light/gameplay presence;
4. do not stack production cuts before the next benchmark.

No production shadow rule was added in this diagnostic step.

## Implementation log — 2026-09-18 (exterior lamp no-shadow + wood/landmark split)

Evidence from `docs/performance/results/2026-09-18--025--benchmark-settlement-heavy.md` (census only; isolation probes partially broken — do not use FPS/render-ms as before):

- `storageWood` 478 draws / 674.8k tris
- `fireHouseExteriorLamp` 324 / 22.5k
- `landmark` 273 / 556.8k

### Production change (exactly one)

- After `tagSettlementShadowKind(..., 'fireHouseExteriorLamp')` in `props.ts`, call exported `disableCastShadow(houseLight.object)` from `propUtils.ts`.
- Keeps fixture mesh, PointLight, night intensity, interior fill; only removes the exterior lantern from the shadow pass.
- Interior table lamps, village torches, campfires, houseStatic unchanged.

### Diagnostic splits (no quantity / logic changes)

`storageWood` sources retagged:

- `storageWoodSettlementPrimary` — primary progressive pile
- `storageWoodSettlementOverflow` — extra overflow clones
- `storageWoodSettlementSecondary` — LG/XL secondary stockpile
- `storageWoodHousehold` — household yard piles
- `storageWood` remains fallback

`landmark` sources retagged:

- `landmarkWell` — central + household + pasture wells
- `landmarkGarden` — gardens (+ `kindFromName` `garden:` → `landmarkGarden`)
- `landmarkField` — wheat field
- `landmarkNoticeBoard` — notice board
- `landmark` remains fallback

### Gate

- Waiting on user `?benchmark=settlement-heavy` for post-cut Isolation and the new wood/landmark subcategory rows.
- Expect `fireHouseExteriorLamp` ≈ 0 in Settlement shadow casters.
- Do not use 025 FPS as the before baseline for Isolation.

### Automated checks (this stage)

- `sceneCensus` + `report` unit tests: pass.
- `pnpm type-check`: pass.
- `pnpm lint`: pass.
- `pnpm test`: pass (7349).
- `pnpm build`: pass.
- No browser verification; no `pnpm docs:sync`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

## Implementation log — 2026-09-18 (census effective visibility + landmarkWell recon)

Evidence from `docs/performance/results/2026-09-18--026--benchmark-settlement-heavy.md`:

- `fireHouseExteriorLamp` gone from shadow census — exterior lamp cut kept.
- `storageWoodHousehold` 360 / 451.8k — suspected inflated by hidden progressive `Pile_*` stages.
- `landmarkWell` 175 / 65.5k (submission-heavy).
- `landmarkGarden` 84 / 491.1k.

### Diagnostic fix: effective visibility

`isRenderableMesh` only checked local `object.visible`. Three.js also culls when any ancestor is hidden.

- Added `isEffectivelyVisible` (walk object → parents; all must be `visible`).
- Applied in `censusScene`, `censusShadowCasters`, `censusSettlementShadowCasters`.
- `hideBuckets` / runtime render unchanged.
- Test: visible mesh under `parent.visible=false` counts as 0.

### Recon `landmarkWell` (no production cut)

| Fact | Detail |
|------|--------|
| Asset | `well.glb` via `WELL_URL`; fallback `createWell()` |
| GLB primitives | **5** meshes; after `loadGltf` SMALL_MESH threshold **all** `castShadow=true` (authored diagonal ≫ 0.5) |
| Fallback | 8 meshes; 7 cast (water no shadow) |
| Placement | One template → `clone(true)` for central / household / pasture — **not** InstancedMesh |
| Colliders / queues | Separate circle colliders + drink queues in `createSettlement.ts` — not mesh-derived |
| 026 math | 175 draws ≈ 35×5 GLB meshes → many well instances in load radius and/or role mix; split will attribute |

ROI candidates (notes only — **not implemented**): whole-prop no-shadow, shadow proxy / merge, household InstancedMesh rebucketing, visual-accepted castShadow=false.

### Diagnostic split

Retagged create sites:

- `landmarkWellCentral`
- `landmarkWellHousehold`
- `landmarkWellPasture`

`landmarkWell` remains fallback.

### Gate

- User re-runs `?benchmark=settlement-heavy`.
- Expect lower `storageWood*` (hidden stages excluded).
- Expect well rows split Central / Household / Pasture; sum ≈ N×5 meshes for GLB wells.

### Automated checks (this stage)

- `sceneCensus` + `report` unit tests: pass.
- `pnpm type-check`: pass.
- `pnpm lint`: pass.
- `pnpm test`: one unrelated failure in `src/ai/weatherPressure.test.ts` (storm vs rain shelter pressure); not touched by this change.
- `pnpm build`: pass.
- No browser verification; no `pnpm docs:sync`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

## Implementation log — 2026-09-18 (household well + garden plant no-shadow + wood overflow max 2)

Evidence from `docs/performance/results/2026-09-18--027--benchmark-settlement-heavy.md`:

- `landmarkWellHousehold` 100 / 37.4k (20× `well.glb` × 5 meshes)
- `landmarkWellCentral` 30 / 11.2k, `landmarkWellPasture` 25 / 9.3k — left casting
- `landmarkGarden` 78 / 456k (~13× `crops.glb` bed × 6 meshes; plants ≈ 97% tris)

### Recon (static; no new diagnostics)

`well.glb`: Stone_Dark 608, Wood 530, Stone_Light 448, Bag 144, RoofTiles_Red 140 ≈ 1870 tris; all `castShadow=true` after `loadGltf` (authored diagonal ≫ 0.5). Partial Bag-only cut ≈ −20 draws — weak ROI vs whole-prop household cut.

`crops.glb` per bed: Dirt 800 · Lettuce 9.7k · Red 1.6k · Green 15.6k · Orange 2.1k · Watermelon_DarkGreen 5.2k ≈ 35k. Template fitted once then `layoutCropsGarden` clones.

### Production changes (three)

1. **Household well no-shadow** — after `tagSettlementShadowKind(..., 'landmarkWellHousehold')`, `disableCastShadow(hw)`. Central/pasture unchanged. Main-pass, colliders, drink queues untouched.
2. **Garden plant no-shadow** — `disableGardenPlantCastShadow` on fitted `crops.glb` template (all meshes except material `Dirt`). Procedural `createGarden` crop cones `castShadow=false`. Dirt / bed grounding caster kept. Cultivation anchors / interactions unchanged.
3. **`WOOD_PILE_MAX_EXTRA` 3 → 2** — trim `WOOD_PILE_EXTRA_OFFSETS` to two slots. Progressive primary pile, quantity bands, ownership, storage semantics unchanged. Tests updated.

### Not changed

- `shadowBudget.ts`, NPC/fauna shadow distances, house statics, benchmark infrastructure, central/pasture wells.

### Gate

- User re-runs `?benchmark=settlement-heavy`.
- Expect `landmarkWellHousehold` ≈ 0 in Settlement shadow casters.
- Expect `landmarkGarden` ≈ Dirt-only (much lower tris; fewer draws).
- Expect at most 2 overflow wood piles when stock is high.

### Automated checks (this stage)

- `storageVisuals` unit tests: pass (earlier in session).
- `pnpm type-check`: pass.
- `pnpm lint`: pass.
- Full `pnpm test` / `pnpm build`: deferred to user.
- No browser verification; no `pnpm docs:sync`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

## Implementation log — 2026-09-18 (final diagnostic — close plan)

Last measured report: `docs/performance/results/2026-09-18--027--benchmark-settlement-heavy.md` (fixture `tools-001-v1`, seed 42, rain, XL Podgórze — same as 023–026).

Isolation absolute ms in 025–027 is noisy/untrustworthy when probes invert or zero out; prefer census + relative `full` vs `no-shadows` on 023/024/027.

### Before → after (comparable census)

| Category / signal | Early measured (023/024/025) | 027 (last measured) | After post-027 production cuts (code; not re-benchmarked) |
|---|---|---|---|
| Settlement shadow total | 023: 1702 / 1.77M · 024: 1496 / 1.72M | **1081 / 1.37M** | lower still (household wells + garden plants + overflow cap) |
| `storageGoods` | in `other` / storage piles casting | already no-shadow | held |
| `fireHouseExteriorLamp` | 025: **324 / 22.5k** | **absent** | held |
| `storageWood*` | 025 aggregate 478 / 674.8k; 026 household inflated by hidden `Pile_*` | Primary 12/9.1k · Secondary 6/16.9k · Household 66/29.4k · Overflow gone from census | overflow max extras **3→2** |
| `landmarkWellHousehold` | in aggregate wells | **100 / 37.4k** | **no-shadow** (central/pasture still cast) |
| `landmarkGarden` | in landmark / 026: 84 / 491.1k | **78 / 456.0k** | plant meshes no-shadow; **Dirt** bed grounding kept |
| `full` → `no-shadows` | 023: 45.8→35.4 (−23%); 024: 47.5→34.6 (−27%) | 88.3→71.7 (−19%) — direction OK, abs ms not comparable | optional user re-run |

### Shipped under this plan

Diagnostics:

- top-level `censusShadowCasters`
- settlement sub-census + storage/fire/wood/landmark/well splits
- effective-visibility census (`isEffectivelyVisible`)

Production content cuts (create-time / template; no `shadowBudget` cadence changes; no NPC/fauna distance changes):

1. `storageGoods` food-pile meshes — `castShadow=false`
2. house exterior lantern fixtures — `disableCastShadow`
3. household wells — `disableCastShadow` (central/pasture keep casting)
4. garden plant meshes — no-shadow; Dirt bed keeps casting
5. wood overflow extras capped at 2

### Final recon — no further 038 cut

No remaining settlement shadow category is simultaneously obvious, visually safe, and large-ROI for another `castShadow=false` under this plan:

- `decor` (~198 / 399k in 027) — trees/flowers; high visual risk
- `houseStatic` — structural; keep
- garden **Dirt** grounding — intentionally retained
- central/pasture wells — low tris vs household; keep
- terrain (~5.60M) / vegetation (~738k) shadow casters — outside settlement content-budget scope

027 `hide-settlement` ≈ −4 ms vs `full` (noisy) vs trustworthy 024 ≈ −14.5 ms — remaining settlement decorative shadow ROI is uncertain. Plan success gate: do not stack more exceptions for small/uncertain wins.

### Residuals → other plans / LOOSE-ENDS

- Settlement main-pass submissions / garden·decor geometry cost → `settlements-019`
- N8AO / post-process → `world-terrain-039`
- Optional whole-garden or Dirt shadow revisit only with explicit benchmark + visual OK (not another 038 session)
- Terrain/vegetation shadow participation — only if a fresh benchmark shows they dominate after settlement work

### Close

Plan marked `done`. Content-budget loop complete: measure → cut → remeasure census → stop when no safe large ROI remains. No code change in this closing session.

