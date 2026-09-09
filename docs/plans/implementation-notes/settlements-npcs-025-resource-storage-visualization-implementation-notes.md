# Implementation Notes: Resource storage visualization

**Reviewed:** 2026-09-09  
**Plan:** `settlements-npcs-025-resource-storage-visualization.md`

## Review conclusion

The plan fits the current architecture. Keep `src/settlement/storageVisuals.ts` as a presentation-only projection over `Household` / `SettlementEconomy`; do not add storage state, persistence, or another destination resolver.

The implementation direction changed after asset preparation on 2026-09-09:

- do **not** build low/mid wood from procedural loose logs;
- migrate the primary wood visual to the new authored `wood_pile_progressive.glb` containing five complete pile variants: `Pile_01`, `Pile_05`, `Pile_10`, `Pile_18`, `Pile_29`;
- exactly one primary variant should be visible at a time for positive quantities;
- `resource_rock_1.glb` and `resource_gold_1.glb` are terrain-deposit models (rocks protruding from ground; gold is grey rock with gold fragments), so they are **not** suitable stored-resource visuals and must be removed from storage candidates.

One current-code issue still drives the future food implementation: `createFoodStorageVisual()` currently disposes/recreates item meshes whenever the selected kind/scale signature changes. Replace this with bounded cached pools when the food stage is implemented so sync only changes visibility/transforms.

## Current implementation pass — Stage 1: progressive wood stockpile

The next implementation pass is intentionally **wood-only**. Implement only the progressive wood stockpile and the smallest reusable seam needed to support it cleanly.

### In scope

1. Wire the checked-in progressive asset, expected at:
   - `public/models/settlement/wood_pile_progressive.glb`
2. Preserve the existing authoritative quantity path:
   - `physicalWoodStockpileQuantity(households, economy)` remains unchanged.
3. Add a small pure quantity → wood-stage mapping:
   - `0` → none
   - `1` → `Pile_01`
   - `2–5` → `Pile_05`
   - `6–10` → `Pile_10`
   - `11–20` → `Pile_18`
   - `21+` → `Pile_29`
4. Resolve/cache `Pile_01`, `Pile_05`, `Pile_10`, `Pile_18`, `Pile_29` once when constructing the visual controller.
5. Make `sync(quantity)` toggle only cached visibility for the primary pile stage; exactly one `Pile_*` is visible for positive quantity and none for zero.
6. Remove quantity-driven scaling of the primary authored pile.
7. Preserve a safe fallback through the existing stockpile/procedural path if the progressive GLB fails to load or the required named nodes are missing.
8. Keep object identity stable across repeated `sync()` calls; no per-sync mesh creation/disposal or hierarchy traversal.
9. Add focused tests for mapping boundaries, zero/positive visibility semantics, stable identities, and unchanged physical wood aggregation.
10. Retain the current bounded overflow mechanism only if doing so is a small, low-risk adaptation. Do not expand Stage 1 to redesign high-stock presentation.

### Explicitly out of scope for Stage 1

Do **not** implement or refactor:

- food quantity representatives,
- food mesh pooling,
- crate/container fill levels,
- iron/coal/gold/copper storage visuals,
- water storage visuals,
- a generic `quantityToVisualRepresentatives()` abstraction for all resources,
- storage destination semantics,
- economy ownership,
- persistence,
- NPC delivery logic,
- terrain resource deposits,
- unrelated settlement props or rendering refactors.

Food and remaining resource work stays as later stages of `settlements-npcs-025`. Do not opportunistically implement it in the wood pass.

### Stage 1 implementation principle

Prefer the narrowest existing seams:

`authoritative wood quantity → pure wood stage mapping → cached authored variant visibility`

Do not generalize beyond wood unless a tiny extraction is directly required by the current code structure. The purpose of the foundation in Stage 1 is the pure mapping/controller seam, not a premature generic storage-visual framework.

## Existing ownership and wiring to preserve

