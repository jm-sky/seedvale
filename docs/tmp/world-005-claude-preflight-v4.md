Already up to date
Done in 293ms using pnpm v11.20.0

   ╭───────────────────────────────────────────────╮
   │                                               │
   │     Update available! 11.20.0 → 11.24.0.      │
   │     Changelog: https://pnpm.io/v/11.24.0      │
   │   To update, run: corepack use pnpm@11.24.0   │
   │                                               │
   ╰───────────────────────────────────────────────╯

# SEEDVALE — IMPLEMENTATION PREFLIGHT

## Target
Plan: `docs/plans/world-005-new-game-time-reset.md`
Implementation notes: MISSING
HEAD: afaece8 | branch: main
Working tree: HAS CHANGES — preserve them

## Relevant files

- `src/world/dayNight.ts`
- `src/app/createApp.ts`

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

## Recommended reads

- `src/world/dayNight.ts`
- `src/app/createApp.ts`

## Rules
Current source code is authoritative. Use this briefing to navigate to targeted code rather than reading large repository documents wholesale.
