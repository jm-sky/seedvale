# World-003 — Background Initialization Timing Discovery

**Date:** 2026-08-27  
**Related plan:** `docs/plans/world-003-faster-application-startup.md`  
**Commit:** `e3b183d79600fafc14ac64507b1963633ca6cb6d`

## Discovery

After implementing the deferred world initialization from `world-003`, the boot-time instrumentation was extended to measure the three background operations independently:

- `buildFauna()`
- `preloadHeldToolModels()`
- `preloadItemGlbModels()`

The new browser measurement shows that the initial playable path is now substantially shorter, but all three background operations take approximately **23 seconds**.

## Measured results

### Critical path

```text
[BootMark][createApp] createRenderStack: 17 ms

[BootMark][buildWorldSystems] createWaterMirror: 0 ms
[BootMark][buildWorldSystems] buildChunkManager: 124 ms
[BootMark][buildWorldSystems] waitForChunks: 1198 ms
[BootMark][buildWorldSystems] createWorldContext: 0 ms
[BootMark][buildWorldSystems] buildOcean: 1 ms
[BootMark][buildWorldSystems] buildResourceDeposits: 0 ms
[BootMark][buildWorldSystems] createPlayerGardens: 0 ms
[BootMark][buildWorldSystems] createFoodSourceHooks: 0 ms
[BootMark][buildWorldSystems] createHuntingHooks: 0 ms
[BootMark][buildWorldSystems] buildSettlementsManager: 375 ms
[BootMark][buildWorldSystems] droppedItems+placed+wells+terrainPrep: 1 ms
[BootMark][buildWorldSystems] createLargeCaves: 337 ms

[BootMark][createApp] createWorldBundle: 2455 ms
[BootMark][createApp] createWorldContext: 0 ms
[BootMark][createApp] PlayerController.create: 466 ms
[BootMark][createApp] createMinimap: 0 ms
```

The new `createWorldBundle` critical phase takes:

**2455 ms**

`PlayerController.create()` adds another:

**466 ms**

The world is therefore reaching the playable stage in roughly **2.5–3 seconds**, rather than waiting for the full world initialization.

## Background phase

A later measurement reports:

```text
[BootMark][buildWorldSystems] background:buildFauna: 22754 ms
[BootMark][buildWorldSystems] background:preloadHeldToolModels: 22954 ms
[BootMark][buildWorldSystems] background:preloadItemGlbModels: 22966 ms
[BootMark][buildWorldSystems] background:fauna+preloads: 22970 ms
[BootMark][buildWorldSystems] background:homeReady: 2278 ms
[BootMark][buildWorldSystems] background:itemSpawners+dryingRacks+hives: 3 ms
```

### Summary

| Operation | Time |
|---|---:|
| `createWorldBundle` critical path | **2455 ms** |
| `waitForChunks` | 1198 ms |
| `buildSettlementsManager` | 375 ms |
| `createLargeCaves` | 337 ms |
| `PlayerController.create` | 466 ms |
| `buildFauna` | **22.75 s** |
| `preloadHeldToolModels` | **22.95 s** |
| `preloadItemGlbModels` | **22.97 s** |
| `background:fauna+preloads` | **22.97 s** |
| `homeReady` | 2.28 s |
| item spawners/racks/hives | 3 ms |

## Interpretation

The `world-003` scheduling change appears to have achieved its primary goal: the approximately 23-second background work is no longer blocking initial world availability.

The current critical path is approximately:

```text
createWorldBundle
    ~2.5 s
        ↓
PlayerController.create
    ~0.5 s
        ↓
playable world
```

The previous `createWorldBundle` baseline was approximately **6.5 seconds**, so the deferred initialization removed several seconds of work from the boot critical path.

## Important observation

The three expensive background operations finish almost simultaneously:

```text
buildFauna                  22.754 s
preloadHeldToolModels       22.954 s
preloadItemGlbModels        22.966 s
background cluster           22.970 s
```

This is significant.

Because the operations are started concurrently through `Promise.all()`, the measurements do **not** indicate that one of these operations simply blocks the other two.

Instead, the nearly identical ~23-second durations suggest that they may share a common expensive dependency or resource, or that several expensive operations are competing for the same underlying resources.

At this point there is not enough evidence to identify the root cause.

Possible areas include:

- GLB/model loading or decoding,
- shared asset/cache initialization,
- browser/network/cache behavior,
- CPU contention,
- work performed internally by `buildFauna()`,
- shared terrain or spawn-point processing,
- interaction between fauna initialization and model loading.

These are hypotheses only and must not be treated as established causes.

## What is not the bottleneck

The following measurements do not currently justify further optimization:

```text
homeReady                         2.278 s
itemSpawners+dryingRacks+hives        3 ms
```

The home settlement is no longer a major critical-path cost.

The item spawner/drying rack/beehive phase is effectively negligible once `homeReady` completes.

Similarly, the currently measured critical-path constructors such as:

```text
createWorldContext
buildOcean
buildResourceDeposits
createPlayerGardens
createFoodSourceHooks
createHuntingHooks
```

are effectively free at the measured resolution.

## Current conclusion

**Do not optimize the ~23-second background work blindly.**

The next investigation should focus first on `buildFauna()` and establish where its **22.75 seconds** are actually spent.

Add focused instrumentation inside `buildFauna()` to distinguish at least:

```text
buildFauna
├── preparation / population calculation
├── asset/model loading
├── animal creation
├── terrain / spawn-point processing
└── remaining work
```

The exact breakdown should follow the actual implementation rather than introducing artificial categories.

After that, separately investigate why:

```text
preloadHeldToolModels()   ≈ 23 s
preloadItemGlbModels()    ≈ 23 s
```

also take approximately the same amount of time.

## Decision

Do **not**:

- change `waitForChunks(homeChunks())` yet;
- change the deferred initialization architecture;
- remove the model preloads yet;
- rewrite fauna initialization;
- add workers;
- introduce timers or arbitrary delays;
- make speculative optimizations.

First obtain a finer-grained measurement of `buildFauna()`.

The current evidence indicates that **world boot responsiveness has already improved significantly**, while the remaining ~23-second cost is now an asynchronous background-performance investigation rather than a startup critical-path problem.
