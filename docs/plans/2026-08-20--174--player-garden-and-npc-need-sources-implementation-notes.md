# Plan 174 — Player Garden and NPC Need Sources — Implementation Notes

**Reviewed:** 2026-08-21
**Status:** `planned` 📋
**Scope:** current-codebase review; this file is implementation guidance, not an implementation.

## 1. Review verdict

Plan 174 is architecturally sound, but the original plan is behind the current codebase in several important places.

The biggest correction is that **player wells are already implemented** (plan 127) and `NpcAgent` already imports the `NearbyPlayerWellLookup` seam. Do not design a second well/source system. The existing `PlayerWells.nearestCompleted()` is the natural adapter for `thirst` discovery.

Likewise, plan 172 is already implemented and in verification, while plan 126 remains planned. Therefore 174 must integrate with the actual 172 lifecycle API, not invent a new crop lifecycle or assume that player planting already exists.

The current NPC need vocabulary is also different from the plan's examples: `NeedId` uses `food` and `water`, while the underlying need state is `hunger` and `thirst`. Keep this distinction instead of introducing a parallel `hunger/thirst` need enum.

## 2. Current architecture to reuse

### NPC needs / decision flow

`src/ai/Needs.ts` owns the NPC need meters and selection:

- `NeedState.thirst`
- `NeedState.hunger`
- `NeedId: 'food' | 'water' | ...`
- `pickNeed()` with normal and critical thresholds.

Plan 174 should plug source selection into the existing NPC decision/action pipeline after a `food`/`water` need has been selected. Do not add `GardenAI`, `FoodFinderAI`, `WaterFinderAI`, or a second scheduler.

The source resolver should answer something equivalent to: “which concrete world target can satisfy this already-selected need?” It should not replace `pickNeed()`.

### Player-built wells

`src/world/playerWell.ts` defines the persistent well record and the `NearbyPlayerWellLookup` type. `src/world/createPlayerWells.ts` already exposes `nearestCompleted(x, z, maxDistance)` and derives the serving position from the completed well's persisted record.

Important existing semantics:

- only a `roof` stage whose own duration has elapsed is a usable water source;
- well state is world-day based, not a real-time timer;
- wells register through the shared collider registry;
- well state is persisted as a plain world record;
- lookup is bounded by `maxDistance` and scans the existing well collection only.

Use this API. Do not copy well records into NPC state or create a global `NeedSourceManager` containing wells.

`NpcAgent.ts` already imports `NearbyPlayerWellLookup`, which strongly suggests the existing NPC water-fetch integration point should be extended rather than replaced. Trace the constructor/wiring in `NpcAgent.ts` and `createApp.ts` before adding another resolver.

### Natural food

Plan 159's natural food is already represented by the existing world item/chunk systems. The important current distinction is:

- natural berries/nuts/etc. are world item placements from the chunk item pipeline;
- settlement garden carrot/potato/cabbage pickups are currently renewable `ItemSpawnPoint`s in `src/items/createItemSpawners.ts`;
- these are not interchangeable with lifecycle-bearing planted crops.

Do not make NPC food discovery scan every `ItemSpawnPoint` or every item in the world globally. Extend/reuse the existing bounded chunk/resource query mechanism used by world items, or add a small bounded query at the owner of that resource data.

The source object should be a lightweight target description, not a copied `ItemPlacement`/crop/well state.

## 3. Plan 172 / 126 boundary

Plan 172's implementation notes explicitly distinguish natural crop lifecycle from existing renewable garden pickup spawners and from future planted crops. That distinction matters for 174.

Plan 126 is still **planned**. Do not assume that a player-planted crop API already exists. 174 should define the integration seam that 126 will consume, but should not implement seed planting merely to make the 174 scenario work.

For the garden side, the desired ownership remains:

```text
126  seed + planting + placement
172  crop lifecycle / stage resolution
174  player garden plot + NPC need-source adapter
```

A mature crop should become a hunger source through the shared crop lifecycle resolver. Do not create `NpcGardenAction` if the existing gather/harvest path can accept a generic target.

## 4. Garden implementation

Use the same player-built world-object pattern as tents, traps, containers and wells:

- plain persistent record for gameplay state;
- factory responsible for scene representation and colliders;
- wiring through `WorldBundle` / `createApp.ts` where appropriate;
- save/load through the existing player-built-object persistence path;
- no `GardenManager`.

