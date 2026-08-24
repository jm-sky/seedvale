# Plan 126 — Implementation Notes

**Reviewed:** 2026-08-19  
**Plan:** `2026-08-16--126--seed-planting.md`  
**Status:** implementation notes  
**Source of truth:** current code + tests + build configuration; the plan itself is not modified.

## 1. Review verdict

The plan is directionally correct, but the current codebase changes several implementation assumptions that an agent must account for.

The most important points are:

1. `Inventory` already has item-instance support from plan 155. Do **not** create another seed-instance mechanism or redesign inventory.
2. `TreeLifecycle` already provides the correct lazy world-time growth machinery, sparse tree overrides, spatial registration and stable procedural tree identity. Planting should extend that mechanism rather than create `playerTrees` or a second tree-growth system.
3. A newly planted tree is **not** representable by a tree override alone. Procedural trees can be reconstructed from terrain generation; a planted tree cannot. Persistence therefore needs a sparse collection of planted-tree records containing the minimum identity/placement data needed to recreate a `TreePresence`.
4. The current garden system is primarily settlement geometry/visuals (`createGarden`, garden scales, beds, wheat-field visuals). There is no general persistent crop lifecycle/harvest system equivalent to `TreeLifecycle`. `CropLifecycle` will therefore be new, but it should remain small and data-driven and should integrate with the existing garden/interaction/rendering paths instead of introducing a `FarmSystem`.
5. The current save format is already v19 and already persists `inventoryInstances`. Do not follow older examples that add another inventory-instance save version.

The implementation should stay narrow: player planting, deterministic lazy growth, world persistence, minimal visuals and harvesting. Do not pull NPC farming, watering, fertilizing or advanced farmland into this plan.

## 2. Current code facts

### 2.1 `TreeLifecycle` is already the canonical tree growth system

`src/world/treeLifecycle.ts` already owns:

- `TreeGrowthStage`;
- environment-dependent growth;
- canopy competition;
- lazy `advanceStage()` resolution;
- stable procedural IDs;
- runtime presence registration;
- spatial buckets for nearby-tree queries;
- harvest/chop transitions;
- sparse `TreeStateOverride` persistence.

The normal living lifecycle is:

```text
sapling → young → mature → old
```

`limbed`, `felled` and `harvested` are chop/regrowth states, not additional living ages.

Do not introduce another tree growth clock. A planted tree should enter the existing lifecycle as `sapling`, with its stage anchored at the current `worldDays` rather than pretending it existed at day 0.

### 2.2 Important limitation of current tree IDs

`makeTreeId(seed, x, z, speciesIndex)` is intended for deterministic procedural trees. Its identity is derived from seed + quantized position + species.

That is not sufficient by itself for planted trees because a planted tree is a world mutation, not a procedural presence. In particular, an ID collision must not make a planted tree indistinguishable from a procedural tree or cause a saved lifecycle override to affect the wrong tree.

Prefer one of these approaches:

- add an explicit planted-tree namespace to the lifecycle ID generation;
- or add a dedicated `makePlantedTreeId(...)` that cannot collide with procedural IDs.

Do not use `Object3D.id`, array index or an ID generated only by the renderer.

A planted tree should still be registered through the same `TreeLifecycle.registerPresence()` mechanism once its presence is loaded/streamed.

## 3. Tree planting data model

The plan's proposed persistence shape:

```text
stable id + state override + stageStartedAt
```

is sufficient for an existing procedural tree, but **not for a newly planted tree**.

A planted tree needs enough persistent data to reconstruct its `TreePresence`, for example:

```ts
{
  id,
  x,
  z,
  speciesIndex,
  sizeClass,
  sizeJitter,
  initialStage: 'sapling'
}
```

The exact type should live with the tree lifecycle/world domain, not in `createApp.ts`.

The runtime model should remain:

```text
planted tree record
      ↓
TreePresence
      ↓
TreeLifecycle.registerPresence()
      ↓
TreeLifecycle.resolve()
```

This is not a parallel `playerTrees` system. It is a sparse world-mutation collection owned by the existing tree lifecycle/world infrastructure.

### 3.1 Which fields actually need persistence

For planted trees, persist only data that cannot be deterministically reconstructed:

- stable ID;
- x/z;
- species;
- size class/jitter if visual size is intended to remain stable;
- current lifecycle override when the tree has diverged from its initial planted state.

