# Plan: Terrain Modification & Land Preparation — Implementation Notes

**Created:** 2026-08-24  
**Status:** `verification needed` 🔍

## Implementation summary (2026-08-24)

Implemented per plan, following this file's recommended order. Key decisions worth recording for a future session:

- **Long-running work primitive**: reused `world/timeSkip.ts` (the same "wait"/"sleep" mechanism), not the well-style repeated-`busy`-bout pattern. `world/timeSkip.ts` already exposes a per-frame `progress()` fraction while active, which is exactly what continuous progressive deformation needs; the well pattern doesn't animate visually between bouts. A new `app/actions/terrainPreparationActions.ts` module owns a local `activeWork` pointer (mirroring `restActions.ts`'s `pendingRest`/`pendingLodgingQuality` pattern) so it recognizes "this finished skip is mine" without any change to `TimeSkip`'s public contract.
- **`requiredWork`/`hours` relationship**: `requiredWork` is expressed in "hours at base tool speed"; `hours = remaining / toolMultiplier` is what's actually passed to `timeSkip.start()`. This keeps `completedWork = requiredWork * timeSkip.progress()` exact and keeps a faster tool finish sooner (fewer real/game hours) without a second unit system.
- **New `ChunkManager.applyExactHeights(id, samples)`** — one new `TerrainModification` variant (`mode: 'prepare'`) reusing the existing `modifications` list/reapply-on-chunk-load pipeline, not a parallel terrain-mutation system. Used by both `Wyrównaj` (one-shot, fresh id per call) and active preparation work (same id, replaced every tick).
- **`Wyrównaj` eligibility simplified**: removed `canLevelAt`/`LevelEnv`/`LEVEL_EPS` (procedural-base-depression check) entirely — dead once the plan's new semantics don't compare against `sampleBaseHeight`. `Wyrównaj`/`Wykop skałę` are now offered under the exact same condition as the matching dig (`profile !== null`), not a second gate.
- **Esc/damage interruption**: added `terrainPrep.cancelActive()`/`interruptForDamage()` as a third link in the existing `abortRest → abortBusy` chain (`App.vue`'s Esc handler; `createApp.ts`'s `interruptLongActivityOnDamage` composite) — same pattern already used twice, not a new cancellation path. "Exhaustion/fatigue"/"hunger" interrupting work (plan §7) is *not* a new vigor-threshold mechanism — the player has none today (vigor only slows regen/gates sprint); severe/prolonged hunger or thirst already produces real HP loss (`playerDamage.ts`), which already reaches the same damage-interrupt entry point. This reuses what exists rather than inventing a parallel "low vigor forces X" system.
- **Persistence gap discovered, scoped out**: `ChunkManager`'s `modifications` list (dig/level/scorch marks) was never part of `SaveData` at all (confirmed in code, not just the doc comment) — a full save/load (app restart) already loses ordinary dig holes today, a pre-existing plan-052 scoping decision. This plan persists only the *active* `TerrainPreparationRecord` (immutable `originalHeights` + progress) and reconstructs its current terrain via `applyExactHeights` on load — satisfying the plan's own requirement — but does **not** retroactively fix general terrain-modification persistence; a *completed* preparation's baked shape reverts to procedural terrain after an app restart, same as an ordinary dig hole. Recorded in `LOOSE-ENDS.md`.
- **Preview aim**: this game has no free-moving cursor (pointer-locked FPS camera) — "grid following the mouse position" resolves the same way every other aimed action already does, from `mouseLook.state.yaw` at a fixed reach, not a screen-space raycast.
- **Not yet browser-verified** — see the plan's own Verification section; all listed technical checks (`tsc`, `lint`, `build`, `test`) pass, including new unit tests in `src/terrain/terrainPreparation.test.ts`.



## Review verdict

The plan fits the existing terrain architecture, but the **long-running preparation work is the main implementation seam that needs care**. Current shovel/level actions are short `busy` actions and mutate terrain only on completion; they do not provide the progress, time-skip, interruption/resume or persistence model required here. Do not extend `busyAction` into a second work system. Find and reuse the existing long-running/time-skip work pattern used by player systems.

