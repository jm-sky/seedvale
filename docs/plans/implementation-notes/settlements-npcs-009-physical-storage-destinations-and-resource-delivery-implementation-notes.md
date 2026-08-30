# Implementation Notes: Physical Storage Destinations & Resource Delivery

**Reviewed:** 2026-08-30  
**Plan:** `settlements-npcs-009-physical-storage-destinations-and-resource-delivery.md`

## Review conclusion

Plan 009 is still valid, but the current codebase already contains much of the physical-storage and generic transport foundation. Treat this as a **typed destination + food-delivery integration**, not as a new logistics system.

Plan 008 is a hard prerequisite for the food path. Its implementation notes identify the required migration from scalar `food` to concrete `ItemKind` inventory.

## Existing systems to reuse

The current code already has:

- generic NPC `goTo → execute/onComplete → next` action flow in `src/ai/NpcAgent.ts`;
- NPC/household `Inventory`;
- local exchange claim seams in `src/economy/localExchange.ts`;
- bounded same-settlement household source lookup in `src/settlement/householdExchange.ts`;
- physical household storage instances created by `src/settlement/createSettlement.ts`;
- existing storage/interactable infrastructure in `src/settlement/props.ts`, `src/interaction/Interactable.ts` and `src/interaction/resolveInteraction.ts`.

The archived Plan 156 implementation is historical evidence that generic household/settlement transport was already introduced. Do not duplicate it.

## 1. Destination model

A storage destination should answer only:

```text
Can this physical destination accept this resource/item?
```

Keep the concepts separate:

```text
destination = WHERE
inventory/economic state = WHAT + HOW MUCH
```

Do not store quantities on the Three.js/interactable storage object.

Extend the existing storage metadata/landmark/interactable mechanism instead of adding `StorageManager`, separate `WoodStorageSystem`/`FoodStorageSystem`, or another registry.

Minimum destination categories:

- `wood`;
- `food`.

## 2. Food classification

Food must use the existing `ItemKind` and item metadata/category from `src/items/items.ts`.

Do not create a logistics-side list of carrots, potatoes, cabbage, tomatoes, etc.

After Plan 008:

```text
ItemKind → existing food category → Food Storage
```

This also means newly classified food items should work without changing the logistics resolver.

## 3. Wood and food have different authoritative owners

Do not force all resources into the same inventory model.

Current architecture distinguishes:

```text
wood
→ scalar economic stock

food
→ concrete ItemKind Inventory after Plan 008
```

The shared abstraction should be the delivery/destination flow, not identical storage representation.

Water and ore have their own existing semantics. Avoid touching them unless required by the destination abstraction.

## 4. Household storage already exists

`createSettlement.ts` already builds `householdStorages` using the settlement's existing households and storage/home positions.

Preserve this indexing and ownership relationship.

Do not create a replacement physical storage object.

Plan 009 should add type/compatibility information to the existing destination, which Plan 010 can later use for visualization.

## 5. Settlement concrete food is the important architectural seam

Current `SettlementEconomy` still uses scalar `EconomicStock`; it does not currently have the same concrete `Inventory` seam as `Household.items`.

Plan 008 implementation notes already flag this as necessary.

Therefore:

- do not implement Plan 009's food delivery against scalar `SettlementEconomy.food` as the final model;
- consume the concrete settlement-food API established by Plan 008;
- keep non-food settlement economic stock unchanged.

If Plan 008 is not implemented yet, stop rather than creating a temporary scalar-food destination path.

## 6. Exchange integration

`src/economy/localExchange.ts` currently uses atomic/live surplus claims, while `src/settlement/householdExchange.ts` provides bounded source selection.

Preserve:

- live revalidation at claim time;
- atomic source claim;
- same-settlement restriction;
- deterministic nearest-first ordering/tie-break;
- existing exchange action lifecycle.

The food side needs a concrete-item transfer seam after Plan 008. Do not rewrite the whole exchange system.

Wood can continue using the existing scalar claim path.

## 7. NPC decision vs destination

Do not add a new NPC candidate generator for storage.

Existing strategy code already handles `economyWithdraw`, `householdExchange` and resource work/delivery.

Keep the separation:

```text
decision layer → WHAT / WHY
destination resolver → WHERE
existing action chain → HOW
```

## 8. Conservation and failure handling

The current `NpcAgent` already has action failure/repath/watchdog recovery. Reuse it.

Important transfer ordering:

```text
resolve valid destination
→ perform movement/action
→ transfer ownership exactly once
```

Never:

- remove source stock before the transfer can complete;
- duplicate an item on retry;
- leave a carried item permanently after failed delivery;
- repeatedly retry an impossible destination forever.

A missing destination should return through the existing action failure/decision flow.

## 9. Streaming

Storage props are presentation objects rebuilt with settlement creation. They must not become authoritative state.

If a settlement streams out/in:

- authoritative resource/inventory state survives through existing simulation state;
- physical storage objects are recreated;
- NPC action/carry state must use the existing lifecycle.

Do not introduce storage-specific persistence.

## 10. Tests to prioritize

Focus on the changed seams:

1. wood resolves to Wood Storage;
2. every existing food-category `ItemKind` resolves to Food Storage;
3. household and settlement destinations resolve correctly;
4. food transfer moves concrete item ownership exactly once;
5. wood remains on its existing scalar path;
6. exchange remains atomic/live;
7. incompatible destination is rejected;
8. missing destination does not strand the carrier or create an infinite retry;
9. destination resolution is deterministic.

Update existing tests instead of adding infrastructure.

## 11. Focused files

Start with:

- `src/settlement/household.ts`
- `src/items/Inventory.ts`
- `src/items/items.ts`
- `src/economy/settlementEconomy.ts`
- `src/economy/localExchange.ts`
- `src/settlement/householdExchange.ts`
- `src/ai/npcStrategies.ts`
- `src/ai/NpcAgent.ts`
- `src/settlement/createSettlement.ts`
- `src/settlement/props.ts`
- `src/interaction/Interactable.ts`
- `src/interaction/resolveInteraction.ts`

Also read the archived Plan 156 implementation notes for context, but verify everything against current code.

## Main pitfalls

- Plan 156 is already implemented; do not rebuild generic logistics.
- Physical household storage already exists; extend it.
- Do not retain scalar `food` as a second authoritative cache after Plan 008.
- Do not convert all `EconomicKind` values into `ItemKind`.
- Do not create a second food-kind list.
- Do not put quantities into storage `Object3D`/interactable state.
- Do not implement Plan 010's visual storage system here.
- Do not rewrite working water/ore/wood transport just for symmetry.

## Recommended implementation order

```text
1. Verify the concrete-food API delivered by Plan 008.
2. Extend the existing storage destination metadata.
3. Add one shared ItemKind/category → destination compatibility resolver.
4. Adapt existing food delivery to concrete Inventory.
5. Adapt concrete-food exchange claims/transfers.
6. Keep wood/water/ore on their existing ownership paths.
7. Reuse existing action failure/recovery for unavailable destinations.
8. Update focused tests.
9. Run typecheck/lint/build and browser verification.
```

The key objective is a small extension of existing storage/logistics, with **no parallel inventory or logistics architecture**.
