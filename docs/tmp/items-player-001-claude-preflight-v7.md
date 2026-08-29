# SEEDVALE — IMPLEMENTATION PREFLIGHT

## Target
Plan: `docs/plans/items-player-001-containers-waterskins-and-copper-items.md`
Implementation notes: `docs/plans/implementation-notes/items-player-001-containers-waterskins-and-copper-items-implementation-notes.md`
HEAD: efffef9 | branch: main
Working tree: HAS CHANGES — preserve them

## Relevant architecture

### `ITEM_CATALOG` — src/items/itemCatalog.ts:203
- domain: items-player
- system: item-catalog
- role: Single source of truth for per-`ItemKind` gameplay flags and tool-capability gates.
- owns: ItemCatalogEntry

### `SaveData` — src/persistence/saveData.ts:292
- domain: persistence
- system: save-schema
- role: Owns the SaveData shape and its validation/defaulting.
- owns: SaveData

## Relevant files

- `src/items/itemModels.ts`
- `docs/assets/MODELS.md`
- `docs/items/CATALOG.md`
- `src/items/container.ts`
- `src/world/createPlacedContainers.ts`
- `src/items/itemInstances.ts`
- `src/items/trade.ts`
- `src/persistence/saveData.ts`
- `src/items/items.ts`
- `src/items/itemCatalog.ts`
- `src/terrain/resourceDeposits.ts`
- `src/world/naturalResources.ts`

## Dependencies

### `items/itemModels.ts` — src/items/itemModels.ts
- imports: `assets/loadGltf.ts`, `items/items.ts`
- imported by: `app/worldBundle.ts`, `assets/assetIndex.ts`, `items/highQualityWeapons.test.ts`, `items/items.ts`

### `items/container.ts` — src/items/container.ts
- imports: `items/tentPlacement.ts`
- imported by: `app/actions/containerActions.ts`, `app/createApp.ts`, `items/container.test.ts`, `persistence/saveData.ts`, `world/createPlacedContainers.ts`

### `world/createPlacedContainers.ts` — src/world/createPlacedContainers.ts
- imports: `items/Inventory.ts`, `items/container.ts`, `items/itemInstances.ts`, `items/items.ts`, `player/PlayerController.ts`, `settlement/props.ts`, +1 more
- imported by: `app/interactables.ts`, `app/worldBundle.ts`, `world/helperDeliveryHooks.ts`

### `ItemInstance` — src/items/itemInstances.ts
- imports: `items/items.ts`
- imported by: `ai/NpcAgent.ts`, `ai/npcLoadout.ts`, `app/actions/placementActions.ts`, `app/actions/survivalActions.ts`, `app/createApp.ts`, `app/gameLoop.ts`, +20 more

### `items/trade.ts` — src/items/trade.ts
- imports: `items/Inventory.ts`, `items/itemInstances.ts`, `items/items.ts`, `items/liquidContainer.ts`, `items/tradeCatalog.ts`, `items/trapItemInstances.ts`, +1 more
- imported by: `app/actions/groundActions.ts`, `app/actions/placementActions.ts`, `app/createApp.ts`, `app/gameLoop.ts`, `app/inventoryWiring.ts`, `items/trade.test.ts`, +3 more

### `SaveData` — src/persistence/saveData.ts
- imports: `config/worldConfig.ts`, `economy/kinds.ts`, `fauna/AnimalSpawner.ts`, `items/HeldTool.ts`, `items/Inventory.ts`, `items/container.ts`, +10 more
- imported by: `app/createApp.ts`, `app/saveState.ts`, `persistence/saveData.test.ts`, `persistence/saveDb.ts`, `persistence/saveSlots.test.ts`, `persistence/saveSlots.ts`

## Implementation anchors

### `ItemKind` — src/items/items.ts:6
```ts
export type ItemKind =
  | 'shell'
  | 'stone'
  | 'branch'
  | 'beam'
  | 'mushroom'
  | 'flower'
  | 'cone'
```

