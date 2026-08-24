# Implementation notes — plan 187: Building Resources

**Created:** 2026-08-21
**Plan:** [2026-08-21--187--building-resources.md](./2026-08-21--187--building-resources.md)
**Status:** `verification needed` 📋

## 1. Review conclusion

Plan 187 should be implemented as a **resources + construction integration change only**. The mountain part has already been explicitly removed from the plan and belongs to plan 191. Do not touch `chunkHeightmap.ts`, mountain parameters, river generation or terrain shaping in this plan.

The most important correction to the plan is that **plan 111 is not a generic material-consumption construction system**. It is primarily the visual House Builder / settlement assembly layer. Current player construction is represented by the much smaller, data-driven player-well implementation from plan 127. Therefore the agent must not search for or invent a pre-existing `BuildingMaterialQuery`/`ConstructionStorage` API merely because plan 187 describes one.

The correct implementation seam should be established from the current world-item and player-well/construction code, then kept small and generic enough for future structures.

## 2. Current architectural facts

`WorldBundle` already owns `PlayerWells`, `DroppedItems`, `ItemSpawners`, `ResourceDeposits` and the other world systems. Keep world-item/building integration inside those existing lifecycles; do not introduce a second global resource manager or building-material manager.

`ITEM_CATALOG` is the gameplay-facing item metadata source. Plan 184 is implemented: capabilities are declared on catalog entries and queried through `hasItemCapability()` / `Inventory.hasCapability()`; `wood_chopping` and `branch_trimming` already exist. Do not reintroduce `isChopTool()`, `isHarvestKnife()` or hand-written tool lists. fileciteturn8file0L2-L2

`branch` is still the canonical existing item. The catalog currently describes it as a renewable/axe-harvest item and as the existing lit-hand visual. Any new `beam` must follow the normal `ItemKind` + `ITEM_DEFS` + `ITEM_CATALOG` pipeline; it must not become a second resource representation. fileciteturn9file0L2-L2

Plan 127's well implementation is the best existing construction reference: its state is a small persistent domain record, stage progress is evaluated lazily from world time, material costs are centralized, and runtime visuals/colliders are derived from the record. It deliberately avoids a generic construction manager. fileciteturn3file0L2-L2

Plan 111's House Builder is a **visual assembly system**, not the material inventory owner. Its current implementation uses `HouseDefinition`, `ConstructionCatalog`, settlement-owned static batching and separate interactive doors. Do not couple world material consumption to `houseBuilder.ts`. fileciteturn17file0L2-L2

## 3. Branch / beam model

### 3.1 Item identity

Add exactly one new material identity:

```text
branch = small wood / branch
beam   = structural wood
```

Keep `branch` as-is for existing callers. Add `beam` to the canonical item pipeline rather than renaming/reinterpreting `branch` globally.

Expected touch points:

- `src/items/items.ts` — `ItemKind` + `ITEM_DEFS`;
- `src/items/itemCatalog.ts` — catalog metadata;
- `docs/items/CATALOG.md` if the living catalog requires a row;
- model/asset registration only if an actual beam asset is available.

Do not create `WoodResource`, `BuildingMaterial`, `WoodManager` or integer-only material counters.

### 3.2 Capabilities

`beam` does not need a new capability merely because it is a construction material. Construction should ask for the **item kind + quantity**, while tool requirements continue to use `ItemCapability`.

The axe requirement for tree felling is already `wood_chopping`. The branch bonus is already `branch_trimming`. Reuse those exact capabilities. fileciteturn8file0L2-L2

### 3.3 Tree harvest

Extend the existing authoritative final tree-harvest transition in `src/world/treeHarvest.ts` / the current `TreeLifecycle` path. Do not create a parallel `BeamHarvestSystem`.

The implementation must first verify the current final-harvest callers and drop path before changing yield. The new result should be conceptually:

```text
final tree harvest
  ├─ beam × N
  └─ branch × M
```

Use the existing tree information and existing deterministic random source if the current harvest flow already varies yields. Do not add tree-size/age parameters solely to support beams.

The important invariant is that the drop is produced **once**, at the authoritative final-harvest transition. Intermediate tree lifecycle stages must not duplicate the resources.

