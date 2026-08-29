Already up to date
Done in 270ms using pnpm v11.20.0
# SEEDVALE — IMPLEMENTATION PREFLIGHT

## Target
Plan: `docs/plans/npc-002-npc-healing.md`
Implementation notes: `docs/plans/implementation-notes/npc-002-npc-healing-implementation-notes.md`
HEAD: bfab5c0 | branch: main
Working tree: HAS CHANGES — preserve them
**Created:** 2026-08-21  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** M  
**Depends on:** `177`
Plan sections: Cel · Kluczowa zasada: niskie HP ≠ potrzeba leczenia · Przygotowanie pod przyszłe injuries / conditions · Źródła obrażeń · Consumables · Kiedy NPC powinien się leczyć? · Walka · Leczenie poza walką · Gdzie NPC się leczy? · Wykonanie leczenia · Priorytet wobec Hunger / Thirst · Integracja z przyszłymi injuries · Zakres implementacyjny · Przypadki do sprawdzenia

## Intent
### Cel
- Dodać NPC możliwość reagowania na **uleczalne obrażenia** poprzez istniejący system decyzji, akcji, inventory i consumables.
- NPC powinien:
- - wykrywać potrzebę leczenia,
- - posiadać informację, czy aktualny stan jest uleczalny,
- - użyć dostępnego consumable przeznaczonego do leczenia,
- - zdecydować kiedy i gdzie się leczyć,
- - działać zarówno podczas normalnego życia, jak i po zakończeniu walki,
- - nie próbować leczyć HP utraconego wskutek głodu lub pragnienia.

## Relevant architecture

### `Inventory` — src/items/Inventory.ts:92
- domain: items-player
- system: inventory
- role: Owns item ownership: stack counts, item instances and perishable food batches.
- owns: FoodBatch
- produces: SaveItemInstance

### `HealthState` — src/shared/HealthState.ts:7
- domain: shared
- system: health
- role: Shared health/damage/death state used by the player, NPCs and fauna.
- owns: HealthState

### `ITEM_CATALOG` — src/items/itemCatalog.ts:203
- domain: items-player
- system: item-catalog
- role: Single source of truth for per-`ItemKind` gameplay flags and tool-capability gates.
- owns: ItemCatalogEntry

### `NpcAgent` — src/ai/NpcAgent.ts:760
- domain: settlements-npcs
- system: npc-agent
- role: Central per-NPC behaviour integration point: needs, FSM/schedule, personality-driven decisions and combat.
- owns: NpcAuthoritativeState
- uses: Household, SettlementEconomy, Needs
- simulation: tick

## Relevant files
- `src/shared/HealthState.ts`
- `src/ai/Needs.ts`
- `src/items/itemCatalog.ts`
- `src/app/actions/survivalActions.ts`
- `src/ai/NpcAgent.ts`
- `src/items/Inventory.ts`
- `src/simulation/types.ts`
- `src/settlement/places.ts`
- `src/app/actions/groundActions.ts`
- `src/assets/houseDefinitionExample.ts`
- `src/fauna/playerAwareness.ts`
- `src/app/actions/mountActions.ts`

## Relationships
### Architectural (JSDoc)
- `Inventory` owns FoodBatch; produces SaveItemInstance
- `HealthState` owns HealthState
- `ITEM_CATALOG` owns ItemCatalogEntry
- `NpcAgent` owns NpcAuthoritativeState; uses Household, SettlementEconomy, Needs

## Warnings
- Do not make `NpcAgent` depend on `createSurvivalActions()` or fake a `PlayerActionContext` just to call `consumeItem()`.
- Avoid storing a Three.js `Object3D` or long-lived `NpcAgent` reference inside the action. The existing action model intentionally uses plain destination snapshots.
- Do not make `NpcAgent.applyIncomingCombatDamage()` call `beginHealing()`.
- NPC nie powinien podejmować decyzji o leczeniu wyłącznie dlatego, że:
- Jeżeli NPC jest odwodniony i ma niski poziom HP, bandaż nie powinien być traktowany jako rozwiązanie problemu odwodnienia.
- Healing nie powinien być częścią wyłącznie combat systemu.

