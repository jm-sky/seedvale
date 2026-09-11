# Implementation notes: world-terrain-020 adventure cave variant

**Reviewed:** 2026-09-11  
**Plan:** `docs/plans/world-terrain-020-adventure-cave-variant.md`  
**Baseline:** `main` at `2f62a70720cd14a264b672e474fbc810bee83014`

Focused implementation handoff based on current code. Do not repeat broad cave/treasure recon unless `main` materially changed.

## Current ownership and construction chain

Production caves are owned by `src/world/createCaves.ts` and already use the final world-terrain-019 architecture:

```text
pickLargeCaveSites()
  -> buildProductionCaveTopology()
  -> buildCaveHeightfieldRepresentation()
  -> CaveRuntime { topology, definition, heightfield, walkSurfaceAt }
```

The retained `CaveHeightfieldRepresentation` is the single production spatial authority for presentation, mouth cutout, ground/floor/ceiling, occupancy, horizontal containment, interior and camera space. Do not add a second adventure/dungeon representation or collision path.

Topology + heightfields are built up front; only presentation is relevance-streamed. `createCavePresentationQueue()` drains at most one synchronous presentation build per update by default and `createCaveStreamingController()` uses the existing 55/80 m hysteresis.

## Topology: extend the current generator, not `CaveTopology`

Relevant files:

- `src/world/caves/caveTopology.ts`
- `src/world/caves/productionTopology.ts`
- `src/world/caves/productionTopology.test.ts`
- `src/world/caves/caveRng.ts`
- `src/world/createCaves.ts`
- `src/world/largeCaves.ts`

`CaveTopology` is already sufficient: representation-neutral `nodes`, arbitrary `segments`, `features`, `minClearance`. It does not need an adventure-specific graph type or representation fields.

`buildProductionCaveTopology()` currently owns all terrain-aware route construction. Important existing helpers/guardrails to reuse rather than bypass:

- `walkSegment()` / `planDestination()` / `rampInterior()`;
- `MAX_TRAVERSABLE_FLOOR_GRADE` and `FLOOR_RAMP_STATION_SPACING`;
- local overburden adaptation through `unconstrainedFloorY()` / `mouthOverburdenRequirement()` / `minSurfaceOverFootprint()`;
- `MAX_TOTAL_DROP` rejection rather than forcing unreasonable routes;
- `MIN_DISCONNECTED_CLEARANCE` + `minGapBetweenPaths()` for branch/main-route separation;
- purpose-scoped RNG via `createCaveRandom(caveId, salt)`.

Current natural topology is effectively one entrance/main route/chamber with an optional short branch (`BRANCH_CHANCE = 0.35`). Adventure must be a separate topology recipe/archetype inside this ownership, while sharing the route-building helpers. Do not grow one function into a large natural/adventure conditional block if a small recipe split around shared primitives is clearer.

### Freeze the natural recipe

For the same seed + site, existing natural topology output and acceptance behavior are regression fixtures for this plan. Do not retune natural dimensions, `BRANCH_CHANCE`, overburden/grade/drop thresholds, route shape or acceptance limits while adding adventure.

If recipe extraction is useful, keep it mechanical: shared helpers may be extracted, but the natural call sequence and parameters must stay behaviorally identical. Add fixed seed/site regression coverage before or together with the split so an apparently harmless refactor cannot silently alter existing caves.

Add new independent `CAVE_RNG_SALT` values for archetype/content/layout decisions. Do not consume extra values from existing natural-cave RNG streams: changing call order would silently change existing seeded natural caves.

Do not put `archetype` into `CaveTopology` merely for rendering. Keep archetype/site metadata alongside the runtime/topology unless a real representation-neutral consumer requires it.

## Cave-site assignment: acceptance order and natural fallback

`pickLargeCaveSites()` currently creates up to 10 deterministic candidates in a 130–620 m ring around origin, with `LARGE_CAVE_MIN_HOME_DIST = 110`, 90 m cave separation, village/road/coast/ridge/slope filters. `createCaves()` then calls `buildProductionCaveTopology()` and drops rejected sites.

Adventure is harder to accept than natural because it is longer while preserving the same terrain/overburden/grade/drop constraints. The assignment flow must therefore prevent a failed adventure attempt from deleting a cave that the current natural recipe would accept.

Use this bounded flow; do not invent a second siting pass:

1. Call `pickLargeCaveSites()` exactly as the siting authority does today.
2. Deterministically order candidates in an explicit preferred home band using distance plus stable site/cave identity as tie-break.
3. Try adventure topology for those candidates in order. The first accepted adventure becomes the guaranteed home adventure cave.
4. If none accepts in the preferred band, continue over the remaining existing sites, nearest/stable first. Do not synthesize a site and do not weaken adventure acceptance guardrails.
5. For every remaining site, perform the independent deterministic 15% adventure roll.
6. If the roll is natural, build the unchanged natural recipe.
7. If the roll is adventure, try adventure first; **if adventure rejects, immediately try the unchanged natural recipe for the same site**. Keep the natural result if it accepts.

This fallback is a hard regression guard, not an optional tuning choice. A non-guaranteed site must not disappear merely because its new archetype roll selected a recipe that cannot fit its terrain.

The implementation should define the preferred home band explicitly in code/tests. Current siting already excludes <110 m, so the lower bound should not fight `LARGE_CAVE_MIN_HOME_DIST`. Avoid coupling this to camera/player position; home is the origin/current home settlement footprint already passed into `createCaves()`.

Do not implement the guarantee as “build natural first, then relabel it”: archetype must be known before topology construction. A small pure ordering/roll helper is preferable so deterministic selection can be tested without Three.js, while actual acceptance remains owned by topology construction.

## Adventure topology shape and footprint

The plan wants roughly 3–4x the current exploration length, several spaces, one guaranteed junction, side chamber and final chamber. Treat 3–4x as gameplay route length, not `LargeCaveSite.length` multiplication and not a requirement to spread 3–4x farther in one world direction.

Keep the route relatively compact in XZ because `buildCaveHeightfieldRepresentation()` allocates a rectangular grid over topology bounds. A long straight or widely fanned topology increases empty cells and mesh/build cost. Prefer a deterministic folded/curving main route with separated legs.

Suggested semantic node IDs should be stable and role-based because later content anchors need them, e.g. `adventure-junction`, `adventure-side-chamber`, `adventure-final-chamber`. Exact names are implementation detail, but do not discover treasure rooms later by “last chamber in array”.

The side branch is mandatory for adventure; do not reuse the natural 35% branch roll for it. Reuse the existing branch clearance calculation and retry/reject deterministically if a candidate branch would smooth-union into the main route.

Before accepting a topology, preserve existing overburden/drop/grade rules. It is acceptable for an adventure recipe to reject terrain that supports a natural cave. Guaranteed selection handles this by trying another existing site; ordinary 15% sites handle it by falling back to the unchanged natural recipe.

### Heightfield footprint budget before build

`DEFAULT_HEIGHTFIELD_CONFIG.cellSize` is currently global and must remain unchanged. Because the retained representation is a rectangular grid, add an adventure-specific pre-build safety check derived from topology bounds and the existing heightfield margins/config. Bound either estimated `nx * nz` directly or equivalent rectangular area with a clear conversion to estimated cells.

The budget should be generous enough for the intended 3–4x route but finite and testable. If an adventure layout exceeds it, deterministically reject/retry that adventure layout; do not increase global cell size, loosen representation limits, move the heightfield to a worker, or silently allocate an unbounded grid.

Keep this guard adventure-specific unless evidence shows a general cave invariant is needed. This plan must not change natural cave acceptance through a new global footprint rule.

## Content-anchor seam: cave owns placement truth, world owns gameplay objects

Current `Caves` API exposes spatial queries but no semantic interior content descriptors. Add a narrow read-only cave-content descriptor seam rather than importing inventory/treasure systems into `createCaves.ts`.

Recommended conceptual shape:

```text
AdventureCaveContent
  caveId
  sideTreasure { id/role, x, y, z, yaw }
  finalTreasure { id/role, x, y, z, yaw }
  prop anchors [{ role, x, y, z, yaw }]
```

Names/types are implementation choices. The important ownership rule is:

- topology determines semantic room/node;
- final retained heightfield determines floor Y and usable clearance;
- cave subsystem exports stable placement descriptors;
- `WorldBundle` composes those descriptors into existing world/container systems;
- cave code must not own chest inventories, loot mutations or save data.

Use `sampleHeightfieldAt()` / the specific runtime heightfield when resolving an anchor. Do not use public `Caves.sampleFloor(x,z)` during construction if overlapping cave bounds could select another runtime; the placement resolver already has the exact `CaveRuntime`.