### 3.4 Yield recommendation

Do not hard-code the exact `beam:branch` numbers in multiple call sites. Put the chosen yield rule in the existing tree-harvest domain function/constants.

Prefer a simple deterministic rule based on already available tree data. If no useful size/age information is available at the final transition, use one bounded base yield with the existing deterministic variation rather than expanding the tree model.

## 4. World-item construction integration

This is the most important implementation area.

The plan's desired flow is correct:

```text
world item
  → local query around construction
  → satisfy one material requirement
  → consume world item
  → advance existing construction progress
```

But **do not assume the repository already has a generic construction-material query**. The reconnaissance must identify the exact current `DroppedItems` API, item record shape, position/count representation and removal/consumption semantics before adding anything.

### 4.1 Preferred API shape

If `DroppedItems` lacks the required bounded query, extend it with a small data-oriented query such as:

```text
findNearbyByKind(position, radius, kind)
consume(id, quantity)
```

or an equivalent API matching its actual current naming/model.

The query should:

- operate in world XZ space;
- be bounded by a small radius;
- filter by required `ItemKind` before doing unnecessary work;
- return stable/deterministic ordering;
- avoid allocating large temporary collections;
- never scan all loaded chunks/world items every frame.

If `DroppedItems` already has an appropriate spatial/query mechanism, reuse it instead of adding another index.

### 4.2 Consumption must be atomic

The construction code must not first delete world items and then discover that the construction cannot advance.

Preferred sequence:

```text
resolve current construction requirement
→ query available world quantities
→ validate total requirement
→ consume exact items
→ commit construction progress
```

If the existing construction model consumes materials at stage start, follow that boundary. If it consumes per progress step, consume only at that boundary. Do not create a third convention.

If a requirement can be fulfilled by multiple nearby stacks, consume deterministically across stacks until the requested quantity is satisfied.

### 4.3 Inventory + world materials

The plan explicitly says that world materials should be usable without first moving them into inventory.

Do not silently replace this with:

```text
world item → pickup → inventory → construction
```

The world-item path must consume the actual dropped stack(s). Inventory consumption remains available through the existing construction path where currently supported.

The cleanest long-term seam is a material-source abstraction at the **construction domain boundary**, not a new storage system. For example, the construction requirement resolver can accept inventory and nearby-world availability, while the actual stores remain `Inventory` and `DroppedItems`.

Avoid creating a persistent `ConstructionInventory`.

## 5. Player-built well is the key compatibility test

Plan 127 currently represents the only concrete player-built multi-stage construction and should be treated as the first regression target.

Its costs currently use existing items (`stone` and `branch`) and stage progression consumes material at the stage-advance interaction. The well's persistent state remains the source of truth; completed state is derived into the normal `WaterSource` path. fileciteturn3file0L2-L2

Plan 187 should therefore avoid rewriting the well into a generic framework just for the sake of abstraction.

Instead:

1. identify the material validation/consumption code in `playerWell.ts` / its action path;
2. extract only the reusable operation needed to obtain a required item from inventory **or nearby world items**;
3. keep well-specific stage rules in `playerWell.ts`;
4. verify that a well still consumes the correct material exactly once per stage;
5. verify that world-item construction works without changing the persisted well record.

The existing well's save/rebuild contract must remain intact. Do not persist transient query state, nearby item IDs or derived material availability. fileciteturn3file0L2-L2

## 6. Construction genericity

The plan correctly says the mechanism should work for future structures, but this should mean **shared material acquisition/consumption**, not a new generic construction framework.

A useful minimal boundary is:

```text
Construction material requirement
        ↓
resolve available sources
        ↓
consume exact quantities
        ↓
existing structure-specific stage/progress mutation
```

The resolver should not know about wells, houses, grates or future structures.

Conversely, the resolver should not own stage timers, visuals, placement, persistence or interaction prompts.

This keeps plan 127 and future plan 175/other structures compatible without introducing a God Object.

## 7. Fire/fuel integration

The existing fire/torch model must remain authoritative.

