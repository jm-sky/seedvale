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

Add new independent `CAVE_RNG_SALT` values for archetype/content/layout decisions. Do not consume extra values from existing natural-cave RNG streams: changing call order would silently change existing seeded natural caves.

Do not put `archetype` into `CaveTopology` merely for rendering. Keep archetype/site metadata alongside the runtime/topology unless a real representation-neutral consumer requires it.

## Cave-site assignment: important acceptance-order detail

`pickLargeCaveSites()` currently creates up to 10 deterministic candidates in a 130–620 m ring around origin, with `LARGE_CAVE_MIN_HOME_DIST = 110`, 90 m cave separation, village/road/coast/ridge/slope filters. `createCaves()` then calls `buildProductionCaveTopology()` and drops rejected sites.

Therefore the home guarantee must be applied to **accepted cave runtimes**, not blindly to the first candidate site. A candidate selected as adventure may be rejected by the longer topology even though a nearby natural topology would have been accepted.

Recommended bounded flow:

1. Keep `pickLargeCaveSites()` as the siting authority; do not invent an extra cave near home.
2. Establish deterministic archetype preferences for sites without depending on iteration/streaming order.
3. Build/accept topologies.
4. Ensure exactly one accepted cave in the preferred home band is adventure. If the preferred candidate cannot accept an adventure topology, deterministically try the next eligible accepted/acceptable candidate by distance/tie-break identity.
5. If none exists in the preferred band, expand over the already-existing candidate set and choose the nearest site that can accept adventure topology. Do not synthesize a new site.
6. Other eligible caves use an independent 15% adventure roll.

The implementation should define the preferred home band explicitly in code/tests. Current siting already excludes <110 m, so the lower bound should not fight `LARGE_CAVE_MIN_HOME_DIST`. Avoid coupling this to camera/player position; home is the origin/current home settlement footprint already passed into `createCaves()`.

Because adventure topology is longer, do not implement the guarantee as “build natural first, then relabel it”: archetype must be known before topology construction. A small pure assignment/selection helper is preferable so guarantee/15% behavior can be tested without Three.js.

## Adventure topology shape and footprint

The plan wants roughly 3–4x the current exploration length, several spaces, one guaranteed junction, side chamber and final chamber. Treat 3–4x as gameplay route length, not `LargeCaveSite.length` multiplication and not a requirement to spread 3–4x farther in one world direction.

Keep the route relatively compact in XZ because `buildCaveHeightfieldRepresentation()` allocates a rectangular grid over topology bounds. A long straight or widely fanned topology increases empty cells and mesh/build cost. Prefer a deterministic folded/curving main route with separated legs.

Suggested semantic node IDs should be stable and role-based because later content anchors need them, e.g. `adventure-junction`, `adventure-side-chamber`, `adventure-final-chamber`. Exact names are implementation detail, but do not discover treasure rooms later by “last chamber in array”.

The side branch is mandatory for adventure; do not reuse the natural 35% branch roll for it. Reuse the existing branch clearance calculation and retry/reject deterministically if a candidate branch would smooth-union into the main route.

Before accepting a topology, preserve existing overburden/drop/grade rules. It is acceptable for an adventure recipe to reject terrain that supports a natural cave. The home-guarantee selector must handle that by trying another existing site.

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

- `productionTopology.test.ts`: natural regression, adventure deterministic route, mandatory branch, side/final semantic nodes, grade/overburden/clearance, compact bounds/route-length ratio;
- pure archetype assignment tests: home guarantee, deterministic fallback, 15% roll independent from topology RNG, no synthetic site;
- `createCaves.test.ts`: content descriptors resolve to final heightfield floor with adequate gap and stable IDs; natural caves expose no adventure content; presentation props activate/dispose with cave group;
- `worldGeneratedContainers.test.ts`: explicit-Y spec places underground mesh at supplied Y while legacy surface specs still call ground placement; saved contents override initial loot without changing deterministic placement;
- `treasureGameplay.test.ts`: tier/profile determinism and final profile strictly/range-wise richer than side while legacy default stays unchanged;
- WorldBundle-level targeted test only if needed to prove the two descriptors become exactly two existing world-generated chest specs.

Do not write statistical tests expecting exactly 15% in a tiny sample. Test the deterministic threshold/helper directly and optionally use a large fixed sample only as a sanity check.

## Performance guardrails

The expensive part of a long cave is the heightfield's rectangular XZ bounds, not only node count. Add a measurable test/assertion or debug statistic for route length vs bounds/cell count so adventure tuning cannot accidentally create a huge mostly-empty grid.

Do not change global `DEFAULT_HEIGHTFIELD_CONFIG.cellSize` for this plan. Do not move heightfield building to a worker as part of this feature. Keep `PRESENTATION_BUILDS_PER_UPDATE = 1` unless profiling shows a separate problem.

Props must be template-reused/cloned and relevance-streamed. Avoid per-cave materials where an existing/shared material/template already owns them.

## Suggested implementation order

1. Pure archetype assignment + adventure topology recipe and tests, no treasure/props.
2. Cave semantic content descriptors resolved against final heightfield.
3. Explicit-Y world-generated-container seam + two cave chest specs + deterministic side/final loot tiers + persistence tests.
4. Relevance-streamed cart/wagon/support/lantern presentation using existing assets.
5. Targeted regression/typecheck/lint/build; User performs browser verification.

Keep each step independently testable. Do not mix topology tuning with container persistence changes in one large edit if avoidable.

## Do not do

- no `AdventureCaveManager`, `DungeonGraph` or cave-specific inventory;
- no SDF/collider resurrection;
- no new cave save blob for deterministic archetype/topology/content placement;
- no fake surface terrain height for underground chests;
- no keys/locks/traps unless scope is explicitly expanded;
- no fauna/NPC navigation, ore/mining, collapse, lake or dungeon geometry;
- no external asset download;
- no browser verification by AI;
- do not run `pnpm docs:sync` (GitHub workflow owns generated docs).

For new important public/architectural helpers, add useful JSDoc and `@domain world-terrain` (or the actual owning domain for cross-domain helpers) when it improves preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**