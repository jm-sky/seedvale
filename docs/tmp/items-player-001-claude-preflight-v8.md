# SEEDVALE — IMPLEMENTATION PREFLIGHT

## Target
Plan: `docs/plans/items-player-001-containers-waterskins-and-copper-items.md`
Implementation notes: `docs/plans/implementation-notes/items-player-001-containers-waterskins-and-copper-items-implementation-notes.md`
HEAD: e94bca3 | branch: main
Working tree: HAS CHANGES — preserve them

## Relevant architecture

### `Inventory` — src/items/Inventory.ts:92
- domain: items-player
- system: inventory
- role: Owns item ownership: stack counts, item instances and perishable food batches.
- owns: FoodBatch
- produces: SaveItemInstance

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

- `src/items/itemInstances.ts`
- `src/items/Inventory.ts`
- `src/items/trade.ts`
- `src/items/itemCatalog.ts`
- `src/persistence/saveData.ts`
- `src/items/items.ts`
- `src/items/liquidContainer.ts`
- `src/items/itemModels.ts`
- `docs/assets/MODELS.md`
- `docs/items/CATALOG.md`
- `src/items/container.ts`
- `src/world/createPlacedContainers.ts`

## Dependencies

### `cloneItemInstance` — src/items/itemInstances.ts
- imports: `items/items.ts`
- imported by: `ai/NpcAgent.ts`, `ai/npcLoadout.ts`, `app/actions/placementActions.ts`, `app/actions/survivalActions.ts`, `app/createApp.ts`, `app/gameLoop.ts`, +20 more

### `instancesToJSON` — src/items/Inventory.ts
- imports: `items/foodFreshness.ts`, `items/itemCatalog.ts`, `items/itemInstances.ts`, `items/items.ts`, `items/liquidContainer.ts`
- imported by: `ai/NpcAgent.ts`, `ai/npcAssistance.test.ts`, `ai/npcAssistance.ts`, `ai/npcCombat.test.ts`, `ai/npcCombat.ts`, `ai/npcLoadout.test.ts`, +47 more

### `createAcquiredInstance` — src/items/trade.ts
- imports: `items/Inventory.ts`, `items/itemInstances.ts`, `items/items.ts`, `items/liquidContainer.ts`, `items/tradeCatalog.ts`, `items/trapItemInstances.ts`, +1 more
- imported by: `app/actions/groundActions.ts`, `app/actions/placementActions.ts`, `app/createApp.ts`, `app/gameLoop.ts`, `app/inventoryWiring.ts`, `items/trade.test.ts`, +3 more

### `ITEM_CATALOG` — src/items/itemCatalog.ts
- imports: `items/itemInstances.ts`, `items/items.ts`, `world/WaterSource.ts`
- imported by: `ai/npcAssistance.ts`, `ai/npcCombat.test.ts`, `ai/npcCombat.ts`, `app/actions/groundActions.ts`, `app/actions/placementActions.ts`, `app/actions/survivalActions.ts`, +30 more

### `SaveData` — src/persistence/saveData.ts
- imports: `config/worldConfig.ts`, `economy/kinds.ts`, `fauna/AnimalSpawner.ts`, `items/HeldTool.ts`, `items/Inventory.ts`, `items/container.ts`, +10 more
- imported by: `app/createApp.ts`, `app/saveState.ts`, `persistence/saveData.test.ts`, `persistence/saveDb.ts`, `persistence/saveSlots.test.ts`, `persistence/saveSlots.ts`

### `ItemKind` — src/items/items.ts
- imports: `assets/loadGltf.ts`, `items/itemInstances.ts`, `items/itemModels.ts`
- imported by: `ai/NpcAgent.ts`, `ai/npcAssistance.ts`, `ai/npcCombat.ts`, `ai/npcLoadout.ts`, `app/actions/actionContext.ts`, `app/actions/gatheringActions.ts`, +69 more

## Implementation anchors

### `cloneItemInstance` — src/items/itemInstances.ts:146
```ts
export function cloneItemInstance(instance: ItemInstance): ItemInstance {
  if (isTrapItemInstance(instance)) {
    const trap: TrapItemInstance = {
      id: instance.id,
      kind: instance.kind,
      durability: instance.durability,
    }
    return trap
```

### `instancesToJSON` — src/items/Inventory.ts:398
```ts
  instancesToJSON(): SaveItemInstance[] {
    return [...this.instances.values()].map(toSaveItemInstance)
  }

  static instancesFromJSON(rows: readonly SaveItemInstance[]): ItemInstance[] {
    const out: ItemInstance[] = []
    for (const row of rows) {
      if (!row.id || !row.kind) continue
```

### `instancesFromJSON` — src/items/Inventory.ts:402
```ts
  static instancesFromJSON(rows: readonly SaveItemInstance[]): ItemInstance[] {
    const out: ItemInstance[] = []
    for (const row of rows) {
      if (!row.id || !row.kind) continue
      if (isTrapKind(row.kind)) {
        if (typeof row.durability !== 'number' || !Number.isFinite(row.durability)) continue
        const trap: TrapItemInstance = {
          id: row.id,
```

### `createAcquiredInstance` — src/items/trade.ts:127
```ts
export function createAcquiredInstance(kind: ItemKind): ItemInstance | null {
  if (isTrapKind(kind)) return createTrapInstance(kind)
  if (isWeaponMaintenanceKind(kind)) return createWeaponInstance(kind)
  if (isLiquidContainerKind(kind)) return createLiquidContainerInstance(kind)
  return null
}

/** Overall `[0,1]` condition used only to order which instance sells/drops
```

### `isInstanceBackedKind` — src/items/itemInstances.ts:129
```ts
export function isInstanceBackedKind(kind: ItemKind): boolean {
  return INSTANCE_BACKED_KINDS.has(kind)
}

export function isTrapKind(kind: ItemKind): kind is TrapKind {
  return kind === 'trap_simple' || kind === 'trap_good'
}

```

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

### `migrateLegacyWaterskinsToInstances` — src/items/liquidContainer.ts:128
```ts
export function migrateLegacyWaterskinsToInstances(inventory: Inventory): void {
  const emptyCount = inventory.count('waterskin_empty')
  const fullCount = inventory.count('waterskin_full')
  if (emptyCount > 0) {
    inventory.remove('waterskin_empty', emptyCount)
    for (let i = 0; i < emptyCount; i++) {
      inventory.addInstance(createLiquidContainerInstance(LEGACY_WATERSKIN_TARGET_KIND))
    }
```

## Limited text-search fallback

- `instancesToJSON`
  - src/app/saveState.ts:116:    inventoryInstances: inventory.instancesToJSON(),
  - src/items/Inventory.test.ts:56:    const json = inv.instancesToJSON()
  - src/items/Inventory.test.ts:144:    const json = inv.instancesToJSON()
- `instancesFromJSON`
  - src/app/createApp.ts:475:    initialSave ? Inventory.instancesFromJSON(initialSave.inventoryInstances ?? []) : undefined,
  - src/app/gameLoop.ts:1347:                ? Inventory.instancesFromJSON([collected.instance])[0] ?? null
  - src/items/Inventory.test.ts:57:    const restored = Inventory.instancesFromJSON(json)
- `fillWaterskin`
  - src/app/actions/survivalActions.ts:58:  fillWaterskin: () => void
  - src/app/actions/survivalActions.ts:281:  const fillWaterskin = (): void => {
  - src/app/actions/survivalActions.ts:403:    fillWaterskin,

## Rules
Current source code is authoritative. Use this briefing to navigate to targeted code rather than reading large repository documents wholesale.
