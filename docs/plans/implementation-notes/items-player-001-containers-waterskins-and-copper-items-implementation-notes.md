# Implementation Notes: Containers, Waterskins & Copper Items

**Reviewed:** 2026-08-27  
**Plan:** items-player-001-containers-waterskins-and-copper-items.md

## 1. Review result — plan is materially behind the codebase

Do not implement the plan literally. Several parts already exist through later plans:

- Plan 164 already provides the generic player storage container in src/items/container.ts + src/world/createPlacedContainers.ts. It is a physical chest/storage system backed by Inventory.
- Inventory already has gabarite capacity, item instances, persistence helpers and backpack-derived carry capacity.
- backpack already exists as an ItemKind; its carryCapacityBonus is already implemented.
- waterskin_empty / waterskin_full already exist from plan 106, including well/lake filling and drinking.
- Item instances are now established architecture (src/items/itemInstances.ts), including save serialization and instance-backed traps/weapons.
- Save format is currently a hard-cut SaveData v1. Do not introduce the old plan's proposed v18 migration chain.
- The current visible ore system supports only coal, iron and gold; copper is genuinely new.

The real implementation work is therefore mainly liquid-container state + new item kinds + copper resource integration, not a new generic container/inventory system.

## 2. Liquid containers: do not reuse the physical storage Container

src/items/container.ts / createPlacedContainers.ts means a player-placed chest. Its contents are an ordinary Inventory with count-based items and item instances.

Do not put water/milk into this system.

A liquid container needs fixed capacity in litres, one allowed liquid type, fractional/partial amount, persistent state while the physical item remains in inventory, and identity independent of the visual representation.

The cleanest fit with the current architecture is a container item instance, not a new BucketSystem and not a second inventory.

Suggested state:

- id
- kind
- liquid: water | milk | null
- amountLitres

Capacity and allowed-liquid rules should be derived from one central item definition. Do not persist derived capacity.

Avoid naming the new domain type simply Container because that collides conceptually with the existing physical storage-container domain.

## 3. Existing ItemInstance architecture is the correct extension point

src/items/itemInstances.ts already owns stable IDs and discriminated instance state.

Extend the existing instance union/type guards/clone logic rather than introducing another per-item-state map.

The implementation must update all current instance boundaries together:

- cloneItemInstance()
- Inventory.instancesToJSON()
- Inventory.instancesFromJSON()
- instance-kind classification
- acquired-instance creation in src/items/trade.ts
- save validation in src/persistence/saveData.ts

Do not make liquid state live in UI or in WaterSource. The liquid amount is item state; WaterSource remains the source abstraction.

## 4. Legacy waterskin kinds need deliberate handling

Current code still has waterskin_empty and waterskin_full, and survivalActions.ts explicitly swaps them during filling.

The new partial-container model cannot use that representation.

Do not blindly delete the old kinds: SaveData is hard-cut v1 and existing saves can contain those item kinds.

Keep a small compatibility path for legacy waterskin_empty/full unless the implementation explicitly chooses to invalidate old saves. Prefer converting legacy waterskins at the load/acquisition boundary into the new instance representation without adding a general migration framework.

After conversion, all new gameplay should operate on the new instance model. Do not retain two active liquid implementations beyond this compatibility boundary.

## 5. Filling/drinking should become domain operations

Current fillWaterskin() removes waterskin_empty and adds waterskin_full. Replace this with operations against a concrete liquid-container instance.

Required invariants:

- fill never exceeds capacity;
- empty container can receive water;
- partially filled water container can be topped up;
- a container containing milk cannot receive water;
- water cannot be added to a non-water-capable container;
- drinking consumes exactly 1 l;
- drinking an empty container is rejected;
- drinking does not delete the physical container;
- after drinking to zero, the same instance remains present and empty.

Keep DRINK_THIRST_RELIEF as the existing thirst mechanic unless balancing is explicitly changed. One litre is the physical consumption unit.

For now, only water should be wired to the existing WaterSource fill flow. Milk filling can expose the domain representation without adding cow-milking UI/action if that belongs to a later fauna interaction plan.

## 6. Bucket vs waterskin rules must be data-driven

Use a small central definition rather than scattered kind checks:

- waterskin_small/medium/large → water only;
- wooden_bucket → 10 l + water/milk;
- copper_bucket → 10 l + water/milk.

