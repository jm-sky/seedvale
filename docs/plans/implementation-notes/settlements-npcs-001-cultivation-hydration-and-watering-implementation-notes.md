# Plan: Cultivation Hydration & Watering — Implementation Notes

**Created:** 2026-08-25
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** ~~174~~ ~~126~~ ~~176~~
**Domain:** `settlements-npcs`

## Review verdict

Plan 001 fits the current architecture, but should be implemented against the actual code rather than its generic terminology.

The current authoritative cultivation object is `PlayerGardenRecord` in `src/world/playerGarden.ts`. It already owns `care` and `lastMaintainedAtDays` and uses lazy resolution. Hydration should extend this same record. Do not introduce `CultivationHydrationRegistry`, `WateringManager` or a second farming state store.

Current important boundaries:

- `src/world/playerGarden.ts` is the shared cultivation/maintenance domain.
- `src/world/cropLifecycle.ts` currently models **natural/wild** crops. Do not add hydration to `CropPlacement` or make the lifecycle farming-specific.
- `src/world/plantedCrops.ts` contains planted-crop placement/save helpers; use the planted-crop contract established by plan 126 rather than creating another one.
- `src/world/WaterSource.ts` is already the shared water-source abstraction.
- Player timed actions use the existing `busy`/action-context system.
- `NpcAgent` already uses generic `PlannedAction`/`ActionLifecycle` and decision/strategy systems.

## 1. Hydration state

Extend `PlayerGardenRecord` with the minimum state required by the plan, e.g.:

```ts
hydration: number
lastHydrationUpdateAtDays: number
```

Keep hydration and care as independent site state:

```text
PlayerGardenRecord
├── care
├── lastMaintainedAtDays
├── hydration
└── lastHydrationUpdateAtDays
```

Use pure/lazy functions analogous to `resolveCultivationCare()`.

Before every hydration mutation:

```text
stored hydration
  → elapsed time + deterministic rain
  → resolved hydration
  → watering/rain update
  → new hydration + timestamp
```

Never simply add `+40` to stale stored hydration.

## 2. Rain integration

`src/world/weather.ts` is deterministic from `(seed, elapsedDays)` and exposes `WeatherState.type` and `intensity`. There is no weather history to persist/replay.

Do not add farming-specific weather state, listeners or a rain manager.

Rain contribution must be resolved lazily from the existing weather generator. Do not iterate through an arbitrarily long time skip cycle-by-cycle. Hydration is bounded to `0..100` and drying is `20/day`, so the implementation needs a bounded strategy for old intervals while remaining deterministic.

Keep the complete rain integration in one pure cultivation-hydration resolver so player, NPC, save/load and tests use identical semantics.

If weather needs a generic interval helper, extend `weather.ts`; do not duplicate its cycle logic in farming code.

## 3. Crop lifecycle boundary

Current `src/world/cropLifecycle.ts` provides `CropGrowthStage`, `CropDefinition`, `resolveCropStage()` and `resolveCropHarvest()`. It is intentionally lazy and currently serves natural crops.

Hydration must be a cultivation-site condition, not a second crop lifecycle:

```text
crop lifecycle → stage
cultivation site → hydration/stress
                    ↓
               planted crop result
```

Do not create `HydratedCropLifecycle` or modify natural crop timing globally.

For planted crops, integrate hydration at the existing plan-126 harvest/growth boundary.

## 4. Drought stress

Prefer deriving drought stress from the cultivation hydration state rather than ticking it every hour/frame.

The important design check is persistence: current hydration + one update timestamp may not be enough to reconstruct how long hydration stayed below 30% once deterministic rain is involved. If necessary, persist the **smallest additional anchor/value** that makes stress deterministic. Do not store a hydration/rain event history.

Rules remain:

```text
hydration = 0      → crop dies
0 < hydration < 30 → growth paused + stress
hydration >= 30     → normal growth
```

`0%` must be handled before yield calculation.

Drought stress affects final planted-crop yield only; it must not silently change `young → mature → spoiled` timing in v1.

## 5. Yield and weeds

Current crop yields are integer counts (`CropDefinition.yieldCount`). Apply the drought modifier at one authoritative harvest/productivity boundary and define deterministic rounding there.

Do not modify `resolveCropHarvest()` in a way that changes wild crop behaviour unless the API is explicitly generalized without coupling it to cultivation.