The current terrain mutation path is already the right foundation: `groundActions.ts` validates tools/targets, `dig.ts` owns shovel/rock-ground rules, `digAction.ts` applies mutations, and `ChunkManager` owns terrain sampling/modification and chunk rebuild behaviour. fileciteturn12file0L2-L2 fileciteturn4file0L2-L2

## 1. Current code to extend

Start from these concrete boundaries:

- `src/app/actions/groundActions.ts` — existing `startDigAt`, `startLevelAt` and pickaxe variants. Add the new action here rather than another input/action path. Current level validation uses `canLevelAt()` and `isRockGround()`. fileciteturn12file0L2-L2
- `src/terrain/dig.ts` — current terrain classification and level eligibility. `isRockGround()` is already the canonical shovel-vs-rock distinction; reuse it for preparation's mountain/rocky requirement rather than inventing terrain types. fileciteturn4file0L2-L2
- `src/terrain/digAction.ts` — current mutation facade. Keep terrain mutation behind `ChunkManager`; do not write height samples directly from player actions. fileciteturn8file0L2-L2
- `src/terrain/chunkManager.ts` / `src/terrain/chunkHeightmap.ts` — authoritative terrain sampling, procedural base sampling, modified terrain and chunk rebuild/streaming. The terrain is worker-generated and streamed, so modified samples must continue through this existing ownership boundary. fileciteturn5file0L2-L2
- `src/app/busyAction.ts` — only suitable for short channels such as current dig/level. It has real-time `dt`, a completion callback and cancel, but no persisted progress or world-time advancement. Do not use it as the preparation state machine. fileciteturn15file0L2-L2
- `src/app/saveState.ts` + `src/persistence/saveData.ts` — SaveData is the canonical v1 schema and `saveState.ts` assembles it. Active preparation must be added through this existing save boundary, not through terrain-local storage. fileciteturn18file0L2-L2 fileciteturn21file0L1-L2

## 2. Important mismatch with the existing `Wyrównaj`

Current `applyLevelAt()` calls `ChunkManager.levelTerrain(x, z, DIG_RADIUS, DIG_DEPTH_SOIL)`, and `canLevelAt()` compares runtime height with **procedural base height**. The plan explicitly changes the semantics: level the nearest 3×3 terrain samples to the **central runtime sample**, never to `sampleBaseHeight`. Do not preserve the old eligibility/target semantics just because the action already exists. fileciteturn8file0L2-L2

Keep the existing single-action deformation limit for `Zrób górkę`; it should be the inverse of the current dig path, not a new deformation algorithm.

## 3. Terrain preparation state ownership

Introduce one small domain record only if no existing world-state module is a natural home. It should own the active preparation's deterministic state, for example:

```ts
id
center
size
targetHeight
originalHeights
requiredWork
completedWork
status
```

`originalHeights` must be the authoritative baseline for all later interpolation. Never reconstruct it from the current terrain after work has started.

Prefer a compact serializable data record over an `Object3D`, marker instance or terrain-chunk-owned state. The marker/visual is derived runtime state.

There should be **one active preparation identity and one lifecycle**, not separate player/action/terrain copies of progress.

## 4. Progressive deformation — critical detail

At start:

1. resolve the exact affected terrain samples from the world-space 2×2/3×3/4×4 area using the terrain system's existing sampling resolution;
2. capture their current heights once;
3. validate all samples;
4. calculate work;
5. only then create the active state.

On every meaningful progress update, derive every sample as:

```text
originalHeight + (targetHeight - originalHeight) * progress
```

Do **not** apply `deltaSinceLastTick` to the current sample. Accumulated deltas will drift after interruption/resume/save-load and make repeated updates non-deterministic.

The terrain mutation API should ideally receive the complete authoritative sample-height result for the preparation, or otherwise expose the smallest extension to `ChunkManager` needed to set the selected samples. Avoid repeatedly applying `modifyTerrain()` because its existing radius/depth operation is designed for local shovel deformation, not exact flat preparation.

