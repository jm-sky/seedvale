# Implementation Notes: Physical Storage Destinations & Resource Delivery

**Reviewed:** 2026-08-30  
**Plan:** `settlements-npcs-009-physical-storage-destinations-and-resource-delivery.md`  
**Review status:** plan is partially obsolete; implementation should be a focused migration/extension, not a new logistics system

## 1. Critical finding: most of the planned logistics/storage foundation already exists

The archived plan `docs/plans/archive/2026-08-18--156--npc-household-and-settlement-storage-logistics.md` is marked **done** and explicitly records that the generic transport contract was already implemented.

Current code confirms this:

- `NpcAgent` already uses the shared `goTo → execute/onComplete → next deposit` action chain;
- NPC carrying uses the existing `Inventory`;
- `localExchange.ts` already provides owner-agnostic atomic surplus claims;
- `householdExchange.ts` already provides bounded, same-settlement household source lookup;
- `createSettlement.ts` already materializes `householdStorages`;
- `settlementStorage` / `householdStorage` are already represented by existing interactable/prop infrastructure;
- `resolveInteraction.ts` already exposes live household/settlement stock.

**Do not reimplement any of these systems.** Plan 009 should extend the existing mechanisms only where the 008 food migration requires it.

## 2. Plan 008 is the real prerequisite

Current `Household` still has:

```text
stock: EconomicStock
  food: number
  wood: number

items: Inventory
  concrete ItemKind
```

Plan 008/its implementation notes identify the required migration of authoritative food from scalar `stock.food` to concrete `ItemKind` inventory.

Therefore Plan 009 must not be implemented against the current scalar-food API as its final architecture.

Expected dependency:

```text
008
concrete food ownership
      ↓
009
typed storage destination
      ↓
010
visual representation
```

## 3. Existing physical storage is currently generic

The existing household storage container is a presentation/interactable object associated with a household; it is not a second inventory.

Current `createSettlement.ts` builds `householdStorages` by matching the already-created household list to home/storage positions. Preserve this ownership/indexing scheme.

The same applies to settlement storage.

Do not introduce:

- a new `StorageManager`;
- `WoodStorageSystem`;
- `FoodStorageSystem`;
- storage-local quantities;
- another settlement/household registry.

For the new typed destinations, prefer extending the existing storage metadata/landmark/interactable contract.

## 4. Storage destination should be a classification, not another inventory

The required distinction is:

```text
physical destination
  = where an NPC delivers

Inventory/resource state
  = authoritative amount/items
```

For this plan, a destination needs enough metadata to answer:

```text
Can this destination accept this resource/item?
```

Minimum logical categories are:

```text
wood
food
```

Food must resolve from the existing `ItemKind`/item-category mechanism after Plan 008.

Do not add a logistics-side hard-coded list such as:

```ts
const FOOD = ['carrot', 'potato', ...]
```

## 5. Important distinction: bulk wood vs concrete food

The current architecture deliberately keeps `Household.stock` for scalar economic resources such as wood, while concrete food belongs in `Household.items` after Plan 008.

Therefore the delivery implementation must support both:

```text
wood
→ existing scalar household/settlement stock

food ItemKind
→ concrete household/settlement Inventory
```

Do not force wood into `ItemKind` merely to make the storage resolver uniform.

The shared abstraction should be the **delivery/destination flow**, not identical ownership representation for every resource.

## 6. Existing exchange must be adapted, not duplicated

`src/economy/localExchange.ts` currently claims scalar surplus using:

```text
claimHouseholdSurplus()
claimEconomySurplus()
```

These functions currently call `Household.surplus()` / `SettlementEconomy.surplus()` and remove scalar stock.

After Plan 008, food cannot continue through these scalar methods as authoritative food.

Do not delete/rewrite the generic exchange architecture. Add the smallest concrete-food claim/transfer seam needed by 008/009, preserving:

- live revalidation;
- atomic source claim;
- bounded local source selection;
- existing `HouseholdExchangeHooks`.

Wood should continue using the current scalar claim path.

## 7. Existing NPC strategies are already integrated

Current `npcStrategies.ts` / `NpcAgent.ts` already contain:

- `economyWithdraw`;
- `householdExchange`;
- existing resource work/delivery;
- the shared action lifecycle.