- `src/settlement/storageVisuals.ts`
  - `physicalWoodStockpileQuantity(households, economy)` is already the correct physical wood total: `Σ Household.stock.wood + SettlementEconomy.wood` because both deliveries resolve to the same shared stockpile.
  - `woodPileVisualState()` / `createWoodPileVisual()` are the current wood quantity → presentation seam.
  - `selectFoodStorageSlots()` / `createFoodStorageVisual()` are the current food presentation seam.
- `src/settlement/storageDestinations.ts`
  - wood → `landmarks.stockpile` for both household and settlement scope;
  - household food → household home;
  - settlement food → `landmarks.settlementStorage`.
  - Do not extend this file for ores/water unless their real logistics/storage destination is first defined elsewhere; visualization must not invent storage semantics.
- `src/settlement/props.ts::buildSettlementProps()` constructs the storage props/controllers and returns `SettlementStorageVisuals`.
- `src/settlement/createSettlement.ts::update()` already drives:
  - `storageVisual.wood.sync(physicalWoodStockpileQuantity(...))`;
  - `storageVisual.settlementFood.sync(economy.items)`;
  - household food sync by the existing household/storage index mapping.
  Keep this integration point. Controllers already no-op on unchanged signatures, so a new event bus is not justified.
- `src/economy/settlementEconomy.ts`
  - `food` is derived from concrete `SettlementEconomy.items`;
  - all other `EconomicKind`s are scalar `EconomicStock` values behind `economy.query(kind)`.
- `src/settlement/household.ts` remains the owner of household wood/water/items. Do not mirror values into visual objects.

`stockpileSecondary` remains decorative: current delivery semantics target only `landmarks.stockpile`. Do not split or duplicate authoritative wood across the secondary pile in this plan.

## Asset / prop audit

### Progressive wood asset

A new authored progressive asset has been prepared in Blender for this plan:

```text
wood_pile_progressive
├── Pile_01
├── Pile_05
├── Pile_10
├── Pile_18
└── Pile_29
```

Asset intent:

- `Pile_01`: 1 log,
- `Pile_05`: 5 logs,
- `Pile_10`: 10 logs,
- `Pile_18`: 18 logs,
- `Pile_29`: full 29-log pile.

The five children are **alternative complete variants**, not additive stages. Runtime should show exactly one primary `Pile_*` at a time.

Before implementation, verify the actual checked-in path. Intended location is under the settlement model assets, preferably:

`public/models/settlement/wood_pile_progressive.glb`

Treat the five child names as a deliberate runtime asset contract. Resolve them once after load/clone and cache references; do not rely on child indices or re-traverse/sort the hierarchy during sync.

The old `public/models/settlement/wood_pile.glb` audit remains useful only as historical context: it is one merged authored pile and cannot provide progressive child reveal. Once the progressive asset is wired successfully, it should no longer be the primary quantity representation.

### Nature resource assets

Previous notes incorrectly listed the nature deposit GLBs as possible bounded stored-resource representatives. Corrected decision:

| Asset | Actual visual meaning | Storage suitability |
|---|---|---|
| `public/models/nature/resource_rock_1.glb` | rock/deposit protruding from terrain | **Unsuitable** for stored ore |
| `public/models/nature/resource_gold_1.glb` | grey rock/deposit with visible gold fragments, protruding from terrain | **Unsuitable** for stored gold |

These belong to world-deposit visual language. Do not reuse them directly for settlement stockpiles and do not adapt mineable deposit objects/interactables into storage visuals.

### Settlement food crate

`public/models/settlement/crate.glb` is loaded in `props.ts` for settlement storage (`loadPropOrFallback('/models/settlement/crate.glb', 1.0, () => createCrate(1.8))`). The audited GLB is a closed/merged prop; the procedural fallback is also a closed box.

Therefore do **not** implement a fake internal fill level tied to guessed crate bounds. Keep food as bounded visible representatives placed deterministically on/adjacent to the storage prop in the future food stage. A true rising fill level should wait for an intentionally open container asset/prop with real usable interior/rim bounds.