The garden plot should primarily be a **placement/anchor object** for future crop slots. It should not own a second crop simulation.

Before implementation, inspect the exact current placement APIs for `PlacedContainers`, `PlacedTents`, `PlacedTraps` and `PlayerWells` and follow whichever one is closest to a static player-built world object.

The minimum construction cost from the plan is shovel + wood + stone. Reuse the existing held-tool/placement validation and inventory mutation conventions; do not hardcode a second resource-transfer path.

## 5. NeedSource shape

Keep the abstraction small and data-oriented. It should describe an actionable target, for example:

```ts
type NeedSource = {
  need: 'food' | 'water'
  position: { x: number, y: number, z: number }
  distanceSq: number
  isAvailable: boolean
  // target/action information should use existing domain identifiers
}
```

This is guidance, not a required public type.

Prefer a source resolver such as:

```text
findNeedSource(need, npcPosition, boundedRadius)
```

rather than a registry. The resolver can query each relevant existing source domain locally and score the candidates.

Do not store the resolved source as persistent NPC state. A source may disappear, become unavailable, or unload before the NPC reaches it.

## 6. Selection/scoring

The first version should be deliberately simple:

1. filter by requested need;
2. reject unavailable targets;
3. reject targets outside a bounded search radius;
4. reject targets that cannot be reached by the existing movement/action path;
5. choose the lowest travel cost / distance, with a deterministic tie-breaker.

Do not use `Math.random()` for source selection. Stable ordering plus distance is sufficient.

`distanceSq` is enough for candidate comparison; only calculate square roots if the resulting travel distance is actually required by an action.

If path feasibility is already represented by the existing collider/movement logic, let the final action validate the target again. Do not introduce a global pathfinding preflight solely for scoring.

## 7. Source-specific adapters

Keep source knowledge at the resource owner where possible:

```text
PlayerWells
  → nearestCompleted()
  → water source

Natural world items / chunk item query
  → nearest available edible placement
  → food source

Crop lifecycle / garden plot
  → mature planted crop
  → food source
```

The generic NPC resolver should combine these adapters, not inspect private fields of each system.

This keeps future sources such as hunting/fishing/water barrels compatible without adding more NPC-specific behaviour classes.

## 8. Action integration

A successful source selection should feed an **existing** NPC movement/action mechanism.

The action needs to retain enough target identity to validate the target when the NPC arrives. Position alone is not enough for mutable resources such as crops and pickups.

Recommended conceptual flow:

```text
pickNeed() → food/water
        ↓
local source query
        ↓
source target/id
        ↓
existing movement
        ↓
arrival validation
        ↓
existing gather/drink/consume action
        ↓
normal inventory/need mutation
```

Do not reduce the whole operation to “NPC walks to coordinates and hunger goes down”. That would bypass the existing item/crop/water ownership models.

The arrival action must re-check availability because another NPC/player may have consumed or harvested the source while this NPC was travelling.

## 9. Water-specific pitfall

The plan says “well → collect/use water”, but the current code already distinguishes personal thirst from household `waterDuty`.

Do not accidentally satisfy `waterDuty` when implementing personal thirst, and do not route a personal thirst need through household `WaterBarrel`/`AnimalTrough` logic unless the existing action explicitly models that.

`NeedId.water` corresponds to the NPC's own thirst. `NeedId.waterDuty` is a separate household provisioning chore.

The completed player well should be exposed as a source for the former, while preserving the existing household-water path for the latter.

## 10. Food-specific pitfall

Do not treat every item with a food-related name as an NPC source.

Use the existing item catalogue / consumable metadata and the item's existing gather/consume lifecycle. The source resolver should identify an actual world target that can yield an edible item, not fabricate an item directly into the NPC inventory.

For natural food, preserve the existing world item identity/collected-state semantics. For planted crops, use crop identity and lifecycle state. For settlement garden renewable pickups, only include them if their existing pickup semantics are intentionally made available to NPCs; do not silently reinterpret them as planted crops.

## 11. Persistence and chunk lifecycle

Never persist a `NeedSource` list.

Persist only the underlying world objects using their existing save mechanisms:

- garden plot record;
- planted crop state through the 126/172 contract;
- well records through the existing player-well persistence.

For natural procedural food, follow the existing chunk item sparse-state model. A consumed/harvested target must not reappear merely because its chunk was unloaded and regenerated.

NPC source discovery must only query loaded/local data or use an existing deterministic bounded world query. It must not force all chunks to load.

