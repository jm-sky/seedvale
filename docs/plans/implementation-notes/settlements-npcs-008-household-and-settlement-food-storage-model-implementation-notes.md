# Implementation Notes: Household & Settlement Food Storage Model

**Reviewed:** 2026-08-30  
**Plan:** `settlements-npcs-008-household-and-settlement-food-storage-model.md`  
**Review status:** requires clarification before implementation

## 1. Critical finding: current model differs from the plan

The plan's target is feasible for **Household**, but not currently for **Settlement** without introducing an explicit concrete-item owner at settlement level.

Current `Household` has both:

- `stock: EconomicStock` containing scalar `food`/ `wood`;
- `items: Inventory` for concrete `ItemKind` values.

The concrete-item inventory is already the correct reusable mechanism, but food still lives in `stock.food`.

Current `SettlementEconomy` contains only `EconomicStock`-style bulk quantities (`food`, `wood`, ore, etc.). It has **no `Inventory`**. Do not pretend that settlement concrete food already exists.

**Implementation implication:** the plan needs a small settlement-owned concrete-item inventory (or an equivalent existing owner abstraction if recon finds one). It must be authoritative for concrete food. Do not create a parallel `FoodStock`.

## 2. Reuse the existing item classification

`src/items/items.ts` already defines `ItemCategory = 'food'` and `hasItemKindCategory()`; `ITEM_DEFS` marks concrete food kinds including:

- `tomato`, `carrot`, `potato`, `cabbage`;
- `fish`, `dried_fish`;
- `egg`;
- meat variants;
- `bread`, `berries`, `apple`, `nuts`, `honey`, `cheese`, `dried_meat`;
- `herb`.

Do **not** create a second food-kind list.

Important: `raw_meat` and `herb` are currently catalogued as `food`, so the migration should follow the catalog unless there is an explicit gameplay reason to change their classification. Do not silently redefine the catalog as part of this plan.

## 3. Do not reuse player-only freshness state blindly

`Inventory` is shared by player/NPC/household, but `foodBatches`/save freshness handling is currently part of the player save pipeline.

Before adding household freshness, verify the actual `Inventory` API and whether its food-batch bookkeeping is intrinsically tied to the inventory instance. The plan does **not** require implementing household spoilage.

For this plan, concrete food quantity/ownership is the concern. Do not expand the scope into a second household food-freshness system.

## 4. Household migration

Current authoritative household food is:

```text
Household.stock.query('food')
```

while concrete items are already:

```text
Household.items
```

Migrate food production/consumption to `Household.items`, but preserve `Household.stock` for `wood` and its existing resource semantics.

The existing `Household.items` is deliberately unbounded and already used for hunted meat, arrows and bandages. Reuse it; do not add another inventory field.

The existing household policy (`minimum`, `target`, `capacity`) currently operates on scalar stock. These thresholds need a clear concrete-food interpretation after migration. Prefer a small domain helper that derives a **food unit count from `items`** rather than keeping a second scalar cache.

## 5. Consumption path is a major migration seam

`NpcAgent` currently uses household scalar food for the household pantry path. This is one of the highest-risk changes because it affects need scoring, eating and fallback behaviour.

Do not change the abstract need:

```text
NeedId = food
```

Only change the source of availability/consumption from scalar household food to concrete food items.

The helper should atomically select/remove one valid food item according to an explicit deterministic policy. Avoid `Object.keys()` ordering as an implicit gameplay rule if a stable selection order matters.

Preserve the current one-item/one-food-unit semantics unless code inspection proves otherwise.

## 6. Production paths must keep concrete items

Existing systems already produce concrete `ItemKind` values:

- crops produce `carrot`/`potato`/`cabbage`/`tomato`;
- fishing produces `fish`;
- livestock production produces `egg` (and milk uses liquid containers, not food stock);
- hunting produces concrete meat items into household `Inventory`;
- cooking produces concrete food items such as `roasted_meat`;
- helper/trader paths may currently use scalar `food`.

Do not convert these to an abstract `food` counter.

Where an existing path currently deposits scalar `food`, change the destination to the appropriate concrete `ItemKind` if the producer already knows it. If it does not, inspect the producer before inventing a mapping.

## 7. Local exchange is currently scalar

Plan 005's current implementation deliberately exchanges `HouseholdResourceKind = 'food' | 'wood'` through:

- `src/economy/localExchange.ts`;
- `src/settlement/householdExchange.ts`;
- `Household.surplus()/shortage()`;
- `SettlementEconomy` scalar `food`.