Hydration-based weed pressure should reuse the existing cultivation/maintenance concept from plan 176. Keep:

```text
care      → maintenance
hydration → water availability / weed pressure
```

Watering must not increase `care`; maintenance must not increase hydration.

## 6. Container: reuse existing waterskin system

The plan says `bucket`, but the code already has `waterskin_empty` and `waterskin_full` in `ItemKind`, and `createSurvivalActions().fillWaterskin()` already implements empty→full using `WaterSource`.

Do **not** automatically introduce `bucket_empty`/`bucket_full`. First reuse/generalize the existing container path. A new item pair is justified only if the current item model genuinely cannot represent the intended gameplay.

Do not create `WateringContainer` or another equipment system.

The current fill action is instant. Do not create a second fill mechanism merely to satisfy wording in the plan; if timing is required, extend the existing fill action consistently.

## 7. Player watering action

Use the existing busy/action lifecycle:

```text
validate site + full container
→ start busy action
→ completion revalidates site/container
→ resolve hydration
→ +40, clamped
→ consume container
```

If interrupted before completion:

```text
hydration unchanged
container unchanged
```

Apply the mutation only on successful completion. Do not add timers to `PlayerGardenRecord` or `gameLoop.ts`.

The interaction target must be the real persistent garden record, not decorative crop meshes or a global crop scan.

## 8. NPC watering

`NpcAgent` already imports `CARE_MAINTAINED_THRESHOLD` from `playerGarden.ts`, so NPCs already consume the shared cultivation domain.

Follow the same pattern for hydration:

```text
NPC already at cultivation/work context
→ resolve hydration
→ low hydration pressure
→ existing decision/strategy scoring
→ existing PlannedAction/ActionLifecycle
```

Do not implement global `NPC → all gardens` searches and do not create `WateringAI`, `FarmAI`, `GardenAI` or `IrrigationManager`.

Use the generic NPC `Inventory` if carrying a water container is needed. Do not add `NpcHeldWater` or another NPC inventory.

If NPCs cannot yet fill a container through the existing action/resource contracts, extend those generic contracts rather than directly mutating hydration.

## 9. Persistence and world rebuild

Hydration belongs in the same persistence path as `PlayerGardenRecord` and must survive:

- save/load;
- time skip;
- chunk unload/load;
- `WorldBundle` rebuild.

The current save schema is v1/hard-cut per `docs/STATE.md`; do not invent a migration layer unless the actual save code requires it.

No second hydration persistence store.

## 10. Performance

Mandatory:

- no per-frame hydration tick;
- no global garden scan on rain;
- no global NPC→garden scan;
- no worker;
- no `WateringManager`;
- no farming-specific weather simulation;
- lazy deterministic resolution.

## 11. Tests

Focus first on pure domain functions:

- drying and `0..100` clamp;
- watering `+40`;
- deterministic rain/intensity contribution;
- long time-skip/bounded resolution;
- `0%` death;
- `<30%` growth pause;
- drought-stress thresholds and `-50%` cap;
- deterministic yield rounding;
- weed pressure by hydration;
- container empty/full transition;
- interrupted watering;
- save/load and world rebuild.

## 12. Files to reuse

- `src/world/playerGarden.ts` — cultivation record + lazy care model.
- `src/world/cropLifecycle.ts` — existing crop lifecycle.
- `src/world/plantedCrops.ts` — planted crop placement/save helpers.
- `src/world/WaterSource.ts` — shared water abstraction.
- `src/world/weather.ts` — deterministic climate/rain.
- `src/app/actions/survivalActions.ts` — existing container/water actions.
- `src/items/items.ts` — existing waterskin item kinds.
- `src/items/itemCatalog.ts` — central item metadata/capabilities.
- `src/ai/NpcAgent.ts` — NPC decision/action integration.
- `src/simulation/` — generic action lifecycle contracts.
- `src/persistence/saveData.ts` — save schema and garden persistence wiring.

## Main implementation trap

The biggest risk is implementing the plan literally as a new farming subsystem. The existing seams are already sufficient:

```text
PlayerGardenRecord + hydration
        ↓
planted crop integration
        ↓
existing crop lifecycle / harvest

WaterSource
        ↓
existing Inventory/container actions

NpcAgent
        ↓
existing decision + PlannedAction/ActionLifecycle

WeatherState
        ↓
deterministic lazy hydration resolution
```

Extend these systems; do not create parallel mechanisms.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