Validate placement against final heightfield gap/clearance and offset inside the chamber so chest/wagon is not at the centerline bottleneck. Use purpose-scoped cave RNG for yaw/offset. Stable IDs should derive from `caveId + semantic role`, never array index or streaming generation.

## Treasure: current code has the exact missing seam this plan can close

Relevant files:

- `src/world/treasureSites.ts`
- `src/world/worldGeneratedContainers.ts`
- `src/items/treasureGameplay.ts`
- `src/app/worldBundle.ts`
- `src/app/actions/containerActions.ts`
- persistence through existing `SaveWorldGeneratedContainer`, `unlockedTreasureContainerIds`, `treasureChestMutations`.

Important current-code fact: `treasureSites.ts` already declares archetype `'cave'`, but `CAVE_TREASURE_ENABLED = false` with an explicit comment that cave treasure is disabled until a production interior-Y placement seam exists for world-generated containers. world-terrain-020 is the natural place to provide that seam.

`WorldGeneratedContainerSpec` currently has only `x/z/yaw`; `createWorldGeneratedContainers()` always calls `placeOnGround(..., sampleHeight)`, and `WorldBundle` passes `chunkManager.sampleHeight`. That will place a cave chest on the hillside above the cave. Do not fake the surface sampler or mutate terrain.

Preferred minimal extension: allow a deterministic explicit world Y on `WorldGeneratedContainerSpec` (or an equivalent placement mode) and have `createWorldGeneratedContainers()` use it instead of `placeOnGround` when present. Keep existing surface specs unchanged. There is no need to add Y to save data just to restore placement: deterministic spec remains placement authority and current saved records are already used for contents rather than reconstructing the spec.

Do not create a cave-specific container class.

### Lock/key scope

The plan asks for two treasure chests but does not ask for two new key hunts. Current `TreasureSiteDefinition` means “locked systemic treasure” and requires `requiredKeyId + key`; `containerActions` treats a world-generated container not present in `bundle.treasureSites` as a normal open chest.

For this plan, keep adventure exploration as the gating mechanic: materialize the two cave chests through `WorldGeneratedContainers` with stable treasure-like IDs and deterministic loot, but do **not** manufacture fake keys or pre-populate `unlockedTreasureContainerIds`. Do not add them to `TreasureSiteDefinition` unless the plan is explicitly expanded to include key placement/locks.

This still reuses the existing physical container, transfer UI and persisted contents. It deliberately does not opt these two MVP chests into forced-entry/trap logic, because that logic is keyed to `TreasureSiteDefinition`.

`CAVE_TREASURE_ENABLED` can remain false if it specifically denotes the world-024 locked/keyed cave archetype. Update its comment if world-terrain-020 makes the old “no interior Y seam” explanation stale; do not simply flip it true without supplying a valid key-placement contract.

### Loot tiers

`generateTreasureLoot(worldSeed, siteId)` currently has one distribution: 50–200 coins, one weighted gemstone, optional gold/ordinary loot. The plan requires final > side.

Prefer a small backwards-compatible loot-profile/tier input in `treasureGameplay.ts` over duplicating loot generation in cave code. Existing callers must retain current behavior by default. Side can use the baseline/lesser profile; final must deterministically use a richer profile with testable ordering/ranges. Keep item/loot policy in `items-player`, not `world-terrain`.

## WorldBundle ordering

`WorldBundle` creates `caves` and separately builds `treasureSites` / `worldGeneratedSpecs`. Wire cave content at the composition layer after `createCaves()` has produced deterministic content descriptors and before `createWorldGeneratedContainers()` is instantiated.

Append cave chest specs to the same `worldGeneratedSpecs` array. Do not add a second world-generated-container owner.

Saved `worldGeneratedContainers` already restore contents by stable ID. Verify that changing the spec set does not resurrect a looted cave chest on rebuild/save-load; tests should use the same pattern as `src/world/worldGeneratedContainers.test.ts`.

## Props and presentation

Existing assets confirmed in repo:

- `/models/settlement/megakit/wagon.glb` (`src/assets/assetIndex.ts` / MegaKit README), fit max 3.8 in current wagon usage;
- `/models/parked/cart.glb` and `src/world/cartProp.ts` if the smaller hand-cart reads better underground;
- `/models/settlement/lantern.glb` via `LANTERN_URL`;
- MegaKit directory contains parked crate/support assets suitable for beams/supports; inspect exact filenames before wiring.

