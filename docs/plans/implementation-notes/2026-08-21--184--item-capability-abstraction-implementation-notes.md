# Implementation notes — plan 184: Item Capability Abstraction

**Implemented:** 2026-08-21 · **Plan:** [2026-08-21--184--item-capability-abstraction.md](../archive/2026-08-21--184--item-capability-abstraction.md)

## 1. Audit (verified against the code, not the plan text)

| Mechanism | Where | What it really is | Verdict |
|---|---|---|---|
| `ItemKind` | `items/items.ts` | Identity | keep |
| `ItemCategory` | `items/items.ts` | Category (inventory sort/filter) | keep |
| `ITEM_CATALOG` | `items/itemCatalog.ts` | Central gameplay metadata | extended (single source of truth) |
| `holdable` | `ITEM_CATALOG` | Capability (may occupy the hand slot) | now the only source; `HELD_TOOL_KINDS` derived from it |
| `melee` / `ranged` / `defense` | `ITEM_CATALOG` | Capability **+ rich config** | unchanged (plan §7) |
| `consumable`, `food.bait` | `ITEM_CATALOG` | Capability + config | unchanged |
| `ToolKind` / `HELD_TOOL_KINDS` | `items/HeldTool.ts` | Was a hand-written duplicate of `holdable` | set now derived; union kept as the type-level narrowing, asserted in tests |
| `WeaponMaintenanceKind` / `WEAPON_MAINTENANCE_KINDS` | `items/itemInstances.ts` | **Instance-state lifecycle** classification, not a capability | kept (plan §10) |
| `MeleeToolKind` / `isMeleeTool()` | `fauna/faunaCombat.ts` | Type guard already derived from `ITEM_CATALOG.melee` | kept |
| `isRangedTool()` | `items/itemCatalog.ts` | Same, over `ranged` | kept |
| `MELEE/RANGED/DEFENSE_CAPABLE_KINDS` | `ai/npcCombat.ts` | Already *derived* from `ITEM_CATALOG` (not a parallel list) | kept (plan §12) |
| `isChopTool()` / `isHarvestKnife()` | `items/itemCatalog.ts` | Hard-coded capability lists | **removed**, replaced by declared capabilities |
| `kind === 'shovel'` / `'pickaxe'` / `'fishing_rod'` / `has('firestarter')` | app actions, interactables, gameLoop, createApp | `ItemKind` used as a capability proxy | **migrated** |
| `WELL_STAGE_TOOL` | `world/playerWell.ts` | Construction tool requirement expressed as an `ItemKind` | **migrated** to `WELL_STAGE_CAPABILITY` (plan §15) |
| `createItemMesh` `kind === …`, spawners, trade lists, `heldToolVisual` TRS, `wooden_torch`/`long_sword` quest checks | various | Genuine identity | deliberately unchanged |

## 2. Capability matrix (as implemented)

| Capability | Kinds today | Query surface at the call sites | Substitution |
|---|---|---|---|
| `wood_chopping` | `battle_axe`, `axe` | held | real (2 kinds) |
| `meat_harvesting` | `damascus_knife`, `knife` | held **and** inventory (auto-equip) | real (2 kinds) |
| `branch_trimming` | `damascus_knife`, `knife` | inventory | real (2 kinds) |
| `soil_digging` | `shovel` | held (bury, ground work) and inventory (dig/level/well/Quick Actions) | designed-for (`iron_shovel`) |
| `rock_mining` | `pickaxe` | held | designed-for |
| `fire_starting` | `firestarter` | inventory | designed-for |
| `fishing` | `fishing_rod` | held | designed-for |

Every migration kept its **existing** query surface: a check that read `heldTool.held()` still reads the hand, a check that read the bag still reads the bag. Only the identity test changed.

## 3. Design decisions (checkpoint outcome)

