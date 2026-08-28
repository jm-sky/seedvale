# SEEDVALE — IMPLEMENTATION PREFLIGHT

Plan: `docs/plans/npc-002-npc-healing.md`
Implementation notes: `docs/plans/implementation-notes/npc-002-npc-healing-implementation-notes.md`
HEAD: 90c8c95 | branch: main
Working tree: HAS CHANGES — preserve them

## Plan metadata
- **Created:** 2026-08-21  
- **Status:** `planned` 📋  
- **Priority:** medium · **Effort:** M  
- **Depends on:** `177`

## Plan structure
- # Plan: NPC Healing
- ## Cel
- ## Kluczowa zasada: niskie HP ≠ potrzeba leczenia
- ## Przygotowanie pod przyszłe injuries / conditions
- ## Źródła obrażeń
- ## Consumables
- ## Kiedy NPC powinien się leczyć?
- ## Walka
- ## Leczenie poza walką
- ## Gdzie NPC się leczy?
- ## Wykonanie leczenia
- ## Priorytet wobec Hunger / Thirst
- ## Integracja z przyszłymi injuries
- ## Zakres implementacyjny
- ## Przypadki do sprawdzenia
- ### Physical injury
- ### Brak lekarstwa
- ### Głód
- ### Pragnienie
- ### Combat
- ### Jednoczesne problemy
- ### Brak specjalnego miejsca
- ## Weryfikacja techniczna

## Implementation notes — key sections

## Referenced repository paths
- `src/shared/HealthState.ts`
- `src/ai/Needs.ts`
- `src/items/itemCatalog.ts`
- `src/app/actions/survivalActions.ts`
- `src/ai/NpcAgent.ts`

