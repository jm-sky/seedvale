# Plan 203 — Well Depth, Groundwater & Well Protection — Implementation Notes

**Reviewed:** 2026-08-24  
**Status:** `planned` 📋  
**Scope:** current-codebase review; implementation guidance only.

## 1. Review verdict

Plan 203 is still a valid extension of plan 127, but several details must follow the **current** well implementation rather than the original plan wording.

`PlayerWell` already owns staged construction (`pit → well → roof`), active-work progress, capability gating, persistence and NPC lookup. Extend that model; do not introduce another well manager/source type. fileciteturn4file0L2-L2

The important new persistent state is the **resolved underground water result**. It must be generated once when the well is placed and then round-trip through `PlayerWellRecord`/`SavePlayerWell`; otherwise chunk rebuild/load can change a well's water depth.

## 2. Existing systems to reuse

### Player well

Use:

- `src/world/playerWell.ts` — domain record/stage rules;
- `src/world/createPlayerWells.ts` — world-object lifetime, mesh/collider and persistence restoration;
- `src/app/actions/placementActions.ts` — active work sessions and capability/material validation;
- `src/app/worldBundle.ts` / save wiring — rebuild lifetime;
- `src/app/interactables.ts` / interaction wiring — completed-well interaction.

`createPlayerWells()` currently creates a stable record, adds active-work progress and swaps stage meshes; `nearestCompleted()` exposes only completed wells to NPC water fetching. Do not duplicate these behaviours. fileciteturn5file0L2-L2

### WaterSource

`src/world/WaterSource.ts` is deliberately a small data-only shared abstraction. It currently has `kind: 'well' | 'lake'` and `quality: 'safe' | 'unsafe'`; mutation of inventory/needs happens elsewhere. Extend this contract instead of adding `WellWaterSource`. fileciteturn2file0L2-L2

### Capabilities

`ItemCapability` already has `soil_digging` and `rock_mining`, with capability-based inventory checks. The well code already uses `soil_digging` for the pit. For deep excavation, require the additional existing capability rather than checking `ItemKind` directly. fileciteturn7file0L2-L2

## 3. Current mismatch: plan says `pit` is depth-dependent, code already has fixed active-work hours

`WELL_STAGE_WORK_HOURS.pit` is currently `2`, while `well` and `roof` are fixed at `1`. The implementation should replace only the fixed `pit` requirement with a function of the resolved well depth. Keep the existing active-work model: progress is accumulated by repeated work sessions, not by an elapsed timer. fileciteturn4file0L2-L2

Prefer a pure function such as:

```text
getWellPitWorkHours(depth) → hours
```

and keep `well`/`roof` unchanged. Do not introduce `stageStartedAt` or another world-time timer.

## 4. Groundwater model

Do not create a hydrology simulation. The result should be a deterministic **placement-time classification**:

```text
terrain height + seed + stable (x,z)
        ↓
base groundwater depth
        ↓
deterministic underground anomaly roll
        ↓
water source kind + depth
```

The base rule should be monotonic and bounded: higher terrain should generally require deeper wells relative to the chosen groundwater reference level. Keep the formula centralized in a small pure domain module/function so tuning does not leak into placement/UI code.

Underground reservoirs/streams should be sparse deterministic anomalies, not runtime entities. Use the existing world seed and a stable coordinate-derived hash/random helper if one exists; do **not** call `Math.random()` during placement. The same `(seed,x,z)` must always produce the same result.

Do not regenerate the anomaly when a chunk streams back in. Once the well exists, its resolved result becomes part of the well record.

## 5. Persistence model

Current `PlayerWellRecord` contains only `id/x/z/yaw/stage/workProgress`, and `SavePlayerWell` mirrors that shape. The plan's new result therefore requires an explicit schema extension. `WaterSource` itself should remain derived/runtime data. fileciteturn10file0L2-L2

Recommended persisted fields are minimal, e.g.:

```text
waterDepth
waterKind: groundwater | reservoir | underground_stream
```

If the calculation also needs a stable anomaly parameter, persist the final resolved result rather than the random seed/roll. Do not persist duplicated derived values such as terrain height.

Because the repository currently uses a hard-cut save schema v1, follow the current save conventions rather than designing a migration system just for this feature. Existing `SavePlayerWell` is the authoritative persisted representation. fileciteturn10file0L2-L2

## 6. Important `WaterSource` pitfall

Do **not** implement the new uncovered-well HP/Vigor effect by simply treating every `quality: 'unsafe'` source as the new effect. `WaterSource` already marks lakes as `unsafe`, while its current warning explicitly says no illness system exists. fileciteturn2file0L2-L2

The uncovered-well effect needs a distinct source property, preferably a small generic health-risk/consumption-effect field that can later support water quality. Keep it optional so existing lakes retain their current behaviour until the broader health system exists.

The desired current rule is:

```text
uncovered player well
→ 50% deterministic/random consumption roll
→ -1..2 HP + -5 Vigor

roofed well
→ no such effect
```

The roll should happen **when water is consumed**, not when the well is built or when the water is collected. Do not add `WellHealthSystem`.

## 7. Rope

Repository search does not show an existing `rope` implementation. Treat this as a real new `ItemKind`, not as hidden well state.

Add it through the normal item pipeline (`ItemKind`/`ITEM_DEFS`/`ITEM_CATALOG`, inventory and any intended spawn/acquisition path). Do not add `WellRope` or a boolean special resource outside `Inventory`.

The deep-well threshold should be a single named constant/function shared by:

- capability requirements;
- rope requirement;
- UI/interaction messaging;
- gameplay validation.

Do not consume the rope unless the design explicitly decides that using the deep well consumes it; the current plan only says it is **needed to use** a deep well, so default to an ordinary inventory possession requirement.