## 5. World-space area vs terrain samples

The plan's 2×2/3×3/4×4 values are metres. The preview and validation must therefore first resolve a world-space rectangle, then collect the terrain samples covered by it using the current terrain resolution.

Do not interpret `2×2` as "2×2 samples". This distinction is important because terrain resolution/configuration can change independently of gameplay dimensions.

The grid is axis-aligned X/Z. No rotation state is needed in v1.

## 6. Validation must be atomic

Do all validation against the **original snapshot** before creating work:

- every affected sample is valid;
- existing water/terrain restrictions remain respected through existing world/terrain queries;
- every `abs(target - original) <= 3`;
- shovel capability exists;
- mountain/rocky area additionally requires pickaxe;
- tool capability/held-tool rules use `ITEM_CATALOG` / `hasItemCapability`, not item-kind checks;
- no partial preparation may be created when one sample fails.

The existing item catalog is already the central capability gate, and `groundActions.ts` demonstrates both inventory capability and held-tool capability usage. fileciteturn12file0L2-L2

## 7. Work model and tool bonuses

Use the plan's formula literally, but keep it in one pure function so it is testable:

```text
requiredWork = max(minimumWork, area * averageAbsHeightDelta * workScale)
```

`minimumWork` should be calibrated from the existing long-running work convention so that base speed equals one in-game hour. Do not introduce a new unit system.

Resolve equipped tools once for the active work step and apply the additive multiplier:

```text
1.00 / 1.05 / 1.10 / 1.15
```

The shovel is mandatory. Pickaxe is mandatory for the existing `isRockGround()` mountain/rock condition. Knife/pickaxe bonuses should not bypass the shovel requirement.

Add XP through `PlayerSkills`; do not add a new skill. Keep XP proportional to actual completed preparation work rather than granting the whole reward on start.

## 8. Long-running work: do not misuse `busyAction`

`busyAction` is explicitly a short real-time channel and currently completes only when its timer reaches zero. It cannot satisfy preparation's requirements for time acceleration, player-needs progression, fatigue/damage interruption, persistent progress and resume. fileciteturn15file0L2-L2

Find the existing player long-running/time-skip implementation and follow its ownership for:

- active work progress in in-game hours;
- time acceleration;
- player hunger/thirst/vigor/stamina updates;
- interruption conditions;
- `Esc` cancellation;
- resuming from stored progress.

If the existing mechanism has a generic "work for N hours" primitive, extend it. If it is domain-specific, reuse its underlying time/progress contracts rather than creating `TerrainPreparationWorkManager` plus a second clock.

## 9. Interruption semantics

There are two different cases that must not be confused:

- **work interruption:** keep the preparation record and current progress;
- **preparation completion:** apply exactly 100% and delete the preparation record.

`Esc`, exhaustion, hunger or damage must stop active work without resetting `completedWork` or `originalHeights`.

After interruption, the terrain already contains the last deterministic progress state. Resume must continue from the same `completedWork` value and recompute the same heights from the immutable originals.

## 10. Preview and marker

The preview is UI/runtime state only. Do not persist a preview mesh/grid.

The confirmed preparation marker is a persistent **world-state reference**, not the authoritative terrain state. It should contain/reference the preparation id and be reconstructed from saved preparation data after load/chunk rebuild.

Use the existing interaction/marker aggregation path. Do not create a `TerrainPreparationManager` solely to own markers if an existing world-marker mechanism can expose the record.

At 100%:

1. set all affected samples exactly to `targetHeight`;
2. trigger the normal terrain dirty/rebuild path;
3. remove the active preparation record;
4. remove its marker;
5. refresh relevant interaction availability.

There is no permanent `PreparedTerrain` state.

## 11. Persistence and terrain rebuild

Current SaveData v1 has no terrain-modification field and no active preparation field. Adding this feature therefore requires extending the canonical save schema and its runtime assembly/restore path; do not hide preparation state in `ChunkManager` or localStorage. fileciteturn20file0L2-L2

Persist enough information to reconstruct both:

