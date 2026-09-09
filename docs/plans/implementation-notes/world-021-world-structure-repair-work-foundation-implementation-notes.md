# Implementation Notes: world-021 — World structure repair work foundation

**Status:** implemented (2026-09-09)

## Landed APIs reused from world-020

- `src/world/condition.ts` — `checkpointCondition()` / `resolveCondition()` / `CONDITION_MAX`.
- `src/world/playerWell.ts` — `resolveWellRoofCondition()`, `initializeWellRoofCondition()`, `applyWellRoofConditionDelta()`. Repair does not re-implement lazy wear; it checkpoints through the existing helpers after a successful material preflight.
- Save schema was at v16 with optional `roofCondition` / `lastRoofConditionUpdateAtDays`. This plan bumped **v16 → v17** (`CURRENT_SAVE_VERSION = 17`). Pre-021 wells restore with no `roofRepair`.

## Shared repair primitives

`src/world/repair.ts` is pure and small:

- `RepairProgress { startedCondition, targetCondition, requiredWork, completedWork }`
- `repairRemainingWork()` / `isRepairComplete()`
- `applyRepairWork()` — zero/negative no-op, clamps at `requiredWork`, returns exact `acceptedWork`

It imports no inventory/material/UI/actor/skill types.

## Well roof ownership

- `PlayerWellRecord.roofRepair?: RepairProgress` sits beside the world-020 roof condition fields. Construction `workProgress` is untouched after the roof completes.
- `quoteWellRoofRepair()` / `beginWellRoofRepair()` / `applyWellRoofRepairWork()` live in `playerWell.ts`.
- `PlayerWells.startRoofRepair()` / `contributeRoofRepairWork()` are the authoritative mutation seams. `toRecord()` copies `roofRepair` so save/load and in-session `WorldBundle` rebuilds keep the episode.

Start transaction order:

```text
relookup live well
→ read-only quote (resolved condition, no checkpoint)
→ preflight all materials
→ consume atomically
→ checkpoint condition + create RepairProgress
```

A failed material preflight neither consumes nor advances the condition anchor. Resume never re-runs the material path.

## Cost

Roof reconstruction baseline remains `4 × branch + 1 h`. Repair uses `WELL_ROOF_REPAIR_COST_FACTOR = 0.75` of that, scaled by restored-condition fraction. A full `0 → 100` quote is `3 × branch + 0.75 h`. V1 player target is always 100.

## Interaction

Completed player-built wells stay `{ kind: 'playerWell', id, complete: true }` instead of collapsing to generic `well`. Settlement wells are unchanged. `[R]` is still fill-water on a healthy completed roof (and on settlement wells); a damaged or in-progress roof opens the existing `FlavorDialog` with start/continue plus drink/fill. `[R]` is not bound as a dedicated Napraw shortcut because it already fills water.

Busy Action reuses the well construction bout (`WELL_WORK_SESSION_SEC` / `WELL_WORK_SESSION_HOURS`) and credits `acceptedWork` from `contributeRoofRepairWork`. Partial interruption keeps the episode.

## Water + protection

`isWellWaterAvailable()` is false while `roofRepair` exists. Player interactables, `PlayerWells.nearestCompleted()`, and `querySiteInfrastructure()` all reuse that predicate. The well stays in general lookup/render/collision.

`resolveWellRoofCondition()` returns the checkpointed stored condition while repair is active, so degradation and protection stay frozen at `startedCondition` until completion writes `targetCondition` and resets the anchor.

## Tests

- `src/world/repair.test.ts`
- `src/world/playerWell.test.ts` — quote, failed start, freeze, completion, water gate, prompts
- `src/world/createPlayerWells.test.ts` — start/resume/nodes()/nearestCompleted
- `src/world/siteInfrastructure.test.ts` — repairing well is not usable water
- `src/persistence/saveData.test.ts` — v16 → v17, partial repair round-trip, malformed reject

> **Zrób git commit i push do main, rebase jeżeli trzeba**
