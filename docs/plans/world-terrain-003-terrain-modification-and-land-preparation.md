# Plan: Terrain Modification & Land Preparation

**Created:** 2026-08-24  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** L  
**Depends on:** none

## Goal

Extend the existing shovel actions with local terrain shaping and a larger **Prepare Terrain** action. This establishes a foundation for future construction, garden beds, fields and roads.

This plan extends the existing terrain modification system. It does not introduce a separate `PreparedTerrain` system.

## Implementation guidance

Before coding, inspect the current implementations of shovel/dig actions, terrain sampling and modification, chunk rebuild/dirty handling, world markers/interactions, long-running work/time-skip, tools and persistence. Reuse existing mechanisms and patterns rather than creating parallel systems. Treat the current code as the source of truth if it differs from this plan.

The 2×2 / 3×3 / 4×4 sizes describe **world-space preparation areas in metres**, not terrain sample counts. Use the terrain system's existing sampling/resolution.

## 1. Existing shovel actions

### `Wyrównaj`

Change the existing action to:

- sample the **3×3 nearest terrain samples** around the selected point;
- use the central sample's current height as the target height;
- set all 9 samples to that target height;
- use the existing terrain modification and dirty-chunk/rebuild mechanisms;
- do not use procedural `baseHeight` as the target.

### `Zrób górkę`

Add a new shovel action:

- inverse of `Wykop dołek`;
- reuse the existing terrain deformation mechanism;
- preserve the existing limits for a single shovel deformation.

## 2. `Przygotuj teren` preview

When the action is selected:

- display a world-space grid following the mouse position on the terrain;
- keep the grid axis-aligned to world X/Z;
- support `2×2 m`, `3×3 m` and `4×4 m` areas;
- use mouse wheel and `+/-` to change size;
- initialize target height from the central terrain sample;
- use `,` / `.` to change target height by **0.25 m** per step;
- display selected size and target height;
- provide confirm and cancel controls.

Rotation of the preparation area is out of scope for v1.

## 3. Validation

Validate the complete selected area before creating work.

### Maximum deformation

For every affected terrain sample:

```text
abs(targetHeight - originalHeight) <= 3m
```

Reject the preparation if any sample exceeds the limit.

### Tools

```text
shovel  — required
knife   — +5% work speed
pickaxe — +10% work speed
```

Tool bonuses are additive.

Mountain/rocky terrain requires both shovel and pickaxe.

Do not implement the future terrain-difficulty penalty in v1.

### Terrain validity

Reuse existing terrain/world queries for invalid areas, including water and other existing terrain restrictions. Do not create a parallel collision/validation system for this feature.

## 4. Active preparation state

After confirmation, create a temporary `TerrainPreparation` state containing at least:

```text
id
center
size
targetHeight
originalHeights
requiredWork
completedWork
status
```

`originalHeights` are immutable for the lifetime of the preparation.

The state must support interruption, save/load and later resumption.

Delete the preparation state after completion.

## 5. Work model

Use a deliberately simple work model:

```text
requiredWork = max(
  minimumWork,
  area × averageAbsHeightDelta × workScale
)
```

`minimumWork` must correspond to **1 in-game hour at base tool speed**.

The exact `workScale` should be chosen from existing long-running work conventions in the codebase; do not introduce a complex volume/soil simulation.

Tool speed:

```text
shovel                         1.00×
shovel + knife                 1.05×
shovel + pickaxe               1.10×
shovel + knife + pickaxe       1.15×
```

The shovel is mandatory. Mountain/rocky terrain additionally requires the pickaxe.

Use existing tool capability/inventory/held-tool mechanisms rather than hard-coded parallel item checks.

Add a small amount of XP using the existing skill system. Do not create a new skill.

## 6. Progressive terrain modification

Terrain must change progressively while work is performed.

For every affected sample:

```text
progress = completedWork / requiredWork

height =
  originalHeight +
  (targetHeight - originalHeight) * progress
```

Always derive the current height from the immutable original height and current progress. Do not accumulate incremental deltas.

At 100% all affected samples must reach the target height.

This must remain deterministic across interruption, resume and save/load.

## 7. Work interruption and resume

