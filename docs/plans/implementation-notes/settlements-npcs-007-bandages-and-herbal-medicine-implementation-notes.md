# Implementation Notes: settlements-npcs-007 — Bandages and herbal medicine

**Plan:** `docs/plans/settlements-npcs-007-bandages-and-herbal-medicine.md`  
**Reviewed:** 2026-09-02  
**Status:** `planned` 📋  
**Source of truth:** current `main` code + docs; plan is intent, not current implementation.

## Review result

Plan is directionally compatible, but it is not ready to implement directly after 006. The production foundation used by 006 is still incomplete. Current `ProductionDef` exists, but execution is split between `SettlementEconomy.produce()` and Hunter's direct `Inventory.applyRecipe()` path.

Practical dependency chain:

```text
014 → 015 → 006 → 007
```

Plan 015 is the shared production-execution foundation. Do not bypass it with a bandage-specific executor. 006's existing implementation notes already identify this dependency gap.

## 1. Existing items — reuse, do not duplicate

Current `src/items/items.ts` already contains `herb` and `bandage`.

Current `src/items/itemCatalog.ts` already defines:
- `herb` as a `world_chunk` collectible, labeled zioło lecznicze, with `consumable.need === 'health'` and relief 8;
- `bandage` as a normal non-spawn item, with `consumable.need === 'health'` and relief 35.

Therefore do not create a parallel `medicinal_herbs` item merely to satisfy the wording of the plan. The safest current interpretation is:

```text
herb + linen_material → bandage
bandage + herb → dressing
```

Likewise, do not recreate `bandage`; preserve its existing catalog/healing semantics.

Verify what 006 has actually added before introducing `flax` or `linen_material`. New item kinds should be limited to genuinely missing concepts, notably poisonous herbs and dressing.

## 2. Herb gathering is not yet a generic NPC pipeline

`src/terrain/chunkItems.ts` already generates `herb` as deterministic world-chunk flora. However, the current NPC food-source/gathering hooks are not a generic 'gather any chunk item' API; `herb` is classified as a health consumable, not food.

Do not assume Herbalist can gather herbs just because the world can spawn them. Reuse/extend the smallest existing natural-item gathering seam. Do not create `HerbalismSystem`, a global flora registry, or a second flora scanner.

Keep ownership explicit:

```text
world herb → existing gathering seam → Household.items
```

## 3. Production must use plan 015

`src/economy/production.ts` already provides `ProductionDef` and item inputs/outputs. `src/economy/npcWork.ts` currently adapts work to production, while Hunter still uses `produceFirstAvailableItemRecipe()` directly against `Household.items`.

007 should consume the shared executor delivered by 015 once it exists. For:

```text
linen_material → bandage
bandage + herb → dressing
```

the natural owner is the household's concrete `Household.items` inventory. Do not put these items into `SettlementEconomy` bulk stock and do not create medical storage.

The executor must prevalidate all inputs and output capacity and commit atomically. Never remove linen/bandage/herb before the production action reaches its authoritative completion point.

## 4. Herbalist role

Current `Role` has no `herbalist`. Adding it is an exhaustive-role change.

At minimum inspect/update:
- `src/ai/characters.ts`;
- `src/ai/schedule.ts`;
- role dispatch in `src/ai/NpcAgent.ts`;
- role → loadout mappings and any exhaustive role maps/switches.

Do not only add `herbalist` to `RANDOM_ROLES`.

Keep one broad Herbalist role covering gathering and herbal processing. Do not create gatherer/apothecary/specialist roles.

Role assignment should use the existing deterministic family/role generation seams. Avoid generating Herbalists that have no usable work while introducing a new assignment system.

## 5. Textile Worker / 006

007 extends Textile Worker with `flax → linen_material`, but Textile Worker is not present in the current `Role` model. This belongs to 006.

After 006 is actually implemented, reuse its role, schedule, work dispatch, tool/workplace semantics and production path. Do not add a second linen-production path inside 007.

## 6. Dressing and future NPC healing

007 must not implement NPC healing. The downstream `npc-002-npc-healing` plan already expects health consumables to be discoverable through the existing catalog contract.

