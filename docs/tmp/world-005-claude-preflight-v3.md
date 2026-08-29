Already up to date
Done in 282ms using pnpm v11.20.0
# SEEDVALE — IMPLEMENTATION PREFLIGHT

## Target
Plan: `docs/plans/world-005-new-game-time-reset.md`
Implementation notes: MISSING
HEAD: d0aa3e1 | branch: main
Working tree: HAS CHANGES — preserve them

Plan sections: Cel · Aktualny stan · Zakres · Kryteria akceptacji · Verification · Poza zakresem

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
- `rebuildWorld`
  - src/app/gameLoop.ts:220:   *  (plan 040 §7), and `config.seed` can change on `rebuildWorld()`, so this
  - src/app/gameLoop.ts:403:   *  setup, `rebuildWorld`, the day/night GUI toggle) decide whether
  - src/app/gameLoop.ts:409:   *  mesh is disposed (`rebuildWorld`), where touching the soon-to-be-gone

## Recommended reads
- `src/world/dayNight.ts`
- `src/app/createApp.ts`

## Rules
Current source code is authoritative. Use this briefing to navigate to targeted code rather than reading large repository documents wholesale.