Prefer the smaller `cart.glb` if the 3.8 m merchant wagon cannot fit chambers without dominating/blocking them. The plan's “wagon/wóz” requirement is environmental storytelling, not a requirement to reuse the merchant settlement object's behavior/collider/horse logic.

Decorative props should attach to the cave presentation group and be disposed with that presentation. Do not add them as permanent global scene objects. Keep deterministic prop descriptors on the runtime; instantiate visual clones only when presentation activates.

Do not reuse settlement-specific `merchantWagon` placement/collider behavior. Reuse asset/loading/preparation helpers, not settlement semantics.

### Async asset caution

Current cave presentation build is synchronous and queue-controlled. `loadGltf()` is async. Do not turn `createCavePresentationQueue()` into an unbounded async lifecycle or let stale loads attach after deactivation. Preferred options:

1. preload/cache the very small fixed adventure prop template set at world startup and clone synchronously during cave activation; or
2. if async loading is unavoidable, preserve the existing generation/stale-result contract before attaching.

Choose the simpler option supported by current asset helpers. Do not reload GLBs per cave activation.

## Lanterns / lights

`LANTERN_URL` is only a visual asset; do not assume the model contains useful game lighting. Production has `PointLightBudget` specifically to keep `NUM_POINT_LIGHTS` stable and prevent shader-program hitches. Any real cave `PointLight` must be registered/unregistered through that budget and tied to presentation lifecycle.

MVP preference: use emissive/unlit-looking lantern visuals first, with zero or at most a very small bounded number of real point lights per active adventure cave. Do not scatter one real light per lantern. If cave presentation receives a `PointLightBudget`, thread it explicitly from `WorldBundle`; do not reach for globals.

## Tests with highest value

Extend existing focused suites rather than creating broad integration harnesses:

- `productionTopology.test.ts`: fixed seed/site natural output + acceptance regression, adventure deterministic route, mandatory branch, side/final semantic nodes, grade/overburden/clearance, compact bounds/route-length ratio, adventure footprint-budget rejection;
- pure archetype assignment tests: deterministic home ordering, 15% roll independent from topology RNG, no synthetic site;
- `createCaves.test.ts`: guaranteed candidate fallback across existing sites; ordinary adventure rejection falls back to natural and preserves a cave that natural accepts; content descriptors resolve to final heightfield floor with adequate gap and stable IDs; natural caves expose no adventure content; presentation props activate/dispose with cave group;
- `worldGeneratedContainers.test.ts`: explicit-Y spec places underground mesh at supplied Y while legacy surface specs still call ground placement; saved contents override initial loot without changing deterministic placement;
- `treasureGameplay.test.ts`: tier/profile determinism and final profile strictly/range-wise richer than side while legacy default stays unchanged;
- WorldBundle-level targeted test only if needed to prove the two descriptors become exactly two existing world-generated chest specs.

Do not write statistical tests expecting exactly 15% in a tiny sample. Test the deterministic threshold/helper directly and optionally use a large fixed sample only as a sanity check.

## Performance guardrails

The expensive part of a long cave is the heightfield's rectangular XZ bounds, not only node count. Enforce the adventure-specific pre-build bounds/cell budget described above and keep a measurable test/assertion or debug statistic for route length vs bounds/cell count so tuning cannot accidentally create a huge mostly-empty grid.

Do not change global `DEFAULT_HEIGHTFIELD_CONFIG.cellSize` for this plan. Do not move heightfield building to a worker as part of this feature. Keep `PRESENTATION_BUILDS_PER_UPDATE = 1` unless profiling shows a separate problem.

Props must be template-reused/cloned and relevance-streamed. Avoid per-cave materials where an existing/shared material/template already owns them.

## Suggested implementation order

1. Add fixed natural regression fixtures first; then pure archetype ordering/roll + adventure topology recipe + adventure→natural fallback tests, no treasure/props.
2. Add adventure footprint/cell budget before heightfield construction and test deterministic rejection without changing global heightfield config.
3. Cave semantic content descriptors resolved against final heightfield.
4. Explicit-Y world-generated-container seam + two cave chest specs + deterministic side/final loot tiers + persistence tests.
5. Relevance-streamed cart/wagon/support/lantern presentation using existing assets.
6. Targeted regression/typecheck/lint/build; User performs browser verification.

Keep each step independently testable. Do not mix topology tuning with container persistence changes in one large edit if avoidable.

## Do not do