`initialStage` can remain implicitly `sapling` if every planted tree starts there.

Do not persist resolved scale, visual kind, mesh data, environment sample or current growth stage if it can be lazily derived from `stageStartedAt + worldDays`.

For the simplest implementation, a planted record can contain its identity/placement data while the lifecycle override contains the current stage anchor. Avoid duplicating the same stage in two persisted structures.

## 4. Procedural tree vs planted tree

Keep the distinction explicit:

```text
procedural tree
  → generated from seed/terrain
  → TreePresence exists when chunk is loaded
  → sparse override only when player changes lifecycle

planted tree
  → exists because of persistent world mutation
  → planted record recreates TreePresence
  → same TreeLifecycle resolves its growth/harvest state
```

This is the key architecture boundary for plan 126.

Do not add special rendering or harvesting code such as:

```ts
if (tree.owner === 'player') ...
```

A planted tree should become an ordinary `TreePresence` after registration and should naturally appear in `getNearbyTrees()`, inspection and axe harvesting.

## 5. Tree placement validation

Reuse the existing terrain sampling APIs already used by world generation and other placement features.

Validation should be deterministic and cheap:

1. sample terrain height at candidate x/z;
2. reject water/ocean/inland-water positions using the existing water/shore signals;
3. sample environment/biome information through the same path used by `TreeEnvSample`;
4. reject clearly unsuitable altitude/biome combinations according to the tree's species preferences;
5. reject obvious collisions/overlap with existing trees and world structures;
6. ensure the candidate is inside a loaded/valid world area before mutating inventory or world state.

Do not create a second terrain sampling helper if an existing sampler already provides the required signal.

Placement should also check both:

- registered procedural/settlement trees;
- already planted trees.

The lifecycle's spatial registration is useful for nearby-tree queries, but the persistent planted-tree registry must also be consulted if its records are not currently loaded as `TreePresence` objects.

## 6. Tree species and seed items

The existing tree species are represented by `speciesIndex` aligned with `TREE_SPECS`/tree preferences. Avoid creating a second species enum solely for planting.

Seed items should be ordinary `ItemKind` values and should follow the existing item catalog architecture:

- add the new `ItemKind` values in the canonical item definitions;
- add corresponding `ITEM_CATALOG` entries;
- keep them non-holdable unless the current item UX explicitly requires otherwise;
- give them normal inventory weight/count semantics;
- do not make seeds item instances.

The current `Inventory` already distinguishes count-based items from instance-backed items. Seeds belong to the normal count-based path.

Also check the generated/maintained item documentation (`docs/items/CATALOG.md`) if the current repository workflow expects catalog changes to be reflected there.

Do not add seed drop-rate logic, random seed generation or a seed economy as part of plan 126.

## 7. Inventory integration

Current `src/items/Inventory.ts` already supports:

- count-based items;
- instance-backed items;
- `add/remove/count/has`;
- `addInstance/removeInstance`;
- item-instance persistence;
- weight/capacity for both collections.

Therefore seed consumption is simply:

```text
check inventory.count(seedKind)
→ validate placement
→ inventory.remove(seedKind, 1)
→ create world plant
```

The mutation order matters. Do not consume the seed before placement validation succeeds.

If world creation can still fail after validation, prefer a transaction-like sequence where the seed is removed only at the final mutation point, or restore it immediately on failure. Avoid a half-created plant with a missing seed.

Do not add `SeedInstance`, `PlantInventory`, or a new inventory manager.

## 8. Player interaction architecture

`src/app/interactables.ts` already aggregates interaction candidates from world systems and currently exposes nearby trees from `chunkManager.getNearbyTrees()`.

Planting should fit the same architecture:

```text
held/selected seed
        ↓
synthetic placement candidate
        ↓
Interactable
        ↓
existing input/action pipeline
        ↓
world mutation
```

Do not create a parallel input system for planting.

The current interaction model already supports synthetic candidates such as digging and shoreline drinking; a planting candidate can follow the same pattern.

Prefer a placement preview/candidate that is generated from the current player position/aim rather than placing directly from arbitrary mouse coordinates.

The prompt should be driven by actual availability/validity, for example:

```text
[E] Posadź: sosna
```

or the project's existing concise interaction wording.

Do not make the prompt itself the source of truth for validity. The final action must validate again.

## 9. Crop/garden review: current system is visual, not lifecycle-based

`src/settlement/gardenScale.ts` currently defines garden scale, bed dimensions, spacing and clearing radius.

