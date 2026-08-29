# SEEDVALE — IMPLEMENTATION PREFLIGHT

## Target
Plan: `docs/plans/world-005-new-game-time-reset.md`
Implementation notes: MISSING
HEAD: c9f9c8b | branch: main
Working tree: HAS CHANGES — preserve them

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

## Dependencies

### `DayNightState` — src/world/dayNight.ts
- imports: `world/createSky.ts`, `world/timeConversion.ts`
- imported by: `app/actions/actionContext.ts`, `app/createApp.ts`, `app/gameLoop.ts`, `app/graphicsSettings.ts`, `app/saveState.ts`, `app/worldBundle.ts`, +8 more

### `createApp` — src/app/createApp.ts
- imports: `ai/reactionChance.ts`, `app/actions/actionContext.ts`, `app/actions/containerActions.ts`, `app/actions/gatheringActions.ts`, `app/actions/groundActions.ts`, `app/actions/mountActions.ts`, +97 more
- imported by: `main.ts`

## Implementation anchors

### `DayNightState` — src/world/dayNight.ts:29
```ts
export type DayNightState = {
  /** 0 = midnight, 0.25 ≈ dawn, 0.5 = noon, 0.75 ≈ dusk */
  timeOfDay: number
  /** Absolute game-days elapsed since world start — advances with the clock
   *  (including time skip) and never wraps. Used by lazy systems such as tree
   *  growth (`world/treeLifecycle.ts`) that must survive chunk unload and save. */
  elapsedDays: number
  /** Real seconds for a full day cycle at multiplier = 1. */
```

### `createApp` — src/app/createApp.ts:204
```ts
export async function createApp(
  container: HTMLElement,
  initialSave?: SaveData | null,
  options?: { newGame?: boolean, modelTest?: boolean, benchmarkFixture?: BenchmarkFixture },
): Promise<() => void> {
  const { bootMark, bootMarkEnd, bootMarksSummary } = useBootMark('createApp')

  // `?modelTest` — ultra-minimal NPC/player model+animation preview. Bails out
```

## Limited text-search fallback

- `elapsedDays`
  - src/app/actions/gatheringActions.ts:67:    if (!bundle.placedTraps.activate(id, player.skills.traps.value, dayNight.elapsedDays)) return
  - src/app/actions/gatheringActions.ts:79:      inventory.add(baitKind, 1, dayNight.elapsedDays)
  - src/app/actions/gatheringActions.ts:126:    if (inventory.add(kind, 1, dayNight.elapsedDays)) {
- `timeOfDay`
  - src/ai/NpcAgent.ts:1385:  createInspectionSnapshot(timeOfDay: number): NpcInspectionSnapshot {
  - src/ai/NpcAgent.ts:1394:      activity: this.getCurrentActivity(timeOfDay),
  - src/ai/NpcAgent.ts:1437:  why(timeOfDay: number): NpcWhy {
- `DayNightState`
  - src/app/actions/actionContext.ts:12:import type { DayNightState } from '../../world/dayNight'
  - src/app/actions/actionContext.ts:41:  dayNight: DayNightState
  - src/app/gameLoop.ts:37:import type { DayNightState } from '../world/dayNight'

## Rules
Current source code is authoritative. Use this briefing to navigate to targeted code rather than reading large repository documents wholesale.
