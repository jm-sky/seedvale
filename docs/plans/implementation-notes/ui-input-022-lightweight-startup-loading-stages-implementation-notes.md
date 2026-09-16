# Implementation Notes: Lightweight Startup Loading Stages

**Reviewed:** 2026-09-16  
**Plan:** `ui-input-022-lightweight-startup-loading-stages.md`

## Existing ownership and lifecycle

`src/app/createApp.ts` is the composition root and already owns the `LoadingScreen` instance. It creates the loading overlay before the expensive startup path, starts the render loop near the end of startup, then calls `loadingScreen.hide()`. Keep the new stage changes in that ownership direction: app -> UI.

`src/ui/createLoadingScreen.ts` is deliberately a tiny vanilla-DOM component. Today it creates the spinner + one static text node and exposes only `hide()`. It is the correct place for the stage type/labels and the cached detail-element reference. Do not move this component into Vue just to support stage text.

## Critical startup seam

The current initial build goes through `createWorldBundle()` -> `buildWorldSystems()` in `src/app/worldBundle.ts`. `world-003` already split initial startup into critical and background work; do not alter that split.

The useful existing terrain readiness boundary is:

```text
chunkManager.update(0, 0)
bootMark('waitForChunks')
await chunkManager.waitForChunks(homeChunks())
bootMarkEnd('waitForChunks')
```

This waits for the pinned 3x3 home chunks to become ready. It is the natural coarse UI boundary for `Generowanie terenu i rzek…`; after it resolves the loader can move to a broader world-preparation stage.

If `createApp.ts` cannot observe this boundary without exposing internal promises, prefer one optional semantic callback threaded through `createWorldBundle()` / `buildWorldSystems()` over exposing `ChunkManager` internals or passing a UI object into the world layer.

Keep the callback initial-boot-only in practice: rebuild callers do not need to opt in.

## Why geography and rivers must stay one visible stage

`src/terrain/chunkHeightmap.worker.ts` receives a `tile` request and performs the full tile pipeline before one response:

```text
computeChunkTile(params)
-> computeChunkVegetation(...)
-> computeChunkItems(...)
-> computeChunkEnvironment(...)
-> computeChunkCrops(...)
-> postMessage(tile result)
```

`computeChunkTile()` already receives canonical `riverSegments` alongside terrain/road/clearing inputs. There is no worker protocol event meaning “base geography finished” or “river carving started”.

Therefore do not implement the originally imagined visible transition:

```text
Generowanie geografii
-> Generowanie rzek
```

inside a single tile job. Doing so would require extra worker progress messages or splitting computation solely for presentation. Use the truthful combined label `Generowanie terenu i rzek…` instead.

## Loader API shape

Prefer a closed semantic type in `createLoadingScreen.ts`, for example stages equivalent to:

```text
terrain
world
player
render
ready
```

Keep the label mapping in the UI module so application/world code does not contain Polish presentation strings.

`setStage()` should:

- compare with the current stage and return if unchanged;
- return if the overlay has already been hidden/removed;
- assign only `detailEl.textContent`;
- never call `querySelector`, `innerHTML`, layout APIs or scheduling APIs.

One extra element and ~5 writes over the entire boot are the intended cost profile.

## BootMark is not the event bus

`src/shared/bootMark.ts` checks `isBootMarkMode()` before recording `performance.now()` or logging. Keep it as opt-in diagnostics.

Do not modify `useBootMark()` to invoke production UI callbacks. Although existing boot-mark names identify useful boundaries, coupling the loader to diagnostic instrumentation would mix lifecycles and turn a debug mechanism into production state flow.

It is fine for the new UI callback and an existing `bootMark` call to sit adjacent to the same real startup boundary.

## Post-world-bundle stages

`createApp.ts` already has real boundaries after `await createWorldBundle(...)`, including player/controller creation and render-program prewarm before `renderLoop.start()` / `loadingScreen.hide()`.

Use those existing boundaries for coarse stages such as `player`, `render`, and `ready`. Do not add yields so a fast stage remains visible; if a stage completes too quickly to be seen, that is correct.

## Performance pitfalls to avoid

- No update per chunk or worker completion.
- No asset-loader progress listeners for this plan.
- No timer that rotates messages independently of actual work.
- No forced paint/yield between labels.
- No percentage based on stage count.
- No `requestAnimationFrame()` solely for the loader.
- No change to worker pool, worker protocol, `waitForChunks()`, `computeChunkTile()`, settlement readiness, fauna startup, or background systems.
- Avoid creating a generic global startup event bus; the only consumer is the existing loading screen during initial boot.

## Verification focus

The important implementation review is structural rather than microbenchmarking a `textContent` assignment:

1. Diff contains no new worker message/protocol shape.
2. Diff contains no new await/timer/polling/RAF for loading feedback.
3. World generation and readiness calls remain in the same order.
4. Stage callbacks are bounded, synchronous O(1) notifications.
5. Existing `?bootMark=1` timings before/after do not show a repeatable regression beyond normal noise.
6. User performs browser verification of the visible labels and fade lifecycle.

No browser verification should be performed by the implementation agent.