`src/settlement/settlementStructures.ts` currently provides:

- `createGarden()` — procedural garden beds plus decorative crop cones;
- `layoutCropsGarden()` — layout of a `crops.glb` template;
- `createWheatField()` — separate decorative wheat-field generation.

These are presentation/settlement systems. They do not currently provide:

- crop identity;
- crop stage;
- planted crop persistence;
- crop growth clock;
- per-crop harvest;
- crop interaction.

Therefore plan 126 should **not** attempt to reinterpret the existing decorative garden meshes as authoritative crop state.

Use them as placement/context infrastructure and add a small world-domain crop lifecycle for actual planted crops.

## 10. `CropLifecycle` design

A small data-only module is appropriate, e.g. `src/world/cropLifecycle.ts`.

Keep it analogous to the useful parts of `TreeLifecycle`, but do not copy tree-specific complexity such as species preferences, canopy competition or chop states.

Recommended conceptual state:

```ts
export type CropStage = 'seed' | 'sprout' | 'growing' | 'mature' | 'harvested'
```

A crop presence needs only what the runtime actually needs, for example:

```ts
id
x
z
cropId
stageStartedAt
```

The current stage should be resolved lazily from:

```text
stageStartedAt + worldDays + crop definition durations
```

Do not tick every crop every frame.

### 10.1 Mature → harvested

Treat harvest as an explicit world mutation, not as a time-driven transition.

The intended flow is:

```text
mature
  ↓ [E] Zbierz
inventory.add(harvestedItem, yield)
  ↓
crop removed/reset
```

The exact post-harvest behavior should follow the plan's minimal scope. Do not silently add regrowth, re-seeding or multiple harvest cycles unless the current plan explicitly requires it.

## 11. Crop definitions

Use a data-only table, for example:

```ts
export type CropDefinition = {
  id: string
  seedItem: ItemKind
  harvestedItem: ItemKind
  growthDurations: {
    seed: number
    sprout: number
    growing: number
  }
  environment?: CropEnvironmentRequirements
  yield?: number
}
```

The exact shape may be simplified if existing project conventions provide a better fit.

Important rules:

- one definition table for all crops;
- no crop-specific classes;
- no `TomatoCrop`, `WheatCrop`, etc.;
- no duplicated item IDs outside the item catalog;
- use `tomato` as the first crop only if its current item definition is suitable as the harvested item.

Do not invent a new item kind for a harvested tomato if `tomato` already exists.

## 12. Garden placement semantics

The plan says to reuse existing garden/resource-gathering mechanisms. Current code suggests that a garden is a settlement landmark/visual, not a collection of individual persistent beds exposed by a domain API.

Therefore the implementation should establish a **small reusable garden placement query** rather than hard-code coordinates inside `createApp.ts`.

The query should answer something like:

```text
isPlantableGardenPosition(x, z)
```

or return a resolved bed/slot if the caller needs more information.

It should reuse:

- `GardenScale` dimensions;
- bed width/depth/gap;
- garden landmark position/orientation;
- existing terrain/clearing rules.

Avoid adding a full `FarmPlot`/`FarmSystem` abstraction for this first step.

### 12.1 Do not treat decorative crop cones as slots

The six crop meshes produced by `createGarden()` are decorative and tied to a visual fallback. They must not become the authoritative list of available crop positions.

If deterministic slots are needed, derive them from garden bed dimensions and a shared placement helper. The same helper can later drive visuals.

This prevents visual mesh counts from becoming gameplay state.

## 13. Crop placement collision rules

A planted crop should have a deterministic position and stable ID.

Reject placement when:

- outside an allowed garden/bed area;
- in water or obviously invalid terrain;
- too close to another planted crop;
- colliding with an incompatible world object.

Use a small deterministic spacing rule rather than arbitrary floating-point overlap checks scattered through callers.

If garden beds are the only valid crop location in v1, keep that restriction explicit. Do not quietly turn every patch of grass into farmland.

## 14. Crop persistence

Unlike procedural settlement garden geometry, planted crops are world mutations and therefore must survive save/load and chunk unload/load.

A minimal save record should contain:

```text
id
cropId
x
z
stageStartedAt
```

The current stage is derived lazily.

Do not persist:

- rendered scale;
- mesh/GLB data;
- current material;
- environment samples;
- resolved stage if `stageStartedAt` is sufficient.