## Implementation-note constraints
### 1. Review verdict
- Plan 180 fits the Seedvale architecture, but several assumptions in the plan do **not** match the current code and must be corrected before implementation.
- The most important findings are:
- 1. **Plan 177 is already implemented.** NPC combat, incoming damage, `HealthState` and NPC death are available. Do not recreate combat plumbing.
- 2. **`HealthState` currently contains only `maxHp`, `currentHp` and `dead`.** It has no injury/condition/source information. `healHealth()` simply restores HP and therefore cannot by itself distinguish physical injury from any other future source of lost HP.
- 3. **Current NPC needs are only `food`, `water`, `waterDuty`, `wood`, `idle`.** There is no general pressure/problem system in `Needs.ts` and no `health` need should be added just to represent an injury.
- 4. **NPC starvation/dehydration damage is not part of the current NPC implementation.** Plan 165 concerns player hunger/thirst/deprivation; it is not evidence that NPC hunger/thirst currently damages NPC HP. Therefore V1 should not invent a second deprivation-damage system merely to satisfy the wording of plan 180.
- 5. **The player already has a catalog-driven health consumable path, but it is player-action code.** `survivalActions.ts` reads `ITEM_CATALOG[kind].consumable`, removes the item and calls `healHealth()`. NPCs cannot call this player action closure directly. The implementation needs a small reusable item/effect seam or an NPC-local use of the same catalog contract; it must not create a second consumable definition.
- 6. **There is no generic medical-location system.** `NpcAgent` already has `home` and settlement `Place` data, so V1 should use an existing destination such as home rather than introducing `HealingLocation`, hospital, doctor or medical manager.
### 5. Consumables: reuse the existing catalog contract
- `src/items/itemCatalog.ts` already defines:
- ```ts
- consumable?: {
- need: 'hunger' | 'thirst' | 'health'
- relief: number
- resultKind?: ItemKind
- }
- ```
### 15. Suggested implementation ownership
- Likely touch points, to confirm against the final code before editing:
- ```text
- src/ai/NpcAgent.ts
- - V1 physical injury state
- - injury update from accepted damage
- - healing candidate selection
- - healing decision/action
- - heal action completion
### 22. Final implementation guidance
- The safest implementation shape is:
- ```text
- existing combat damage
- ↓
- NpcAgent records minimal physical injury
- ↓
- normal NPC decision
- ↓

## Current implementation anchors
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

## Source evidence
```text
src/items/Inventory.ts:92
    90 |  * @produces SaveItemInstance
    91 |  */
    92 | export class Inventory {
    93 |   private readonly counts = new Map<ItemKind, number>()
    94 |   private readonly instances = new Map<string, ItemInstance>()
```
```text
src/shared/HealthState.ts:7
     5 |  * @owns HealthState
     6 |  */
     7 | export type HealthState = {
     8 |   maxHp: number
     9 |   currentHp: number
```
```text
src/simulation/types.ts:90
    88 |  * mutations into the plan layer; actions should remain executable steps.
    89 |  */
    90 | export type PlannedAction<TKind extends string = string> = {
    91 |   kind: TKind
    92 |   destination?: Vec3
```
```text
src/shared/HealthState.ts:28
    26 | 
    27 | /** Adds `amount` to HP, capped at `maxHp`. Does not revive the dead. */
    28 | export function healHealth(health: HealthState, amount: number): void {
    29 |   if (health.dead || amount <= 0) return
    30 |   health.currentHp = Math.min(health.maxHp, health.currentHp + amount)
```
```text
src/items/itemCatalog.ts:203
   201 |  * @owns ItemCatalogEntry
   202 |  */
   203 | export const ITEM_CATALOG: Record<ItemKind, ItemCatalogEntry> = {
   204 |   shell: {
   205 |     kind: 'shell',
```
```text
src/ai/NpcAgent.ts:760
   758 |  * @simulation tick
   759 |  */
   760 | export class NpcAgent {
   761 |   readonly mesh: THREE.Object3D
   762 |   readonly label: CSS2DObject
```
```text
src/settlement/places.ts:20
    18 | export type PlaceType = 'home' | 'workplace' | 'food' | 'social'
    19 | 
    20 | export type Place = {
    21 |   /** Stable id, namespaced by settlement (e.g. `0_0:home:2`) — same spirit as
    22 |    *  `SettlementDef.id`/interactable ids elsewhere in `settlement/`. */
```
```text
src/simulation/types.ts:106
   104 |   | 'cancelled'
   105 | 
   106 | export type ActionLifecycle = {
   107 |   status: ActionLifecycleStatus
   108 | }
```

## Text-search fallback (unresolved terms)
- `CLAUDE.md`: 3 match(es), e.g. `src/app/actions/groundActions.ts:21: *  meant to spawn at that volume (see `CLAUDE.md`'s performance rules). */`
- `maxHp`: 8 match(es), e.g. `src/ai/NpcAgent.ts:723:/** Below this currentHp/maxHp fraction, walk speed starts dropping toward the floor.`
- `currentHp`: 8 match(es), e.g. `src/ai/NpcAgent.ts:723:/** Below this currentHp/maxHp fraction, walk speed starts dropping toward the floor.`
- `waterDuty`: 8 match(es), e.g. `src/ai/Needs.test.ts:8:    expect(pickNeed({ thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 })).toBe('idle')`
- `Needs.ts`: 8 match(es), e.g. `src/ai/NpcAgent.ts:675: *  at default `Needs.ts`/`dayNight.ts` rates, so a multi-hour skip still`
- `survivalActions.ts`: 4 match(es), e.g. `src/app/actions/placementActions.ts:427:   *  `survivalActions.ts`'s waterskin fill/drink already uses, extended here`

## Plan index context
- | 💡 `npc-002-npc-healing.md`                                            | NPC używa opatrunków | 🟡 | M | ~~177~~ |

## Recommended next reads
- `src/shared/HealthState.ts`
- `src/ai/Needs.ts`
- `src/items/itemCatalog.ts`
- `src/app/actions/survivalActions.ts`
- `src/ai/NpcAgent.ts`
- `src/items/Inventory.ts`
- `src/simulation/types.ts`
- `src/settlement/places.ts`
- `src/app/actions/groundActions.ts`
- `src/assets/houseDefinitionExample.ts`
- `src/fauna/playerAwareness.ts`
- `src/app/actions/mountActions.ts`