## Quantity policy

Wood and food intentionally use different pure mappings because wood has authored discrete variants while food uses generic representative pools.

### Wood mapping

Exact Stage 1 mapping:

| Physical wood quantity | Primary variant |
|---:|---|
| 0 | none |
| 1 | `Pile_01` |
| 2–5 | `Pile_05` |
| 6–10 | `Pile_10` |
| 11–20 | `Pile_18` |
| 21+ | `Pile_29` |

Implement this as a small pure function returning a stage/key, not scale.

High stock may retain bounded overflow piles if useful, but:

- `Pile_29` remains the primary visual for 21+;
- no quantity-driven scaling;
- overflow count must stay capped;
- overflow should reuse a full-pile representation rather than invent new geometry.

### Food mapping — future stage

Recommended representative-count thresholds for the later food implementation:

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

Do not implement this mapping in Stage 1 unless it already exists unchanged and no modification is required.

## Wood implementation

Replace the current scale-band primary pile with the progressive asset.

Expected controller behavior:

1. load/clone `wood_pile_progressive.glb` once through the existing prop/template pipeline;
2. resolve `Pile_01`, `Pile_05`, `Pile_10`, `Pile_18`, `Pile_29` once during construction;
3. cache those `Object3D` references in the wood visual controller;
4. fail safely / use the existing procedural stockpile fallback if the progressive asset cannot be loaded or required nodes are missing;
5. `sync(quantity)` calls the pure stage mapping and toggles only cached `.visible` values;
6. zero hides every primary variant;
7. positive quantities show exactly one primary variant;
8. do not modify variant scale to encode quantity;
9. retain bounded overflow only if it still improves high-stock readability and requires only a small adaptation.

Do not generate procedural loose-log pools for low/mid wood now that the authored variants exist.

Keep `physicalWoodStockpileQuantity()` unchanged and reuse the current main stockpile anchor.

### Suggested symbol direction

Current symbols may be simplified toward concepts such as:

- `woodPileStage(quantity)` → `null | 'Pile_01' | 'Pile_05' | 'Pile_10' | 'Pile_18' | 'Pile_29'` or a compact enum/key;
- `createWoodPileVisual(progressivePile, overflowPiles?)` caches named variants;
- remove `WOOD_PILE_BANDS` / quantity-driven main-pile scaling once no longer used.

Exact naming can follow existing repository conventions, but preserve a pure quantity → stage seam for tests.

## Food implementation — future stage

Keep `FOOD_ITEM_KINDS` ordering and `createItemMesh(kind)` as the authoritative item-visual pipeline when food work resumes.

The current `FOOD_STORAGE_MAX_SLOTS = 4` limits **kinds**, not quantity representatives. Preserve bounded kind selection, then give selected kinds bounded representative pools. Suggested total cap per storage location: 8 visible food meshes, apportioned deterministically among selected kinds according to counts.

Important future implementation detail: avoid rebuilding item meshes in `sync()`. Because `createItemMesh(kind)` depends on `ItemKind`, either pre-create bounded pools or lazily cache per-kind pools. Do not modify this in Stage 1.

## EconomicKind audit

| Kind | Authoritative owner | Current physical destination | Current visual | Existing suitable storage visual | Proposed status |
|---|---|---|---|---|---|
| `wood` | household `stock.wood` + settlement economy `wood` | shared `landmarks.stockpile` | yes, scale bands + overflow piles | new `wood_pile_progressive.glb` | **Stage 1: implement** five authored primary stages + optional bounded overflow. |
| `food` | `Household.items` / `SettlementEconomy.items` | household home; settlement storage crate | yes, one scaled mesh per selected kind | `createItemMesh(kind)` | **Later stage** bounded discrete reps; defer internal fill because current crate is closed/merged. |
| `iron` | `SettlementEconomy` | no verified dedicated settlement storage destination | none | none verified; terrain rock deposit is unsuitable | **Defer physical placement** until a real storage destination and stored-material visual exist. |
| `coal` | `SettlementEconomy` | no verified dedicated destination | none | none verified; terrain rock deposit is unsuitable | **Defer** for same reason. |
| `gold` | `SettlementEconomy` | no verified dedicated destination | none | none verified; `resource_gold_1.glb` is a terrain deposit and unsuitable | **Defer** for same reason. |
| `copper_ore` | `SettlementEconomy` | no verified dedicated destination | none | none verified; terrain rock deposit is unsuitable | **Defer** for same reason. |
| `water` | `Household.stock.water` / settlement economy where applicable | wells are sources, not stored-water containers | no quantity visual | none verified | **Defer** until stored-water ownership has a physical container/destination. Never map stock quantity onto the well. |

