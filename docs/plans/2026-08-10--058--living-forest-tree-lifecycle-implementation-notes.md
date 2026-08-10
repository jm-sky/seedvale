# 058 — Living Forest / Tree Lifecycle — implementation notes

**Plan:** [058 — Living Forest / Tree Lifecycle](./2026-08-10--058--living-forest-tree-lifecycle.md)
**Reviewed:** 2026-08-10

## Review result

The plan is directionally compatible with the current architecture, but implementation needs explicit decisions around runtime tree state, persistence, NPC tree targets, and harvest resources.

## Decisions

### 1. `chunkVegetation.ts` remains the procedural source of truth

`computeChunkVegetation()` already runs in `chunkHeightmap.worker.ts` and returns pure placement data. Keep that pipeline for deterministic **initial placement only**.

Do not turn `chunkVegetation.ts` into a runtime lifecycle manager and do not move Three.js tree objects into the worker.

Lifecycle stage should be explicit data; model `scale` remains a visual representation derived from stage/progress.

### 2. Tree identity must be derived from placement data

Use a stable deterministic id derived from world seed + quantized world position + species identity, with chunk coordinates as namespace information. Do not use Object3D ids or runtime array indexes.

The v1 assumption is that procedural placement remains stable for a given seed/code version. An intentional future placement algorithm change is a world-generation change, not something requiring arbitrary tree-id migration.

### 3. Runtime state belongs to a dedicated tree lifecycle layer

`ChunkManager` owns streamed Three.js vegetation groups and the worker owns deterministic placement. Neither should become the sole owner of `TreeState`.

Introduce a small tree lifecycle/domain module responsible for `TreeState`, defaults, sparse overrides, growth/regrowth calculation, harvesting transition, and resolving the current visual stage.

`ChunkManager` consumes this state when instantiating/removing vegetation.

### 4. Sparse overrides are the persistence model

Persist only trees whose state differs from their deterministic procedural default, for example:

```ts
Record<TreeId, TreeStateOverride>
```

At the current stage of the project **backward compatibility with existing saves is not required**. Do not add a migration layer solely for v1 tree lifecycle. The current save schema can be extended directly.

Save loading should be defensive: wrap deserialization/validation in `try/catch` and fall back to a new/default world if the saved data is incompatible or corrupted. The game must not fail to start because of an old or malformed save.

When a tree returns fully to its procedural default, its override may be removed.

### 5. Time skip must be lazy

Do not update every tree during `gameLoop` or time skip.

Persist transition timestamps/progress anchors and resolve current stage when the tree is loaded, queried, locally recalculated, or explicitly saved. Large time skips should be calculated from `WorldTime`, not replayed as growth ticks.

### 6. Initial saplings are real lifecycle stages

Current small-tree placement is effectively a visual `isSapling` scale variant. Convert it into an explicit deterministic `sapling` lifecycle stage.

Do not infer lifecycle from arbitrary model scale after this conversion.

### 7. NPC woodcutting targets real trees

Current `SettlementLandmarks.trees` / `workplaceFor('woodcutter')` provides positions, while `NpcAgent` already has generic `goTo → execute` / `PlannedAction` flow. Keep that action architecture, but resolve work targets to actual trees carrying `TreeId` and lifecycle state.

Target flow:

```text
wood need / scheduled work
        ↓
find mature tree in allowed local area
        ↓
TreeId target
        ↓
goTo
        ↓
shared HarvestAction
        ↓
TreeState transition
        ↓
harvest yield
```

Do not create a separate NPC-only chopping system. This keeps the operation reusable by plan 057 and compatible with plan 055's future shared-action direction.

### 8. Harvest resource must use the existing resource flow

The current `ItemKind` has `branch`, but no `wood`. Do not assume a `wood` inventory type already exists and do not create a parallel tree resource store.

For v1, use the existing resource representation unless implementation deliberately introduces a shared resource concept in the existing item system. Plan 057 must consume the same harvest result.

### 9. Harvesting is a world effect

Authoritative operation:

```text
HarvestAction → TreeLifecycle.harvest(treeId) → state override
```

The renderer resolves the resulting state to mature/stump/dead-wood visuals. Chunk reload reconstructs the visual from lifecycle state.

### 10. Stump is part of the same lifecycle

Do not create a separate persistent stump entity collection.

The same `TreeId` survives:

```text
mature → harvested/stump → regrowth → sapling → young → mature
```

### 11. Canopy competition is local

Use local spatial queries over nearby chunk/vegetation data. Do not create a global list of all trees or global O(n²) comparisons.

The v1 model can approximate canopy by nearby mature-tree density. Harvested overrides reduce the canopy contribution of harvested trees. Queries must work across chunk boundaries.

### 12. Keep the existing worker boundary

`chunkHeightmap.worker.ts` already batches terrain, vegetation, items and environment generation. Keep that architecture.

Do not add worker messages per tree. If profiling shows batch growth/canopy work is expensive, extend the existing chunk/region batch pipeline instead.

### 13. Reuse existing environment inputs

Use existing terrain/biome data such as heights, continentalness, mountainRidge, moistureRegion and biome weights. Do not add groundwater or a full soil simulation to 058.

Species preferences should be data-driven rather than scattered biome conditionals.

### 14. Seasons remain an optional hook

Plan 040 remains separate. `GrowthModel` may accept a future season modifier, but 058 must not implement seasons or require them.

### 15. Do not block on plan 055

Plan 055 is planned, not implemented. Reuse the existing `NpcAgent` `PlannedAction` model and keep tree harvesting as a domain/world effect. Do not wait for a complete shared simulation rewrite.

## Acceptance additions

Verify explicitly:

- tree identity survives chunk unload/reload;
- harvested state survives chunk unload/reload;
- harvested/growth state survives save → Continue;
- incompatible/corrupt saves fall back safely to defaults/new game;
- NPC woodcutting targets `TreeId`, not only `Vector3`;
- NPC and future player harvesting call the same world harvest operation;
- no parallel `wood` inventory/resource system is introduced;
- sapling/young/mature are lifecycle data, not only model-scale conventions;
- canopy queries work across chunk boundaries without global O(n²);
- time skip does not iterate every tree frame-by-frame.
