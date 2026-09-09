# Implementation Notes: world-020 — World structure condition and degradation

**Status:** implemented (2026-09-09)

## Preflight / dependency state

- `items-player-018` had already landed on `main` (tent condition, `shelterFactor` `0..1`, `computeSnowExposureDays()` in `weather.ts`). Implementation used those contracts rather than the pre-018 boolean-shelter notes.
- Save schema bumped **v15 → v16** (`CURRENT_SAVE_VERSION = 16`). Legacy completed roofs default to condition `100` with the save's `elapsedDays` as the non-retroactive anchor; unfinished wells stay without roof-condition fields.

## Shared condition extraction

- `src/world/condition.ts` owns `ConditionState`, `CONDITION_MAX`, `clampCondition()`, `applyConditionDelta()`, `checkpointCondition()`, and `resolveCondition()`.
- Passive wear uses the full elapsed interval unless the caller passes `passiveDays`. Weather exposure is caller-supplied so a short weather lookback cannot silently drop time-only decay.
- `src/world/sleepingUtilities.ts` remains the camp-domain seam: `resolveSleepingUtilityCondition()` / `resolveWeatherDrivenCondition()` still own shelter factor, rates, and `SLEEPING_UTILITY_SIM_WINDOW_DAYS`, and now delegate arithmetic to `resolveCondition()` with `passiveDays: 0`.
- Tents keep `TENT_CONDITION_MAX` as an alias of `CONDITION_MAX`. Camp gameplay numbers are unchanged.

## Weather exposure

- `computeSnowExposureDays()` already lived in `src/world/weather.ts` from items-player-018. Added rain-style cycle/overlap tests beside `computeRainExposureDays`. Shelter and decay rates stay out of `weather.ts`.

## Well roof

- `PlayerWellRecord` / `SavePlayerWell` gained optional `roofCondition` + `lastRoofConditionUpdateAtDays`.
- Condition is absent until `isWellCompleted(record)` first becomes true. `PlayerWells.addWork(id, hours, nowDays)` is the completion seam and calls `initializeWellRoofCondition()` — not render/interactable code.
- `createPlayerWells.ts::toRecord()` copies the optional roof fields so save/load **and** in-session `WorldBundle` rebuild preserve them.
- Domain rates in `playerWell.ts`: passive `2.5` / rain `5` / snow `4` per day, weather window `20` days. Passive still uses full elapsed time.
- `resolveWellRoofCondition()` returns `null` when the roof component does not exist (not `100`).
- `wellWaterSource(record, resolvedRoofCondition)` scales `UNCOVERED_WELL_CONSUMPTION_RISK.chance` by `1 - condition/100`. `100` omits the field (old no-risk behaviour); `0` is the full uncovered payload; `WaterQuality` stays `safe`.
- `app/interactables.ts` resolves roof condition with `(worldSeed, nowDays)` and passes the result in; `gameLoop.ts` supplies `getSeed()`.
- `applyWellRoofConditionDelta()` / `PlayerWells.applyRoofConditionDelta()` implement the checkpoint rule for `world-021`: resolve at `nowDays` → commit → set anchor → apply delta. Condition `0` does not remove the roof mesh or revert the construction stage.

## Tests

- `src/world/condition.test.ts`
- `src/world/sleepingUtilities.test.ts` (existing shelter-factor regression)
- `src/world/weather.test.ts` — snow exposure parity
- `src/world/playerWell.test.ts` — roof lifecycle, 100/50/0 risk, long-gap passive, checkpoint
- `src/world/createPlayerWells.test.ts` — completion init, `nodes()`/restore round-trip
- `src/persistence/saveData.test.ts` — v15 → v16 completed vs unfinished roofs

> **Zrób git commit i push do main, rebase jeżeli trzeba**