- no `AdventureCaveManager`, `DungeonGraph` or cave-specific inventory;
- no SDF/collider resurrection;
- no new cave save blob for deterministic archetype/topology/content placement;
- no natural recipe retuning or natural RNG call-order changes;
- no dropping an otherwise-valid natural cave because its adventure attempt rejected;
- no second cave siting pass or synthetic site for the home guarantee;
- no global heightfield resolution/config change to accommodate adventure;
- no fake surface terrain height for underground chests;
- no keys/locks/traps unless scope is explicitly expanded;
- no fauna/NPC navigation, ore/mining, collapse, lake or dungeon geometry;
- no external asset download;
- no browser verification by AI;
- do not run `pnpm docs:sync` (GitHub workflow owns generated docs).

For new important public/architectural helpers, add useful JSDoc and `@domain world-terrain` (or the actual owning domain for cross-domain helpers) when it improves preflight discovery.

## Stage A landed — corrections to the notes above

Stage A (archetypes + adventure topology only; no treasure/props/lights) is implemented. Where the notes' baseline assumptions turned out to need adjusting against real code:

- **Recipe split.** The "small recipe split around shared primitives" happened as `src/world/caves/caveRoute.ts`: `walkSegment` / `planDestination` / `rampInterior` / `unconstrainedFloorY` / `rampStationY` / `minGapBetweenPaths` / `maxCenterlineFloorGrade` / `lowerFeatureIfNeeded` plus `MAX_TRAVERSABLE_FLOOR_GRADE`, `FLOOR_RAMP_STATION_SPACING`, `MAX_TOTAL_DROP`, `MIN_DISCONNECTED_CLEARANCE`. They now take a `RouteContext` instead of five loose arguments. `productionTopology.ts` keeps the natural recipe plus the archetype dispatcher and re-exports the constants existing tests import. A fixed seed/site natural fixture (`cave:8f19a29f`, seed 99) is asserted node-by-node in `productionTopology.test.ts`.

- **Descent rate is a recipe parameter, not a shared constant.** The notes did not anticipate this: `NOMINAL_DESCENT_PER_METER = 0.12` alone spends the whole unchanged `MAX_TOTAL_DROP` (12 m) budget in ~70 m of route after the mandatory ~3.4 m drop behind the mouth, so at 3-4x length *every* adventure site rejected. `RouteContext.descentPerMeter` is now per-recipe: natural keeps 0.12 exactly (`NATURAL_DESCENT_PER_METER`), adventure uses `ADVENTURE_DESCENT_PER_METER = 0.05`. Overburden adaptation, the grade cap and `MAX_TOTAL_DROP` itself are untouched; measured adventure drop is 6.6-7.5 m.

- **Self-separation, not just branch separation.** A folded route also has to avoid smooth-unioning onto *itself*, which would bypass the junction. Legs three or more apart in route order carry the full `MIN_DISCONNECTED_CLEARANCE`; legs one leg apart share the node that connects them, so ordinary curvature legitimately brings them close and they only have to stay out of each other's tube (gap >= 0). Requiring the full clearance at that distance rejected almost every layout.

- **Footprint budget.** `estimateHeightfieldGrid()` is now exported from `caveHeightfieldRepresentation.ts` (the origin/`nx`/`nz` arithmetic hoisted out of `buildCaveHeightfieldRepresentation()`, which calls it) so the recipe prices the exact grid the build would allocate. `fitsAdventureFootprintBudget()` / `ADVENTURE_MAX_HEIGHTFIELD_CELLS = 72_000` gate each layout attempt. Measured: natural ~18k cells, adventure ~37-43k. `DEFAULT_HEIGHTFIELD_CONFIG` is unchanged.

- **Assignment is one pure function.** `assignCaveArchetypes(seed, sites, buildTopology)` in `caveArchetype.ts` owns ordering, the guarantee, the roll and the adventure→natural fallback, and offers each site a given recipe at most once (rejected home candidates are remembered, not rebuilt). `createCaves()` only supplies the builder. Home band is `[LARGE_CAVE_MIN_HOME_DIST, 300]`.

- **Archetype metadata seam.** `Caves.archetypeOf(caveId)` plus `CaveRuntime.archetype`. Nothing was added to `CaveTopology`. New salts: `archetype`, `adventureLayout`, `adventureShape`, `adventureBranch`, `adventureFeature`, `adventureCenterline`.