## 12. Performance

The plan's “no NPC × all world resources” requirement is especially important here.

Good trigger points:

- when `pickNeed()` changes the active need;
- after arrival/action failure;
- after a source is found to be unavailable;
- after a meaningful world/source change if an existing event/hook already exists.

Bad trigger points:

- every render frame;
- every NPC simulation tick regardless of need;
- every chunk load for every NPC;
- global registry rebuilds after every pickup.

Keep queries spatially bounded. If the current chunk APIs do not expose a suitable local query, add one to the resource owner instead of introducing a manager.

## 13. Determinism

The source selection itself should be deterministic. This is separate from deterministic procedural resource generation.

Use:

```text
candidate availability
→ distance/travel cost
→ stable source id tie-break
```

Do not let array insertion order from unrelated systems become an accidental gameplay rule unless the source IDs are stable.

## 14. Important current-code mismatches to avoid

The implementation agent should explicitly account for these differences between the plan wording and today's code:

1. **`hunger/thirst` vs `food/water`:** the meters are `hunger`/`thirst`, but `NeedId` is `food`/`water`.
2. **Well already exists:** plan 127 is implemented; reuse `PlayerWells.nearestCompleted()`.
3. **NPC well seam already exists:** `NpcAgent.ts` already references `NearbyPlayerWellLookup`; inspect and extend it instead of adding a parallel injection.
4. **Plan 172 is implemented:** use its actual crop lifecycle API; do not recreate the model from the plan text.
5. **Plan 126 is not implemented yet:** garden planting cannot be assumed to exist.
6. **Garden crop pickups are not automatically planted crops:** `createItemSpawners.ts` still uses renewable `ItemSpawnPoint`s for carrot/potato/cabbage.
7. **`waterDuty` is not personal thirst:** do not conflate the two.
8. **WorldBundle is authoritative for world system lifetime:** if a new garden system is added, wire it through the bundle/rebuild lifecycle rather than capturing replaceable world-system fields in closures.

## 15. Suggested implementation order

1. Trace the existing NPC `food`/`water` action path and `NearbyPlayerWellLookup` wiring.
2. Trace the actual 172 crop lifecycle and its current interaction/harvest API.
3. Trace existing player-built placement + persistence patterns.
4. Implement the garden plot using the closest existing player-built world-object pattern.
5. Add the smallest resource-owner queries needed for natural food and mature crops.
6. Introduce the generic local source selection seam.
7. Connect `food`/`water` decisions to the source target while preserving existing actions.
8. Revalidate source availability at arrival.
9. Add focused unit tests for deterministic selection and unavailable-source fallback.
10. Run typecheck/lint/tests/build, then browser-test the end-to-end scenarios.

## 16. Testing priorities

At minimum cover:

- `water` selects a completed nearby well;
- unfinished well is ignored;
- `water` does not use `waterDuty` targets by accident;
- unavailable nearest source is skipped;
- farther available source is selected;
- deterministic tie-break between equal-distance sources;
- natural berry/nut source is usable through existing item semantics;
- mature crop is a hunger source;
- young/unavailable crop is ignored;
- source consumed by another actor before arrival causes a re-query/fallback rather than free hunger reduction;
- source discovery is bounded and does not require all chunks to be loaded;
- garden persistence survives save/load and world rebuild;
- no source registry is scanned every frame.

## 17. Verification commands

Use the repository's current commands rather than blindly copying commands from older plans. The plan map and recent implementation notes indicate `tsc`, lint, tests and build as the normal technical checks; confirm the exact `package.json` scripts before running them.

Browser verification is required for:

```text
player builds garden
→ crop is planted through the eventual 126 path
→ crop matures through 172
→ hungry NPC discovers it
→ NPC reaches it
→ existing harvest/consume path runs

player builds completed well
→ thirsty NPC discovers it
→ NPC reaches the well
→ existing water action runs

NPC outside settlement
→ local natural food / completed well discovery still works
```

## 18. Architectural target

The final shape should remain:

```text
existing resource owner
        ↓
small local query / adapter
        ↓
NeedSource candidate
        ↓
existing NPC need decision
        ↓
existing movement/action
        ↓
resource owner's normal mutation
```

The key invariant is: **NeedSource is a temporary decision representation, not a second authoritative world state.**

That keeps 174 compatible with future hunting, fishing, barrels and other resources without creating a monolithic NPC resource manager.
