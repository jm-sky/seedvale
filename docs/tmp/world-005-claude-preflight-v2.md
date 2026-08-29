Already up to date
Done in 263ms using pnpm v11.20.0
# SEEDVALE — IMPLEMENTATION PREFLIGHT

## Target
Plan: `docs/plans/world-005-new-game-time-reset.md`
Implementation notes: MISSING
HEAD: bfab5c0 | branch: main
Working tree: HAS CHANGES — preserve them
**Created:** 2026-08-28  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** S  
**Depends on:** none  
**Domain:** `world`
Plan sections: Cel · Aktualny stan · Zakres · 1. Wspólna wartość początkowa czasu · 2. Reset New Game · 3. Zachować istniejące mechanizmy · Kryteria akceptacji · Verification · Automated · Browser / manual · Poza zakresem

## Intent
### Cel
- Zapewnić, że **New Game** rozpoczyna świat z pełnym, deterministycznym stanem początkowym czasu.
- Obecnie **New Game** resetuje `elapsedDays`, ale zachowuje bieżące `timeOfDay` ze starego świata.

## Relevant architecture

### `createApp` — src/app/createApp.ts:204
- system: app-composition
- role: Composition root: builds every long-lived system, threads their dependencies and owns app-level lifecycle (boot, rebuild, dispose).
- owns: WorldBundle, GameLoop, AppRenderLoop
- lifecycle: boot
- integration: Wires world, player, UI, persistence and audio systems together.

## Relevant files
- `src/world/dayNight.ts`
- `src/app/createApp.ts`
- `src/persistence/saveDb.ts`
- `src/app/actions/gatheringActions.ts`
- `src/app/gameLoop.ts`
- `src/app/actions/actionContext.ts`
- `src/ai/NpcAgent.ts`
- `src/app/actions/groundActions.ts`
- `src/assets/houseDefinitionExample.ts`
- `src/fauna/playerAwareness.ts`

## Relationships
### Architectural (JSDoc)
- `createApp` owns WorldBundle, GameLoop, AppRenderLoop

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
src/app/createApp.ts:204
   202 |  * @integration Wires world, player, UI, persistence and audio systems together.
   203 |  */
   204 | export async function createApp(
   205 |   container: HTMLElement,
   206 |   initialSave?: SaveData | null,
```
```text
src/persistence/saveDb.ts:121
   119 | 
   120 | /** Next `writeSave()` without an id creates a new named slot instead of overwriting. */
   121 | export function beginNewSave(name: string): void {
   122 |   setActiveSaveId(null)
   123 |   setPendingNewSaveName(name)
```
```text
src/world/dayNight.ts:27
    25 | 
    26 | /** Initial `timeOfDay` for a freshly created world / New Game. */
    27 | export const DEFAULT_TIME_OF_DAY = 0.32
    28 | 
    29 | export type DayNightState = {
```
```text
src/world/dayNight.ts:43
    41 | }
    42 | 
    43 | export function createDayNightState(
    44 |   overrides?: Partial<DayNightState>,
    45 | ): DayNightState {
```
```text
src/world/dayNight.ts:29
    27 | export const DEFAULT_TIME_OF_DAY = 0.32
    28 | 
    29 | export type DayNightState = {
    30 |   /** 0 = midnight, 0.25 ≈ dawn, 0.5 = noon, 0.75 ≈ dusk */
    31 |   timeOfDay: number
```
```text
src/world/dayNight.ts:56
    54 | }
    55 | 
    56 | export function tickDayNight(state: DayNightState, dt: number): void {
    57 |   if (!state.enabled) return
    58 |   const len = Math.max(30, state.dayLengthSec)
```
```text
src/app/actions/gatheringActions.ts:56
    54 | }
    55 | 
    56 | export function createGatheringActions(
    57 |   ctx: PlayerActionContext,
    58 |   deps: GatheringActionDeps,
```
```text
src/app/gameLoop.ts:393
   391 | }
   392 | 
   393 | export type GameLoop = {
   394 |   /** Runs one frame's worth of simulation + render. The caller owns the
   395 |    *  `requestAnimationFrame` scheduling (and the frame id needed to cancel
```

## Text-search fallback (unresolved terms)
- `elapsedDays`: 8 match(es), e.g. `src/app/actions/gatheringActions.ts:67:    if (!bundle.placedTraps.activate(id, player.skills.traps.value, dayNight.elapsedDays)) return`
- `timeOfDay`: 8 match(es), e.g. `src/ai/NpcAgent.ts:1385:  createInspectionSnapshot(timeOfDay: number): NpcInspectionSnapshot {`
- `dayNight.elapsedDays`: 8 match(es), e.g. `src/app/actions/gatheringActions.ts:67:    if (!bundle.placedTraps.activate(id, player.skills.traps.value, dayNight.elapsedDays)) return`
- `dayNight.timeOfDay`: 8 match(es), e.g. `src/app/createApp.ts:563:  hud.setTime(dayNight.timeOfDay)`
- `CLAUDE.md`: 3 match(es), e.g. `src/app/actions/groundActions.ts:21: *  meant to spawn at that volume (see `CLAUDE.md`'s performance rules). */`
- `rebuildWorld`: 8 match(es), e.g. `src/app/actions/actionContext.ts:28: *  place by `rebuildWorldBundle`, see `worldBundle.ts`), while values that are`

## Plan index context
- | ◼️ `world-005-new-game-time-reset.md`                        | - | 🟡 | S | - |

## Recommended next reads
- `src/world/dayNight.ts`
- `src/app/createApp.ts`
- `src/persistence/saveDb.ts`
- `src/app/actions/gatheringActions.ts`
- `src/app/gameLoop.ts`
- `src/app/actions/actionContext.ts`
- `src/ai/NpcAgent.ts`
- `src/app/actions/groundActions.ts`
- `src/assets/houseDefinitionExample.ts`
- `src/fauna/playerAwareness.ts`