The audit requirement must **not** turn into adding arbitrary anchors around `settlementStorage`. Missing destination semantics and missing appropriate stored-material assets are concrete blockers.

## Lifecycle / disposal

Continue using the settlement `group` as the lifetime owner. Avoid per-sync `disposeObject3D()` calls after pools/controllers are established.

The progressive wood variants are part of one cloned asset hierarchy and should live for the settlement lifetime. Sync only toggles visibility.

No visual state belongs in `SaveData`; stream-out/in rebuilds from authoritative quantities.

## Stage 1 tests

Update `src/settlement/storageVisuals.test.ts` only as needed for wood:

- wood mapping at `0,1,2,5,6,10,11,20,21` and a very large quantity;
- zero hides all primary variants;
- every positive quantity selects exactly one of `Pile_01`, `Pile_05`, `Pile_10`, `Pile_18`, `Pile_29`;
- high quantity remains on `Pile_29`;
- overflow, if retained, remains bounded;
- repeated wood `sync()` does not replace asset/object identities;
- `physicalWoodStockpileQuantity()` tests stay unchanged.

For wood, stable authored node names are intentional contract and may be asserted. Do not assert incidental child indices.

Do not add food representative/pool tests in Stage 1.

## Focused files for Stage 1

Expected implementation surface:

- `src/settlement/storageVisuals.ts` — main change;
- `src/settlement/storageVisuals.test.ts` — wood stage mapping/controller tests;
- `src/settlement/props.ts` — load/clone/wire progressive wood asset and fallback;
- settlement prop/template helper only if strictly needed to expose/cache the new GLB cleanly.

Avoid changes outside this surface unless current code demonstrates a direct dependency required for the wood integration.

Do **not** touch `src/terrain/resourceDeposits.ts`, `src/settlement/storageDestinations.ts`, economy ownership, persistence, NPC delivery logic, or food visualization in Stage 1.

## Main pitfalls

- Do not keep the old `wood_pile.glb` scale bands as the primary quantity cue.
- Do not treat `Pile_*` variants as additive; they are complete alternatives and exactly one primary stage should be visible.
- Do not re-traverse the GLB hierarchy on every sync; cache named nodes once.
- Do not generate procedural loose logs for low/mid wood unless the progressive asset fails and fallback is required.
- Do not broaden Stage 1 into food/mineral/water storage work.
- Do not introduce a generic storage-visual framework just for this pass.
- Do not make `stockpileSecondary` a second authoritative wood destination.
- Keep deterministic behavior; no `Math.random()`/per-sync seeded generation.
- Decorative representatives need no new colliders.

## Documentation discrepancy / clarification

Two earlier assumptions are superseded:

1. The original implementation notes recommended procedural loose logs because `wood_pile.glb` is merged. A dedicated progressive asset now exists, so the implementation should use its five authored variants instead.
2. Earlier plan/notes treated `resource_rock_1.glb` and `resource_gold_1.glb` as possible ore-storage representatives. Visual inspection confirms they are terrain deposits protruding from the ground, so this is semantically incorrect for settlement storage. Mineral storage remains deferred until both destination semantics and suitable stored-material visuals exist.

The current settlement food crate remains closed/merged, so internal fill-height behavior is still deliberately deferred.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