The same definition should answer capacity and allowed liquids so a future barrel is an extension, not another branch tree.

## 7. New ItemKinds

Add:

- waterskin_small
- waterskin_medium
- waterskin_large
- wooden_bucket
- copper_bucket
- copper_ore
- copper
- saddlebags

backpack already exists — do not add it again.

Do not add copper_cup.

All new definitions must exist in both src/items/items.ts / ITEM_DEFS and src/items/itemCatalog.ts / ITEM_CATALOG. Do not create a third item-definition registry.

## 8. Backpack and saddlebags

Backpack capacity is already implemented through ITEM_CATALOG.backpack.carryCapacityBonus and Inventory.maxWeight. Do not create an equipment slot or second backpack-capacity system.

saddlebags should remain a normal item definition for now. Do not implement animal inventory/equipment until the horse/transport plan.

## 9. Weight

The plan's suggested weights are not authoritative. Use existing ITEM_DEFS conventions.

Do not encode liquid mass by changing ITEM_DEFS.weight.

For instance-backed liquid containers, decide explicitly whether liquid mass affects encumbrance now. If yes, extend Inventory.totalWeight() for liquid-container instances using amountLitres and density. If not, document that liquid mass is deferred.

Do not silently make a full 10 l bucket weigh the same as an empty one if gameplay expects realistic encumbrance.

## 10. Copper is not currently an ore type

src/terrain/resourceDeposits.ts currently treats only coal | iron | gold as visible mineable ore.

Do not add a separate copper placement system.

Copper should extend the existing chain:

NaturalResource → visible ore deposit → ResourceDeposits.mine() → depositMining yield → copper_ore ItemKind

Inspect/extend:

- src/world/naturalResources.ts
- src/terrain/resourceDeposits.ts
- src/terrain/depositMining.ts

Keep deterministic generation, depletion state and NPC mining hooks shared with iron/coal/gold.

Do not implement copper smelting. copper can be introduced as a future processed material definition, but there must be no fake production chain unless current implementation actually needs a minimal source.

## 11. Copper trade/source rules

Do not automatically add copper to merchant stock.

Expected ownership:

- copper_ore: world mining result;
- copper: future processing output;
- copper_bucket: future smithing/crafting output;
- no random item pickup;
- no new placement manager.

If tradeCatalog.ts needs values, extend the existing resource valuation rather than creating a second pricing system.

## 12. Models

Current item GLB handling is centralized in src/items/itemModels.ts through ITEM_GLB_SPECS and the procedural fallback in createItemMesh.

Do not create another item renderer.

Check public/models/items/ and docs/assets/MODELS.md before adding assets. Missing models should use the existing fallback. Update the asset backlog only for genuinely required new models.

## 13. Trade/acquisition boundary

src/items/trade.ts already has createAcquiredInstance() and the instance-backed acquisition path.

New liquid-container kinds should use the same acquisition boundary if they become instance-backed.

Do not special-case container creation in merchant UI. A merchant purchase of an empty container should create a fresh empty instance with a stable ID.

## 14. Persistence

Current SaveData is version 1 and intentionally has no migration history. Do not follow the plan's old v18 migration instruction.

Extend the existing v1 SaveItemInstance representation and validator to persist liquid-container state.

Persist only authoritative state:

- id
- kind
- liquid
- amountLitres

Capacity and allowed-liquid rules remain derived from item definitions.

Add round-trip validation for empty, partial, full, water, milk, invalid liquid and amount outside the allowed range.

## 15. UI scope

Do not implement a new interaction/UI system.

Extend the existing inventory view model only if needed to display current liquid/amount. Gameplay/domain code owns mutations; Vue must not own litres or fill/drink rules.

## 16. Testing focus

High-value tests:

1. each container kind has the correct derived capacity;
2. empty waterskin can be filled;
3. partial waterskin can be topped up;
4. fill cannot exceed capacity;
5. milk is rejected by waterskins;
6. buckets accept water and milk;
7. drinking consumes exactly 1 l;
8. empty container remains in inventory;
9. save/load preserves amount and identity;
10. inventory weight/capacity is correct;
11. copper ore is produced through the existing mining path;
12. copper_cup does not exist.

## 17. Main architectural pitfall

The dangerous implementation is to keep waterskin_empty ↔ waterskin_full and add a numeric amount somewhere beside it. That creates two sources of truth.

Target invariant:

one physical liquid container → one ItemInstance → kind + derived capacity + liquid + amount → fill/drink mutates that same instance → save/load preserves the same instance

Likewise, do not confuse the physical storage chest from plan 164 with the portable liquid-container model from this plan.

## 18. Scope recommendation

Before coding, the implementation agent should treat this review as a correction to the plan's stale assumptions.

Specifically:

- backpack is already implemented;
- generic physical containers already exist;
- item instances already exist;
- SaveData v18 migration is incorrect for current SaveData v1;
- waterskin fill/drink already exists but must be replaced by partial-state semantics;
- copper ore is the only genuinely new mineral pipeline integration.

Keep the implementation focused on the missing liquid-container state and copper integration. Do not refactor unrelated inventory/container code.

---

## 19. What was actually implemented

Written 2026-08-27, after implementation, against §1-18 above.

### Liquid containers — `LiquidContainerItemInstance`, exactly as §2/§3/§17 specify

`items/itemInstances.ts` gained `LiquidContainerKind` (`waterskin_small`/`medium`/`large`, `wooden_bucket`, `copper_bucket`), `LiquidContent` (`'water' | 'milk'`) and `LiquidContainerItemInstance = ItemInstance & { kind, liquid: LiquidContent | null, amountLitres: number }`, added to `INSTANCE_BACKED_KINDS` and `cloneItemInstance()`. `items/liquidContainer.ts` holds the pure domain operations — `createLiquidContainerInstance`, `canFillLiquidContainer`/`fillLiquidContainer`, `canDrinkFromLiquidContainer`/`drinkFromLiquidContainer`, `emptyLiquidContainer`, `liquidContainerCapacity` (reads `ITEM_CATALOG[kind].container.capacityLiters`) — mirroring `weaponMaintenance.ts`'s shape exactly: pure functions over a cloned instance, applied by the caller via `Inventory.updateInstance()`, no new mutation surface on `Inventory` itself. One physical container really is one instance; two carried waterskins of the same size can hold different amounts.

### Acquisition boundary (§13)

`items/trade.ts`'s `createAcquiredInstance()` gained a branch: `isLiquidContainerKind(kind) → createLiquidContainerInstance(kind)`. Because `addPurchased`/`offerHasEnough`/`removeOffer` already dispatch generically on `isInstanceBackedKind()`, a merchant purchase (and quest reward / world pickup, which share the same function) needed zero merchant-UI special-casing — a bought waterskin is a fresh empty instance for free.

### Persistence (§14)

No second save field. `SaveItemInstance` (`items/Inventory.ts`) gained optional `liquid`/`amountLitres`, `toSaveItemInstance()`/`Inventory.instancesFromJSON()` handle the new branch (capacity-clamped against `ITEM_CATALOG[kind].container` on restore, corrupt data included), and `persistence/saveData.ts`'s `isSaveItemInstancesField` validates them (`liquid` must be `'water'|'milk'` when present, `amountLitres` a finite non-negative number). An empty container omits both fields rather than persisting `liquid: null`.

### Legacy waterskin_empty/waterskin_full (§4)

Kept as real `ItemKind`s (with minimal `ITEM_DEFS`/`ITEM_CATALOG` entries, no `consumable`, not Kupiec stock) purely so an old save's counts still parse. `items/liquidContainer.ts`'s `migrateLegacyWaterskinsToInstances(inventory)` — called unconditionally at load in `createApp.ts` right next to plan 161's `migrateWeaponCountsToInstances`, same idempotent "no legacy count → no-op" shape — converts every legacy count into a `waterskin_medium` instance (empty for `waterskin_empty`, full-of-water for `waterskin_full`; medium was picked as the closest "generic" stand-in since plan-106 waterskins had no size concept). No second live liquid implementation exists after this boundary.

### Fill/drink wiring (§5)

`app/actions/survivalActions.ts`'s `fillWaterskin()` (well/lake `[R]`) now finds the smallest-capacity carried waterskin *instance* that `canFillLiquidContainer(..., 'water')` and fills it via `updateInstance`. `consumeItem()` (inventory "Wypij") special-cases `isLiquidContainerKind(kind)`: finds any instance with `canDrinkFromLiquidContainer`, drinks one `LIQUID_DRINK_PORTION_LITRES` via `drinkFromLiquidContainer`, restores the unchanged `DRINK_THIRST_RELIEF` per portion. Buckets get the same domain functions but no call site — no gameplay path can fill/drink one yet (matches §5's "only water/WaterSource for now" and the plan's own §9 UI deferral).