- **Adventure node ids** (stable, role-based, for Stage B anchors): `adventure-transition`, `adventure-passage-1`, `adventure-chamber-1`, `adventure-passage-2`, `adventure-junction`, `adventure-deep-passage`, `adventure-deep-chamber`, `adventure-final-passage`, `adventure-final-chamber`, `adventure-side-passage`, `adventure-side-chamber`. Exported constants exist for the junction, side chamber and final chamber.

- **Overburden test tolerance.** The dense re-check residual for adventure is ~0.42 m against the natural suite's 0.4 m tolerance (bigger chambers reached over longer interpolated segments). The adventure suite documents 0.5 m; `STATION_SAFETY` itself is unchanged.

Stage B can assume: `Caves.archetypeOf`, the role node ids above, and that adventure caves already exist on the default repro seed. Still to do exactly as written in the notes above: content descriptors resolved against the final heightfield, the explicit-Y `WorldGeneratedContainerSpec` seam, loot tiers, and relevance-streamed props/lanterns.

## Stage B landed — content-anchor seam

Stage B (semantic content anchors only; no chests/props/lights/container Y) is implemented. Corrections against the notes above:

- **Contract.** `CaveContentAnchorRole` / `CaveContentAnchor` live in `src/world/caves/caveContentAnchors.ts`. Roles are `sideTreasure`, `finalTreasure`, `wagon`, `support`, `crate`, `lantern` — none of these were added to `CaveTopologyNodeKind`. Stable ids are `${caveId}:${role}` or `${caveId}:${role}:${ordinal}` for repeating roles. `Caves.contentAnchors()` / `contentAnchorsOf(caveId)` are the public read-only API; `CaveRuntime` stays private. Natural caves return an empty list.
- **Semantic source.** Side treasure ← `adventure-side-chamber`; final treasure ← `adventure-final-chamber`; wagon ← `adventure-deep-chamber`; supports/crates/lanterns ← deeper chambers/passages. Lookup is by role node id, not array position (shuffling `nodes`/`segments` does not change the result). Additional exported ids: `ADVENTURE_DEEP_CHAMBER_NODE_ID`, `ADVENTURE_DEEP_PASSAGE_NODE_ID`, `ADVENTURE_FINAL_PASSAGE_NODE_ID`.
- **Y authority.** Each candidate is sampled with `sampleHeightfieldAt(runtime.heightfield, x, z)`; `y = sample.floorY`. Construction never calls `chunkManager.sampleHeight()`, topology node Y, `Caves.sampleFloor()`, or player-stateful `queryGround()`.
- **Fitting.** Bounded alternatives (`CONTENT_ANCHOR_CANDIDATE_LIMIT = 24`) around the semantic node/segment. Guards: in-void, not `openSky`, `gap >= role.minGap`, `coreT <= maxCoreT`, ring footprint samples, wagon kept off the through-line and off foreign passages. Wagon `minGap`/`footprintRadius` are strictly larger than chest. New RNG salt `adventureContent` (0x0f) only chooses preferred wall-side; it does not touch topology/heightfield streams.
- **Streaming.** Anchors are built with the heightfield at world construct and do not depend on presentation activation.

Stage C can assume the three required adventure anchors exist with heightfield floor Y, and should wire them into `WorldGeneratedContainerSpec` explicit-Y + loot tiers. Still to do: the container Y seam, chests, loot tiers, and relevance-streamed props/lanterns.

## Stage C landed — cave treasure chests

Stage C (two unlocked cave chests, explicit-Y container seam, loot tiers; no props/wagon/lanterns) is implemented. Corrections/decisions against the notes above:

