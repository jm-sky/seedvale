# Plan 119 — implementation notes

**Date:** 2026-08-15
**Plan:** [2026-08-15--119--chunk-streaming-performance.md](./2026-08-15--119--chunk-streaming-performance.md)

## Code trace (confirmed)

`attachGeneratedChunk` was one async function. After `buildAndAttachMesh` it `await`ed `get*Templates()` (memoized GLB load). `drainFinalizeQueue` fired `void runFinalize` without waiting, so several chunks parked on the same promise. When it resolved, every continuation ran in one tick — vegetation stampede (`chunk vegetation glb` max 544 ms in the plan-119 `stream` capture).

Plan 112's 1-start-per-frame cap only covered the mesh stage.

## What landed

- `memoTemplates` exposes `start()` / `peek()`. `ChunkManager` construction preloads tree/bush/cactus/reed/rock/log/cemetery templates so GLB parse happens on the loading screen, not during sprint streaming.
- Finalize is two sync stages on the same nearest-first `finalizeQueue`:
  - `mesh` — `buildAndAttachMesh` + water + grass request; `state = 'ready'`
  - `content` — vegetation instancing + items + environment + `rebuildColliders`
- One slot per gameplay frame, **mesh over content**. Content whose templates are not ready stays queued and does not starve terrain.
- No `await` inside finalize. `waitForChunks` / `pendingPromise` wait for content as well as mesh. Unload drops both stages and does not attach content afterward.
- `pickNextFinalizeKey` exported and unit-tested (mesh priority, skip-blocked content).

`CHUNKS_STARTED_PER_FRAME = 2` and `CHUNKS_FINALIZED_PER_FRAME = 1` (now 1 stage total, not 1+1) unchanged. Worker protocol, Insane 193, and `buildAndAttachMesh` itself were not touched.

## Not done

Browser `?benchmark=*` (forest / water / stress / stream) vs review 015 / the plan-119 `stream` capture. Technical checks are the verification in this session — do not treat that as hitch proof.

A single Insane-193 `chunk mesh` can still be tens of ms. That stays a follow-up, same as plan 112.

## Report

| | |
|---|---|
| **Źródło hitcha** | Stampede po `await` GLB w `attachGeneratedChunk` (A) + sync mesh nadal 1×/klatkę (B, nie ruszane). |
| **Rozwiązanie** | Preload szablonów + kolejka `mesh`/`content`, 1 etap/klatkę, priorytet mesh. |
| **Before → After** | `stream` hitch `chunk vegetation glb` max 544 ms / frame max 613 ms → **pending** `?benchmark=stream`. |
| **Kompromis** | Drzewa/skały mogą pojawić się 1–kilka klatek po terenie (pop-in). `waitForChunks` dłuższy o etap content (loading screen). |
| **Follow-up** | Jeśli po A+B `stream` nadal ma `chunk mesh` max ≫ 50 ms *i* to dominuje `frame.max` — osobny plan (reuse bufferów / niższy default res). |
