# Implementation Notes: Resource storage visualization

**Reviewed:** 2026-09-09  
**Plan:** `settlements-npcs-025-resource-storage-visualization.md`

## Review conclusion

The plan fits the current architecture. Keep `src/settlement/storageVisuals.ts` as a presentation-only projection over `Household` / `SettlementEconomy`; do not add storage state, persistence, or another destination resolver.

Current implementation direction:

- **Stage 1** — progressive wood stockpile;
- **Stage 2** — pooled food representatives;
- **Stage 3A** — container-ready deterministic food layout foundation;
- **Stage 3B** — actual open-container fill visualization after a suitable asset is checked in and verified;
- remaining ores/minerals/water stay deferred until their real storage semantics/assets exist.

The latest focused recon confirms:

- `createFoodStorageVisual()` is already the correct shared seam for household and settlement food storage;
- its current implementation has avoidable churn: changed kind/scale signatures trigger `removeFromParent()` + `disposeObject3D()` + `createItemMesh()` + re-add;
- `FOOD_ITEM_KINDS` is derived from `ITEM_DEFS` by the shared `food` category and provides deterministic catalog order; do not replace it with a parallel list;
- `createItemMesh(kind)` / `cloneItemGlb(kind)` already provide the correct shared item-visual pipeline and procedural fallback behavior;
- current household and settlement food storage both use the same `createFoodStorageVisual()` mechanism, so no per-scope renderers are justified;
- the current settlement/household storage crate is closed and cannot truthfully support internal fill visualization;
- a low-poly open Fruit Crate by BlenderVoyage on Poly Pizza has been identified as a **candidate** open-container asset (`https://poly.pizza/m/aXulVWHOeV`, GLTF/FBX, CC0/public-domain listing), but it is not yet a runtime contract until added to repo and geometry/bounds are inspected.

## Current implementation pass — Stage 1: progressive wood stockpile

The next implementation pass is intentionally **wood-only**.

### In scope

1. Wire the checked-in progressive asset, expected at:
   - `public/models/settlement/wood_pile_progressive.glb`
2. Preserve:
   - `physicalWoodStockpileQuantity(households, economy)` unchanged.
3. Add pure quantity → stage mapping:
   - `0` → none
   - `1` → `Pile_01`
   - `2–5` → `Pile_05`
   - `6–10` → `Pile_10`
   - `11–20` → `Pile_18`
   - `21+` → `Pile_29`
4. Resolve/cache `Pile_01`, `Pile_05`, `Pile_10`, `Pile_18`, `Pile_29` once.
5. `sync(quantity)` toggles only cached visibility for the primary stage.
6. Remove quantity-driven scaling of the primary authored pile.
7. Preserve a safe fallback through existing stockpile/procedural behavior if the progressive asset fails or required nodes are missing.
8. Keep object identity stable across repeated syncs.
9. Add focused Stage 1 tests.
10. Keep existing overflow only if adaptation is small and low-risk.

### Stage 1 out of scope

Do not implement or refactor:

- food quantity representatives,
- food pooling,
- crate/container fill,
- ores/minerals/water storage visuals,
- generic all-resource representative abstractions,
- storage destinations,
- economy ownership,
- persistence,
- NPC delivery,
- terrain deposits,
- unrelated settlement rendering.

### Stage 1 implementation principle

`authoritative wood quantity → pure wood stage mapping → cached authored variant visibility`

Do not generalize beyond wood for this pass.

## Existing ownership and wiring to preserve

- `src/settlement/storageVisuals.ts`
  - `physicalWoodStockpileQuantity(households, economy)` is the physical shared-stockpile total;
  - `woodPileVisualState()` / `createWoodPileVisual()` are the current wood presentation seam;
  - `selectFoodStorageSlots()` / `createFoodStorageVisual()` are the current food presentation seam.
- `src/settlement/storageDestinations.ts`
  - wood → `landmarks.stockpile` for both household and settlement scope;
  - household food → household home;
  - settlement food → `landmarks.settlementStorage`.
  Do not extend this file for ores/water without real logistics/storage semantics.
- `src/settlement/props.ts::buildSettlementProps()` constructs storage props/controllers and returns `SettlementStorageVisuals`.
- `src/settlement/createSettlement.ts::update()` already drives:
  - `storageVisual.wood.sync(physicalWoodStockpileQuantity(...))`;
  - `storageVisual.settlementFood.sync(economy.items)`;
  - household food sync by existing household/storage index mapping.