- **Explicit-Y contract.** `WorldGeneratedContainerSpec` gained an optional `y?: number` (`src/world/worldGeneratedContainers.ts`). When present, `createWorldGeneratedContainers()` sets `mesh.position` directly from `spec.x/y/z` (preserving the same local-origin-offset handling `placeOnGround` uses) and never calls `placeOnGround`/`sampleHeight` for that spec. Specs without `y` are unchanged — same `placeOnGround(mesh, spec.x, spec.z, sampleHeight)` call as before. No cave-specific container class; no second placement-mode enum.
- **Composition ownership.** `WorldBundle` composes cave chests: a new pure exported helper `caveTreasureContainerSpecs(anchors, worldSeed)` in `src/app/worldBundle.ts` filters `Caves.contentAnchors()` down to `sideTreasure`/`finalTreasure` and maps each to a `WorldGeneratedContainerSpec` using the anchor's `x/y/z/yaw` verbatim and `generateTreasureLoot(worldSeed, anchor.id, { profile })`. It is pure (no Three.js/scene dependency) so it is unit-tested directly (`src/app/worldBundle.caveTreasure.test.ts`) without booting a full `WorldBundle`.
- **Build-order change.** The `worldGeneratedSpecs` array and the `createWorldGeneratedContainers()` call were *moved* (not duplicated) from before `buildSettlementsManager()`/`createCaves()` to immediately after `createCaves()`, still before the `bundle` object literal is assembled. Nothing between the old and new location reads `worldGeneratedContainers`/`worldGeneratedSpecs` (verified by grep) — `helperDelivery` depends on `placedContainers`, not on the generated containers. `treasureSites`/`treasureDrafts`/`chestX`/`chestZ`/`chestYaw` computation stayed in its original place since caves don't affect it; only the spec-array construction and the `createWorldGeneratedContainers()` call moved.
- **Stable IDs.** Reused the Stage B anchor id directly (`${caveId}:sideTreasure` / `${caveId}:finalTreasure` from `caveContentAnchorId`) as the container id — no extra prefix/suffix, no runtime UUID, no array index.
- **Loot profile contract.** `generateTreasureLoot(worldSeed, siteId, options?)` in `src/items/treasureGameplay.ts` gained an optional third argument `{ profile?: 'default' | 'caveSide' | 'caveFinal' }`, default `'default'` — byte-for-byte the original distribution/RNG-call sequence for every existing caller. `caveSide`: coins `[CAVE_SIDE_COIN_MIN=60, CAVE_SIDE_COIN_MAX=140]` + exactly one weighted gemstone (same `GEMSTONE_WEIGHTS` table as default), never `gold`. `caveFinal`: coins `[CAVE_FINAL_COIN_MIN=220, CAVE_FINAL_COIN_MAX=360]` (disjoint and strictly above the side range — `220 > 140` is a provable range fact, not a probabilistic tendency) + one weighted gemstone + a guaranteed second **large-tier-only** gemstone (`ruby_large`/`diamond_large`) + guaranteed `gold` in `[CAVE_FINAL_GOLD_MIN=2, CAVE_FINAL_GOLD_MAX=4]`. Side never gets a large-tier guarantee or `gold`, so "final is richer" is structurally provable per-call, not just in expectation — see the tier tests in `treasureGameplay.test.ts`.
- **Lock/key decision confirmed.** Both cave chests are plain `WorldGeneratedContainers` — never added to `TreasureSiteDefinition`, no keys, no `unlockedTreasureContainerIds` pre-population. `containerActions`'s existing generic path (`describeTreasureContainerInteraction` / `attemptTreasureUnlock` returning `not-treasure` for an id absent from `bundle.treasureSites`) already handles this with zero changes — confirmed with a small regression test in `treasureGameplay.test.ts` rather than a new containerActions test harness (none existed before this plan).
- **`CAVE_TREASURE_ENABLED` stays `false`.** Its comment in `src/world/treasureSites.ts` now says it denotes the still-missing world-024 keyed/locked cave archetype specifically, not "no interior-Y seam" (that seam now exists). Not flipped.
- **Persistence.** No new save shape. Cave chests flow through the existing `SaveWorldGeneratedContainer` records exactly like every other world-generated chest — contents restore by stable id (`saved.counts`/`instances`/`foodBatches` override `initialCounts`), an emptied chest stays empty, and placement (`x/y/z`) is never read from save — it always comes back from the deterministic spec (anchor → explicit `y`), so restore never re-grounds a cave chest and never resurrects looted contents. See the `worldGeneratedContainers.test.ts` explicit-Y describe block.
- **Tests added:** `worldGeneratedContainers.test.ts` (explicit-Y placement, no-sampleHeight-call proof, legacy surface regression, save-override with explicit-Y placement retained), `treasureGameplay.test.ts` (loot-profile determinism, tier separation/guarantee, explicit-default-matches-implicit regression, not-treasure-container regression for a cave-shaped id), `worldBundle.caveTreasure.test.ts` (pure composition: exactly 2 specs for an adventure-shaped anchor set including non-treasure roles, 0 for an empty/natural anchor set, anchor x/y/z/yaw passthrough, order-independent stable ids, correct profile-per-role wiring).

## Stage D landed — adventure presentation props

Stage D (wagon/cart, support, crate, lantern visuals; optional bounded cave lantern lights; no new gameplay systems) is implemented.