Keep:

```text
ITEM_CATALOG[kind].consumable.need === 'health'
```

Do not hard-code bandage/dressing into future healing logic and do not change the existing `herb`/`bandage` relief values just because this plan introduces new production.

`dressing` should become an ordinary item. Whether it is a stronger health consumable belongs to the healing design; 007 should not silently invent new healing behaviour.

## 7. Poisonous herbs

There is currently no poisonous-herb item in the relevant item model.

Add it as a normal concrete resource:
- `ItemKind` + `ITEM_DEFS` entry;
- catalog entry;
- ordinary `Inventory` storage;
- no poisoning/alchemy effect.

Use the same Herbalist gathering mechanism as medicinal `herb` where practical. Do not add a poison system.

## 8. Storage and ownership

Current ownership is:

```text
Household.items       = concrete household items
SettlementEconomy     = settlement bulk stock + settlement food
NpcAgent.carried      = temporary NPC carrying inventory
```

Medical/textile products should remain concrete items. Production should normally be:

```text
Household.items → ProductionDef → Household.items
```

unless 015 establishes an explicit destination contract that changes this. Never introduce `medicalStock`, `herbalStock`, `medicalInventory` or equivalent duplicate state.

## 9. Gathering vs production

Keep the boundary explicit:

```text
world resource → gathering → Household.items
Household.items → ProductionDef → Household.items
```

Production must never search the world for missing herbs/flax. Missing production inputs are a blocked recipe; obtaining them belongs to gathering/logistics.

## 10. Off-screen/time-skip risk

The plan requires production to work off-screen. Production itself should follow the existing NPC work/time-skip path and must not depend on render frames or visible Three.js objects.

The potentially missing piece is off-screen Herbalist gathering. If the only available herb source is instantiated chunk-item pickup, do not silently invent a global herb registry just for 007. Reuse an existing deterministic natural-resource abstraction if one is suitable; otherwise keep the gathering extension minimal and explicit.

## 11. Exhaustive item/catalog changes

When adding new kinds, update all relevant exhaustive structures together:
- `src/items/items.ts` (`ItemKind`, `ITEM_DEFS`);
- `src/items/itemCatalog.ts` (`ITEM_CATALOG`);
- any item model/fallback switch if required;
- trade data only when the item is intentionally tradeable.

Do not add a second list of medical items. Existing `herb` and `bandage` are already the concrete concepts to reuse.

## 12. High-value tests

Prioritize:
- existing `herb` remains a health consumable;
- existing `bandage` remains a health consumable;
- no duplicate medicinal-herb item is introduced;
- linen → bandage consumes exact inputs;
- missing linen leaves state unchanged;
- bandage + herb → dressing consumes both atomically;
- missing either input leaves state unchanged;
- output failure cannot consume inputs;
- Herbalist is present in all exhaustive role structures;
- Herbalist can gather existing `herb` and the new poisonous herb through the shared gathering seam;
- Textile Worker/006 linen production still works;
- production works through time-skip/off-screen simulation.

## 13. Recommended implementation order

1. Finish/verify 015 production execution foundation.
2. Finish/verify 006 and confirm its actual item/role changes.
3. Reconcile 007 scope with the already-existing `herb` and `bandage`.
4. Add only missing item kinds.
5. Add Herbalist to the existing role/schedule/work dispatch.
6. Extend the existing gathering seam for medicinal `herb` and poisonous herbs.
7. Add ordinary `ProductionDef` recipes for bandage/dressing through the shared executor.
8. Keep outputs in existing household concrete-item storage.
9. Add targeted production/role tests and verify off-screen behaviour.

## 14. Scope traps

Do not implement in 007:
- NPC healing/injury conditions (`npc-002`);
- poisoning or alchemy;
- medical facilities or medical storage;
- a new economy resource model;
- yarn/spinning;
- detailed herb species;
- a global herbalism manager;
- a second production scheduler;
- physical long-distance logistics.

The architectural boundary should remain:

```text
world resources → gathering
items → ProductionDef → items
items/catalog → future healing
```

**Zrób git commit i push do main, rebase jeżeli trzeba**