### `ItemInstance` — src/items/itemInstances.ts:4
```ts
export type ItemInstance = {
  id: string
  kind: ItemKind
}

export type TrapKind = 'trap_simple' | 'trap_good'

export type TrapItemInstance = ItemInstance & {
```

### `LiquidContainerItemInstance` — src/items/itemInstances.ts:104
```ts
export type LiquidContainerItemInstance = ItemInstance & {
  kind: LiquidContainerKind
  liquid: LiquidContent | null
  amountLitres: number
}

export function isLiquidContainerInstance(instance: ItemInstance): instance is LiquidContainerItemInstance {
  return isLiquidContainerKind(instance.kind)
```

### `ITEM_DEFS` — src/items/items.ts:183
```ts
export const ITEM_DEFS: Record<ItemKind, ItemDef> = {
  shell: {
    kind: 'shell',
    label: 'muszla',
    categories: ['resource'],
    weight: 0.05,
    size: 'XS',
    color: 0xf2e4c9,
```

### `ITEM_CATALOG` — src/items/itemCatalog.ts:203
```ts
export const ITEM_CATALOG: Record<ItemKind, ItemCatalogEntry> = {
  shell: {
    kind: 'shell',
    label: 'muszla',
    holdable: false,
    melee: null,
    spawn: 'village_renewable',
    modelUrl: null,
```

### `LiquidContainerKind` — src/items/itemInstances.ts:67
```ts
export type LiquidContainerKind =
  | 'waterskin_small'
  | 'waterskin_medium'
  | 'waterskin_large'
  | 'wooden_bucket'
  | 'copper_bucket'

export const LIQUID_CONTAINER_KIND_LIST: readonly LiquidContainerKind[] = [
```

### `LiquidContent` — src/items/itemInstances.ts:62
```ts
export type LiquidContent = 'water' | 'milk'

/** Kinds backed by `LiquidContainerItemInstance` — three waterskin sizes
 *  (water only) and two buckets (water or milk); `ITEM_CATALOG[kind].container`
 *  carries capacity/allowed-content rules (`items/liquidContainer.ts`). */
export type LiquidContainerKind =
  | 'waterskin_small'
  | 'waterskin_medium'
```

### `INSTANCE_BACKED_KINDS` — src/items/itemInstances.ts:122
```ts
export const INSTANCE_BACKED_KINDS: ReadonlySet<ItemKind> = new Set<ItemKind>([
  'trap_good',
  'trap_simple',
  ...WEAPON_MAINTENANCE_KINDS,
  ...LIQUID_CONTAINER_KINDS,
])

export function isInstanceBackedKind(kind: ItemKind): boolean {
```

## Limited text-search fallback

- `ItemKind`
  - src/ai/NpcAgent.ts:8:import type { ItemKind } from '../items/items'
  - src/ai/NpcAgent.ts:558:const FISH_YIELD_KINDS: readonly ItemKind[] = ['fish']
  - src/ai/NpcAgent.ts:580:/** Helper resource delivery (plan 167) — the concrete `ItemKind` a
- `ItemInstance`
  - src/app/inventoryWiring.ts:71:  /** Adds an acquired item (creating an `ItemInstance` when the kind needs
  - src/items/Inventory.ts:12:  type ItemInstance,
  - src/items/Inventory.ts:52:/** `ItemInstance` → its persisted-row shape — the single conversion used by
- `Inventory`
  - src/ai/NpcAgent.ts:52:import { Inventory } from '../items/Inventory'
  - src/ai/NpcAgent.ts:667:function depositCarriedItems(carried: Inventory, household: Household, kinds: readonly ItemKind[]): void {
  - src/ai/NpcAgent.ts:681:export function findWeaponNeedingMaintenance(inventory: Inventory): WeaponItemInstance | null {

## Rules
Current source code is authoritative. Use this briefing to navigate to targeted code rather than reading large repository documents wholesale.