- **Module.** `src/world/caves/caveAdventureProps.ts` — pure `presentationAnchorsFromContent()` / `adventurePropPlacementFromAnchor()` (treasure roles excluded); boot `preloadCaveAdventurePropTemplates()`; synchronous `createCaveAdventurePropsGroup()` at presentation activation.
- **Assets used.** Cart: `/models/parked/cart.glb` via existing `cartProp.ts` (`CART_FIT_MAX = 2.2`, `CART_MODEL_YAW_OFFSET = 0`). Support: `/models/settlement/megakit/support.glb` (`CAVE_SUPPORT_FIT_MAX = 2.2`, procedural timber brace fallback). Crate: `/models/settlement/crate.glb` (`CAVE_CRATE_TARGET_HEIGHT = 0.6`, `createCrate` fallback). Lantern: `LANTERN_URL` + `LANTERN_FLOOR_MAX` (procedural box fallback if load fails). No merchant `wagon.glb`, no settlement wagon behavior/colliders.
- **Ownership / lifecycle.** `createCaves()` filters `CaveRuntime.contentAnchors` to presentation roles when `archetype === 'adventure'` and passes them into `createCaveHeightfieldPresentation()`. Props are a child group `cave-adventure-props` on the same streamed presentation root as the heightfield mesh; `disposePresentation()` removes instances only. Anchors remain world definitions independent of streaming (unchanged from Stage B).
- **Preload / clone.** `worldBundle` awaits `preloadCaveAdventurePropTemplates()` alongside `preloadCartProp()` before `createCaves()`. Activation clones templates synchronously — no per-cave async load, no stale attach after deactivate.
- **Shared GPU.** GLTF cache materials/geometries stay `sharedGpu`; procedural fallbacks are marked on the module template singleton. `disposeObject3D(presentationGroup)` does not free global templates.
- **Placement.** World `x/y/z/yaw` from anchors verbatim; only template-local foot offsets from `prepareProp` / `preparePropFitMax` are composed at clone time. No `sampleHeight`, `placeOnGround`, or `Caves.sampleFloor`.
- **Point lights.** Up to `CAVE_ADVENTURE_LANTERN_LIGHT_LIMIT = 2` real `PointLight`s per active adventure presentation (first lantern anchors in anchor order), `castShadow = false`, registered via `pointLightBudget.registerSubtree(propsRoot)` in `createCaves` and `unregisterSubtree` in `disposePresentation`. `createCaves(..., pointLightBudget)` threaded from `WorldBundle`.
- **Pivot corrections.** None beyond standard prepareProp foot-on-y=0 and cart `CART_MODEL_YAW_OFFSET` (currently 0). No Stage B anchor placement bugs found during implementation.
- **Tests.** `caveAdventureProps.test.ts`, `createCaves.adventureProps.test.ts` (stream in/out, budget unregister, natural cave has no props group).

Stage E (if any) can build on browser-verified prop scale/placement tuning only — no new seam required for presentation attach.

## Pre–Stage E fix (presentation contract)

Small correctness pass before browser tuning (Stage E):

- **Prepared-root offset.** `createCaveAdventurePropsGroup()` pivot world position is exactly semantic anchor `x/y/z`; the cloned template keeps its `prepareProp` / `preparePropFitMax` local root offset once (no `anchor + src.position` on the pivot).
- **Cave `lantern` role → torch presentation.** Stage B role name unchanged; Stage D uses `VILLAGE_TORCH_URL` / `createProceduralTorchPost` + `createVillageTorchLight()` (shared particle fire, baked `Fire` mesh hidden). No `LANTERN_URL` in adventure cave preload. Reuse is direct via `createVillageTorchLight` — no `CaveTorchSystem`, no `houseLighting` behavior change for settlement torches.
- **Flicker.** Cave torches call `setLit(true)` at presentation build; there is no cave presentation `update(dt)` hook, so point-light flicker is **static** after the initial `fireVisual.flicker()` sample (particles visible but not animated per frame).
- **Lights.** Still `CAVE_ADVENTURE_LANTERN_LIGHT_LIMIT = 2` real `PointLight`s per active adventure presentation via `PointLightBudget` register/unregister on the props subtree; `castShadow = false`.
- **Procedural cart fallback.** `preloadCartProp()` marks the procedural singleton template with exported `markSharedGpu()` so `disposeObject3D()` on streamed presentation clones cannot free shared cart geometry/material.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