After Plan 008, the food side cannot continue using scalar `food` as an authoritative balance.

Do not rewrite Plan 005 wholesale. The smallest correct direction is to preserve its existing action/claim architecture while changing the food transfer operation to concrete item quantities/kinds.

This is also why Plan 009 must depend on the completed Plan 008 rather than assuming scalar food remains available.

## 8. Settlement economy needs an explicit migration decision

Current `SettlementEconomy` is intentionally a bulk economic model and is used by development/resource systems. It is **not** the same thing as player/NPC `Inventory`.

Do not convert all `EconomicKind` values to `ItemKind`. In particular, keep ore/wood/water and settlement development stock semantics unchanged.

Only food needs a concrete-item ownership path for this plan.

A good minimal shape is an `Inventory` owned by the settlement economy/settlement resource owner, while keeping `EconomicStock` for non-food bulk resources. The exact ownership should follow the current architecture after checking `SettlementEconomy` construction/registry and persistence.

## 9. Persistence is currently settlement-only for economy

`SaveData` already persists:

```text
settlementEconomies: Record<string, Partial<Record<EconomicKind, number>>>
```

There is no household inventory persistence in `SaveData`; household state only survives the existing in-session `HouseholdRegistry`/WorldBundle carry mechanism.

If settlement concrete food becomes authoritative, its save/load path must be added to the existing settlement persistence contract. Do not silently leave concrete settlement food outside SaveData while scalar food is removed.

Household persistence should **not** be expanded to full SaveData in this plan unless required by the concrete-food migration. The existing architecture deliberately keeps household runtime state out of the save schema.

## 10. WorldBundle rebuild

`HouseholdSnapshot.items` already carries household concrete items through an in-session `WorldBundle` rebuild.

If settlement concrete food is added, provide the equivalent minimal in-session carry mechanism where the current settlement economy is reconstructed. Follow the existing `carriedEconomies`/snapshot pattern instead of introducing a new persistence mechanism.

## 11. Tests that matter most

Existing `src/settlement/household.test.ts` still asserts scalar `stock.food`. Those tests must be deliberately rewritten, not merely adapted mechanically.

Prioritize:

- concrete food count from household `Inventory`;
- mixed food kinds;
- consumption removes the actual `ItemKind`;
- food shortage/target uses concrete inventory;
- crop/fishing/livestock/hunting production lands in concrete inventory;
- household exchange transfers concrete food without minting/deleting items;
- settlement food ownership and exchange;
- WorldBundle rebuild preserves concrete settlement food;
- save/load preserves settlement concrete food;
- no authoritative household/settlement `stock.food` remains.

Keep wood tests unchanged unless a food migration touches shared APIs.

## 12. Likely pitfalls

- **Do not** replace `food` everywhere with the word `items`; many occurrences refer to NPC needs, food sources or player mechanics.
- **Do not** keep `stock.food` as a cache. That would recreate the exact dual-authority problem this plan is meant to remove.
- **Do not** convert `EconomicKind` wholesale into `ItemKind`.
- **Do not** create `FoodInventory` or a food-specific enum.
- **Do not** make household food capacity depend on inventory weight/size: household `Inventory` is intentionally unbounded. Preserve the household's conceptual food reserve limits through domain helpers if still needed.
- **Do not** use player `foodBatches` persistence as a reason to add household spoilage.
- **Do not** make visual/storage changes here.
- **Do not** assume Plan 005 can keep transferring scalar `food` after the migration.

## 13. Recommended implementation order

```text
1. Add/confirm settlement-owned concrete food Inventory seam
2. Add shared food-domain helpers based on ItemKind category
3. Migrate Household stock.food → Household.items
4. Migrate NPC food availability/consumption
5. Migrate existing food production deposits
6. Migrate local exchange food transfers
7. Migrate settlement food owner + persistence/rebuild
8. Remove scalar food from Household/Settlement authoritative state
9. Update state documentation
10. Focused tests → full tests/typecheck/lint/build
```

This order keeps the domain helper and ownership decision in context while avoiding a large simultaneous rewrite of NPC, economy and persistence code.

## Review conclusion

**Plan 008 should be implemented, but its current wording needs one important architectural clarification:** settlement concrete food has no existing authoritative `Inventory` today. The agent must explicitly establish the smallest settlement-owned concrete-item storage seam before removing scalar settlement food.

The existing `Household.items` is already the correct seam for household food. The existing `ItemKind` + `ItemCategory = 'food'` is the correct classification source.

Plan 009 should remain blocked on this migration; otherwise its Food Storage destination would have nothing concrete and authoritative to store.
