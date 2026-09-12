# Implementation notes: world-terrain-024 dungeon cave archetype

**Reviewed:** 2026-09-12  
**Plan:** `docs/plans/world-terrain-024-dungeon-cave-archetype.md`  
**Baseline:** `main` at `92056c605d27a7b8c5838fde4fb97c5ca46699e8`

Focused handoff for the current Cave V2 code. Do not repeat broad cave recon unless `main` materially changed.

## Existing ownership to extend

The production chain is already the desired one:

```text
pickLargeCaveSites()
→ assignCaveArchetypes()
→ buildProductionCaveTopology()
→ buildCaveHeightfieldRepresentation()
→ one CaveRuntime
```

Relevant seams:

- `src/world/caves/caveArchetype.ts` — assignment, guaranteed home adventure and the existing 15% adventure roll/fallback.
- `src/world/caves/productionTopology.ts` — recipe dispatcher; natural recipe is a regression fixture.
- `src/world/caves/adventureTopology.ts` — folded multi-section reference recipe.
- `src/world/caves/caveRoute.ts` — shared terrain-aware route authority: `walkSegment()`, grade/overburden/drop rules, `minGapBetweenPaths()`.
- `src/world/caves/caveRng.ts` — purpose-scoped deterministic RNG streams.
- `src/world/caves/caveHeightfieldRepresentation.ts` — `estimateHeightfieldGrid()` and the retained spatial representation.
- `src/world/createCaves.ts` — builds topology **and retained heightfield for every accepted cave up front**; only presentation is distance-streamed.
- `src/world/caves/caveHabitat.ts` — generic chamber selection + BFS over `CaveTopology.segments`; no dungeon routing path is needed.

`CaveTopology` already supports arbitrary graphs. Keep `CaveTopologyNodeKind` unchanged; junction semantics come from graph connectivity/stable ids, not a new dungeon node kind.

## Assignment: preserve adventure first, then add dungeon

`assignCaveArchetypes()` currently caches rejected/accepted adventure attempts so each site is offered a recipe at most once and returns results in original siting order. Preserve that property.

Safest extension:

1. Run the existing guaranteed-home-adventure selection first, unchanged. Its chosen `caveId` must remain identical for existing seeds.
2. Reserve that site from the dungeon guarantee.
3. Maintain a separate `dungeonAttempts` cache and try deterministic dungeon candidates; first accepted becomes guaranteed dungeon.
4. Final pass remains in original `sites` order: guaranteed adventure → guaranteed dungeon → 5% dungeon roll → unchanged `rollsAdventure()` → natural fallback.
5. Reuse cached attempts. A rejected dungeon must still proceed through the existing adventure roll and then natural fallback.

Do not rename/reseed `rollsAdventure()` or change `CAVE_RNG_SALT.archetype`; its output is already tested as a regression contract. Add new salts after the existing values for dungeon roll/layout/shape/branch/centerline (and feature if needed).

### Dungeon distance ordering

`RING_MAX = 620` is private to `largeCaves.ts`; assignment already receives only sites accepted by that siting authority. Do **not** export/duplicate that limit just for dungeon assignment.

Interpret the plan's distance intent as a ranking over existing sites:

- first: preferred `400–550 m` candidates;
- then: remaining candidates `>= 300 m` in stable distance/`caveId` order;
- finally: remaining sites `< 300 m` only as fallback if needed to preserve the stronger plan invariant “guarantee a dungeon when any non-adventure existing site can accept one”.

This keeps 300 m a placement preference rather than silently contradicting the plan's fallback guarantee. Never synthesize a site or modify `pickLargeCaveSites()`.

## Topology recipe

Add `src/world/caves/dungeonTopology.ts`; do not grow adventure conditionals or clone the whole file. Reuse public `caveRoute.ts` primitives. If a tiny radial-station/self-separation helper genuinely benefits both recipes, extract it mechanically and keep all existing adventure fixtures unchanged.

Important current-code trap: `buildProductionCaveTopology()` is presently:

```ts
if (input.archetype === 'adventure') return buildAdventureCaveTopology(input)
return buildNaturalCaveTopology(input)
```

After extending the union, this would silently build `dungeon` as `natural`. Make the dispatcher explicit/exhaustive while preserving omitted `archetype` → natural compatibility.

For the dungeon recipe:

- keep `MAX_TOTAL_DROP = 12`, `MAX_TRAVERSABLE_FLOOR_GRADE` and existing overburden rules unchanged; use a gentler dungeon-specific baseline descent if the longer route needs it;
- use a fixed bounded attempt count;
- validate the semantic graph before pricing/building the heightfield;
- use `estimateHeightfieldGrid()` for a dungeon-specific cell cap, chosen from actual generated fixtures rather than as a multiplier of `72_000`;
- preserve at least one normal shelf/overhang feature via `lowerFeatureIfNeeded()` so dungeon remains a regular production topology rather than a featureless special case.

