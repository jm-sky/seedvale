# Implementation notes: Water Reflection GPU Optimization (144)

**Companion to:** [2026-08-17--144--water-reflection-gpu-optimization.md](./2026-08-17--144--water-reflection-gpu-optimization.md)

## Note on this file

This file did not exist before this implementation session — the task that requested this
work pointed at it, but only the plan itself (`2026-08-17--144--water-reflection-gpu-optimization.md`)
was present on disk. The plan ID `144` also collides with an unrelated plan,
`2026-08-17--144--npc-player-food-drink-help.md` (see [duplicate plan IDs](../plans/README.md) — a
recurring issue in this repo, not specific to this plan). Implementation below is based on the plan
file and the current codebase only.

## What was implemented — Stage S (reflection visibility budget)

Per plan §3 "S — Reflection visibility budget", using only existing chunk-level bounds/lifecycle
(no new streaming/visibility system):

- New `REFLECTION_DISTANT_LAYER` (`src/world/waterMirror.ts`) — distinct from the existing
  `REFLECTION_SKIPPED_LAYER` (grass/dropped items) because terrain/vegetation/environment content
  *does* cast shadows. `REFLECTION_SKIPPED_LAYER` objects never cast shadows today (grass has
  `castShadow = false`; the shadow camera never enabled that layer), so reusing it for shadow-casting
  geometry would have silently killed their shadows. The new layer is enabled on the main camera
  (`createApp.ts`) and on the sun's shadow camera (`createLights.ts`), but deliberately **not** on the
  mirror camera (`waterMirror.ts` only ever enables layer 0) — that asymmetry is the whole mechanism.
- `chunkManager.ts`: `reflectionVisibleRadius = max(1, loadRadius - 1)` chunks (Chebyshev distance from
  the player's chunk) — only the outermost streaming ring is excluded from the mirror pass. A new
  `syncReflectionForRecord(record, dist)` toggles a chunk's terrain mesh, non-instanced
  `vegetationExtras` (felled trees / stage meshes) and procedural `environment` group (landmarks,
  cemetery) between the default layer and `REFLECTION_DISTANT_LAYER`. It rides along inside
  `syncInstancedLodForRecord`, so it runs at exactly the same (movement-throttled, not per-frame)
  cadence as the existing vegetation LOD sync — content attach, tree-visual refresh, `recheck()`,
  `setLodScale()`. Grass and dropped items keep their existing, independent, permanent reflection
  exclusion — untouched.
- `vegetationRegionBatcher.ts`: region-batched vegetation (`tree-living`/`bush`/`cactus`/`reed`) and
  environment instancing (`largeRock`/`rockCluster`/`fallenLog`) is the single biggest remaining
  reflection cost per plan §2 P1 (~1.34 M vegetation triangles historically). Added
  `syncReflectionVisibility(chunkCoord, visible)`, mirroring the existing `syncLod`
  "nearest member wins" pattern: a region (`REGION_CHUNKS = 3`, ~192 m) stays mirror-visible as long as
  *any* contributing chunk is within `reflectionVisibleRadius`, applied via `assignRenderLayer` on the
  region's `InstancedPropGroup.group` (whole `THREE.Group` of `InstancedMesh` buckets — cheap, only on
  rebuild/sync, never per-frame).

## Why not M or L

Plan §3 gates each stage behind a browser benchmark (`?benchmark=water` / `?benchmark=stream`) with an
explicit stop condition: "implementować tylko jeśli mirror draw calls/triangles rzeczywiście spadną i
nie pojawi się widoczne hard cutoff." This session was explicitly scoped to skip browser/gameplay
verification (user verifies manually), so that benchmark could not be run. Implementing M (reflection
LOD) or L (adaptive quality) on top of an unconfirmed S would compound unverified changes — both stay
out of scope until S's benchmark (see plan §3 S "Benchmark") is run.

## What was deliberately not touched

- Mirror RT resolution (128²) and cadence (30 Hz cap + load protection) — plan §5/§6 keep these as the
  baseline; no code changed here.
- `mirrorCamera.projectionMatrix.copy(camera.projectionMatrix)` (`waterMirror.ts`) — plan §2 P3
  confirms a shorter `camera.far` doesn't help (`Frustum.setFromProjectionMatrix` doesn't consult
  `.far`, and the streamed world's ~316 m reach is already inside the main camera's far=500), so this
  was left as-is.
- Settlement props (`instancedProps.ts` build in `settlement/props.ts`) — not chunk-scoped, so it has no
  distance metadata to hook the same visibility budget into without building a new mechanism; plan §3 S
  scope is explicitly "existing chunk-level bounds/lifecycle" only. Settlement reflection cost (plan §2
  P1: ~785k triangles) is left for a future stage/plan if the S benchmark below justifies it.
- Grass/dropped-item reflection exclusion (`REFLECTION_SKIPPED_LAYER`) — pre-existing, unchanged.

## Technical verification

- `npx tsc --noEmit` — clean.
- `npm run test` — 1000/1000 passing (includes `waterMirror.test.ts`, `vegetationRegionBatcher.test.ts`,
  `chunkManager.test.ts`).
- `npm run build` — succeeds (`vue-tsc --noEmit && vite build`).
- `git diff` reviewed — 5 files touched: `src/world/waterMirror.ts`, `src/app/createApp.ts`,
  `src/world/createLights.ts`, `src/terrain/chunkManager.ts`, `src/terrain/vegetationRegionBatcher.ts`.

## Browser benchmark (2026-08-18, review 020)

Cursor IDE browser, Intel Arc 140V (hardware ANGLE/D3D11, not SwiftShader), 1068×906 dpr 1, seed 42, res 193, High, 30 s. Compared grass-only `68e1bf4` vs grass+144 S `c834210`. Full tables: [review 020](../reviews/2026-08-18--020--water-grass-gpu-benchmark.md).

- **`current`** (matched spawn, 61 chunks): run 1 mirror draw calls 206→197 (−4.4%), WATER 2.2→2.1 ms, FPS 58.2→58.7, RENDER 12.9 ms both. Run 2 census identical; mirror 197→204 (no drop); FPS unusable (host load). Scene grass/terrain/vegetation census identical both runs.
- **`water`** (matched lake, 62 chunks): run 1 mirror 30→25, run 2 30→23. WATER ~1.1 ms in the quiet run. Scenario is GPU-light.
- **`stream`**: hitch-dominated (max frame 1.7–6.2 s shader compile); end census drifted (69 vs 77 chunks). Not used as a 144 S FPS verdict.

S's draw-call gate is weakly met on `current` (low end of the predicted 5–15% mirror-cost band) and does **not** move FPS/WATER, where WATER is already ~2 ms vs RENDER ~13 ms. M/L stay out of scope.

## Not verified

- No manual visual check (shoreline, distant village/forest silhouette in the reflection) for a hard
  cutoff at the new outer-ring boundary.
- Checked (by reading, not by rendering) that objects moved to `REFLECTION_DISTANT_LAYER` still cast
  shadows (shadow camera enables the layer). The only other layer-sensitive raycaster in the codebase
  (`gameLoop.ts`'s `cameraMeshRaycaster`, debug-only behind `?camdebug=1`, default layer 0 only) will
  miss outer-ring content once relayered — cosmetic for that debug overlay only, not exercised at
  runtime; no gameplay raycasting exists (interaction/melee use distance/arc tests, not raycasts).
