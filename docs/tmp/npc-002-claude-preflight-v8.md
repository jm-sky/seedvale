# SEEDVALE — IMPLEMENTATION PREFLIGHT

## Target
Plan: `docs/plans/npc-002-npc-healing.md`
Implementation notes: `docs/plans/implementation-notes/npc-002-npc-healing-implementation-notes.md`
HEAD: e94bca3 | branch: main
Working tree: HAS CHANGES — preserve them

## Relevant architecture

### `applyIncomingCombatDamage` — src/ai/NpcAgent.ts:1607
- role: Resolves defense, then routes final damage into `takeDamage`.
- uses: HealthState

### `NpcAgent` — src/ai/NpcAgent.ts:780
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

### `HealthState` — src/shared/HealthState.ts:7
- domain: shared
- system: health
- role: Shared health/damage/death state used by the player, NPCs and fauna.
- owns: HealthState

### `takeDamage` — src/ai/NpcAgent.ts:1590
- role: NPC-owned damage entry point: applies `HealthState` HP loss, vigor cost and death.
- uses: HealthState

### `update` — src/ai/NpcAgent.ts:1984
- role: Per-tick NPC loop: needs/stamina/vigor, phase FSM, and the `choose` phase that hands the picked need to `beginNeed`.
- uses: NpcPlannedAction

### `startAction` — src/ai/NpcAgent.ts:2541
- role: Generic `goTo` → `execute` kickoff shared by every NPC action — the one place a planned action becomes the active `ActionLifecycle`.
- produces: ActionLifecycle
- consumes: NpcPlannedAction

### `beginNeed` — src/ai/NpcAgent.ts:2665
- role: Executes the already-picked need via its existing branches; each branch ends by calling `startAction` with a `NpcPlannedAction`.
- produces: NpcPlannedAction

## Relevant files

- `src/shared/HealthState.ts`
- `src/ai/NpcAgent.ts`
- `src/ai/Needs.ts`
- `src/app/actions/survivalActions.ts`
- `src/items/itemCatalog.ts`

## Dependencies

### `healHealth` — src/shared/HealthState.ts
- imports: none
- imported by: `ai/NpcAgent.ts`, `ai/npcStamina.test.ts`, `ai/npcVigor.test.ts`, `app/actions/gatheringActions.ts`, `app/actions/survivalActions.ts`, `fauna/AnimalAgent.ts`, +9 more

### `applyIncomingCombatDamage` — src/ai/NpcAgent.ts
- imports: `ai/Needs.ts`, `ai/characters.ts`, `ai/decisionModifiers.ts`, `ai/dialogue.ts`, `ai/helperAssignment.ts`, `ai/npcAnimalThreat.ts`, +58 more
- imported by: `ai/dialogueTemplates.ts`, `ai/npcCurrentActivity.test.ts`, `ai/npcProfessionWork.test.ts`, `ai/npcWhy.test.ts`, `app/dialogueTimeControl.ts`, `app/gameLoop.ts`, +13 more

### `pickNeed` — src/ai/Needs.ts
- imports: `simulation/index.ts`, `world/timeConversion.ts`
- imported by: `ai/Needs.test.ts`, `ai/NpcAgent.ts`, `ai/decisionModifiers.test.ts`, `ai/decisionModifiers.ts`, `ai/dialogue.ts`, `ai/dialogueTemplates.ts`, +6 more

### `createSurvivalActions` — src/app/actions/survivalActions.ts
- imports: `app/actions/actionContext.ts`, `audio/actionSounds.ts`, `audio/animalSounds.ts`, `audio/inventorySounds.ts`, `fauna/AnimalAgent.ts`, `fauna/AnimalSpawner.ts`, +15 more
- imported by: `app/createApp.ts`, `app/gameLoop.ts`

### `ITEM_CATALOG` — src/items/itemCatalog.ts
- imports: `items/itemInstances.ts`, `items/items.ts`, `world/WaterSource.ts`
- imported by: `ai/npcAssistance.ts`, `ai/npcCombat.test.ts`, `ai/npcCombat.ts`, `app/actions/groundActions.ts`, `app/actions/placementActions.ts`, `app/actions/survivalActions.ts`, +30 more

## Implementation anchors

### `healHealth` — src/shared/HealthState.ts:28
```ts
export function healHealth(health: HealthState, amount: number): void {
  if (health.dead || amount <= 0) return
  health.currentHp = Math.min(health.maxHp, health.currentHp + amount)
}

export function isAlive(health: HealthState): boolean {
  return !health.dead
}
```

### `damageHealth` — src/shared/HealthState.ts:19
```ts
export function damageHealth(health: HealthState, amount: number): void {
  if (health.dead || amount <= 0) return
  health.currentHp = Math.max(0, health.currentHp - amount)
  if (health.currentHp <= 0) {
    health.dead = true
  }
}

```

### `pickNeed` — src/ai/Needs.ts:157
```ts
export function pickNeed(needs: NeedState, options: PickNeedOptions = {}): NeedId {
  return pickFromPressures(generateNeedPressures(needs, options))
}

export function needColor(need: NeedId): number {
  switch (need) {
    case 'food':
      return 0x5faa3a
```

### `createSurvivalActions` — src/app/actions/survivalActions.ts:83
```ts
export function createSurvivalActions(ctx: PlayerActionContext): SurvivalActions {
  const { bundle, player, inventory, heldTool, hud, toast, busy, dayNight, worldAudio } = ctx

  const startBuryCorpse = (animal: AnimalAgent): void => {
    if (!hasItemCapability(heldTool.held(), 'soil_digging') || isChannelBusy(ctx)) return
    if (!animal.isDead() || animal.readyToRemove()) return
    playActionDig(worldAudio.playOnce)
    busy.start(BURY_DURATION_SEC, 'Zakopywanie…', () => {
```

### `applyIncomingCombatDamage` — src/ai/NpcAgent.ts:1607
```ts
  applyIncomingCombatDamage(params: {
    amount: number
    attackerX?: number
    attackerZ?: number
    attackerKey: string
  }): ResolvedDefense {
    if (this.health.dead) return { outcome: 'none', finalDamage: 0, attempted: false }
    this.defenseAttempt += 1
```

### `NpcAgent` — src/ai/NpcAgent.ts:780
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

## Limited text-search fallback

- `healHealth`
  - src/player/PlayerNeeds.ts:1:import { healHealth, type HealthState } from '../shared/HealthState'
  - src/player/PlayerNeeds.ts:285:  healHealth(health, HP_REGEN_PER_SEC * dt)
  - src/player/playerDamage.ts:10:import { healHealth, type HealthState } from '../shared/HealthState'
- `damageHealth`
  - src/ai/npcStamina.test.ts:2:import { createHealthState, damageHealth, isAlive } from '../shared/HealthState'
  - src/ai/npcStamina.test.ts:31:    damageHealth(health, 40)
  - src/ai/npcStamina.test.ts:53:    damageHealth(health, 25)
- `applyIncomingCombatDamage`
  - src/app/gameLoop.ts:1818:                target.applyIncomingCombatDamage({ amount, attackerX, attackerZ, attackerKey: 'fauna' })
- `resolveIncomingNpcDamage`
  - src/ai/npcCombat.test.ts:9:  resolveIncomingNpcDamage,
  - src/ai/npcCombat.test.ts:144:describe('resolveIncomingNpcDamage', () => {
  - src/ai/npcCombat.test.ts:157:    const result = resolveIncomingNpcDamage(baseParams)

## Rules
Current source code is authoritative. Use this briefing to navigate to targeted code rather than reading large repository documents wholesale.
