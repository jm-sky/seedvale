# Implementation Notes: world-020 — World structure condition and degradation

## Preflight / dependency state

- `world-020` is **blocked by `items-player-018`**. On current `main`, `items-player-018` is still `planned`; camp is still on the pre-018 contract: bedroll/platform have `condition + lastConditionUpdateAtDays`, tent has no condition yet, and `resolveSleepingUtilityCondition(..., sheltered: boolean)` still uses binary shelter.
- Implement `world-020` only after `items-player-018` lands, then re-check the exact post-018 API rather than forcing today's signatures. Expected dependency contract from the plan/notes is: tent condition `0..100`, shelter as factor `0..1`, and unchanged lazy weather-driven bedroll/platform semantics.
- Current persistence schema is `CURRENT_SAVE_VERSION = 13`, not the older version quoted in some implementation notes. Use whatever version is current when implementation starts and extend the existing `CURRENT_SAVE_VERSION` + `SAVE_MIGRATIONS` pipeline.

## Shared condition extraction

Relevant code today:

- `src/world/sleepingUtilities.ts` — current authoritative condition/degradation implementation for bedroll/platform.
- `src/world/weather.ts` — canonical deterministic `computeRainExposureDays()`.
- `src/world/condition.ts` does not exist yet.

Extract only math that is genuinely shared after `items-player-018`:

- `ConditionState { condition, lastConditionUpdateAtDays }`
- `CONDITION_MAX = 100`
- `clampCondition()` / `applyConditionDelta()`
- small pure decay resolver.

Keep rates, simulation windows, shelter policy and object-specific consequences in their domains. `resolveSleepingUtilityCondition()` should remain the public camp-domain seam and delegate to shared primitives; callers should not reconstruct sleeping rules around generic `resolveCondition()`.

One subtle invariant: bounded lookback must not silently discard passive decay. If well roof has `passivePerDay`, either resolve passive wear over the full elapsed interval with O(1) arithmetic, or choose a well simulation window guaranteed to be at least the maximum time required for passive decay alone to drive `100 → 0`. Do not simply clamp all elapsed time to a short weather window if that changes the mathematical result after long save/time-skip gaps.

## Weather exposure

Move the existing snow integration from `sleepingUtilities.ts` into `src/world/weather.ts` as the direct counterpart of `computeRainExposureDays()`; reuse the same `WEATHER_CYCLE_DAYS` / `computeWeather()` / `getSeason()` semantics. Add tests beside `weather.test.ts` for deterministic snow exposure and partial-cycle overlap.

Do not put shelter factors or condition damage rates into `weather.ts`. Weather should return exposure; camp/well decide how much of it reaches the component and what it costs.

After `items-player-018`, preserve its chosen factor semantics exactly. Do not regress back to today's `sheltered: boolean` simplification while extracting the shared layer.

## Well roof authoritative state and lifecycle

Relevant code:

- `src/world/playerWell.ts` — `PlayerWellRecord`, `isWellCompleted()`, `isWellWaterAvailable()`, `wellWaterSource()`.
- `src/world/createPlayerWells.ts` — runtime owner/mutations plus the snapshot path.
- `src/app/actions/placementActions.ts` — player construction contributions.

The roof does **not** exist merely because `record.stage === 'roof'`: transition into `roof` happens before roof work completes. Condition must therefore be absent until `isWellCompleted(record)` first becomes true.

Prefer explicit optional component state on the well record, e.g. semantically:

```ts
roofCondition?: number
lastRoofConditionUpdateAtDays?: number
```

(or an equally small grouped shape). Keep it roof-specific; do not introduce generic structure/component records.

Initialization must happen exactly when completed-roof state is first established, with condition `100` and anchor = current `elapsedDays`. The current `PlayerWells.addWork(id, hoursDelta)` has no clock argument and only updates `workProgress`, so the implementation must deliberately establish a completion seam rather than deriving a fake anchor later. Suitable options are to extend the authoritative well mutation with `nowDays`/completion handling or add a small domain-owned completion/checkpoint mutation; do not initialize condition in render/interactable code.

Keep `workProgress` and roof condition independent. Completing construction creates the component; later degradation/repair must never rewrite construction progress.

## Snapshot / rebuild pitfall

`createPlayerWells.ts::toRecord()` manually reconstructs `PlayerWellRecord`. New roof fields must be added there.

