# 050 — Living Forest / Tree Lifecycle — implementation notes

**Plan:** [050 — Living Forest / Tree Lifecycle](./2026-08-10--050--living-forest-tree-lifecycle.md)
**Reviewed:** 2026-08-10

## Review result

The plan is directionally compatible with the current architecture, but it is not implementation-ready without a few concrete decisions. The main gaps are ownership of runtime tree state, persistence, the current NPC tree abstraction, and the resource yielded by harvesting.

## Decisions

### 1. `chunkVegetation.ts` remains the procedural source of truth

`computeChunkVegetation()` already runs in `chunkHeightmap.worker.ts` and returns pure placement data. Keep that pipeline for deterministic **initial placement only**.

Do not turn `chunkVegetation.ts` into a runtime lifecycle manager and do not move Three.js tree objects into the worker.

The placement should gain an explicit deterministic initial lifecycle stage instead of using `scale` as the lifecycle state. `scale` remains a visual representation derived from stage/progress.

### 2. Tree identity must be derived from placement data, not the Three.js object

Use a stable, deterministic id derived from world seed + quantized world position + species identity (and chunk coordinates as part of the namespace). Do not use an Object3D id or runtime array index as the persistent identity.

The id must be available both when a chunk is generated and when a persisted sparse override is restored.

The v1 assumption is that procedural placement itself is stable for a given seed/code version. If a future vegetation algorithm intentionally changes placement, that is a world-generation change and should be handled as such rather than trying to migrate arbitrary old tree identities.

### 3. Runtime state belongs to a dedicated world/tree lifecycle layer

`ChunkManager` currently owns the streamed Three.js vegetation groups, while the worker owns deterministic placement. Neither should become the sole owner of `TreeState`.

Introduce a small tree lifecycle/domain module responsible for:

- `TreeState`,
- deterministic default state,
- sparse overrides,
- growth/regrowth calculation,
- harvesting transition,
- resolving the current visual stage.

`ChunkManager` consumes this state when instantiating/removing vegetation.

### 4. Sparse overrides are the persistence model

Current IndexedDB save data (v6) has no tree state. The existing persistence system must therefore be extended explicitly; streaming alone cannot satisfy the plan's persistence acceptance criteria.

Use a new save schema version (next version) with a sparse collection such as:

```ts
Record<TreeId, TreeStateOverride>
```

Only trees whose state differs from their deterministic procedural default are persisted.

When a tree has fully returned to its procedural default, its override may be removed. This prevents the save from becoming a list of every tree in the world.

Migration of existing v6 saves should produce an empty tree-override collection.

### 5. Time skip must be lazy, not tick-based

Do not update every tree during `gameLoop` or during time skip.

Persist transition timestamps/progress anchors and calculate the current stage when the tree is:

- loaded,
- queried for interaction/harvesting,
- needed for a local growth/competition update,
- explicitly saved.

A large time skip should therefore be handled as a calculation from `WorldTime`, not by replaying growth ticks.

### 6. Initial saplings are real lifecycle stages

The current `chunkVegetation.ts` already creates a minority of visually small trees, but this is currently only a random scale (`isSapling` → small scale). It is not a persistent lifecycle stage.

In 050, convert this concept to an explicit initial `sapling` stage. Do not infer lifecycle from arbitrary model scale after the conversion.

The initial stage/progress should remain deterministic for a given seed and placement.

### 7. NPC woodcutting must stop targeting static settlement tree positions

The current `SettlementLandmarks.trees` / `workplaceFor('woodcutter')` model provides positions for NPC work, and `NpcAgent` already has generic `goTo → execute` / `PlannedAction` flow. However, those positions are not tree entities with lifecycle state.

Keep the existing NPC action architecture, but change the woodcutting target from a bare `Vector3` to a resolved tree reference/target carrying `TreeId` and current lifecycle state.