## 8. Capability rules

The current well implementation already defines:

```text
pit → soil_digging
well → no capability
roof → no capability
```

For 203, extend the pit requirement by depth rather than replacing the existing capability system. A reasonable shape is:

```text
all pits → soil_digging
beyond deep threshold → soil_digging + rock_mining
```

`Inventory.hasCapability()` / the existing capability-resolution path should remain the only way to answer whether the player has a suitable tool. Never write `kind === 'shovel'` / `kind === 'pickaxe'` checks into the well code. The catalog already exists specifically to prevent this duplication. fileciteturn7file0L2-L2

## 9. Construction vs. usage

Keep these concerns separate:

```text
construction
  pit → depth/work/capabilities
  well → existing materials
  roof → existing materials

usage
  completed well → WaterSource
  deep well → rope requirement
  uncovered well → consumption health-risk
```

Do not make the roof mandatory for `WaterSource`: current `isWellCompleted()` defines completion as the roof stage being finished, so 203 needs to distinguish **water-body activation** from the current “fully completed construction” concept. The simplest approach is to expose a completed body/source state after `well` is finished while retaining `roof` as the final construction stage.

This is an important change to the existing `nearestCompleted()` semantics: NPCs should eventually be able to see a roofless working well, so do not blindly keep using a `roof`-complete predicate for all water-source queries.

## 10. NPC integration

Do not add NPC-specific well logic. `NpcAgent` already has the `NearbyPlayerWellLookup` seam and the current implementation uses completed player wells as a water-fetch destination. fileciteturn3file16L81-L86

For 203, expose the new well properties through the same `WaterSource`/source-query abstraction. Future source scoring can then use:

```text
position
availability
quality / health risk
```

without checking `if playerWell` in decision code.

Do not implement the full NPC source-selection model from the plan yet. Only ensure the new well state is represented in the shared source contract so later decisions can distinguish safe/unsafe sources.

## 11. World placement and chunk lifecycle

A player-built well is a persistent world object, not a terrain-generated feature. Keep the existing `createPlayerWells()` ownership/lifetime pattern and restore the resolved water result from the save record. fileciteturn5file0L2-L2

The placement-time groundwater calculation should use the same terrain-height source already available to well placement (`HeightSampler`). Do not scan terrain chunks or perform geological calculations continuously.

For placement preview, calculation is optional. If previewing depth is expensive or awkward, calculate only on placement and show the result after placement.

## 12. Potential issue: `isWellCompleted()` semantics

The current code explicitly defines a completed `WaterSource` only when `stage === 'roof'` and the roof work is complete. That conflicts with 203's requirement that `well` without a roof is already a usable water source. fileciteturn4file0L2-L2

Do not overload `isWellCompleted()` to mean both:

- construction fully finished;
- water source available.

Introduce a separate predicate with explicit semantics, e.g. `isWellWaterAvailable(record)`, where `stage === 'well'` with completed body work is sufficient. Keep `isWellCompleted()` as the full-construction predicate unless the surrounding code strongly benefits from renaming it consistently.

This also avoids accidentally making roofless wells invisible to NPC water lookup.

## 13. Consumption effect and shared needs

The current architecture already has shared `HealthState` and player `PlayerNeeds`/Vigor state. The plan explicitly says not to create a parallel illness system. Apply the effect at the existing water-consumption mutation boundary so player and future NPC consumption can reuse the same source property.

Be careful with `Vigor`: the player and NPC vigor models are related but not identical. Do not put player-specific mutation into `WaterSource`; it should describe the consequence, while the consuming actor applies it through its existing state API.

## 14. Tests worth adding

Focus on pure/domain behaviour rather than Three.js:

- same seed + same placement → same water kind/depth;
- different elevations produce sensible bounded depth differences;
- anomaly roll can produce reservoir/stream results but remains deterministic;
- persisted result is identical after restore;
- pit work hours increase with depth;
- shallow pit requires `soil_digging` only;
- deep pit additionally requires `rock_mining`;
- deep well requires rope for use;
- body-complete roofless well is a water source;
- roofless well carries the consumption risk, roofed well does not;
- lake `unsafe` status does not accidentally acquire the new HP/Vigor effect;
- NPC source lookup can see a body-complete roofless well.

## 15. Implementation order

1. Trace current well placement/work/interaction/save wiring before editing.
2. Add the pure deterministic groundwater resolver and tests.
3. Extend `PlayerWellRecord`/`SavePlayerWell` with the minimal resolved result.
4. Replace fixed pit work with the depth function.
5. Extend depth-based capability validation using existing `soil_digging`/`rock_mining`.
6. Add `rope` through the normal item system.
7. Split water-available vs fully-built well semantics.
8. Extend `WaterSource` with the minimal optional consumption-risk data.
9. Apply the effect at the existing water-consumption mutation boundary.
10. Extend the existing NPC water-source adapter without adding a new NPC subsystem.
11. Run technical checks and then the targeted gameplay scenarios from plan 203.

## 16. Main pitfalls

- Do not recompute groundwater on chunk load.
- Do not use `Math.random()` for a persistent well's source.
- Do not create a second well/groundwater manager.
- Do not check concrete tool kinds; use capabilities.
- Do not make the roof mandatory for water availability.
- Do not use `WaterQuality = 'unsafe'` as a synonym for the new HP/Vigor effect.
- Do not put actor-specific HP/Vigor mutation into `WaterSource`.
- Do not persist terrain height or other values that can be derived safely.
- Do not add a full disease/contamination system under this plan.
- Do not broaden this into full NPC water-source decision making.

**Zrób git commit i push do main, rebase jeżeli trzeba**