- `src/economy/settlementEconomy.ts`
  - food is derived from concrete `SettlementEconomy.items`;
  - other `EconomicKind`s are scalar economy values.
- `src/settlement/household.ts` remains owner of household wood/water/items.

`stockpileSecondary` remains decorative and is not another authoritative destination.

## Asset / prop audit

### Progressive wood asset

```text
wood_pile_progressive
├── Pile_01
├── Pile_05
├── Pile_10
├── Pile_18
└── Pile_29
```

The five children are complete alternatives, not additive stages. Runtime shows exactly one positive-quantity stage.

Intended path:

`public/models/settlement/wood_pile_progressive.glb`

Treat child names as stable runtime contract. Resolve them once and cache references; do not use child indices or re-traverse during sync.

### Nature resource assets

| Asset | Actual meaning | Storage suitability |
|---|---|---|
| `public/models/nature/resource_rock_1.glb` | terrain rock/deposit | **Unsuitable** |
| `public/models/nature/resource_gold_1.glb` | terrain rock/deposit with gold fragments | **Unsuitable** |

Do not reuse mineable deposit visuals/interactables for stored resources.

### Current food crate

Current settlement food storage uses `public/models/settlement/crate.glb`; household storage uses the same crate-template direction. The audited crate is closed/merged and the procedural fallback is also closed.

Do not implement guessed internal fill against this asset.

### Candidate open food crate

Candidate identified after recon:

- **Fruit Crate** — BlenderVoyage / Poly Pizza
- source: `https://poly.pizza/m/aXulVWHOeV`
- low-poly
- GLTF/FBX
- CC0/public-domain listing
- semantic intent: crate for apples/produce.

This is **not yet approved as the runtime asset contract**. Before Stage 3B implementation, add it to the repository and verify:

1. actual file format/path used by runtime;
2. open-top geometry really exposes contents from normal game camera angles;
3. local origin/orientation;
4. bounding box and intended world scale;
5. usable interior floor/rim bounds;
6. whether walls/boards are merged or named separately (nice-to-have only);
7. whether content meshes can sit inside without clipping;
8. whether one asset works acceptably for household and settlement storage or whether settlement storage needs a larger variant/scale.

If it fails these checks, keep Stage 3B deferred instead of forcing the asset.

## Quantity policy

### Wood mapping

| Physical wood quantity | Primary variant |
|---:|---|
| 0 | none |
| 1 | `Pile_01` |
| 2–5 | `Pile_05` |
| 6–10 | `Pile_10` |
| 11–20 | `Pile_18` |
| 21+ | `Pile_29` |

High stock may retain bounded overflow, but `Pile_29` remains primary and no quantity-driven scaling is allowed.

### Food representative mapping

Use as the starting Stage 2 policy:

| Quantity | Visible representatives |
|---:|---:|
| 0 | 0 |
| 1 | 1 |
| 2 | 2 |
| 3–4 | 3 |
| 5–7 | 4 |
| 8–12 | 5 |
| 13–20 | 6 |
| 21+ | 8 max |

Critical recon clarification:

**8 is a global cap per storage location, not per food kind.**

With multiple kinds, the controller must apportion the global visible budget deterministically among selected kinds. Do not allow `4 kinds × 8 reps = 32 meshes`.

## Stage 2 — pooled food representatives

Stage 2 is implementation-ready after this recon; no broad recon is required.

### Existing seams to reuse

- `FOOD_ITEM_KINDS` from `src/items/foodItems.ts`
  - derived from `ITEM_DEFS` category `food`;
  - deterministic declaration/catalog order;
  - automatically covers future food kinds classified in the shared item catalog.
- `createItemMesh(kind)` from `src/items/items.ts`
  - existing authoritative world-item visual factory;
  - uses warmed GLB template where available and procedural fallback otherwise.
- `cloneItemGlb(kind)` / `preloadItemGlbModels()` from `src/items/itemModels.ts`
  - shared template/clone pipeline;
  - do not create a storage-specific model-loading system.
- `createFoodStorageVisual()`
  - already shared by settlement and household storage.

### Current problem to remove

Current `createFoodStorageVisual()` behavior on changed signature:

`removeFromParent() → disposeObject3D() → createItemMesh() → place → group.add()`

This is unnecessary allocation/disposal churn for a repeatedly synced simulation visual.

### Recommended Stage 2 controller shape

Keep a pure presentation chain:

`Inventory → selected food kinds/counts → global representative budget allocation → cached per-kind representatives → deterministic slots → visibility/transforms`

Recommended decisions:

- keep the current bounded kind selection (`FOOD_STORAGE_MAX_SLOTS = 4`) unless implementation evidence shows a reason to rename it for clarity;
- replace `FoodStorageSlot.scale` as a quantity cue with count/representative information;
- add a pure representative-count function for a scalar quantity;
- add a pure deterministic allocator that applies the **global 8-mesh budget** across selected food kinds;
- allocation should preserve at least one representative for each selected positive-count kind when the global budget allows;
- remaining slots should be distributed deterministically based on stored counts, with stable `FOOD_ITEM_KINDS` order used for ties;
- do not use randomness;
- do not make scale encode quantity.

### Pooling decision

Prefer **lazy per-kind pools**.

Reason:

- `FOOD_ITEM_KINDS` is catalog-derived and can grow;
- pre-creating the maximum pool for every food kind at every household/settlement storage location would multiply hidden objects unnecessarily;
- lazy creation means a kind gets its bounded representative pool only after first appearing at that storage location;
- once created, objects live for the storage visual lifetime and normal sync only toggles visibility/transforms.

The pool must remain bounded. A single storage location never needs more than the global visible cap, so do not create eight permanent objects for every kind by default. Grow each kind's cached pool only up to the maximum representative count that kind has actually needed, while keeping the storage-level total live/visible policy bounded and avoiding unbounded historical accumulation. If implementation complexity grows, a small storage-level reusable slot pool keyed by active kind may be preferable, but it must preserve stable identities across normal quantity changes and avoid recreate/dispose churn.

### Lifecycle

Settlement `group` remains the lifetime owner.

Normal `sync()`:

- no `disposeObject3D()`;
- no model loading;
- no geometry/material cloning;
- only bounded visibility/transforms and, if first encounter of a kind requires it, bounded one-time pool growth.

`dispose()` cleans owned pooled representatives at settlement teardown without double-disposing hierarchy-owned objects.

## Stage 3A — container-ready layout foundation

Stage 3A should be implemented together with or immediately after Stage 2 because it is a small architectural seam, not a new gameplay system.

Separate quantity/kind decisions from placement geometry:

`selected representatives → deterministic local storage slots`

Use local slot descriptions conceptually like:

```ts
{ x: number, y: number, z: number, yaw: number }
```

Requirements:

- deterministic fixed slot ordering;
- layout expressed relative to storage anchor/container presentation;
- no world-coordinate logic embedded in representative-count functions;
- no guessed interior dimensions from current closed crate;
- Stage 2 may continue placing visible reps on/adjacent to current storage prop using these deterministic local slots;
- the same slot/layout seam can later be replaced or parameterized by verified open-container interior bounds.

Do not create a generic all-resource layout framework; this is a food-storage presentation seam only.

## Stage 3B — actual open-container fill

Stage 3B stays deferred until the chosen open crate is checked in and audited.

Once verified, prefer bounded content layers/slots inside real interior bounds rather than scaling a fake volume. A conceptual progression may read:

`low → quarter → half → three-quarter → near-full`

but implementation should still derive from bounded representative slots and not create one mesh per stored unit.

A small asset-specific recon is expected at that point; broad repository recon is not.

## EconomicKind audit

| Kind | Authoritative owner | Current physical destination | Current visual | Suitable storage visual | Status |
|---|---|---|---|---|---|
| `wood` | household `stock.wood` + settlement economy `wood` | shared `landmarks.stockpile` | scale bands + overflow | `wood_pile_progressive.glb` | **Stage 1 implement** |
| `food` | `Household.items` / `SettlementEconomy.items` | household home/storage crate; settlement storage crate | one scaled mesh per selected kind | `createItemMesh(kind)`; open Fruit Crate candidate for later container | **Stage 2 implement pooled reps; Stage 3A layout foundation; Stage 3B after asset verification** |
| `iron` | `SettlementEconomy` | no verified dedicated destination | none | none verified | **Defer** |
| `coal` | `SettlementEconomy` | no verified dedicated destination | none | none verified | **Defer** |
| `gold` | `SettlementEconomy` | no verified dedicated destination | none | terrain gold deposit unsuitable | **Defer** |
| `copper_ore` | `SettlementEconomy` | no verified dedicated destination | none | terrain deposit visuals unsuitable | **Defer** |
| `water` | household water / settlement economy where applicable | well is source, not stored-water container | none | none verified | **Defer** |

