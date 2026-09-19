# Plan: WorldBundle rebuild transaction and lifecycle safety

**Created:** 2026-09-19  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** M  
**Depends on:** none  
**Domain:** `world`  
**Subdomains:** `simulation`  
**Tags:** `worldbundle` `lifecycle` `rebuild`  
**Type:** `fix`  
**Roadmap:** -

## Goal

Make an in-session `WorldBundle` rebuild one explicit lifecycle transaction.

A rebuild must never:

- run normal simulation against already-disposed world systems,
- publish a newly-built world after the app has been disposed or the rebuild has become stale,
- resume normal runtime with `bundle` still pointing at disposed old systems after a build failure,
- orphan a freshly built world when background readiness fails.

Preserve the existing stable-`WorldBundle` object contract and existing save/rebuild carry mechanisms.

## Source finding

Created from codebase domain audit area 01:

`docs/reviews/codebase-domain-audit/2026-09-19--01--runtime-architecture-and-worldbundle.md`

Relevant findings: F3, F4, F5.

The startup-stub/readiness findings F1/F2 are **not** part of this plan; they remain owned by `world-003-faster-application-startup.md`.

## Current code / ownership

### `src/app/createApp.ts`

- owns the stable `bundle` reference and app lifetime;
- owns `worldGeneration` and local `rebuilding`;
- starts `rebuildWorld()`;
- owns the render/game loop and every post-rebuild rebind;
- teardown increments `worldGeneration` and calls `disposeWorldBundle(bundle)`.

### `src/app/worldBundle.ts`

- `rebuildWorldBundle()` snapshots carry-forward state;
- disposes current bundle fields;
- builds a fresh world through `buildWorldSystems()`;
- awaits fresh `backgroundReady`;
- publishes with `Object.assign(bundle, fresh)`.

### `src/app/gameLoop.ts` / `src/app/appRenderLoop.ts`

The frame loop remains active during rebuild and reads the stable bundle, whose fields are temporarily disposed until fresh publication.

## Confirmed failure modes

### 1. Teardown during rebuild can publish after disposal

The rebuild's stale predicate is checked inside `buildWorldSystems()` only for the deferred background systems. After `backgroundReady` resolves, `rebuildWorldBundle()` still assigns `fresh` into the stable `bundle`.

If app teardown increments `worldGeneration` while a rebuild is in flight:

1. teardown disposes the currently published bundle;
2. the background phase notices staleness and disposes only its deferred fauna/item/rack/hive instances;
3. `rebuildWorldBundle()` continues and publishes the fresh critical systems;
4. `rebuildWorld()` can continue cache/prewarm/player-rebind work against an already disposed app.

### 2. Runtime ticks through the invalid rebuild window

`rebuilding` does not gate `gameLoop.tick()`. The old world is disposed before the new world is ready, so simulation relies on disposed implementations behaving benignly.

### 3. Build/background failure leaves no valid published world

If fresh world creation or its background readiness rejects after old-world disposal, the stable bundle remains pointed at disposed old systems. `rebuildWorld()` only clears busy/rebuilding in `finally`, so ordinary runtime can resume without a valid world. When a fresh critical bundle already exists, it also needs deterministic cleanup ownership.

## Implementation requirements

### A. One rebuild lifecycle state at the composition root

Introduce one explicit app-owned lifecycle signal sufficient to distinguish at least:

- normal/running,
- rebuild in progress,
- disposed,
- rebuild failed if normal runtime cannot safely resume.

Do not add separate booleans independently to GameLoop, WorldBundle and UI. Keep one owner and pass/read the minimum narrow signal where required.

Existing `worldGeneration` may remain the staleness/epoch identity if useful; do not create a parallel generation counter for the same purpose.

### B. Gate normal world simulation while the published bundle is invalid

From the moment destructive rebuild teardown begins until successful fresh publication + required rebinds finish:

- do not run normal `gameLoop.tick()` world simulation against disposed bundle fields;
- do not accept world actions that can mutate/query the invalid world;
- rendering a static/loading state is acceptable if it does not invoke the invalid simulation path.

Reuse the composition-root/render-loop boundary. Do not scatter `if (rebuilding)` guards across individual world systems.

### C. Make stale cancellation own the entire fresh world, not only deferred systems

After fresh build/background readiness and **before publication**, re-check the rebuild/app lifecycle token.

If stale/disposed:

- never `Object.assign(bundle, fresh)`;
- dispose the entire fresh world exactly once, including its critical systems;
- return a distinct non-success outcome so `createApp.ts` performs none of the normal post-rebuild rebind/prewarm work.

Avoid a second cancellation architecture inside each subsystem.

### D. Give fresh-build failure explicit cleanup ownership

The rebuild path must have a clear owner for partially/finally constructed fresh world resources.

At minimum:

- if `fresh` exists and `backgroundReady` rejects, dispose `fresh` fully;
- do not clear the rebuild gate and resume ordinary runtime on the already-disposed old bundle;
- propagate or convert the failure into an explicit composition-root failure state.

If recon during implementation shows that `buildWorldSystems()` can throw before returning `fresh` after allocating critical systems, extend the same ownership rule to those partial allocations rather than leaving them as implicit leaks. Prefer a bounded cleanup stack/transaction scope over many unrelated catch blocks.

### E. Publish before post-rebuild consumers run, and only on success

Keep the current successful post-rebuild synchronization, but run it only after a successful, non-stale publication:

- map projection params,
- world-location scan invalidation,
- world/guard knowledge invalidation,
- `bindReadyExpeditionDispatch()`,
- coarse/abandoned-cemetery cache activation,
- same-world stale animal-target invalidation,
- day/night + point-light synchronization,
- render-program prewarm,
- `PlayerController.setGround(...)`,
- optional New Game home teleport,
- pause-menu seed refresh.

A stale/cancelled/failed rebuild must execute none of this continuation.

### F. Preserve current state and reference contracts

Do not change:

- the stable outer `WorldBundle` object pattern;
- the current live `bundle.X` read convention;
- explicit consumer rebind APIs such as `PlayerController.setGround`;
- app-owned sparse/persistent carry state;
- domain snapshot/constructor mechanisms used for rebuild continuity;
- New Game reset semantics.

No second world-state owner, no alternate rebuild path and no broad `createApp.ts` redesign.

## Files / symbols to inspect first

- `src/app/createApp.ts`
  - `worldGeneration`
  - `rebuildWorld()`
  - render-loop `onTick`
  - returned teardown callback
- `src/app/worldBundle.ts`
  - `buildWorldSystems()`
  - `createWorldBundle()`
  - `rebuildWorldBundle()`
  - `disposeWorldBundle()`
- `src/app/gameLoop.ts`
  - `createGameLoop()` / `tick()`
- `src/app/appRenderLoop.ts`
  - frame scheduling/dispose boundary
- `docs/architecture/ARCHITECTURE.md`
  - World lifecycle / stable bundle invariants

Also read archived plan 054 before changing reference semantics, and review 002 / archived plan 053 for the earlier rebuild-tick finding.

## Tests / verification

Automated coverage should prove lifecycle outcomes rather than only successful rebuild:

1. successful rebuild publishes once and allows runtime to resume;
2. duplicate rebuild request remains excluded;
3. app teardown while rebuild is pending prevents publication and disposes the fresh world;
4. background-ready rejection disposes fresh resources and does not resume simulation against the disposed old bundle;
5. no game/world tick runs during the destructive rebuild window;
6. successful rebuild still rebinds PlayerController/current-world consumers exactly once;
7. New Game and same-world terrain/config rebuild retain their existing reset differences.

Prefer testing a small extracted lifecycle/transaction coordinator if direct Three.js-heavy `createApp` tests would require excessive mocking. Do not create a generic framework just for tests.

Manual browser verification is performed by the user, not the AI agent. Verify at minimum:

- same-world terrain/config rebuild,
- pause-menu New Game,
- ordinary play immediately before/after rebuild,
- a controlled failure/cancellation path if a safe dev/test seam exists.

## Non-goals

- fixing initial boot stub/readiness consumers — `world-003` owns that;
- redesigning persistence or SaveData;
- changing off-screen/time-skip simulation semantics;
- replacing the stable WorldBundle container;
- unrelated refactors of `createApp.ts`;
- performance tuning except removing work against an invalid/disposed world.

## Documentation

After implementation, update `docs/architecture/ARCHITECTURE.md` only as needed to state the actual rebuild transaction/cancellation contract. Do not duplicate implementation detail.

Add/update JSDoc on the central rebuild lifecycle/publication functions when needed for preflight discovery; use `@domain world` where appropriate.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