### 14.1 Save-version integration

Current persistence is already at v19. Plan 126 must add the crop/planted-tree fields to a new save version, following the current migration chain.

Do not reuse an old version number mentioned in historical plans or implementation notes.

A likely shape is:

```ts
export type SavePlantedTree = {
  id: string
  x: number
  z: number
  speciesIndex: number
  sizeClass: TreeSizeClass
  sizeJitter: number
  stageStartedAt: number
}

export type SavePlantedCrop = {
  id: string
  cropId: string
  x: number
  z: number
  stageStartedAt: number
}
```

The exact schema should follow the existing save-data conventions and validation style.

Migration from v19 should produce empty planted-tree/crop arrays.

Do not attempt to infer old planted plants from procedural world generation or inventory contents.

## 15. Chunk unload/load

This is one of the most important implementation details.

The world already registers streamed trees with `TreeLifecycle` and removes runtime presence when chunks unload. Planted entities should follow the same runtime lifecycle:

```text
persistent planted record
        ↓ chunk becomes relevant
Tree/CropPresence registered
        ↓ render + interaction
        ↓ chunk unload
runtime presence removed
persistent record remains
```

The persistent record must not be deleted when the visual/runtime object is unloaded.

On reload, the same stable ID and placement data must recreate the entity.

Do not keep a permanent Three.js mesh or Object3D for every planted entity in the world.

## 16. Rendering strategy

For trees, reuse the existing tree rendering/update path. A planted tree should eventually look exactly like an ordinary tree at the corresponding lifecycle stage.

For crops, keep the first implementation lightweight.

A practical v1 strategy is:

```text
seed/sprout → tiny procedural mesh
 growing    → medium procedural mesh
 mature     → existing crop visual/template if suitable
```

Do not require one GLB per crop stage.

If `crops.glb` is already loaded for settlement visuals, reuse its asset/template where that is straightforward, but do not make a heavyweight scene clone per crop if many crops are present.

Keep the visual representation derived from lifecycle state. Do not store a separate visual state.

## 17. Harvest integration

Tree harvest already goes through `TreeLifecycle.advanceHarvest()` / `harvestFully()` and the existing interaction/action path. A planted tree should automatically become harvestable through that same path after it reaches a choppable stage.

For crops, add a small harvest operation to `CropLifecycle` or an adjacent crop-domain function:

```text
resolve crop
→ verify mature
→ check inventory capacity
→ add harvested item
→ mark/remove crop
```

Capacity must be checked before removing the world crop.

Do not duplicate generic inventory capacity calculations in crop code.

## 18. Inventory and item semantics for seeds

Seeds are count-based. Recommended lifecycle:

```text
seed item in Inventory
        ↓ consume 1
planted world entity
        ↓ growth
mature
        ↓ harvest
harvested item in Inventory
```

For tomato:

```text
seed_tomato → planted tomato crop → tomato
```

The harvested item should be the existing `tomato` item if its current definition matches the plan.

Do not make a harvested crop item automatically re-enter the seed pool.

## 19. Avoid coupling crop state to settlement NPCs

Current `places.ts` already maps the `farmer` role to the settlement garden landmark, but this does not mean plan 126 should add farmer AI.

The garden landmark is useful as a world location and future integration point only.

Do not add:

- NPC planting;
- NPC harvesting;
- farmer schedules;
- crop ownership;
- household crop inventory;
- automatic garden maintenance.

Those belong to future plans and should consume the crop lifecycle rather than define it.

## 20. Recommended implementation order

### Phase A — domain/data

1. Add seed item kinds and catalog entries.
2. Add/extend planted-tree persistence/domain records.
3. Add `CropDefinition` data.
4. Add `CropLifecycle` with deterministic lazy resolution.

### Phase B — tree planting

5. Add planted-tree ID namespace.
6. Add tree placement validation using existing terrain/environment sampling.
7. Consume seed and create/register a planted `TreePresence`.
8. Reuse existing tree rendering and interaction/harvest path.
9. Persist planted-tree records and lifecycle anchors.

### Phase C — crop planting

10. Add garden placement/slot query using existing garden scale/bed dimensions.
11. Add crop placement and seed consumption.
12. Register/render crop runtime state.
13. Add mature-crop interaction and harvest.
14. Persist planted crops.

### Phase D — lifecycle/chunk integration

