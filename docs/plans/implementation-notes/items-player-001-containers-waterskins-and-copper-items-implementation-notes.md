# Implementation notes — plan items-player-001: Containers, Waterskins & Copper Items

**Plan:** [items-player-001-containers-waterskins-and-copper-items.md](../items-player-001-containers-waterskins-and-copper-items.md)
**Written:** 2026-08-27 (post-implementation — the plan had no pre-implementation notes; this documents what was actually built and where it deviates)

## 1. Backpack already existed

The plan's §4.1 asks for `backpack` as if new. Plan 186 already added it in full (`ITEM_CATALOG.backpack.carryCapacityBonus`, Kupiec stock, procedural fallback). No changes were made to it — it's left exactly as plan 186 built it.

## 2. Partial container content: aggregate liters per `ItemKind`, not `ItemInstance`

Plan §7 explicitly allows a "minimal solution consistent with the existing architecture" if plain `Inventory` (`ItemKind → count`) can't represent partial content, and asks that a future `ItemInstance` need be documented if so.

Two options existed:

- **`ItemInstance`** (the mechanism already used for weapon durability/sharpness and trap durability) — gives true per-physical-unit tracking, but would have broken `ai/npcAssistance.ts`'s plan-152 "request water" flow, which is explicitly documented as "never assumes item instances — consumables are plain counts" and transfers by `Inventory.remove(kind, 1)`/`add(kind, 1)`.
- **One aggregate `liters` total per `ItemKind` stack** — chosen. `Inventory` gained a `liquids: Map<ItemKind, { content, liters }>` (`getLiquid`/`fillLiquid`/`drinkLiquid`/`emptyLiquid`/`liquidCapacity`), persisted as `SaveData.inventoryLiquids`. `ItemKind → count` stays the only ownership record; `liquids` just adds "how full is the stack" on top.

**Known gap (documented per the plan's own ask):** carrying two of the same waterskin/bucket and filling only one isn't distinguishable — the model tracks one total across however many units of that kind are held, capped at `count(kind) × capacityLiters`. A real per-unit split needs promoting these kinds to `ItemInstance`, deliberately not done now. `Inventory.remove()` clamps held liters down whenever losing a unit drops the stack's capacity below what's stored.

`ai/npcAssistance.ts`'s `findCarriedConsumableKind` still matches a waterskin by mere possession (`carried.has(kind, 1)`), not by whether it currently holds water — this was already true before this plan (no code path ever puts a waterskin in an NPC's `carried` Inventory, so it's a dormant/untriggered gap either way) and is left as-is rather than reworking plan 152's own architecture.

## 3. Waterskins: existing well/lake fill + inventory drink migrated, not left broken

Plan 106's binary `waterskin_empty`/`waterskin_full` swap was replaced by three kinds (`waterskin_small`/`medium`/`large`, 2/5/10 l) sharing the new `container` model. Since this is an *existing*, already-wired mechanic (not new UI), it was adapted rather than left non-functional:

- `app/actions/survivalActions.ts`'s `fillWaterskin` (well/lake `[R]`) now tops up the smallest carried waterskin that isn't already full of water, via `Inventory.fillLiquid`.
- `consumeItem` (inventory "Wypij") now special-cases `isLiquidContainerKind()`: one `LIQUID_DRINK_PORTION_LITERS` (1 l) per click via `Inventory.drinkLiquid`, restoring the same `DRINK_THIRST_RELIEF` per portion the well/lake already grants — not a per-liter rebalance, since exact numbers for a multi-drink container are a UX/balance call that belongs to the future interaction-window plan (§9), not this one.
- The Inventory-screen item card still shows one static "+45 pragnienia" `Efekt` line (from `catalogEntry.consumable.relief`) and doesn't render "water: X / Y l" anywhere yet — showing that, and disabling "Wypij" when empty rather than toasting an error on click, is exactly the "filtrowanie niedostępnych akcji" work plan §9 defers to the future interaction system.

## 4. Buckets: domain model only, no wired interaction

`wooden_bucket`/`copper_bucket` (10 l, water or milk) got the same `container` catalog entry and the same `Inventory.fillLiquid`/`drinkLiquid`/`emptyLiquid` methods as waterskins, but **no call site uses them** — there's no existing bucket mechanic to preserve (buckets are new), and milking/bucket-fill/bucket-drink are explicitly future work (plan §3.3, §9). This matches the codebase's existing "wired but dormant" precedent (e.g. Farmer planting, Blacksmith sharpening in `docs/STATE.md`).

## 5. Copper ore: `copper_ore` is the deposit/economy identity, not `copper`

Iron/coal/gold share one literal name end-to-end (`NaturalResource.type` = `MineableOre` = `ItemKind` = `EconomicKind`) — `terrain/depositMining.ts`'s `oreEconomicKind()` relies on this being a plain identity function. Since the plan wants `copper_ore` (raw) distinct from `copper` (future-smelted material), the *ore* got the shared name `copper_ore` everywhere (deposit type, item, economy stock), keeping `oreEconomicKind()` untouched. `copper` (the refined material) is **not** an `EconomicKind` and has no mining tie-in — it's Kupiec-only, the same "buy the material, no smelting" shortcut the codebase already uses for `iron_rod`.

Touched for the new ore: `terrain/naturalResources.ts` (`ResourceType`, weighting), `terrain/depositMining.ts` (`MineableOre`), `terrain/resourceDeposits.ts` (`VisibleOreType`, tint color, reuses the existing rock-cluster pile template), `economy/kinds.ts` (`EconomicKind`), `interaction/Interactable.ts` (`oreType` union), `interaction/resolveInteraction.ts` (settlement storage display line), `ai/dialogueTemplates.ts` (`RESOURCE_LABEL` — settlement flavor text). No new placement/streaming system — same `ResourceDeposits` pipeline as iron/coal/gold.

## 6. Models

No existing GLB fit any of the new items (checked `items/itemModels.ts`, `public/models/`, `docs/assets/MODELS.md`); all use procedural fallbacks (see `docs/assets/MODELS.md` M68–M71). `_temp/Models/packs/fantasy-props-megakit/glTF/` has plausible unconverted sources for buckets (`Bucket_Wooden_1.gltf`, `Bucket_Metal.gltf`) and saddlebags (`Pouch_Large.gltf`) — not converted/wired in this pass (out of scope for an items/data plan; conversion is its own pipeline, see `docs/blender/README.md`).

## 7. Merchant stock

All new carriable items with no recipe yet (3 waterskins, both buckets, `saddlebags`, `copper`) were added to `tradeCatalog.ts`'s `MERCHANT_PRICES`/`MERCHANT_STOCK`, matching the existing convention that every "no recipe yet" item is Kupiec-sourced (e.g. `iron_rod`, `whetstone`). `copper_ore` was **not** added — raw ore/mineral kinds are never sold (`tradeCatalog.ts`'s own comment), matching `iron`/`coal`/`gold`.