```text
active preparation state
+
partially modified terrain
```

The critical question is how current terrain modifications are already retained across chunk unload/reload. Before implementing save fields, inspect the existing `ChunkManager` terrain-modification storage and restore path and extend **that same sparse override mechanism**. The plan's preparation record must not become a second terrain-override database.

If the existing terrain override representation stores modified sample heights, preparation progress should update those same authoritative values. Save/load should restore the overrides first, then reconstruct the preparation marker/work state from the saved preparation record.

## 12. Chunk streaming / boundary handling

A preparation can overlap chunk boundaries. Do not assume one chunk owns the whole operation.

Resolve affected samples in world coordinates and route modifications through the existing chunk manager. Dirty/rebuild every affected chunk using its existing mechanism.

When a chunk is streamed out/in, the preparation record remains independent of the mesh. Rebuilt terrain must read the same modified sample values.

Avoid per-frame work across every loaded chunk; a preparation touches only its bounded sample set.

## 13. Existing terrain classification is deliberately narrow

Current shovel digging does not have a general terrain-material taxonomy. `dig.ts` derives soil/sand/rock from height, water level, sand band and mountain ridge signals. Keep preparation validation similarly dependent on existing terrain/world queries. Do **not** introduce `TerrainType`, `SoilManager`, `RockLayer` or material inventories in v1. fileciteturn4file0L2-L2

The plan's future soil/rock note is appropriate; leave it as a future extension point only.

## 14. Potential interaction with water and rivers

Terrain validity must use the existing water/terrain queries rather than checking only `waterLevel` locally. Rivers/lakes have their own world systems, and the terrain state document explicitly treats rivers/hydrology as a separate domain. fileciteturn23file0L2-L2

Do not create a preparation-specific water collision test that can drift from existing water semantics.

## 15. Recommended implementation order

1. Audit the exact current `ChunkManager` terrain override/mutation/rebuild and restore path.
2. Audit the existing long-running/time-skip work mechanism and identify the smallest reusable contract.
3. Refactor `Wyrównaj` to exact 3×3 central-sample leveling without breaking current interaction wiring.
4. Add `Zrób górkę` through the existing single-deformation path.
5. Implement pure preparation sampling/validation/work-calculation logic.
6. Add persistent preparation state and integrate it with SaveData/restore.
7. Add progressive sample-height application using immutable originals.
8. Wire the existing long-running work/time-skip/interruption mechanisms.
9. Add preview grid + controls + confirmed marker through existing interaction/render ownership.
10. Add XP and tool-speed bonuses.
11. Test chunk-boundary, interruption and save/load cases before browser verification.

## 16. Tests worth adding

Focus tests on deterministic logic rather than Three.js:

- world-space area resolves the expected terrain samples;
- central sample is the leveling target;
- no sample exceeds the 3 m deformation limit;
- cut and fill calculate correct signed deltas;
- work formula has the minimum-work floor;
- tool multipliers are additive and deterministic;
- progress 0 / 0.5 / 1 produces exact interpolation;
- repeated application at the same progress is idempotent;
- interruption/resume gives identical heights to uninterrupted work;
- save/load round-trip preserves preparation state and reconstructed heights;
- completion removes active preparation/marker.

## 17. Documentation / scope

Update `LOOSE-ENDS.md` and the appropriate terrain/world vision document as requested by the plan, but keep those changes factual: terrain modification is a **foundation** for later construction, fields/gardens, roads and structures; it is not itself a construction system.

Do not pull future soil/rock quantities, terrain difficulty, roads, buildings or permanent prepared-terrain semantics into v1.

## Key architectural rule

The desired ownership is:

```text
existing terrain sampling / overrides
        ↓
TerrainPreparation state
        ↓
existing long-running work/time
        ↓
exact sample-height mutations
        ↓
existing chunk dirty/rebuild + persistence
```

Not:

```text
TerrainPreparationManager
+ PreparedTerrain database
+ custom work clock
+ custom collision system
+ custom tool checks
```

The codebase already has the necessary seams; the implementation should connect them rather than create parallel systems.
