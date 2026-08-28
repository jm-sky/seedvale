# Plan: Cultivation Hydration & Watering — Implementation Notes

**Created:** 2026-08-28
**Status:** `verification needed` 🔍
**Priority:** medium · **Effort:** M
**Depends on:** ~~174~~ ~~126~~ ~~176~~
**Domain:** `settlements-npcs`

## Review verdict

Plan 001 is compatible with the current architecture, but parts of its terminology are now stale.

All listed dependencies are already implemented. The authoritative cultivation object is **`PlayerGardenRecord`** in `src/world/playerGarden.ts`; it already owns `care` and lazy maintenance state. Hydration belongs on this same record.

Do **not** introduce a farming registry, `WateringManager`, irrigation service, separate hydration store or farming-specific weather system.

## 1. Current implementation seams to extend

Use these existing owners:

- `src/world/playerGarden.ts` — persistent player cultivation record, nearest-garden query, lazy `care` resolution and cultivation yield modifier.
- `src/world/plantedCrops.ts` — planted-crop placement/save contract from plan 126.
- `src/world/cropLifecycle.ts` — existing lazy crop stage/harvest rules. It currently also serves natural crops; do not make the whole lifecycle hydration-aware.
- `src/world/weather.ts` — deterministic weather from `(seed, elapsedDays)`; `computeWeather()` exposes rain type/intensity.
- `src/world/WaterSource.ts` — shared well/lake water abstraction.
- `src/items/itemInstances.ts` + `src/items/liquidContainer.ts` — current per-instance liquid-container model.
- `src/app/actions/survivalActions.ts` — existing player water-source/container action path.
- `src/ai/NpcAgent.ts` + `src/simulation/` — existing NPC decision/action lifecycle.
- `src/persistence/saveData.ts` — canonical save-v1 validation and garden persistence.
- `WorldBundle` / garden runtime wiring — preserve the existing authoritative garden state across rebuilds; runtime meshes must remain projections.

## 2. Hydration state

Extend `PlayerGardenRecord`, not a parallel object:

```ts
hydration: number
lastHydrationUpdateAtDays: number
```

Keep:

```
PlayerGardenRecord
├── care
├── lastMaintainedAtDays
├── hydration
└── lastHydrationUpdateAtDays
```

Use the same lazy/pure pattern as `resolveCultivationCare()`.

Every mutation must first resolve the stale value:

```
stored hydration
→ elapsed world time / rain
→ current hydration
→ watering or other contribution
→ new hydration + timestamp
```

Clamp centrally to `0..100`.

Do not tick hydration from `gameLoop.ts`, render frames or chunk updates.

## 3. Rain: important architectural constraint

`WeatherState` is **global and deterministic**, not spatial. There is currently no per-location rainfall field. Therefore v1 should not invent one.

Rain contribution should be resolved from `computeWeather(seed, elapsedDays, ...)` / existing climate functions and remain deterministic across time-skip/save-load.

The difficult part is long gaps between hydration resolutions: replaying every 0.3-day weather cycle since the last update can become unbounded. Do not blindly implement a cycle loop proportional to world age.

Prefer a bounded, deterministic interval resolver analogous to `computeSurfaceWeather()`. If exact historical rain accumulation cannot be reconstructed cheaply, define the bounded rain lookback explicitly in the hydration domain and keep it centralized/tested. Do not silently approximate in individual callers.

Also keep drying deterministic: `-20 hydration/world day`.

## 4. Crop lifecycle boundary

Hydration is a **cultivation-site condition**, not another crop lifecycle.

Use:

```
crop lifecycle → stage
cultivation site → hydration + drought stress
                       ↓
                 planted crop result
```

Do not change natural crop behaviour globally.

For planted crops, integrate hydration at the existing plan-126/harvest boundary. The current planted crop record contains only `id/x/z/cropId/stageStartedAt`; do not duplicate hydration per crop when the plan explicitly makes hydration site-owned.

Important consequence: a garden can exist without a planted crop, and hydration must still resolve correctly.

## 5. Drought stress needs an explicit anchor

The plan's two-field hydration state is sufficient for drying, but **not necessarily sufficient for exact drought-stress reconstruction** when hydration crosses below/above 30% multiple times because of rain.

Do not store a full history.

Use the smallest additional persisted anchor required by the chosen resolver, e.g. accumulated sub-30% duration / last stress anchor. Make the state deterministic and reset it when the crop lifecycle for that cultivation site is reset/harvested.

Rules:

- `0%` → crop dies; resolve before harvest yield.
- `1..29%` → growth paused and drought stress accumulates.
- `>=30%` → normal growth and no further stress accumulation.
- Rewatering does **not** erase already accumulated stress.
- Stress caps at `-50%`.

Do not make hydration alter `young → mature → spoiled` timing in v1.

## 6. Yield integration

Current `CropDefinition.yieldCount` is an integer and current crop harvest resolution is shared with natural crops.