### Weight (§9) — resolved, not deferred

Since liquid state is now real per-instance data, `Inventory.totalWeight()` adds `instance.amountLitres * LIQUID_DENSITY_KG_PER_LITRE` (flat 1 kg/l for both water and milk) for `LiquidContainerItemInstance`s, on top of the container's own static `ITEM_DEFS.weight`. A full 10 l bucket is now genuinely ~10 kg heavier than empty.

### Inventory UI (§15) — one addition, not a new system

`items/inventoryView.ts`'s `buildInventoryGroups()` dispatched `buildTrapGroup ?? buildWeaponGroup` per instance-backed kind; without a third branch, liquid-container instances would have silently never appeared in the inventory screen at all (both existing builders filter to their own instance type and return null otherwise). Added `buildLiquidContainerGroup()`, same shape as the other two, reporting fill percentage as `conditionPercent` (`sharpnessPercent: null`) — the existing per-instance grouping UI (`InventoryScreenItemDetails.vue`) then shows distinct rows for containers at different fill levels for free, no Vue changes needed.

### Copper (§10/§11)

`terrain/naturalResources.ts` (`ResourceType`, weighting function), `terrain/depositMining.ts` (`MineableOre`), `terrain/resourceDeposits.ts` (`VisibleOreType`, tint color, reuses the existing rock-cluster pile template), `economy/kinds.ts` (`EconomicKind`), `interaction/Interactable.ts` (`oreType` union) all gained `copper_ore` — the exact `NaturalResource → visible ore deposit → ResourceDeposits.mine() → depositMining yield → copper_ore ItemKind` chain §10 describes, deterministic generation/depletion/NPC-mining hooks shared with iron/coal/gold via the same generic code paths (no copper-specific branch needed in `NpcAgent.ts` or `interactables.ts`'s deposit prompt/mine handler). `interaction/resolveInteraction.ts`'s settlement-storage display and `ai/dialogueTemplates.ts`'s `RESOURCE_LABEL` also got a `copper_ore` line/entry for consistency with iron/coal/gold.

Per §11, neither `copper` nor `copper_bucket` were added to `tradeCatalog.ts` — both are defined but currently unobtainable (no Kupiec stock, no smelting/smithing). `waterskin_small/medium/large`, `wooden_bucket` and `saddlebags` *were* added to Kupiec stock — §11's restriction is scoped to "copper trade/source rules" specifically, not every new item, and every other "no recipe yet" item in this catalog is already Kupiec-sourced by convention (`iron_rod`, `whetstone`, `backpack`).

### New ItemKinds / no copper_cup (§7)

All 8 new kinds (`waterskin_small/medium/large`, `wooden_bucket`, `copper_bucket`, `copper_ore`, `copper`, `saddlebags`) exist in both `items/items.ts`'s `ITEM_DEFS` and `items/itemCatalog.ts`'s `ITEM_CATALOG` — no third registry. `backpack` untouched (§8). No `copper_cup` anywhere.

### Testing (§16)

`items/liquidContainer.test.ts` covers capacity-per-kind, fill/top-up/already-full/wrong-content/mixed-content, drink-portion/empty-rejection/stays-present-at-zero, `Inventory` instance round-trip through `instancesToJSON`/`instancesFromJSON` (including capacity-clamping corrupted data) and the weight addition, plus the legacy migration function. `terrain/depositMining.test.ts` gained a `copper_ore` case mirroring the existing iron/coal/gold assertions. `persistence/saveData.test.ts` gained accept/reject cases for liquid-container instance rows (empty/partial/full, water/milk, invalid content, negative amount). `copper_cup`'s non-existence is compile-time (not in `ItemKind`), not a runtime test.

### Models (§12)

No existing GLB fit any of the new items (checked `items/itemModels.ts`, `public/models/`, `docs/assets/MODELS.md`); all use procedural fallbacks (`docs/assets/MODELS.md` M68-M71). `_temp/Models/packs/fantasy-props-megakit/glTF/` has plausible unconverted sources for buckets (`Bucket_Wooden_1.gltf`, `Bucket_Metal.gltf`) and saddlebags (`Pouch_Large.gltf`) — not converted/wired in this pass.