With multiple branches, clearance must cover more than “branch vs main”. Check disconnected/non-neighbour route sections pairwise, excluding only the legitimate shared-junction footprint; otherwise the heightfield smooth union can create accidental shortcuts between folded passages.

Validate branch decisions from the segment graph (junction degree/connectivity), not from `kind === 'widening'`. The current adventure junction happens to be a widening, but `CaveTopologyNodeKind` is not a graph-role vocabulary.

## Stable chamber semantics: expose a narrow cave-owned view

Current `Caves` does **not** expose raw topology. That is good, but it means a helper only inside `dungeonTopology.ts` would not satisfy later `fauna-027`, which needs to enumerate stable dungeon chambers without reaching into `CaveRuntime` or parsing layout constants.

Add a small pure cave-semantic helper/module over `CaveTopology` and a thin read-only `Caves` accessor, e.g. `dungeonChambersOf(caveId)`. The exact name/type is flexible; the contract should expose only what later plans need, such as stable `nodeId`, a minimal semantic class (`regular`/`side`/`deep`/`final`/entrance-adjacent where useful), and representation-neutral node position/size.

Do not expose `topologyOf()` just to solve this and do not create mutable `DungeonRoom` state. Node id remains identity. Future `world-terrain-025` can use the same pure helper while choosing its pool chamber before heightfield construction; future fauna can use the read-only runtime accessor plus existing cave-scoped spatial queries.

Keep `caveHabitat.ts` generic. Its existing `resolveCaveTraversal()` already finds a standable chamber and BFS route to `entrance`; dungeon only needs a connected, honest segment graph. Multi-resident chamber assignment belongs to the later fauna plan, not here.

## Existing presentation/content behaviour

Keep these current gates as-is:

- `resolveCaveContentAnchors()` returns empty unless archetype is `adventure`;
- `createCaves.ts` passes adventure prop anchors only for `adventure`.

Dungeon therefore gets no wagon/lantern/treasure content from this plan.

`resolveCaveInteriorRocks()` is generic and already derives clutter from topology/heightfield with a hard `MAX_INTERIOR_ROCKS_PER_CAVE = 90`; dungeon should naturally receive that existing common cave dressing. Do not add dungeon-specific density or new prop types here.

No archetype switch should be added to ground, occupancy, horizontal containment, interior detection, terrain cutout, streaming or player movement.

## Performance constraints

Dungeon heightfields are not deferred until the player approaches: `createCaves()` builds all accepted retained fields during `cave.heightfield`. The field currently stores four `Float32Array`s, so raw retained arrays cost about **16 bytes per grid cell** before mesh/presentation overhead. A dungeon cell budget therefore directly affects boot CPU and persistent world-bundle memory.

Presentation remains synchronous and relevance-streamed with one queued cave build per update. Do not move generation to a worker or change global `DEFAULT_HEIGHTFIELD_CONFIG.cellSize = 0.3` in this plan.

Use `estimateHeightfieldGrid().cells` in fixtures and the existing `cave.topology` / `cave.heightfield` boot marks for later profiling; tests should enforce bounded work/cell counts, not wall-clock timings.

## Highest-value tests

Extend existing focused suites rather than broad new integration harnesses:

- `caveArchetype.test.ts`: exact old adventure guarantee/roll stays unchanged; dungeon candidate ordering; independent 5% salt; guarantee excludes guaranteed adventure; per-recipe attempt caching; dungeon reject → adventure roll → natural; original site order retained.
- new `dungeonTopology.test.ts`: deterministic output, ≥5 chambers, two genuine graph branch decisions, side/deep/final stable ids, every chamber reachable from entrance, longer than adventure fixture, grade/drop/overburden/disconnected-path clearance, bounded attempts and footprint cap.
- `createCaves.archetype.test.ts`: accepted archetypes include dungeon; fixed production seed proves guaranteed adventure selection did not move and a dungeon is selected only from existing sites; no dungeon ids/content leak into natural/adventure outputs.
- chamber semantic helper/accessor: stable order/ids and no array-index-dependent classification.
- retain existing adventure/natural fixture suites unchanged as regression tests.

Avoid a tiny-sample statistical assertion for exactly 5%; test the deterministic threshold directly and use a large fixed sample only as a sanity check if useful.

## Suggested implementation order

1. Add dungeon RNG salts + pure assignment/order tests and extend `assignCaveArchetypes()` without touching topology.
2. Add explicit dispatcher arm and `dungeonTopology.ts` with focused fixtures/guardrails.
3. Add the narrow chamber semantic helper/accessor.
4. Wire through `createCaves()`; confirm existing adventure content gates remain unchanged.
5. Update current-state docs only after implementation.

## Model recommendation

**Model:** Opus, Sonnet

The scope is contained inside caves, but deterministic assignment compatibility, folded multi-branch geometry and a future-facing chamber contract make regression reasoning non-trivial. Opus is the safest primary choice; with these notes and the existing strong cave tests, Sonnet is the cheaper fallback with limited extra risk.
