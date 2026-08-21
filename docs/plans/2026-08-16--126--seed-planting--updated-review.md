# Plan: Seed Planting — Updated Review

**Created:** 2026-08-19
**Status:** `reviewed` 🔎
**Priority:** medium · **Effort:** L
**Depends on:** ~~106~~ ~~122~~

## Verdict

**update**

Plan 126 remains directionally valid. The main architecture is still correct, but several implementation assumptions are now stale enough that the plan should be updated before implementation.

## Significant context drift

### 1. Tree lifecycle remains the canonical mechanism — but planting must integrate with the newer rendering path

`TreeLifecycle` is still the correct owner for planted-tree growth, state resolution, registration and harvesting. Its species model is now richer and includes the later tree-species/environment work; planting should reuse `TREE_SPECS` / `TREE_SPECIES_PREFS` and the existing `TreePresence` shape rather than introducing a planting-specific species model.

The important new constraint is rendering: living procedural trees now participate in `vegetationRegionBatcher` / cross-chunk instancing. A planted tree must therefore enter the same `tree-living` placement path when it is a normal living tree, while lifecycle-mutated trees can use the existing non-instanced refresh path. Do not add a separate planted-tree renderer or permanent Object3D collection.

### 2. Vegetation batching changes the chunk integration point

Plan 126's generic "use existing chunk lifecycle" is still correct but underspecified. `vegetationRegionBatcher` now owns cross-chunk batched vegetation and explicitly supports `tree-living` placements, removal by tree key, LOD and reflection visibility.

Planted trees must be compatible with this path and with `removeByKey()` / lifecycle refresh. Avoid a design that assumes one tree mesh belongs permanently to one chunk.

This is an implementation dependency, not a reason to redesign the lifecycle.

### 3. Tree persistence model from the implementation notes is still required

The existing sparse `treeOverrides` mechanism is insufficient to recreate a newly planted tree because planted trees are world mutations rather than deterministic procedural presences.

Keep the implementation-notes distinction:

```text
procedural tree → generated presence + sparse override
planted tree    → persistent planted record → TreePresence → TreeLifecycle
```

A planted record must persist the minimum non-derivable placement/identity data, while lifecycle timing remains lazy. Do not persist renderer state or duplicate resolved stage state.

### 4. Inventory/item-instance work does not change seed semantics

`Inventory` now has both count-based items and item instances, with item-instance persistence already present in save v19. Seeds should remain ordinary count-based `ItemKind` values.

Do not create seed instances, a second inventory mechanism, or another inventory save structure.

The item catalog already contains `tomato` as food, but no seed item is implied by that existing definition. If tomato is the first crop, its seed must be a separate canonical item kind; harvested output should reuse `tomato` rather than duplicate the food item.

### 5. Crop lifecycle is still new, but its future consumers are broader

The implementation notes correctly identify that the current garden code is mostly settlement geometry/visuals and does not provide authoritative crop state.

`CropLifecycle` can therefore still be introduced as a small data-driven world-domain module. However, later food-related work makes the crop output an important world resource rather than an isolated player feature. Keep harvested items connected to the existing item/food definitions so later NPC/player food systems can consume the same item without a parallel crop-output model.

Do not pull NPC farming, advanced agriculture, watering or fertilizing into plan 126.

### 6. Persistence version must advance from the actual current version

The repository's canonical save shape is currently **v19**, including `inventoryInstances`. Plan 126 must add its planted-tree/crop state through the next save-version migration instead of following historical version examples.

Older saves should migrate to empty planted-world-mutation collections.

### 7. Chunk streaming must distinguish persistent records from runtime presence

The current chunk manager explicitly unregisters streamed tree runtime presence on unload and the vegetation renderer is rebuilt around loaded chunk contributions.

Therefore:

```text
persistent planted record
        ↓ chunk loaded
runtime TreePresence / CropPresence
        ↓ render + interaction
        ↓ chunk unloaded
runtime presence removed
persistent record retained
```

Do not keep planted entities permanently attached to the scene and do not delete their world records on chunk unload.

### 8. Placement should reuse current terrain/environment sampling

The current chunk manager already exposes terrain, biome, moisture, continentalness, mountain-ridge and forest/environment sampling used by the existing vegetation/tree systems. Tree placement should reuse these signals and the existing tree species preferences.

Do not introduce a second terrain sampler or a planting-only biome model.

For crops, keep placement constrained to the existing garden context rather than turning all terrain into farmland in this plan.

## Dependencies / conflicts

- **106 — player needs / food:** still relevant as a downstream consumer of harvested food, but does not need to become part of planting implementation.
- **122:** the original plan still lists it as a dependency, but the current repository evidence should be rechecked by the implementing agent before coding; the plan must not assume an old placement API solely from this dependency label.
- **143 — cross-chunk vegetation batching:** now an important implementation constraint for living planted trees even though the original plan predates it.
- Later tree-species/lifecycle changes: use current `TreeLifecycle` and species definitions as source of truth; do not copy older assumptions from plan 126 notes.
- Later item/inventory work: use current count-vs-instance semantics; seeds remain count-based.
- Later food plans: harvested crop items should use canonical food items so they naturally participate in existing food systems.

## What should change in Plan 126

Only these points need updating:

1. Explicitly require integration with `vegetationRegionBatcher` for living planted trees.
2. Keep the planted-tree persistent-record model from the implementation notes and make it an explicit implementation requirement.
3. State that current `TreeLifecycle` species definitions are authoritative.
4. State that seeds are count-based inventory items, not item instances.
5. State that crop harvest outputs reuse canonical `ItemKind` food definitions.
6. State that persistence starts from current save v19 and adds a new migration version.
7. Clarify that chunk unload removes runtime presence/rendering only; persistent planted records remain.
8. Keep crop placement narrow and garden-based; do not expand scope into general farmland.

## No redesign required

The following original decisions remain sound:

- no second tree growth system;
- no large shared `PlantSystem`;
- deterministic lazy growth from world time;
- sparse world-mutation persistence;
- existing interaction pipeline;
- count-based seed consumption after successful validation;
- no per-frame crop ticking;
- no worker-specific solution;
- no NPC farming / watering / fertilizing / advanced farm mechanics.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