Reuse the existing long-running work and time-skip mechanisms.

During work:

- existing time acceleration can be used, as with sleep;
- player needs continue to update;
- exhaustion/fatigue can interrupt work;
- hunger can interrupt work;
- damage can interrupt work;
- `Esc` stops work.

Stopping work preserves the current progress and partially modified terrain. The player can later interact with the preparation marker and continue.

Do not create a separate time-acceleration system.

## 8. Temporary work marker

Create a temporary flag/marker when preparation is confirmed.

The marker:

- identifies the active preparation;
- allows the player to resume work;
- remains after manual or automatic interruption;
- is removed when preparation reaches 100%.

After completion there is no permanent preparation marker and no `PreparedTerrain` record. The resulting terrain is simply normal, modified world terrain.

## 9. Persistence

Persist active `TerrainPreparation` state so an interrupted preparation survives save/load.

Persist all data required to reproduce the current state deterministically, including:

- area and target;
- immutable original heights;
- required work;
- completed work;
- active status.

The partially modified terrain must also remain correct after save/load.

Remove the preparation record after completion.

## 10. Future terrain materials

Do not add `soil`, `rocks` or other terrain-material inventories in v1.

Add a short code comment near the simplified work/deformation model noting that future terrain simulation may account for materials such as soil and rocks and actual cut/fill quantities.

## 11. Documentation

### `docs/plans/LOOSE-ENDS.md`

Record that the broader terrain-modification topic has started.

Also record that mountain/rocky terrain should eventually receive an explicit terrain-difficulty penalty for preparation work.

### `docs/vision/`

Update the appropriate domain vision document to establish terrain modification as a broader foundation for:

- construction;
- garden beds and fields;
- houses/buildings;
- roads;
- other structures and world changes dependent on terrain shape.

This plan does not implement those systems.

## 12. Reuse and architectural constraints

Reuse existing mechanisms for:

- terrain sampling and modification;
- chunk dirty/rebuild handling;
- shovel actions;
- tool capabilities;
- inventory and held tools;
- player needs;
- long-running work;
- time acceleration;
- world markers/interactions;
- persistence/save data.

Do not introduce:

- a second terrain deformation system;
- a parallel tool-capability system;
- `PreparedTerrain` persistence;
- a separate time-acceleration mechanism;
- a parallel terrain collision/validation system.

## 13. Out of scope

- physical `soil` / `rocks` materials;
- physical transport of removed/fill terrain;
- exact cut/fill volume simulation;
- terrain-difficulty penalty;
- houses/buildings;
- roads;
- fields/garden beds;
- wells;
- permanent prepared-terrain state;
- construction placement requirements;
- advanced terrain shaping.

## 14. Verification

### Technical

Run the repository's applicable checks, including:

```text
npx tsc --noEmit
pnpm run lint:fix
pnpm run build
pnpm run test
```

### Browser/gameplay

Verify at minimum:

- `Wyrównaj` produces the intended 3×3 leveling;
- `Zrób górkę` modifies terrain correctly;
- 2×2, 3×3 and 4×4 m preparation areas work;
- target changes by 0.25 m;
- both cutting and filling work;
- the 3 m per-sample limit is enforced;
- shovel/pickaxe requirements and additive tool bonuses work;
- terrain changes progressively;
- work can be interrupted with `Esc` and resumed;
- needs/damage can interrupt work;
- time acceleration works;
- save/load preserves an active preparation;
- the marker disappears after completion.

## Definition of Done

- Existing shovel actions remain functional.
- `Wyrównaj` levels the intended 3×3 samples to the central sample height.
- `Zrób górkę` uses the existing terrain deformation path.
- `Przygotuj teren` supports 2×2, 3×3 and 4×4 m areas.
- Cut and fill both work.
- No sample may require more than 3 m of height change.
- Active work can be interrupted and resumed.
- Terrain deformation is progressive and deterministic.
- Active preparation survives save/load.
- Tool requirements and additive bonuses work.
- The temporary marker disappears on completion.
- No permanent `PreparedTerrain` state is introduced.
- Technical checks pass.
- Browser verification is completed.

> **Zrób git commit i push do main, rebase jeżeli trzeba**