This matters twice:

1. `src/app/saveState.ts` saves `bundle.playerWells.nodes()`;
2. `src/app/worldBundle.ts` also uses `nodes()` to carry player wells across an in-session `WorldBundle` rebuild.

If `toRecord()` is not updated, roof condition can disappear even without save/load. Also ensure `spawn(initial)` preserves optional roof state and any newly created completed roof writes it back to the runtime entry.

## Well roof resolution and water-protection seam

Current protection is binary:

```text
isWellCompleted(record)
→ no WaterSource.consumptionRisk
otherwise usable body
→ UNCOVERED_WELL_CONSUMPTION_RISK
```

`WaterSource` has no contamination state. Its existing seam is `consumptionRisk`, currently rolled only for direct drinking; filling a container intentionally loses that association. Preserve that ownership/limitation rather than creating a second water-quality system.

A minimal factor-based extension is therefore to derive:

```text
roofProtectionFactor = resolvedRoofCondition / 100
remainingRiskFactor = 1 - roofProtectionFactor
```

and scale the existing uncovered-well risk probability by `remainingRiskFactor` while retaining the existing damage/vigor payload. Thus completed roof at `100` matches today's no-risk behavior, `0` matches today's uncovered risk, and intermediate condition is continuous. Keep `WaterQuality` unchanged (`well` remains `safe`).

`wellWaterSource(record)` currently lacks `seed`/`elapsedDays`, while lazy condition needs them. Do not make `WaterSource` itself resolve world state. Prefer a well-domain resolver such as `resolveWellRoofCondition(...)` and pass the already-resolved protection/condition into the water-source derivation, or evolve the well-domain API so the app supplies explicit weather/time context. `app/interactables.ts` is the current primary caller and already owns world/app context; it should not duplicate condition math.

## Checkpoint rule for future repair

Implement one explicit domain helper/mutation for the plan's checkpoint invariant:

```text
resolve lazy condition at nowDays
→ persist resolved condition
→ set anchor = nowDays
→ then apply explicit delta/mutation
```

Even though `world-020` has no repair action yet, `world-021` depends on this rule. Do not let future callers directly mutate stale stored `roofCondition` or camp condition without advancing the anchor, otherwise elapsed weather wear is lost or counted twice.

Keep `condition = 0` as a valid existing roof with zero protection; do not remove/swap/collapse the mesh or turn the well back into a construction stage.

## Persistence and migration

Extend `SavePlayerWell` in `src/persistence/saveData.ts`; `SaveData` already stores global `elapsedDays`, so migration of legacy wells can use that as the non-retroactive anchor.

Migration policy:

- completed roof in an old save → roof condition `100`, anchor = saved `elapsedDays`;
- pit / well body / unfinished roof → no roof condition state;
- never infer historical degradation for legacy saves.

Update current-schema validation, migration tests and any fixtures containing `SavePlayerWell`. `buildSaveData()` already spreads `playerWells.nodes()`, so once the runtime snapshot is correct it should not need separate well-specific serialization math.

## Tests with highest value

- shared condition clamp/delta and resolver boundary cases (`nowDays <= anchor`, negative/overflow values);
- sleeping-utility regression tests proving unchanged results after extraction, including post-018 shelter-factor behavior;
- `computeSnowExposureDays()` parity with rain-style cycle/overlap behavior;
- roof condition absent during unfinished `roof` stage, initialized exactly once on completion;
- well roof `100 / 50 / 0` produces respectively `0 / 50% / 100%` of the existing uncovered-well risk chance;
- long elapsed/time-skip does not undercount passive decay because of bounded weather lookback;
- `PlayerWells.nodes()` + rebuild round-trip preserves roof state;
- save/load migration: legacy completed roof starts at `100` with saved `elapsedDays` anchor, unfinished roofs remain without condition.

## Suggested implementation order

1. Verify the landed `items-player-018` contracts and regression tests.
2. Extract `condition.ts` primitives and snow exposure; migrate camp without gameplay changes.
3. Add well roof state + exact completion initialization + runtime snapshot preservation.
4. Add well-domain lazy resolver and factor-based existing `consumptionRisk` integration.
5. Add save-schema migration/validation/tests.
6. Add checkpoint helper/invariant needed by `world-021`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
