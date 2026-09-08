# Implementation Notes: Resource storage visualization

**Reviewed:** 2026-09-08  
**Plan:** `settlements-npcs-025-resource-storage-visualization.md`

## Review conclusion

The plan fits the current architecture. Keep `src/settlement/storageVisuals.ts` as a presentation-only projection over `Household` / `SettlementEconomy`; do not add storage state, persistence, or another destination resolver.

Two current-code details should drive the implementation:

- `createFoodStorageVisual()` currently disposes/recreates item meshes whenever the selected kind/scale signature changes. Replace this with fixed bounded pools; otherwise the plan's “toggle visibility/transforms only” goal is not met.
- the audited GLBs are effectively merged models. None exposes useful authored child units that can be progressively revealed, so do not spend implementation time building child-name/order logic for them.

## Existing ownership and wiring to preserve

- `src/settlement/storageVisuals.ts`
  - `physicalWoodStockpileQuantity(households, economy)` is already the correct physical wood total: `Σ Household.stock.wood + SettlementEconomy.wood` because both deliveries resolve to the same shared stockpile.
  - `woodPileVisualState()` / `createWoodPileVisual()` are the current wood quantity -> presentation seam.
  - `selectFoodStorageSlots()` / `createFoodStorageVisual()` are the current food presentation seam.
- `src/settlement/storageDestinations.ts`
  - wood -> `landmarks.stockpile` for both household and settlement scope;
  - household food -> household home;
  - settlement food -> `landmarks.settlementStorage`.
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

## GLB / prop audit

The glTF JSON chunks on current `main` show:

| Asset | Nodes | Meshes | Primitives | Progressive child reveal? | Decision |
|---|---:|---:|---:|---|---|
| `public/models/settlement/wood_pile.glb` | 1 | 1 | 2 | No | Treat as one full-pile visual only. Low/mid quantities need bounded loose-log/procedural representatives. |
| `public/models/nature/resource_rock_1.glb` | 1 | 1 | 1 | No | Use as one ore-rock representative/template, not as a revealable pile. |
| `public/models/nature/resource_gold_1.glb` | 1 | 1 | 2 | No | Same: one bounded representative/template. |
| `public/models/settlement/crate.glb` | 1 | 1 | 2 | No | Closed/merged prop; there is no independently revealable lid/interior/top-layer structure. |

`crate.glb` is loaded in `props.ts` for settlement storage (`loadPropOrFallback('/models/settlement/crate.glb', 1.0, () => createCrate(1.8))`). The fallback `createCrate()` is a closed box as well. Therefore do **not** implement a fake internal fill level tied to guessed crate bounds. Keep food as bounded visible representatives placed deterministically on/adjacent to the storage prop. A true rising fill level should wait for an intentionally open container asset/prop.

The plan text says to derive fill Y from real container geometry if the active prop is open. Current storage prop does not satisfy that precondition; this is a deliberate defer, not a missing implementation.

## Quantity policy

Replace the current separate scale-band logic with one small pure representative-count mapping used by wood/food/ore visuals where applicable.

Recommended thresholds:

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

Keep this as a pure exported function and test every boundary. Do not derive model scale from quantity; representative meshes should stay close to their authored/base scale.

For deterministic layout, prefer fixed local slot arrays per representation class. No seeded RNG is needed while caps are this small; fixed slots are simpler and guarantee stable reload/update layout.

## Wood implementation

Because `wood_pile.glb` is one merged mesh, use two visual regimes:

1. low/mid quantity: a prebuilt pool of up to 6–8 loose log representatives using the existing procedural log visual language from `createStockpile()` (factor a small `createLogRepresentative()`/template helper rather than creating full five-log piles per unit);
2. high quantity: reveal the existing authored full pile once the quantity reaches the configured “full pile” threshold; retain a bounded number of existing overflow pile clones for very high stock if useful visually.

Do not keep quantity-driven scaling of the authored full pile. `1` wood must never show a shrunken complete pile.

Keep `physicalWoodStockpileQuantity()` unchanged and reuse the current main stockpile anchor. Build pools once in `buildSettlementProps()` / controller construction; `sync()` should only toggle `.visible` and, if needed, fixed transforms.

## Food implementation

Keep `FOOD_ITEM_KINDS` ordering and `createItemMesh(kind)` as the authoritative item-visual pipeline.

The current `FOOD_STORAGE_MAX_SLOTS = 4` limits **kinds**, not quantity representatives. Preserve a bounded kind selection, then give each selected kind a small fixed representative pool. Suggested total cap per storage location: 8 visible food meshes, apportioned deterministically among selected kinds according to counts.

Important implementation detail: avoid rebuilding item meshes in `sync()`. Pre-create the pool once. Because `createItemMesh(kind)` depends on `ItemKind`, either:

- pre-create a bounded pool for every `FOOD_ITEM_KINDS` kind and show only selected slots, or
- lazily create each kind's bounded pool the first time it becomes selected, cache it for the life of the storage visual, and only toggle thereafter.

Prefer lazy-per-kind caching if the food catalog is materially larger than the simultaneous visible cap; it avoids unnecessary initial meshes while still eliminating churn on repeated changes.

Do not use the current `FoodStorageSlot.scale` as a quantity cue. Replace `selectFoodStorageSlots()` with/augment it by a pure selection result carrying representative count, e.g. `{ kind, count, visibleRepresentatives }`.

## EconomicKind audit