15. Ensure planted entities are recreated when chunks load.
16. Ensure runtime registrations disappear on chunk unload without deleting persistent state.
17. Verify save/load and world-time advancement.

### Phase E — polish

18. Add minimal stage visuals.
19. Add tests for lifecycle, persistence, placement and inventory consumption.
20. Only then adjust prompts/UX if needed.

## 21. Tests to add

### Tree lifecycle

- planted tree starts as `sapling`;
- `stageStartedAt` is the planting time, not day 0;
- lazy growth advances correctly after elapsed world time;
- environment growth factors still apply;
- planted tree reaches normal mature/old lifecycle;
- planted tree can enter normal axe harvest flow;
- planted-tree ID cannot collide with procedural-tree identity;
- duplicate planting at the same location is rejected.

### Crop lifecycle

- seed → sprout → growing → mature based only on world time;
- no per-frame ticking required;
- invalid/unknown crop definition is rejected safely;
- mature crop can be harvested exactly once;
- harvest yield respects inventory capacity;
- harvested crop is no longer interactable as mature.

### Persistence

- v19 save migrates to the new canonical save shape with empty plant collections;
- planted tree survives save/load;
- planted crop survives save/load;
- lifecycle resumes from persisted `stageStartedAt`;
- malformed plant records are ignored/rejected without breaking the save;
- chunk unload/load recreates the same entity IDs;
- procedural trees and planted trees do not cross-contaminate overrides.

### Inventory

- planting removes exactly one seed;
- invalid placement removes no seed;
- failed world mutation does not consume the seed;
- harvested item is added through normal inventory APIs;
- inventory capacity prevents destructive harvest/placement ordering bugs.

## 22. Performance guidance

The plan's performance rules are correct and should be treated as hard constraints.

For trees:

- no per-frame lifecycle tick;
- resolve growth when rendering, interacting or otherwise needing current state;
- use existing spatial tree registration/buckets;
- keep planted records as plain data;
- do not keep detached meshes alive for unloaded chunks.

For crops:

- do not create an update callback per crop;
- resolve stage from world time on demand;
- batch/instance visuals when crop counts become significant;
- avoid cloning heavy GLB scenes for every individual crop unless profiling shows the count is tiny.

Do not introduce a worker for crop growth. The lazy calculation is intentionally cheap and independent of a worker boundary.

## 23. Files likely involved

Start with focused inspection rather than broad repository scanning:

- `src/world/treeLifecycle.ts`
- `src/world/treeLifecycle.test.ts`
- `src/terrain/chunkManager.ts`
- `src/app/createApp.ts`
- `src/app/interactables.ts`
- `src/items/Inventory.ts`
- `src/items/itemInstances.ts`
- `src/items/items.ts`
- `src/items/itemCatalog.ts`
- `src/settlement/gardenScale.ts`
- `src/settlement/settlementStructures.ts`
- settlement creation/landmark code that exposes `landmarks.garden`
- `src/persistence/saveData.ts`
- `src/persistence/saveData.test.ts`
- relevant save/load wiring in `src/app/createApp.ts` / `src/app/worldBundle.ts`

For existing interaction patterns, inspect the dig, trap and tent placement flows before adding a new action.

## 24. Things an AI agent should not do

Do not:

- create `PlantSystem`, `FarmSystem` or `PlayerTrees`;
- duplicate `TreeLifecycle` growth logic;
- replace `Inventory` with a seed-specific inventory;
- make seeds item instances;
- treat decorative garden crop meshes as authoritative state;
- persist resolved visual state instead of minimal world data;
- add per-frame crop/tree growth loops;
- add NPC farming;
- add watering/fertilizing/disease/weeds;
- add player-built farmland;
- add seed economy/drop tables;
- introduce a worker for lifecycle updates;
- create a new interaction/input framework;
- store Three.js objects in save data;
- mutate the existing plan while implementing the notes.

## 25. Key architectural decision

The cleanest final model is:

```text
                 WORLD TIME
                     │
          ┌──────────┴──────────┐
          │                     │
   TreeLifecycle          CropLifecycle
          │                     │
   procedural +          planted crops
   planted trees               │
          │                     │
          └──────┬──────────────┘
                 │
          shared infrastructure
     placement / persistence /
     interaction / inventory /
     chunk lifecycle / rendering
```

Only the infrastructure is shared. Tree-specific and crop-specific lifecycle rules remain separate.

That preserves the plan's intent while fitting the current codebase and avoiding another large central manager.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
