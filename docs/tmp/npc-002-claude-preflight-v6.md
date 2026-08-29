# SEEDVALE — IMPLEMENTATION PREFLIGHT

## Target
Plan: `docs/plans/npc-002-npc-healing.md`
Implementation notes: `docs/plans/implementation-notes/npc-002-npc-healing-implementation-notes.md`
HEAD: c9f9c8b | branch: main
Working tree: HAS CHANGES — preserve them

## Relevant architecture

### `HealthState` — src/shared/HealthState.ts:7
- domain: shared
- system: health
- role: Shared health/damage/death state used by the player, NPCs and fauna.
- owns: HealthState

### `NpcAgent` — src/ai/NpcAgent.ts:760
- domain: settlements-npcs
- system: npc-agent
- role: Central per-NPC behaviour integration point: needs, FSM/schedule, personality-driven decisions and combat.
- owns: NpcAuthoritativeState
- uses: Household, SettlementEconomy, Needs
- simulation: tick

### `ITEM_CATALOG` — src/items/itemCatalog.ts:203
- domain: items-player
- system: item-catalog
- role: Single source of truth for per-`ItemKind` gameplay flags and tool-capability gates.
- owns: ItemCatalogEntry

## Relevant files

- `src/shared/HealthState.ts`
- `src/ai/Needs.ts`
- `src/items/itemCatalog.ts`
- `src/app/actions/survivalActions.ts`
- `src/ai/NpcAgent.ts`

## Dependencies

### `HealthState` — src/shared/HealthState.ts
- imports: none
- imported by: `ai/NpcAgent.ts`, `ai/npcStamina.test.ts`, `ai/npcVigor.test.ts`, `app/actions/gatheringActions.ts`, `app/actions/survivalActions.ts`, `fauna/AnimalAgent.ts`, +9 more

### `ai/Needs.ts` — src/ai/Needs.ts
- imports: `simulation/index.ts`, `world/timeConversion.ts`
- imported by: `ai/Needs.test.ts`, `ai/NpcAgent.ts`, `ai/decisionModifiers.test.ts`, `ai/decisionModifiers.ts`, `ai/dialogue.ts`, `ai/dialogueTemplates.ts`, +6 more

### `ITEM_CATALOG` — src/items/itemCatalog.ts
- imports: `items/itemInstances.ts`, `items/items.ts`, `world/WaterSource.ts`
- imported by: `ai/npcAssistance.ts`, `ai/npcCombat.test.ts`, `ai/npcCombat.ts`, `app/actions/groundActions.ts`, `app/actions/placementActions.ts`, `app/actions/survivalActions.ts`, +30 more

### `app/actions/survivalActions.ts` — src/app/actions/survivalActions.ts
- imports: `app/actions/actionContext.ts`, `audio/actionSounds.ts`, `audio/inventorySounds.ts`, `fauna/AnimalAgent.ts`, `fauna/AnimalSpawner.ts`, `fauna/animalHarvest.ts`, +14 more
- imported by: `app/createApp.ts`, `app/gameLoop.ts`

### `NpcAgent` — src/ai/NpcAgent.ts
- imports: `ai/Needs.ts`, `ai/characters.ts`, `ai/decisionModifiers.ts`, `ai/dialogue.ts`, `ai/helperAssignment.ts`, `ai/npcAnimalThreat.ts`, +57 more
- imported by: `ai/dialogueTemplates.ts`, `ai/npcCurrentActivity.test.ts`, `ai/npcProfessionWork.test.ts`, `ai/npcWhy.test.ts`, `app/dialogueTimeControl.ts`, `app/gameLoop.ts`, +13 more

## Implementation anchors

### `HealthState` — src/shared/HealthState.ts:7
```ts
export type HealthState = {
  maxHp: number
  currentHp: number
  dead: boolean
}

export function createHealthState(maxHp: number): HealthState {
  return { maxHp, currentHp: maxHp, dead: false }
```

### `NpcAgent` — src/ai/NpcAgent.ts:760
```ts
export class NpcAgent {
  readonly mesh: THREE.Object3D
  readonly label: CSS2DObject
  readonly name: string
  /** Display-only — `name` alone stays the matching key for quests/dialogue
   *  (`quests/quests.ts` hardcodes `giverName` as first name only). */
  readonly displayName: string
  /**
```

### `ActionId` — src/ai/NpcAgent.ts:300
```ts
export type ActionId =
  | 'chop'
  | 'conversation'
  | 'deposit'
  | 'drink'
  | 'eat'
  | 'fish'
  | 'harvest'
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

## Limited text-search fallback

- `HealthState`
  - src/ai/npcStamina.test.ts:2:import { createHealthState, damageHealth, isAlive } from '../shared/HealthState'
  - src/ai/npcVigor.test.ts:2:import { createHealthState, damageHealth, isAlive } from '../shared/HealthState'
  - src/app/actions/gatheringActions.ts:12:import { damageHealth } from '../../shared/HealthState'

## Rules
Current source code is authoritative. Use this briefing to navigate to targeted code rather than reading large repository documents wholesale.