Do not invent anchors to satisfy the audit.

## Tests

### Stage 1

- mapping at `0,1,2,5,6,10,11,20,21` and large quantity;
- zero hides all primary variants;
- positive quantity selects exactly one `Pile_*`;
- high quantity remains `Pile_29`;
- overflow, if retained, bounded;
- repeated sync preserves object identity;
- `physicalWoodStockpileQuantity()` unchanged.

### Stage 2 / Stage 3A

Add/replace tests for:

- representative mapping at `0,1,2,3,4,5,7,8,12,13,20,21` and large quantity;
- global visible representative count never exceeds 8 per storage location;
- multiple kinds share the same budget deterministically;
- at least one rep per selected kind when budget permits;
- food-only selection;
- bounded kind selection;
- same contents → same allocation/layout;
- no quantity-driven item scale growth;
- repeated sync preserves object identities;
- normal quantity/content changes do not dispose/recreate existing representatives unnecessarily;
- empty inventory hides all reps;
- household and settlement storage still use the same mechanism;
- layout slots are deterministic and local/container-relative.

Do not assert incidental child indices or random ordering.

## Focused files by stage

### Stage 1

- `src/settlement/storageVisuals.ts`
- `src/settlement/storageVisuals.test.ts`
- `src/settlement/props.ts`
- prop/template helper only if required for progressive GLB.

### Stage 2 / Stage 3A

Expected surface:

- `src/settlement/storageVisuals.ts` — main mapping/allocation/pool/layout changes;
- `src/settlement/storageVisuals.test.ts` — pure allocation/cap/lifecycle tests;
- `src/settlement/props.ts` only if controller construction needs an explicit container-relative layout parameter;
- `src/items/foodItems.ts` only for shared type/helper reuse if truly needed; do not move presentation ownership there;
- `src/items/itemModels.ts` / `src/items/items.ts` should normally be reused unchanged.

### Stage 3B

After candidate asset is checked in:

- settlement asset/spec/loading path for new open crate;
- `props.ts` to use it for intended food storage props;
- `storageVisuals.ts` layout parameterization for verified interior slots/bounds;
- relevant tests for deterministic bounded layout contract.

## Main pitfalls

- Do not keep scale as the primary quantity cue for wood or food.
- Do not treat `Pile_*` variants as additive.
- Do not re-traverse the wood GLB every sync.
- Do not recreate/dispose food meshes on normal quantity changes.
- Do not make the 8-representative cap per-kind; it is per storage location.
- Do not eagerly instantiate all food kinds × max representatives for every storage location.
- Do not create separate household vs settlement food renderers.
- Do not infer food kinds through a new hard-coded list; reuse `FOOD_ITEM_KINDS`.
- Do not hard-code guessed closed-crate interior geometry.
- Do not treat the Fruit Crate candidate as approved until actual checked-in GLB geometry is verified.
- Do not invent mineral/water storage destinations.
- Do not map stored water to the well.
- Do not reuse terrain resource deposits as stored-resource props.
- No `Math.random()` / per-sync layout generation.
- Decorative storage representatives need no new colliders.

## Documentation discrepancy / clarification

Superseded assumptions:

1. Procedural loose logs are no longer the preferred progressive wood path because `wood_pile_progressive.glb` exists.
2. `resource_rock_1.glb` / `resource_gold_1.glb` are terrain deposits, not stored-resource visuals.
3. The food representative threshold table's `8 max` must be interpreted as a **global storage-location cap**, not a per-kind cap.
4. The current closed crate blocks actual internal fill, but not Stage 2 pooling or Stage 3A container-ready layout.
5. Stage 3 is now explicitly split:
   - **3A** layout foundation — implementable without new asset;
   - **3B** actual open-container fill — asset-dependent.
6. The Poly Pizza Fruit Crate is a promising candidate, not yet a verified runtime dependency.

> **Zrób git commit i push do main, rebase jeżeli trzeba**