The NPC flow should become:

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
resource yield
```

Do not create `NpcTreeChopping` as a second action system. This aligns with plan 055's shared action/world-effect direction and leaves the same harvest operation available to plan 057.

### 8. `wood` does not currently exist as an `ItemKind`

The current item system contains `branch`, but no `wood` item. Therefore 050 must not assume that a `wood` inventory flow already exists.

For v1, use the existing resource representation (`branch`) for the NPC harvest yield, unless implementation of 050 deliberately introduces a shared `wood` resource concept as part of the existing item system. Do not create a parallel tree-only resource store.

Plan 057 should consume the exact same harvest result rather than inventing a separate player-only wood reward.

### 9. Harvesting should be a world effect, not a renderer mutation

The authoritative operation is:

```text
HarvestAction → TreeLifecycle.harvest(treeId) → state override
```

The renderer then resolves the state to the mature/stump representation.

A chunk unload/reload must reconstruct the visual from `TreeState`, not from the fact that a mesh used to exist.

### 10. Stump is a lifecycle representation

Do not add a separate persistent "stump entity" collection in v1.

A harvested tree remains the same `TreeId`; its visual state changes to `stump/dead wood`, and its regrowth state is derived from the same lifecycle record.

This keeps the tree identity stable across:

```text
mature → harvested/stump → regrowth → sapling → young → mature
```

### 11. Canopy competition must be local and approximate

Do not perform global tree-to-tree comparisons.

Use a local spatial query over nearby chunk/vegetation data, limited to the small radius relevant to a sapling. The implementation should operate on chunk-local tree collections / deterministic placement data rather than a global list of all trees.

For v1, canopy is an approximation based on nearby mature-tree density. Harvested sparse overrides reduce the local canopy contribution of harvested trees. Exact botanical light/shadow simulation is explicitly unnecessary.

The implementation should tolerate chunk boundaries; a sapling near an edge must be able to query neighboring chunk data.

### 12. Worker boundary remains unchanged

`chunkHeightmap.worker.ts` already batches terrain, vegetation, items and environment generation into one worker request/response. Keep this architecture.

Do not introduce worker messages per tree.

If profiling later shows that batch growth/canopy calculation is expensive, extend the existing chunk worker pipeline with batch data rather than creating a dedicated per-tree worker protocol.

### 13. Environment inputs use existing samplers

Use the already generated/available terrain fields:

- `heights`,
- `continentalness`,
- `mountainRidge`,
- `moistureRegion`,
- biome weights.

Do not add groundwater or a new soil simulation in 050.

Species-specific preferences should be data-driven (species configuration), not scattered biome-specific conditionals.

### 14. Seasons remain an optional modifier hook only

Plan 040 is still a separate planned system. `GrowthModel` may accept an optional season modifier, but 050 must not create a seasons implementation or make tree lifecycle depend on seasons being present.

### 15. Shared simulation architecture should be respected without blocking 050

Plan 055 is currently planned, not implemented. 050 should therefore reuse the existing `NpcAgent` `PlannedAction` model and define the tree harvest as a domain/world effect, but should not wait for a complete rewrite into the future shared simulation architecture.

This keeps 050 incremental while avoiding an incompatible NPC-specific harvesting subsystem.

## Acceptance additions from the review

Before implementation is considered complete, verify explicitly:

- a tree's identity survives chunk unload/reload;
- a harvested tree survives chunk unload/reload;
- a harvested tree survives save → Continue;
- an old v6 save loads with no tree overrides;
- NPC woodcutting targets an actual `TreeId`, not only a settlement `Vector3`;
- NPC harvesting and future player harvesting call the same world harvest operation;
- no `wood`-specific parallel inventory system is introduced;
- sapling/young/mature state is represented as lifecycle data, not inferred only from model scale;
- canopy queries work across chunk boundaries without a global O(n²) scan;
- time skip does not iterate every tree frame-by-frame.

## Documentation issue found during review

`docs/plans/README.md` currently contains another plan using number `050` (`2026-08-09--050--fire-torch.md`) while this tree-lifecycle plan is also numbered `050` and is not listed in the README index.

This is a plan-index inconsistency that should be resolved before relying on plan numbers as unique identifiers. It was not changed automatically in this review because the requested scope explicitly identifies this document as plan 050.