## Source search
### `planned`
- src/ai/NpcAgent.ts:2150:              type: 'action.planned',
- src/ai/NpcAgent.ts:2516:    this.trace.record({ simTime: this.simClock, type: 'action.planned', action: action.kind, queueId: action.queueId ?? null })
- src/debug/npcTrace.ts:27:   *  → `action.planned`. `selected` is `null` only when every candidate for
- src/debug/npcTrace.ts:36:  | { simTime: number; type: 'action.planned'; action: ActionId; queueId: string | null }
- src/fauna/AnimalAgent.ts:830:  /** Shared planned-action seam (plan 055) — movement bodies stay local. */
- src/settlement/gardenScale.ts:4:/** ~1 garden unit per 3 houses; always at least one when gardens are planned. */
- src/settlement/minorLocations.ts:75: * to the analytic ocean ray-march for settlements without a planned dock.
- src/settlement/minorLocations.ts:86:    const planned = def.plan.landmarks.find((l) => l.kind === 'dock')
### `bandage`
- src/items/itemCatalog.ts:716:  bandage: {
- src/items/itemCatalog.ts:717:    kind: 'bandage',
- src/items/items.ts:62:  | 'bandage'
- src/items/items.ts:652:  bandage: {
- src/items/items.ts:653:    kind: 'bandage',
- src/items/items.ts:1043:  if (kind === 'bandage') {
- src/items/items.ts:1046:      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.bandage.color, flatShading: true }),
- src/items/tradeCatalog.ts:40:  bandage: 10,
### `HealthState`
- src/ai/NpcAgent.ts:54:import { damageHealth, type HealthState } from '../shared/HealthState'
- src/ai/NpcAgent.ts:780:  readonly health: HealthState
- src/ai/NpcAgent.ts:1552:   * cost. `HealthState` stays combat-agnostic (plan 092). The single place
- src/ai/npcCombat.ts:13: * phase, `HealthState`/target-owner death consequences stay with the target.
- src/ai/npcCombat.ts:126: *  `finalDamage` to `HealthState` itself (this stays a pure resolver, no
- src/ai/npcCombat.ts:127: *  `HealthState` import). `defenseSkillValue` defaults to `0` (no bonus) —
- src/ai/npcStamina.test.ts:2:import { createHealthState, damageHealth, isAlive } from '../shared/HealthState'
- src/ai/npcStamina.test.ts:21:    const health = createHealthState(100)
### `PlannedAction`
- src/ai/NpcAgent.ts:74:  type PlannedAction,
- src/ai/NpcAgent.ts:276: *  parameterized by shared `PlannedAction` (`src/simulation`, plan 055).
- src/ai/NpcAgent.ts:315: * NPC adapter over the shared `PlannedAction` contract: destination and
- src/ai/NpcAgent.ts:321:type NpcPlannedAction = PlannedAction<ActionId> & {
- src/ai/NpcAgent.ts:322:  destination: NonNullable<PlannedAction<ActionId>['destination']>
- src/ai/NpcAgent.ts:325:  next?: NpcPlannedAction
- src/ai/NpcAgent.ts:340: *  `Phase`/`PlannedAction` themselves (`docs/plans/archive/2026-08-09--048...`). */
- src/ai/NpcAgent.ts:420: *  (see `NpcPlannedAction.chainKind`) — a chained leg like ore-gathering's
### `Inventory`
- src/ai/NpcAgent.ts:49:import { Inventory } from '../items/Inventory'
- src/ai/NpcAgent.ts:584: *  `harvestAnimalIntoInventory`'s own `canAdd` gate; this is the explicit
- src/ai/NpcAgent.ts:644: *  overflow here: `Household.items` (an `Inventory`, not `EconomicStock`) is
- src/ai/NpcAgent.ts:647:function depositCarriedItems(carried: Inventory, household: Household, kinds: readonly ItemKind[]): void {
- src/ai/NpcAgent.ts:661:export function findWeaponNeedingMaintenance(inventory: Inventory): WeaponItemInstance | null {
- src/ai/NpcAgent.ts:1009:  /** Generic item carrier reused from the player's own `Inventory` (plan
- src/ai/NpcAgent.ts:1013:  private readonly carried = new Inventory(undefined, NPC_CARRY_MAX_WEIGHT)
- src/ai/NpcAgent.ts:1485:   *  against this NPC's own carried `Inventory`, social relation/standing and
### `maxHp`
- src/ai/NpcAgent.ts:723:/** Below this currentHp/maxHp fraction, walk speed starts dropping toward the floor.
- src/ai/NpcAgent.ts:1423:      health: { current: this.health.currentHp, max: this.health.maxHp },
- src/ai/NpcAgent.ts:1833:      healthRatio: this.health.maxHp > 0 ? this.health.currentHp / this.health.maxHp : 0,
- src/ai/NpcAgent.ts:2298:      computeBarPercent(this.health.currentHp, this.health.maxHp),
- src/ai/NpcAgent.ts:3126:    if (this.health.currentHp / this.health.maxHp < NPC_GARDEN_MAINTENANCE_MIN_HEALTH_RATIO) return
- src/ai/NpcAgent.ts:3144:    if (this.health.currentHp / this.health.maxHp < NPC_GARDEN_MAINTENANCE_MIN_HEALTH_RATIO) return
- src/ai/NpcAgent.ts:3631:    const factor = this.health.currentHp / this.health.maxHp
- src/app/actions/mountActions.ts:119:    const conditionRatio = animal.health.maxHp > 0 ? animal.health.currentHp / animal.health.maxHp : 0
### `currentHp`
- src/ai/NpcAgent.ts:723:/** Below this currentHp/maxHp fraction, walk speed starts dropping toward the floor.
- src/ai/NpcAgent.ts:1423:      health: { current: this.health.currentHp, max: this.health.maxHp },
- src/ai/NpcAgent.ts:1833:      healthRatio: this.health.maxHp > 0 ? this.health.currentHp / this.health.maxHp : 0,
- src/ai/NpcAgent.ts:2298:      computeBarPercent(this.health.currentHp, this.health.maxHp),
- src/ai/NpcAgent.ts:3126:    if (this.health.currentHp / this.health.maxHp < NPC_GARDEN_MAINTENANCE_MIN_HEALTH_RATIO) return
- src/ai/NpcAgent.ts:3144:    if (this.health.currentHp / this.health.maxHp < NPC_GARDEN_MAINTENANCE_MIN_HEALTH_RATIO) return
- src/ai/NpcAgent.ts:3628:  /** 1 above HP_SLOW_THRESHOLD, tapering toward a floor as currentHp drops
- src/ai/NpcAgent.ts:3631:    const factor = this.health.currentHp / this.health.maxHp
### `dead`
- src/ai/NpcAgent.ts:1180:    // Hydrating an npc id whose authoritative state is already dead
- src/ai/NpcAgent.ts:1182:    // it — reflect the dead pose immediately instead of leaving the
- src/ai/NpcAgent.ts:1185:    if (this.health.dead) this.die()
- src/ai/NpcAgent.ts:1557:    if (this.health.dead) return
- src/ai/NpcAgent.ts:1560:    if (this.health.dead) this.die()
- src/ai/NpcAgent.ts:1576:    if (this.health.dead) return { outcome: 'none', finalDamage: 0, attempted: false }
- src/ai/NpcAgent.ts:1607:    if (this.health.dead) return false
- src/ai/NpcAgent.ts:1913:   *  dead NPC from the next tick on. */
### `food`
- src/ai/Needs.test.ts:15:    expect(pickNeed({ thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0.9 })).toBe('food')
- src/ai/Needs.test.ts:25:    expect(pickNeed({ thirst: 0, woodDuty: 0.9, waterDuty: 0, hunger: 0.9 }, { skipWood: true })).toBe('food')
- src/ai/Needs.test.ts:29:  it('shortage bias can promote wood/food without becoming a planner', () => {
- src/ai/Needs.test.ts:33:    expect(pickNeed({ thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0.28 }, { foodShortage: true })).toBe('food')
- src/ai/Needs.test.ts:45:  it('an active helper assignment promotes food the same way foodShortage does (plan 167)', () => {
- src/ai/Needs.test.ts:47:    expect(pickNeed({ thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0.28 }, { helperDeliveryAvailable: true })).toBe('food')
- src/ai/Needs.test.ts:61:    expect(pickNeed({ thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0.9 }, { critical: true })).toBe('food')
- src/ai/Needs.test.ts:64:  it('keeps water > wood > waterDuty > food precedence on ties', () => {
### `water`
- src/ai/Needs.test.ts:8:    expect(pickNeed({ thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 })).toBe('idle')
- src/ai/Needs.test.ts:12:    expect(pickNeed({ thirst: 0.9, woodDuty: 0, waterDuty: 0, hunger: 0 })).toBe('water')
- src/ai/Needs.test.ts:13:    expect(pickNeed({ thirst: 0, woodDuty: 0.9, waterDuty: 0, hunger: 0 })).toBe('wood')
- src/ai/Needs.test.ts:14:    expect(pickNeed({ thirst: 0, woodDuty: 0, waterDuty: 0.9, hunger: 0 })).toBe('waterDuty')
- src/ai/Needs.test.ts:15:    expect(pickNeed({ thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0.9 })).toBe('food')
- src/ai/Needs.test.ts:19:    expect(pickNeed({ thirst: 0.5, woodDuty: 0.5, waterDuty: 0.5, hunger: 0.5 })).toBe('water')
- src/ai/Needs.test.ts:20:    expect(pickNeed({ thirst: 0, woodDuty: 0.9, waterDuty: 0, hunger: 0.35 })).toBe('wood')
- src/ai/Needs.test.ts:24:    expect(pickNeed({ thirst: 0, woodDuty: 0.9, waterDuty: 0, hunger: 0 }, { skipWood: true })).toBe('idle')

## Targeted source snippets
```text
src/ai/NpcAgent.ts:2150
  2148 |             this.trace.record({
  2149 |               simTime: this.simClock,
  2150 |               type: 'action.planned',
  2151 |               action: action.next.kind,
  2152 |               queueId: action.next.queueId ?? null,
```
```text
src/ai/NpcAgent.ts:2516
  2514 |     resetMovementWatchdog(this.watchdog)
  2515 |     this.repathActive = false
  2516 |     this.trace.record({ simTime: this.simClock, type: 'action.planned', action: action.kind, queueId: action.queueId ?? null })
  2517 |   }
  2518 | 
```
```text
src/debug/npcTrace.ts:27
    25 |    *  `need.selected`, before `beginNeed()`'s existing execution branch runs,
    26 |    *  so the trace shows the causal chain `need.selected` → `strategy.selected`
    27 |    *  → `action.planned`. `selected` is `null` only when every candidate for
    28 |    *  this need is unavailable (falls through to `beginUnscheduledIdle`). */
    29 |   | {
```
```text
src/debug/npcTrace.ts:36
    34 |       selected: NpcStrategyId | null
    35 |     }
    36 |   | { simTime: number; type: 'action.planned'; action: ActionId; queueId: string | null }
    37 |   | { simTime: number; type: 'action.completed'; action: ActionId }
    38 |   /** `reason: 'invalid'` — `goTo` lost its `pendingAction` (defensive safety
```
```text
src/fauna/AnimalAgent.ts:830
   828 |    *  threading it through every method signature (plan 044 §2.3/§2.4). */
   829 |   private currentVillages: readonly VillageInfo[] = []
   830 |   /** Shared planned-action seam (plan 055) — movement bodies stay local. */
   831 |   private actionLifecycle: ActionLifecycle = createActionLifecycle()
   832 |   private pendingAction: PlannedAction<FaunaActionKind> | null = null
```
```text
src/settlement/gardenScale.ts:4
     2 | export type GardenScale = 'S' | 'M' | 'L'
     3 | 
     4 | /** ~1 garden unit per 3 houses; always at least one when gardens are planned. */
     5 | export function gardenUnitsFromHouses(houseCount: number): number {
     6 |   const n = Math.max(0, Math.floor(houseCount))
```
```text
src/settlement/minorLocations.ts:75
    73 | /**
    74 |  * Plan 047 adapter: prefer a dock landmark already on `VillagePlan`; fall back
    75 |  * to the analytic ocean ray-march for settlements without a planned dock.
    76 |  */
    77 | export function minorLocationsFor(
```
```text
src/settlement/minorLocations.ts:86
    84 |   let locations = cache.get(def.id)
    85 |   if (!locations) {
    86 |     const planned = def.plan.landmarks.find((l) => l.kind === 'dock')
    87 |     if (planned) {
    88 |       locations = [
```
```text
src/items/itemCatalog.ts:716
   714 |     consumable: { need: 'health', relief: 8 },
   715 |   },
   716 |   bandage: {
   717 |     kind: 'bandage',
   718 |     label: 'opatrunek',
```
```text
src/items/itemCatalog.ts:717
   715 |   },
   716 |   bandage: {
   717 |     kind: 'bandage',
   718 |     label: 'opatrunek',
   719 |     holdable: false,
```

## Current documentation anchors
- # Seedvale — Current State
- ## Read this first
- ## Runtime architecture
- ## Major systems
- ### World / terrain
- ### Settlements / NPCs
- ### Fauna
- ### Items / player
- ### Quests / progression
- ### Persistence
- ### UI / input
- ## Important shared concepts
- ## Developer tooling
- ## Important code entry points
- ## Current architectural seams / active refactors
- ## Verification state
- ## Not implemented / intentionally deferred
- ## Source of truth rule

## Agent rules distilled from CLAUDE.md
- Current source code is authoritative over plans/notes.
- Narrow navigation: use indexes and targeted source inspection instead of broad reads.
- Reuse existing mechanisms; do not create parallel systems.
- Preserve deterministic simulation, ownership/lifecycle boundaries and performance.
- Distinguish implemented, technically verified and browser/manual verified.

## Recommended next reads
- `src/shared/HealthState.ts`
- `src/ai/Needs.ts`
- `src/items/itemCatalog.ts`
- `src/app/actions/survivalActions.ts`
- `src/ai/NpcAgent.ts`