- **No second registry.** `ItemCapability` is a field on `ItemCatalogEntry` (`capabilities?: readonly ItemCapability[]`). `CAPABILITY_KINDS` and `HOLDABLE_KINDS` are *derived* from the catalog at module load, never hand-written (plan §6).
- **Combat is not re-modelled.** `melee`/`ranged`/`defense` stay configs; `isMeleeTool`/`isRangedTool`/`npcCombat`'s derived sets already answer "which items can fight" from the catalog, so folding them into the string union would have added an alias with no caller (plan §7/§12).
- **Deviation from the plan's example names.** The plan's illustrative `'digging'`/`'mining'` became `soil_digging` and `rock_mining`. Rock digging, rock levelling and ore extraction were **merged** into one capability: all three are "break stone with the same tool", and two capabilities with an identical single-item set would be fragmentation without benefit (plan §4). Soil digging, soil levelling, burying and the well pit are merged into `soil_digging` for the same reason.
- **`branch_trimming` is separate from `meat_harvesting`** even though both are `{knife, damascus_knife}` today: they gate different operations (butchering a corpse vs the tree-inspection branch bonus), and a butchering-only or trimming-only blade is plausible. Using `meat_harvesting` for the branch bonus would have been a semantic lie.
- **`findWithCapability` ordering.** `CAPABILITY_KINDS` is sorted **best-first** by `melee.damage` (the catalog's only quality signal between tool variants), ties broken by catalog key order. That is what preserves plan 160's "prefer `damascus_knife` when both knives are carried" auto-equip behaviour without re-introducing a hand-written knife list.
- **`ItemInstance` state stays out.** `durability`/`sharpness`/`freshness` are untouched; `WeaponMaintenanceKind` remains an instance-lifecycle classification (plan §10).
- **No `HeldTool.hasCapability`.** Every held check already has `heldTool.held()` in scope and passes it to the null-tolerant `hasItemCapability` — a wrapper would have had no caller (plan §9).

## 4. API added

```ts
// items/itemCatalog.ts
type ItemCapability = 'wood_chopping' | 'meat_harvesting' | 'branch_trimming'
                    | 'soil_digging' | 'rock_mining' | 'fire_starting' | 'fishing'
ItemCatalogEntry.capabilities?: readonly ItemCapability[]
hasItemCapability(kind: ItemKind | null | undefined, capability): boolean
CAPABILITY_KINDS: Record<ItemCapability, readonly ItemKind[]>   // derived, best-first
HOLDABLE_KINDS: readonly ItemKind[]                             // derived from `holdable`
CAPABILITY_NEED_LABEL: Record<ItemCapability, string>           // "Potrzebujesz …" phrasing

// items/Inventory.ts
inventory.hasCapability(capability): boolean
inventory.findWithCapability(capability): ItemKind | null       // for auto-equip only
```

## 5. Migrated call sites

`app/actions/groundActions.ts` (dig/level/rock dig/rock level/chop/mine) · `app/actions/survivalActions.ts` (bury, harvest + auto-equip, ignite) · `app/actions/placementActions.ts` (well placement, `workOnWell` tool gate + message) · `app/interactables.ts` (corpse/tree/deposit/water-edge prompts, `buildDigTarget`) · `app/gameLoop.ts` (harvest-knife flag, fishing branch, branch-yield bonus) · `app/userActions.ts` (6 firestarter gates) · `app/createApp.ts` (Quick Actions availability, `startGroundWork` routing) · `world/playerWell.ts` (`WELL_STAGE_CAPABILITY`).

UI rename: `QuickActions.hasShovel` → `hasDiggingTool` (`ui-vue/store.ts`, `ui-vue/mount.ts`, `ui/createQuickActions.ts`, `QuickActionsScreen.vue`). The visible group label stays "Łopata" — no second digging tool exists yet.

## 6. Removed / de-duplicated

- `isChopTool()`, `isHarvestKnife()` — responsibility taken over by declared capabilities.
- `HELD_TOOL_KINDS` hand-written set — derived from `holdable`.
- `WELL_STAGE_TOOL` — replaced by `WELL_STAGE_CAPABILITY`.
- `migrateWeaponCountsToInstances`'s inline 13-kind literal — now iterates `WEAPON_MAINTENANCE_KIND_LIST` (the set is derived from that list).

## 7. Deliberately still `ItemKind`-based

`wooden_torch` / `branch` in `PlayerTorch`+`userActions` (a specific fuel item, with its own persisted `TorchSource`), the `long_sword` quest-sword grant, `createItemMesh`/`heldToolVisual` per-model geometry and TRS, spawner placement lists (`createItemSpawners.ts`), merchant stock/prices (`tradeCatalog.ts`), `WEAPON_MAINTENANCE_KINDS`, ammo `ammoKinds`, bait priority, and the `melee`/`ranged`/`defense` configs. These are identity, economy, visuals or instance state — not "can this item perform operation X".

## 8. Architecture test (plan §16)

Adding `iron_shovel` now requires: `ItemKind` union + `ITEM_DEFS` entry + `ITEM_CATALOG` entry with `holdable: true, capabilities: ['soil_digging']` (+ mesh/model as usual). No `ToolKind` set edit, no `isXTool()`, no `switch`, no per-action `kind === …`. Dig, level, bury, well-pit, the Quick Actions group and every prompt pick it up automatically.

## 9. Verification

- **Implemented:** all of the above.
- **Technically verified:** `npx vue-tsc --noEmit` ✅ · `npx eslint .` ✅ · `npm run build` ✅ · `npx vitest run` ✅ **166 files / 1428 tests** (13 new in `items/itemCapabilities.test.ts`).
- **Browser/manual verified:** ❌ not done — needs a play pass on the gameplay gates below.

### Suggested manual pass (dev server on `:5577`)

1. Hold the shovel → `[E]` dig / `[R]` level on soil; Quick Actions shows the "Łopata" group; place + work a well pit.
2. Hold the pickaxe → rock dig/level and ore deposit `[E]`; the shovel must **not** work on rock and vice versa.
3. Axe → chop a tree; battle axe → same.
4. Empty hand + knife in bag → corpse `[E]` auto-equips (damascus knife preferred when both are carried) and butchers.
5. Firestarter in bag → build/light a fire, light the wooden torch.
6. Hold the fishing rod at a lake shore → the `[E]` prompt is the fishing one, not "drink".
