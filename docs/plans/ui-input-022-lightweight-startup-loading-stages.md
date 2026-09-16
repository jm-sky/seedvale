# Plan: Lightweight Startup Loading Stages

**Created:** 2026-09-16
**Status:** `done` ✅
**Priority:** medium · **Effort:** S
**Depends on:** none
**Domain:** `ui-input`
**Type:** `polish`
**Subdomains:** `feedback`
**Tags:** `loading` `startup` `performance`
**Roadmap:** -
**Model:** Sonnet, Composer

## Goal

Replace the single static startup message with a few truthful, coarse loading stages so the player can see what the application is currently preparing, without measurably increasing startup cost.

Keep the existing top-level message and spinner. Add one lightweight detail line, for example:

```text
Budowanie świata…
Generowanie terenu i rzek…
```

then later:

```text
Budowanie świata…
Przygotowywanie świata…
```

The loader is feedback only. It must not become a progress engine or alter world-generation scheduling.

## Current state

- `src/ui/createLoadingScreen.ts` creates one vanilla-DOM overlay with a spinner and static `Budowanie świata…` text; its public API only exposes `hide()`.
- `src/app/createApp.ts` owns the loading-screen lifecycle: it creates the overlay during composition-root startup and hides it after the render loop starts.
- `src/app/worldBundle.ts` already has explicit boot-phase boundaries and `bootMark` instrumentation around the critical startup path, including `waitForChunks(homeChunks())`.
- Initial home terrain generation runs through the existing chunk worker pipeline. A worker `tile` job performs `computeChunkTile()` and the rest of chunk content preparation before posting its result back to the main thread.
- Terrain geography and river shaping are therefore not separate main-thread awaits. Producing a visible `geography -> rivers` transition inside one worker job would require new worker progress messages or splitting the job solely for UI feedback.
- `src/shared/bootMark.ts` is diagnostics-only and exits immediately unless boot-mark mode is enabled. It should remain independent from production loading UI.

Related work: `world-003-faster-application-startup.md` established the current critical/background startup split. This plan must preserve that scheduling unchanged.

## Scope

### 1. Extend the existing loading screen with a bounded stage API

In `src/ui/createLoadingScreen.ts`:

- keep the existing overlay, spinner, fade and vanilla-DOM ownership;
- add one dedicated detail element below `Budowanie świata…`;
- expose a semantic `setStage(stage)` API with a small closed stage type and one central stage-to-label mapping;
- retain references to the DOM nodes when creating the component; do not query the DOM for every update;
- update only the detail node's `textContent`;
- make repeated assignment of the current stage a no-op;
- make stage changes after `hide()` harmless/no-op.

Do not migrate this earliest-startup UI into Vue.

### 2. Emit only coarse stages at existing startup boundaries

Use a small fixed set of stages. Preferred user-facing sequence:

1. `terrain` — `Generowanie terenu i rzek…`
2. `world` — `Przygotowywanie świata…`
3. `player` — `Przygotowywanie postaci…`
4. `render` — `Przygotowywanie grafiki…`
5. `ready` — `Uruchamianie gry…`

Exact labels may be polished during implementation, but they must describe real work rather than simulate percentage progress.

`createApp.ts` remains the UI owner and should drive all stages it can observe directly.

For the long terrain-readiness section inside `createWorldBundle()` / `buildWorldSystems()`, thread at most a tiny optional startup-stage callback through the existing initial-build call path if required to place the `terrain -> world` transition around the existing `waitForChunks(homeChunks())` boundary.

The world layer must not import or receive `LoadingScreen`. If a callback is needed, it carries only a small semantic stage/event and is optional. The rebuild path must keep working without it.

### 3. Preserve the worker protocol and world-generation schedule

Do **not** add worker progress events merely to distinguish geography from rivers.

Do not change:

- `chunkHeightmap.worker.ts` request/response protocol;
- `computeChunkTile()` scheduling or river generation;
- chunk worker count or priorities;
- `waitForChunks()` behavior;
- critical/background ownership established by `world-003`;
- settlement/fauna/background readiness semantics.

The terrain label intentionally groups geography and rivers because they are part of the same current worker-side generation pipeline.

## Performance guardrails

This plan is acceptable only if the production runtime overhead stays effectively constant:

- no `setInterval`, timers, polling, `requestAnimationFrame`, observers or per-frame work;
- no new worker messages or structured-clone payloads for loading UI;
- no added `await`, artificial delay, promise chain or yield solely to make a stage visible;
- no progress percentage calculation;
- no per-chunk/per-asset stage updates;
- no layout reads (`getBoundingClientRect`, computed style, etc.);
- no repeated `innerHTML` replacement;
- no new dependency;
- stage updates are O(1) write-only `textContent` changes and occur only a handful of times during the whole initial boot;
- `bootMark` remains debug instrumentation, not the production event bus for the loader.

If a stage would require adding observable work to the critical path, omit that stage rather than slowing startup.

## Relevant files

Primary:

- `src/ui/createLoadingScreen.ts` — loading UI and stage-label ownership.
- `src/app/createApp.ts` — loading-screen lifecycle and composition-root stage transitions.
- `src/app/worldBundle.ts` — existing critical startup boundaries; only an optional minimal callback seam if needed for the terrain/world transition.

Read-only context / do not modify unless current code proves necessary:

- `src/shared/bootMark.ts` — existing diagnostics, intentionally separate from loading UI.
- `src/terrain/chunkManager.ts` — `waitForChunks()` readiness boundary.
- `src/terrain/chunkHeightmap.worker.ts` — confirms there is no intra-tile progress contract.
- `src/terrain/chunkHeightmap.ts` — terrain/river work belongs to the same tile-generation pipeline.
- `docs/plans/implementation-notes/world-003-faster-application-startup-implementation-notes.md` — current startup critical/background ownership.

## Non-goals

- Optimizing world-generation duration itself.
- Splitting terrain generation into geography/hydrology sub-jobs.
- Adding a percentage/progress bar.
- Showing progress for every chunk, model, settlement or fauna asset.
- Changing background initialization introduced by `world-003`.
- Adding new performance instrumentation.
- Reworking loader styling beyond what is necessary for the detail line.

## Implementation order

1. Extend `LoadingScreen` with the stage type, detail node and O(1) `setStage()` implementation.
2. Add composition-root stage transitions in `createApp.ts` around already-existing startup boundaries.
3. If the useful terrain/world transition cannot be expressed from `createApp.ts`, add the smallest optional semantic callback through the initial `createWorldBundle()` / `buildWorldSystems()` call path, emitted around the existing `waitForChunks(homeChunks())` boundary only.
4. Keep rebuild callers callback-free unless they already have an appropriate visible loading surface.
5. Run static/build/tests and compare boot diagnostics before/after under the same seed/cache conditions; stage UI must not introduce a meaningful timing regression.

## Verification

Automated:

- `npx tsc --noEmit`
- `pnpm run lint:fix`
- `pnpm run build`
- relevant existing test suite; add a focused unit test only if the repository's current test environment already supports this DOM module without introducing a new test dependency/environment.

Performance checks:

- confirm no worker protocol changes and no new awaits/timers were introduced;
- compare existing `?bootMark=1` timings before/after using the same seed and comparable cache state; differences should remain within ordinary run-to-run noise;
- confirm production stage changes are bounded to a handful of `textContent` writes.

Manual browser verification by the User:

- fresh game shows sensible stage transitions without flicker;
- Continue/load follows the same safe loader lifecycle;
- the overlay still fades/removes correctly when gameplay begins;
- no artificial pauses are visible between stages;
- gameplay becomes available at the same readiness point as before.

> **Zrób git commit i push do main, rebase jeżeli trzeba**