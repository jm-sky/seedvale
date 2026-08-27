# Plan: Faster Application Startup

**Created:** 2026-08-26  
**Status:** `verification needed` 🔍  
**Priority:** high · **Effort:** M  
**Depends on:** none  
**domain:** `world`  
**tags:** [world-terrain, settlements-npcs, fauna, items-player]

## Goal

Reduce Seedvale's **time to first meaningful player interaction**. The player should be able to enter the world and move/interact as soon as the minimum required world infrastructure is ready; terrain, settlement/NPCs, fauna and non-essential assets may finish loading asynchronously afterward.

The target is not necessarily to reduce total world initialization time. The primary metric is **time to first playable world**.

## Baseline

Current instrumentation reports:

```text
createApp
  createRenderStack       19 ms
  createWorldBundle     6474 ms
    buildChunkManager    131 ms
    waitForChunks       1725 ms
    buildSettlementsManager
                         1510 ms
    buildFauna          1026 ms
```

Approximately 2.1 s of `createWorldBundle` is not yet attributed to these measured sections and must be measured before implementation decisions are finalized.

## Scope

### 1. Complete boot-time attribution

Extend the existing `bootMark` instrumentation around the currently unmeasured parts of `buildWorldSystems()` in `src/app/worldBundle.ts`.

Measure at least:

- `createWorldContext`
- `buildOcean`
- `buildResourceDeposits`
- `createPlayerGardens`
- `createFoodSourceHooks`
- `createHuntingHooks`
- `preloadItemGlbModels`
- `preloadHeldToolModels`
- item spawners
- dropped items
- placed fires
- placed tents
- placed traps
- placed containers
- player wells
- terrain preparations
- large caves
- drying racks
- beehives
- remaining WorldBundle construction

Keep instrumentation useful and avoid unrelated logging.

### 2. Remove unnecessary terrain waiting from the global critical path

Current `buildWorldSystems()` starts chunk streaming and then waits for all `homeChunks()` before continuing.

Inspect `src/terrain/chunkManager.ts` and all consumers to determine the minimum terrain readiness required for:

- player creation,
- player spawn,
- movement/controller activation,
- first interaction.

Do not remove terrain generation. Reuse the existing asynchronous chunk/worker pipeline.

Prefer a readiness boundary where the application can become playable while remaining required home chunks continue to stream.

### 3. Decouple settlement manager availability from home settlement completion where safe

Inspect `src/settlement/SettlementsManager.ts` and all consumers of `SettlementsManager.home`.

The current manager already has asynchronous settlement loading via `pendingPromise`/`ensureLoaded()`. Reuse this mechanism rather than introducing a second loader.

Determine whether the manager can be created before the home settlement has finished constructing. Preserve the existing `home: Settlement` contract unless all consumers can safely support a different readiness API.

If a readiness promise/API is needed, make it explicit rather than exposing partially initialized authoritative state.

### 4. Move fauna off the initial critical path

`buildFauna()` currently follows home settlement construction and costs about 1.0 s.

Trace its dependencies. Once the home settlement is ready, investigate starting fauna initialization independently of the player's initial readiness.

Preserve deterministic fauna state and existing lifecycle/ownership/disposal semantics.

### 5. Remove non-essential asset preloads from the critical path

Inspect:

- `preloadItemGlbModels()`
- `preloadHeldToolModels()`

Determine whether they are required before first player interaction. If not, start them asynchronously using the existing GLTF loading/cache mechanism.

Do not introduce duplicate model loading or race conditions for consumers that request an asset before preload completes.

### 6. Classify remaining WorldBundle systems

For each remaining system constructed after fauna, classify it as:

- required before first interaction,
- required soon but safe after gameplay begins,
- safe to initialize fully in the background.

Do not defer systems if doing so can cause lost save state, missing interactions, inconsistent simulation, incorrect NPC behavior, nondeterminism, or lifecycle/disposal bugs.

## Important dependencies

The current dependency chain must remain valid:

```text
terrain readiness
    ↓
home settlement readiness
    ↓
fauna / systems depending on home settlement
```

Do not solve this by blindly replacing awaits with `void` or by adding arbitrary timers.

Background work must remain observable and handle failures correctly.

## Rebuild / persistence considerations

`rebuildWorldBundle()` uses the world-building path as well. Determine whether deferred initialization is appropriate only for initial startup or must also work during rebuilds.

Preserve continuity of authoritative state, including:

- NPC/household state,
- settlement state,
- fauna state,
- dropped items,
- fires,
- tents,
- traps,
- containers,
- wells,
- gardens,
- terrain preparations,
- resource state.

The optimization must change scheduling/readiness, not simulation semantics.

## Implementation approach

1. Read `CLAUDE.md`, `docs/STATE.md`, `docs/VISION.md`, `docs/ROADMAP.md`, and `docs/plans/README.md`.
2. Verify the current implementation of all functions listed above.
3. Complete boot-time instrumentation and establish the full critical-path baseline.
4. Trace consumers of `SettlementsManager.home`, fauna initialization, player readiness and remaining WorldBundle members.
5. Define the minimum readiness boundary for first playable state.
6. Move only safe work behind that boundary, reusing existing asynchronous mechanisms.
7. Keep one authoritative instance of each world system; do not create parallel bootstrap/background architectures.
8. Re-run boot measurements and compare time to first playable state with the baseline.
9. Verify fresh-world startup, existing-save startup, reload, and `rebuildWorldBundle()` where applicable.
10. Run automated checks and perform browser/manual verification for the actual playable startup flow.

## Verification

Record at minimum:

```text
Before:
time to first playable = ?
full world initialization = 6474 ms

After:
time to first playable = ?
full world initialization = ?
```

Verify that:

- the player can move/interact before deferred work finishes;
- terrain continues streaming correctly;
- home settlement eventually appears correctly;
- NPCs initialize correctly;
- fauna initializes correctly;
- item/tool models become available when requested;
- no unhandled promise errors occur;
- save/load state is preserved;
- `rebuildWorldBundle()` remains correct;
- deterministic simulation semantics are unchanged;
- the world continues operating independently of the player.

For Three.js/gameplay behavior, perform browser/manual verification according to `CLAUDE.md`.

## Out of scope

- IndexedDB terrain caching unless measurements show it is necessary after critical-path scheduling is optimized.
- Rewriting terrain generation.
- Rewriting settlement generation.
- Rewriting fauna simulation.
- Adding Web Workers without measured CPU justification.
- Unrelated rendering or simulation refactors.
- Arbitrary startup delays.

## Expected result

The preferred outcome is:

```text
application start
    ↓
minimal world bootstrap
    ↓
player can move/interact
    ↓
remaining world initialization continues in background
```

Total initialization may still take several seconds; that is acceptable if the player becomes productive substantially earlier.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