| Kind | Authoritative owner | Current physical destination | Current visual | Existing visual source | Proposed status |
|---|---|---|---|---|---|
| `wood` | household `stock.wood` + settlement economy `wood` | shared `landmarks.stockpile` | yes, scale bands + overflow piles | `wood_pile.glb`, procedural `createStockpile()` | **Implement** staged loose logs -> full pile -> bounded overflow. |
| `food` | `Household.items` / `SettlementEconomy.items` | household home; settlement storage crate | yes, one scaled mesh per selected kind | `createItemMesh(kind)`, `crate.glb` | **Implement** bounded discrete reps; defer internal fill because current crate is closed/merged. |
| `iron` | `SettlementEconomy` | no verified dedicated settlement storage destination in `storageDestinations.ts` | none | `resource_rock_1.glb` + iron tint; procedural `createRockCluster(...)` | **Defer physical placement** until a real ore storage destination is defined. Prepare shared ore representation helper only if it is useful without inventing an anchor. |
| `coal` | `SettlementEconomy` | no verified dedicated destination | none | `resource_rock_1.glb` + coal tint; procedural rock cluster | **Defer** for same reason. |
| `gold` | `SettlementEconomy` | no verified dedicated destination | none | `resource_gold_1.glb`; procedural rock cluster fallback possible | **Defer** for same reason. |
| `copper_ore` | `SettlementEconomy` | no verified dedicated destination | none | `resource_rock_1.glb` + copper tint; procedural rock cluster | **Defer** for same reason. |
| `water` | `Household.stock.water` / settlement economy where applicable | wells are sources, not stored-water containers | no quantity visual | trough/well visuals exist but are semantically different | **Defer** until stored-water ownership has a physical container/destination. Never map stock quantity onto the well. |

The plan's “audit every EconomicKind” requirement should therefore **not** turn into adding five new arbitrary anchors around `settlementStorage`. The missing destination semantics are the blocker.

If a later/current dependency defines one shared settlement bulk-goods destination for ores, all four ore kinds should use one `OreStorageVisual`/pile mechanism parameterized by template/tint + `EconomicKind`; do not create four renderers.

## Reusable ore visual language

`src/terrain/resourceDeposits.ts` already uses the nature resource assets/tints for mineable deposits. Reuse its asset/tint constants or a small shared data definition if that can be done without pulling terrain-deposit ownership into settlements.

Do **not** reuse a complete mineable-deposit object/interactable in settlement storage. Stored ore must remain non-mineable presentation and visually distinguishable by placement/layout from a world deposit.

`src/settlement/decorProps.ts::createRockCluster(...)` is the existing procedural fallback language. If ore storage becomes implementable in this plan, use a bounded pool of small representatives/clusters rather than scaling one deposit model.

## Lifecycle / disposal

Continue using the settlement `group` as the lifetime owner. Avoid per-sync `disposeObject3D()` calls after pools are established.

A controller may still dispose its owned pooled meshes on settlement teardown, but do not double-dispose objects that are already recursively owned/disposed by the settlement group. Follow the existing pattern used by `SettlementStorageVisuals` and `disposeObject3D`.

No visual state belongs in `SaveData`; stream-out/in should rebuild from authoritative quantities.

## Tests to change

Update `src/settlement/storageVisuals.test.ts` around pure mappings rather than child indices:

- representative mapping at `0,1,2,3,4,5,7,8,12,13,20,21` and very large quantities;
- cap is never exceeded;
- equal quantity -> equal representative state/layout;
- `physicalWoodStockpileQuantity()` tests stay unchanged;
- wood controller: low quantities reveal loose representatives, full-pile threshold switches/reveals the authored pile, overflow remains bounded;
- food selection remains deterministic / food-only / bounded by kind;
- per-kind representative counts change monotonically without scale growth;
- repeated `sync()` and quantity changes do not replace pooled object identities;
- empty state hides all reps;
- no test should depend on incidental GLB child index/name because audited assets have no useful child hierarchy.

## Focused files

Expected implementation surface:

- `src/settlement/storageVisuals.ts` — main change;
- `src/settlement/storageVisuals.test.ts` — pure mapping + pool lifecycle tests;
- `src/settlement/props.ts` — only pool/template construction/wiring if required;
- `src/settlement/settlementStructures.ts` — optional extraction of a single-log procedural representative from `createStockpile()`;
- `src/terrain/resourceDeposits.ts` / `src/settlement/decorProps.ts` — inspect/reuse visual constants/helpers only if ore storage obtains a valid destination; avoid unrelated refactor.

`src/settlement/storageDestinations.ts`, economy ownership, persistence and NPC delivery logic should remain unchanged for the wood/food implementation.

## Main pitfalls

- Do not implement GLB child reveal: audited candidates are merged single-node meshes.
- Do not create/dispose food meshes on quantity changes; current implementation does this and is the main lifecycle issue to remove.
- Do not make model scale the primary quantity signal.
- Do not place ore/water visuals at guessed anchors just to cover every `EconomicKind`.
- Do not treat the settlement well as stored water.
- Do not reuse mineable `resourceDeposits` interactables for stored ore.
- Do not make `stockpileSecondary` a second authoritative wood destination.
- Keep deterministic fixed slots; no `Math.random()`/per-sync seeded generation.
- Decorative representatives need no new colliders.

## Documentation discrepancy / clarification

The plan asks for the “actual crate/barrel/storage GLB” audit and conditional fill-level logic. Current implementation uses `crate.glb`, and the asset is a single merged mesh; the procedural fallback is also a closed box. Therefore a container fill-height implementation is not justified on current `main` and should be recorded as deferred unless the implementation deliberately introduces an already-existing open-container asset after verifying its semantics and placement.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