Do not change `resolveCropHarvest()` so that wild crops acquire cultivation rules.

Instead, apply the drought modifier in the existing planted-crop/cultivation productivity boundary, together with the already-existing `cultivationYieldCount()` care modifier.

There must be one deterministic rounding point. Avoid applying care and drought percentages in separate integer-rounding steps.

A crop at `0%` must be treated as dead, not as a zero-yield mature crop.

## 7. Weeds / care

Reuse the existing maintenance model from plan 176.

Keep the ownership split:

```
care      → maintenance state / existing cultivation yield modifier
hydration → water availability / weed pressure / drought
```

Watering must not increase `care`; maintenance must not increase hydration.

Do not create a second weed lifecycle. If the current weed representation is only pressure/maintenance state, extend that calculation rather than introducing another persistent simulation.

## 8. Containers: plan wording is stale

The plan says `bucket` as if empty/full were separate item kinds. That is no longer the current model.

Plan items-player-001 already introduced:

- `wooden_bucket` — 10 L, water or milk;
- `copper_bucket` — 10 L, water or milk;
- waterskin instances with 2/5/10 L capacities.

Liquid state is an **item instance**:

```LiquidContainerItemInstance
→ liquid
→ amountLitres
```

Use `liquidContainer.ts` domain operations and `Inventory.updateInstance()`.

Do not add `bucket_empty` / `bucket_full` unless a concrete current-system limitation proves that the instance model cannot support the interaction.

The plan's "1 charge → 1 watering" should be adapted to the current model. The cleanest interpretation is **one watering consumes one litre**, leaving the physical container partially filled. Do not throw away the remaining 9 L of a full bucket.

If v1 intentionally wants one full bucket to equal one watering despite its 10 L capacity, that needs an explicit design decision before implementation; otherwise it contradicts the existing liquid-container semantics.

## 9. Player water actions

Reuse the existing `WaterSource` + liquid-container action path in `survivalActions.ts`.

The current liquid-container fill operation is instant. Do not create a parallel timed fill system just because the old plan described a timed action.

For watering, use the existing busy/action context if a timed player interaction is introduced:

```
validate garden + usable water container
→ start existing busy action
→ completion revalidates
→ resolve hydration
→ apply watering amount
→ update container instance
```

Mutation happens only on successful completion. Interrupted actions leave both garden and container unchanged.

Do not mutate hydration at interaction-start.

## 10. NPC watering

`NpcAgent` already consumes cultivation information (including `CARE_MAINTAINED_THRESHOLD`) and already has the generic decision/action machinery.

Add watering as another strategy/action in that flow, not a special AI subsystem.

Prefer local context already available to the NPC (settlement garden / relevant cultivation source) rather than:

```
for every NPC
  scan every garden
```

If NPCs need to carry water, use their existing generic `Inventory` and the same liquid-container instances. If filling/using a container requires a missing generic action seam, extend that seam rather than directly changing garden hydration from NPC code.

The NPC should not bypass the action lifecycle by calling a garden hydration mutator directly from decision code.

## 11. Persistence and rebuild

Save v1 is a hard-cut schema. Adding hydration fields therefore requires updating the normal `SaveData` shape, serializer/restore wiring and `isSaveData()` validation. Do not add a migration layer.

Hydration must survive:

- save/load;
- time skip;
- world rebuild;
- garden runtime reconstruction.

Chunk unload/load should reconstruct the garden from authoritative state; hydration must not live only on the rendered garden/crop mesh.

Do not persist weather history.

## 12. Interaction / rendering

The interaction target must be the actual garden record / cultivation domain object, not a decorative crop mesh and not a global crop search.

If hydration status is exposed in UI or debug text, resolve it lazily at read time. Do not maintain a second cached percentage unless there is an existing rendering cache that can safely be derived from authoritative state.

No new asset is required by this plan.

## 13. Performance

Keep the implementation:

- lazy;
- deterministic;
- data-only where possible;
- independent of render frame rate.

Avoid:

- per-frame hydration updates;
- global garden scans during rain;
- global NPC→garden scans;
- new worker;
- `WateringManager`;
- farming-specific weather state;
- history arrays of rain/watering events.

The number of cultivation sites may grow, so any resolver should be O(1) or bounded by a small deterministic interval, not proportional to world age.

## 14. Tests worth writing

Prioritize pure domain tests:

- hydration drying;
- `0..100` clamp;
- watering amount;
- deterministic rain contribution;
- long time-skip / bounded rain resolution;
- crossing the 30% threshold;
- `0%` crop death;
- drought-stress accumulation/reset/cap;
- deterministic final yield rounding with care + drought;
- hydration-based weed pressure;
- liquid-container fill/consume/empty semantics;
- interrupted watering;
- save validation/round-trip;
- world rebuild continuity.

Do not duplicate existing liquid-container tests unless the new watering path exposes a new invariant.

## 15. Main traps