Do not add another candidate generator for storage.

The storage destination should be resolved by the existing action/transport path after a source is selected.

The decision layer should continue to answer **why/what**, while destination resolution answers **where**.

## 8. Do not reimplement water/ore transport

The archived 156 implementation notes and current state describe existing generic transport for:

- wood;
- water;
- ore.

Water also has its separate authoritative household `water` reserve, deliberately outside `EconomicKind`.

Ore remains settlement/economic stock.

Plan 009 should only touch these flows if the new destination abstraction actually requires a compatibility fix. Do not rewrite working water/ore lifecycles.

## 9. Physical storage is not yet the final visual design

Current storage props are generic containers. That is sufficient for this plan.

Do not implement:

- quantity-based log piles;
- separate fish/vegetable crates;
- visible carrots/potatoes/cabbage/tomatoes;
- storage visual state.

Those belong to Plan 010.

Plan 009 should establish/consume the physical destination identity that Plan 010 can later render.

## 10. Missing-destination handling

The current `NpcAgent` already has substantial action failure/recovery machinery, including movement watchdog/repath/abandon behaviour.

Do not create another retry system.

A failed destination lookup should fail/skip the delivery action through the existing action lifecycle and return the NPC to the normal decision point.

Be particularly careful not to:

- leave an item permanently in NPC carrying;
- remove source stock before a destination is guaranteed;
- duplicate the item on retry;
- repeatedly select an unavailable destination.

The transfer boundary must remain conservation-safe.

## 11. Streaming considerations

`HouseholdRegistry` keeps household objects stable across settlement stream-out/in, and `createSettlement.ts` reconstructs physical props from the simulation-owned state.

Storage objects must remain disposable/recreatable presentation objects.

Do not put authoritative quantities into the storage `Object3D`.

If a delivery is interrupted by settlement streaming, preserve the existing action/carry lifecycle rather than inventing persistence for the physical container.

## 12. Recommended implementation scope

The current plan should effectively become:

```text
1. Verify 008's concrete-food API
2. Extend existing storage destination metadata
3. Add shared ItemKind/category → compatible destination resolution
4. Adapt existing food delivery to concrete Inventory
5. Adapt concrete-food exchange claims/transfers
6. Keep wood/water/ore on existing ownership paths
7. Handle unavailable destination through existing action failure
8. Update focused tests
9. Browser verification
```

The agent should first inspect the exact post-008 code before changing anything. If 008 has not been implemented yet, stop rather than implementing a parallel scalar-food solution.

## 13. Files to inspect first

Focused starting set:

- `src/settlement/household.ts`
- `src/items/Inventory.ts`
- `src/items/items.ts`
- `src/items/itemCatalog.ts`
- `src/economy/settlementEconomy.ts`
- `src/economy/localExchange.ts`
- `src/settlement/householdExchange.ts`
- `src/ai/npcStrategies.ts`
- `src/ai/NpcAgent.ts`
- `src/settlement/createSettlement.ts`
- `src/settlement/props.ts`
- `src/interaction/Interactable.ts`
- `src/interaction/resolveInteraction.ts`

Use the archived 156 implementation notes as historical context, but verify every detail against current code.

## 14. Key pitfalls

- The archived 156 plan is **done**; do not repeat its generic logistics implementation.
- Current physical storage props already exist; do not create replacement containers.
- Current food is still scalar in `Household.stock`; this is precisely what Plan 008 must change.
- Do not retain scalar `food` as a second authoritative cache after 008.
- Do not convert `EconomicKind` wholesale to `ItemKind`.
- Do not create a second food list in logistics.
- Do not make storage `Object3D` authoritative.
- Do not rewrite water/ore/wood transport merely to make the code look uniform.
- Do not modify Plan 010's visual concerns here.

## Review conclusion

**Plan 009 remains useful, but its original implementation scope is too large for the current codebase.** The generic transport and physical storage foundation already exists from completed work. The meaningful remaining work is the **typed-food integration created by Plan 008** plus a clean compatibility/destination layer that can distinguish wood from concrete food without duplicating inventory or logistics.

For Claude Code cost efficiency, this should be treated as a focused extension of the existing 005/156 mechanisms, not as a fresh storage-logistics implementation.