`branch` can continue to participate in the existing torch/fire flow. `beam` may be added to the existing fuel compatibility if the current fire model represents fuel by item kind/list. Do not create a `FuelSystem`.

Important distinction:

```text
branch → existing fire fuel + existing torch path
beam   → existing fire fuel only
```

Do not make `beam` holdable merely because it is wood. Do not alter `wooden_torch` identity semantics unless the current implementation requires a specific compatibility update.

The item catalog notes from plan 184 explicitly identify `wooden_torch` / `branch` as identity-specific gameplay and intentionally leave them ItemKind-based. Preserve that decision. fileciteturn8file0L2-L2

## 8. Plan 175 dependency

Plan 175's implementation notes explicitly recommend treating future grate construction as an upgrade to an existing fire record, not as a separate manager, and use the player-well persistent-construction pattern as the closest construction reference. It also says not to invent a metallurgy system merely to manufacture `iron_rod`. fileciteturn13file0L2-L2

For plan 187 this means:

- `beam` should be a normal item usable by future construction systems;
- do not implement the grate or cooking changes from plan 175 here;
- do not add `iron_rod` production here;
- keep the material-acquisition seam generic enough that plan 175 can later use it.

## 9. House construction / plan 111 warning

Plan 111 is currently `verification needed` because browser playtesting found that some assembled houses are incorrectly composed. Its implementation notes say the House Builder now resolves MegaKit parts and batches static repeats, while `houseCatalog.ts` remains for fallback/tests. fileciteturn16file0L2-L2 fileciteturn17file0L2-L2

Do not use the unresolved visual state of plan 111 as evidence that a generic player construction system exists.

If plan 187 later needs construction material definitions for houses, the material requirement belongs at the appropriate house/construction domain boundary; `houseBuilder.ts` should remain concerned with visual assembly.

## 10. Performance constraints

World-item construction queries are expected to be rare, but a naive global scan can still become expensive as dropped-item count grows.

Required constraints:

- no global/per-frame scan;
- query only when construction is evaluated or material consumption is committed;
- small fixed radius;
- deterministic ordering;
- consume only the requested amount;
- avoid creating many temporary arrays/objects;
- do not add a worker for this — this is a small local query, and worker communication would be counterproductive.

If the current `DroppedItems` implementation is already spatially indexed, use that index. If not, start with the smallest bounded mechanism compatible with its existing lifecycle rather than introducing a general spatial database.

## 11. Persistence / streaming

Dropped world items and player constructions have different lifecycles. Do not persist a construction's relationship to specific world-item IDs.

The save state should contain only the existing construction state. A world item remains a world item until it is actually consumed.

After save/load or `rebuildWorldBundle()`:

- the construction state is reconstructed from its existing record;
- world items are reconstructed through their existing persistence/lifecycle;
- a later material query sees whatever items are physically present nearby;
- no cached "reserved materials" survive unless an existing construction system already persists such a concept.

This is especially important for player wells, whose persisted record is intentionally independent of `WaterSource` runtime state. fileciteturn3file0L2-L2

## 12. Suggested file-level reconnaissance

Before implementation, inspect these actual paths and trust current code over the plan:

- `src/world/treeHarvest.ts` and the current tree lifecycle caller(s);
- `src/world/` dropped-item implementation (`DroppedItems` / its current source file);
- `src/items/items.ts`;
- `src/items/itemCatalog.ts`;
- `src/items/Inventory.ts`;
- `src/world/playerWell.ts`;
- `src/world/createPlayerWells.ts`;
- `src/app/gameLoop.ts` / relevant action modules;
- `src/app/createApp.ts`;
- `src/app/worldBundle.ts`;
- current fire/fuel modules and `src/player/PlayerTorch.ts` / equivalent current path;
- `src/settlement/PlacedFires.ts` if fire fuel compatibility requires it;
- `src/persistence/saveData.ts` only if the new `beam`/world-item state affects persistence;
- `docs/items/CATALOG.md` and `docs/assets/MODELS.md` when item/asset status changes.

Do not broaden this into a repository-wide refactor.

## 13. Tests to add/update

Pure tests should cover:

- branch remains valid;
- beam is a distinct item kind;
- final tree harvest produces both expected material categories;
- deterministic yield for a fixed seed/input state;
- construction requirement resolution from inventory;
- construction requirement resolution from nearby world items;
- mixed inventory + world availability if the final design supports both;
- insufficient total quantity does not consume a partial amount;
- exact quantity is consumed when sufficient;
- multiple stacks are consumed deterministically;
- outside-radius items are ignored;
- `beam` does not satisfy a `branch` requirement and vice versa;
- well stage material consumption remains unchanged.

Do not write Three.js-heavy tests when a pure domain test can establish the invariant.

## 14. Verification status

**Implemented:**

- `beam` added as a normal `ItemKind` (`src/items/items.ts` — `ITEM_DEFS`, procedural pickup mesh — no GLB yet, `docs/assets/MODELS.md` M57) + `ITEM_CATALOG` entry (`src/items/itemCatalog.ts`), `holdable: false`, no capability of its own.
- `src/world/treeLifecycle.ts`: `FELLING_BEAM_YIELD` (`beam` × 4) + `bonusYieldForChopStage(stage)` fire only on the `felled → harvested` transition (the authoritative bucking step) — `advanceHarvest`/`harvestFully` now return an optional `bonusYield` alongside the existing `yield` (branch). No new tree parameters; no duplication at any other chop step. `src/world/treeHarvest.ts`'s `TreeHarvestResult` mirrors the optional `bonusYield`.
- `src/app/actions/groundActions.ts`'s `startTreeChop`: checks/consumes the bonus beam alongside the branch yield when felling the final step, toast shows both.
- Campfire fuel: `src/settlement/VillageFire.ts`'s new `FIRE_FUEL_KINDS = ['branch', 'beam']` constant; `startIgniteFire` (`survivalActions.ts`) and the "dołóż" world action (`gameLoop.ts`) now try each kind in turn instead of hard-coding `branch`. `PlayerTorch.ts`'s `TorchSource` untouched — `beam` is never a hand torch. `AnimalSpawner`'s habitat-destroy fire (`SPAWNER_DESTROY_BRANCH_COST`) intentionally kept branch-only (not a player fuel choice).
- World-item construction materials: new `src/items/constructionMaterials.ts` — `MaterialRequirement`, `CONSTRUCTION_MATERIAL_RADIUS` (3m), `hasMaterial`/`consumeMaterial` (inventory first, then nearest dropped-item stacks within radius, deterministic order, atomic — nothing consumed unless the full requirement is satisfiable). No new storage system; reads `Inventory.count`/`remove` and `DroppedItems.nodes`/`collect` directly.
- `src/app/actions/placementActions.ts`'s `workOnWell` now resolves its per-stage `stone`/`branch` cost through `hasMaterial`/`consumeMaterial` centered on the well's own position, instead of requiring those materials in inventory only. `playerWell.ts`'s persisted record/stage rules are unchanged.

**Technically verified:** `npx tsc --noEmit` clean, `pnpm run lint:fix` clean, `pnpm run test` (1520/1520 passing, including new `constructionMaterials.test.ts` and extended `treeLifecycle.test.ts` cases for the bonus beam yield), `pnpm run build` clean.

**Browser/manual verified:** not yet — pending manual playtest (felling a tree for beam, well construction from ground-lying materials, campfire fuel with beam, torch-from-beam rejection).

For implementation, use the repository-standard commands from `CLAUDE.md` rather than blindly copying generic plan commands. The current standard is `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run build`, `pnpm run test`. fileciteturn14file0L2-L2

Visual/gameplay correctness must remain separate from TypeScript/lint/build/test evidence.

## 15. Scope guard

Do not implement here:

- mountain peaks or massifs;
- terrain generation changes;
- river shaping;
- a general crafting system;
- a general wood/resource manager;
- a building storage system;
- a new fuel manager;
- NPC construction AI;
- plan 175 cooking/grate implementation;
- a house-builder rewrite.

If reconnaissance discovers a genuine out-of-scope blocker, record it in `docs/plans/LOOSE-ENDS.md` rather than expanding plan 187.

**Zrób git commit i push do main, rebase jeżeli trzeba**