1. **Do not build a new farming subsystem.** `PlayerGardenRecord` is already the cultivation owner.
2. **Do not make `cropLifecycle.ts` farming-specific.** Natural crops use it too.
3. **Do not model current buckets as empty/full item kinds.** The repository now uses liquid-container instances.
4. **Do not consume an entire 10 L bucket for one watering without an explicit design decision.**
5. **Do not replay unbounded weather history on save/load/time-skip.**
6. **Do not assume rainfall is spatially varying.** Current weather is global.
7. **Do not calculate drought stress from only the final hydration value if rain can cross the threshold during the elapsed interval.**
8. **Do not let care and hydration mutate each other.**
9. **Do not bypass `NpcAgent`'s existing decision/action lifecycle.**

## 16. Relevant current files

- `src/world/playerGarden.ts`
- `src/world/plantedCrops.ts`
- `src/world/cropLifecycle.ts`
- `src/world/weather.ts`
- `src/world/WaterSource.ts`
- `src/items/itemInstances.ts`
- `src/items/liquidContainer.ts`
- `src/items/itemCatalog.ts`
- `src/app/actions/survivalActions.ts`
- `src/ai/NpcAgent.ts`
- `src/simulation/`
- `src/persistence/saveData.ts`
- `src/app/worldBundle.ts`

## 17. Implementation summary (2026-08-28)

Implemented on `PlayerGardenRecord` (`src/world/playerGarden.ts`), exactly as
this document prescribed. Technically verified (`tsc`, lint, full test
suite, build); browser/gameplay verification is still open (plan §19).

Notable deviations/clarifications made during implementation:

- **Watering consumes 1 litre**, not a whole container (§8 concern resolved
  in favor of the liquid-container model): `WATERING_LITRES = 1`,
  `WATERING_HYDRATION_GAIN = 40` — a full 10 l bucket is 10 waterings.
  `placementActions.ts`'s `waterGardenPlot` fills from any carried
  `wooden_bucket`/`copper_bucket`/waterskin holding water via
  `items/liquidContainer.ts`'s new `hasLiquidContent()`.
- **Rain resolution** reuses `world/weather.ts`'s exported `WEATHER_CYCLE_DAYS`
  + `computeWeather`/`getSeason` inside a new bounded-window step loop
  (`resolveGardenHydration`, `HYDRATION_SIM_WINDOW_DAYS = 5` — the number of
  days for natural drying alone to fully overwrite any stored value). A gap
  larger than the window replays from `hydration = 0` /
  `droughtStressDays = DROUGHT_STRESS_CAP_DAYS` instead of an unbounded walk.
- **Drought stress anchor**: `droughtStressDays` (world-days spent below 30%,
  capped at `DROUGHT_STRESS_CAP_DAYS = 1.25` = 30h) is accumulated inside the
  same bounded step loop that resolves hydration, so no separate history is
  stored. It resets to `0` only via `PlayerGardens.recordHarvest()`, called
  from both the player (`gatheringActions.ts`) and NPC (`foodSources.ts`)
  harvest boundaries, right where `cultivationYieldCount()` already applies
  the `care` multiplier — both percentages combine before the one rounding
  step (plan §7).
- **0% hydration** is checked as a hard override at the same harvest boundary
  (`cultivationYieldCount(..., hydrationDead)`) — always yields `0`
  regardless of `care`/drought stress, never a "zero-yield mature crop".
- **Growth pause (1-29%) is not implemented as a literal `CropLifecycle`
  freeze** — per this document's §4/§5, hydration stays a cultivation-site
  condition and `cropLifecycle.ts`'s pure `(seed, worldDays)` stage function
  is untouched. The only mechanical consequence of low hydration in v1 is the
  accumulating drought-stress yield penalty; "growth paused" is not otherwise
  observable.
- **Weeds** are not a new tracked state. `resolveCultivationCare()`'s existing
  decay rate is scaled by a `weedGrowthMultiplier(hydration)` tier (plan §8's
  four thresholds), read from the record's last-persisted hydration snapshot
  (not a continuously re-integrated value, to keep care resolution a single
  closed-form formula rather than a second weather walk).
- **NPC watering** (`NpcAgent.maybeWaterNearbyGarden`) mirrors the existing
  `maybeMaintainNearbyGarden` exactly, including going through `foodSources`
  hooks from inside the harvest action's `onComplete` (never bypassing the
  action lifecycle) and, like NPC maintenance, not requiring the NPC to carry
  a water item — consistent with the existing precedent rather than building
  new NPC container-carrying logic.
- `PlayerGardens` (`createPlayerGardens.ts`) now takes `seed` as a
  constructor parameter (from `worldBundle.ts`'s `config.seed`) so hydration
  resolution stays encapsulated there; no other module threads `seed`
  through for this feature.
- Save v1 hard-cut, as expected: `SavePlayerGarden` gained the three new
  required fields with no migration path.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
