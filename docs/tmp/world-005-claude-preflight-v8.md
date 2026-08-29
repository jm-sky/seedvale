# SEEDVALE — IMPLEMENTATION PREFLIGHT

## Target
Plan: `docs/plans/world-005-new-game-time-reset.md`
Implementation notes: MISSING
HEAD: e94bca3 | branch: main
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

### `createDayNightState` — src/world/dayNight.ts
- imports: `world/createSky.ts`, `world/timeConversion.ts`
- imported by: `app/actions/actionContext.ts`, `app/createApp.ts`, `app/gameLoop.ts`, `app/graphicsSettings.ts`, `app/saveState.ts`, `app/worldBundle.ts`, +8 more

### `createApp` — src/app/createApp.ts
- imports: `ai/reactionChance.ts`, `app/actions/actionContext.ts`, `app/actions/containerActions.ts`, `app/actions/gatheringActions.ts`, `app/actions/groundActions.ts`, `app/actions/mountActions.ts`, +97 more
- imported by: `main.ts`

## Implementation anchors

### `createDayNightState` — src/world/dayNight.ts:43
```ts
export function createDayNightState(
  overrides?: Partial<DayNightState>,
): DayNightState {
  return {
    timeOfDay: DEFAULT_TIME_OF_DAY,
    elapsedDays: 0,
    dayLengthSec: 480,
    timeMultiplier: 1,
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

- `beginNewSave`
  - src/main.ts:8:  beginNewSave,
  - src/main.ts:77:      beginNewSave(choice.name)
  - src/persistence/saveDb.ts:121:export function beginNewSave(name: string): void {
- `createDayNightState`
  - src/world/dayNight.test.ts:3:  createDayNightState,
  - src/world/dayNight.test.ts:62:    const state = createDayNightState({
  - src/world/dayNight.test.ts:71:  it('matches createDayNightState defaults so New Game and boot stay aligned', () => {
- `elapsedDays`
  - src/app/actions/gatheringActions.ts:67:    if (!bundle.placedTraps.activate(id, player.skills.traps.value, dayNight.elapsedDays)) return
  - src/app/actions/gatheringActions.ts:79:      inventory.add(baitKind, 1, dayNight.elapsedDays)
  - src/app/actions/gatheringActions.ts:126:    if (inventory.add(kind, 1, dayNight.elapsedDays)) {

## Rules
Current source code is authoritative. Use this briefing to navigate to targeted code rather than reading large repository documents wholesale.
