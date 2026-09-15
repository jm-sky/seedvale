# Implementation notes: world-terrain-035 streaming visual horizon and distant occlusion

**Reviewed:** 2026-09-15  
**Plan:** `docs/plans/world-terrain-035-streaming-visual-horizon-and-distant-occlusion.md`  
**Baseline:** `main` at `f652b7baf9ff2a7c61954100483c50a41e2a1c3b`

## Current code facts

- `WorldConfig.terrain` in `src/config/worldConfig.ts` owns `chunkSize`, `loadRadius` and `unloadRadius`; defaults are currently `64 / 3 / 4`. `unloadRadius` is explicitly hysteresis and is not a guaranteed forward-visible radius.
- `src/terrain/chunkManager.ts` owns streamed terrain lifecycle. The desired terrain region uses `loadRadius`; already-loaded chunks may remain until `unloadRadius`. Therefore the visual contract must derive from the desired/load ring, never from retained chunks.
- `src/world/dayNight.ts::skyParamsFromTime()` currently creates outdoor fog with `fogNear = 50 + dayFactor * 80` and `fogFar = 150 + dayFactor * 100`. Its comment currently says `fogFar` covers approximately `unloadRadius × chunkSize`; that assumption is incorrect for guaranteed forward coverage and should be corrected when implementing this plan.
- `src/world/weatherVisuals.ts` is the pure composition seam: `applyWeatherOverlay()` can only move/tint weather fog, while `resolveSceneFog()` chooses outdoor fog vs the fixed `CAVE_INTERIOR_FOG_*` values.
- `src/app/gameLoop.ts::applyDayNight()` calls `applyWeatherOverlay(...)`, then `resolveSceneFog(...)`, then mutates the existing `THREE.Fog` on `scene.fog`. Day/night work is already throttled by `DAY_NIGHT_APPLY_THRESHOLD`; keep horizon composition on this existing path rather than adding per-frame scene traversal.
- `src/app/worldBundle.ts` deliberately streams settlements independently with `SETTLEMENT_LOAD_RADIUS = 300` and `SETTLEMENT_UNLOAD_RADIUS = 420`. `homeChunks()` pins only the 3×3 origin chunk block. Do not alter these values or make settlement simulation depend on render distance.
- `src/app/worldBundle.ts` already computes an ocean presentation fade from `loadRadius * chunkSize` / `(loadRadius + 1) * chunkSize`. This demonstrates that presentation may derive distances from terrain streaming configuration, but those ocean values are not a safe terrain guarantee and should not be reused as the horizon formula.
- `world-terrain-026` is implemented. `src/world/caves/caveHeightfieldPresentation.ts::createCaveMouthProxy()` builds a presentation-only backing from `buildCaveMouthProxyBuffers()` using the same `mouthOpeningAt()` contour as the real mouth.
- Important cave/fog interaction: `createMouthUndersideMaskMaterial()` currently has `fog: false`, `createCaveMouthProxy()` receives that shared `maskMaterial`, and then calls `exemptCavePresentationFromSceneFog(group)`. Therefore the existing mouth proxy intentionally bypasses global scene fog. The implementation must not assume the new shared outdoor fog automatically hides that proxy near the streaming horizon.
- Full cave presentation also deliberately opts out of `scene.fog` through `exemptCavePresentationFromSceneFog()`. Preserve cave-interior presentation semantics; do not globally remove that exemption merely to solve the distant mouth case.

## Recommended ownership

Add the visual-horizon calculation as a small pure terrain-owned module:

`src/terrain/terrainVisualHorizon.ts`

Suggested contract:

```ts
export type TerrainVisualHorizon = {
  fadeStart: number
  opaqueAt: number
}

export function terrainVisualHorizon(input: {
  chunkSize: number
  loadRadius: number
}): TerrainVisualHorizon
```

This module owns only the geometric/presentation guarantee derived from terrain streaming configuration. It must not know about weather, settlements, caves, camera state or `WorldConfig` globals.

Add JSDoc and `@domain world-terrain` to the exported helper/type because this is a cross-domain rendering contract.

## Horizon geometry

`loadRadius` is a Chebyshev chunk radius around the player's current chunk, while the player may stand anywhere inside that chunk. A naive `loadRadius * chunkSize` radius is therefore not equally guaranteed in every direction from the player.

Choose the horizon conservatively so `opaqueAt` remains inside the minimum guaranteed Euclidean/cardinal coverage after allowing for the player's position inside the current chunk and a visual safety margin. Keep the formula explicit and tested rather than tuning a hardcoded `180`/`190` value.

Required properties:

- deterministic from `chunkSize` + `loadRadius` only;
- `0 < fadeStart < opaqueAt`;
- `opaqueAt` remains inside guaranteed desired terrain coverage;
- transition width scales reasonably with chunk size;
- supported small radii still produce a useful positive fade;
- changing `unloadRadius` must not affect the result.

Do not query live loaded chunks to expand the horizon. Doing so would make visibility depend on travel direction/history and recreate the original inconsistency.

## Fog composition seam

Keep day/night and weather ownership unchanged. Add a narrow pure outdoor cap in `src/world/weatherVisuals.ts`, either by extending `resolveSceneFog(...)` with a `TerrainVisualHorizon` argument or by composing an equally small helper immediately before it.

Preferred precedence:

```text
skyParamsFromTime()
→ applyWeatherOverlay()
→ cap outdoor distances by terrain visual horizon
→ resolve cave-interior override
→ existing THREE.Fog mutation in gameLoop.applyDayNight()
```

The cap may only make outdoor fog nearer/stronger:

```text
fogFar <= min(weatherFogFar, horizon.opaqueAt)
fogNear <= min(weatherFogNear, horizon.fadeStart)
fogNear < fogFar
```

Do not alter `fogColor`; horizon fog should continue using the day/night/weather atmospheric color so there is no second visual fog system.

`CAVE_INTERIOR_FOG_COLOR/NEAR/FAR` remain authoritative and must be byte-for-byte unaffected by the terrain horizon.

## Threading the horizon

Do not let `weatherVisuals.ts` import `WorldConfig` or read mutable global config.

The horizon should be computed at an app/world composition boundary from the live world config and passed into the game-loop fog path. Two acceptable shapes are:

- store the current horizon on the mutable `WorldBundle`, recomputed whenever the bundle is rebuilt; or
- pass a getter into `GameLoopDeps` that derives from the current world configuration/bundle.

Prefer the smallest shape that preserves the existing world rebuild rule: closures created before rebuild must not capture stale per-world values. `WorldBundle` is intentionally a stable mutable container whose fields are replaced during rebuild, so if the horizon becomes a bundle field, `gameLoop` should read `bundle.<field>` at application time rather than destructuring/capturing the old value.

Do not introduce a second config singleton or terrain-render manager.

## Settlement behavior

No settlement ownership changes are required if normal settlement materials already honor scene fog.

Keep:

- `SETTLEMENT_LOAD_RADIUS = 300`;
- `SETTLEMENT_UNLOAD_RADIUS = 420`;
- settlement/NPC simulation and persistence unchanged;
- home settlement lifecycle unchanged.

The invariant is presentation-only: loaded buildings may continue to exist outside the terrain horizon, but standard fog-aware exterior meshes become unreadable before unsupported terrain can disappear.

Perform a focused material audit in settlement construction only if a building/prop visibly bypasses fog. Fix confirmed `fog: false`/custom-shader bypasses at the material seam; do not add per-building distance checks or unload logic.

## Cave-specific decision

Do not replace or duplicate `world-terrain-026`.

There are two separate cases:

1. **Readable-range leak:** if the cave aperture shows bright sky while still comfortably inside the terrain visual horizon, fix the existing proxy geometry/lifecycle in `caveHeightfieldMesh.ts`, `caveHeightfieldPresentation.ts` and/or `createCaves.ts`.
2. **Horizon-range leak:** the proxy currently bypasses global fog. Give the *distant mouth proxy* a way to participate in outdoor horizon hiding without changing full cave-interior fog semantics.

Prefer separating proxy fog behavior from full-cave fog behavior rather than weakening `exemptCavePresentationFromSceneFog()` globally. For example, `createCaveMouthProxy()` should not blindly apply the full cave exemption if its role is exterior distant occlusion. If the shared `maskMaterial` must remain fog-free for the near/full cave underside mask, use a proxy-specific material/clone or a narrow option so the proxy can honor outdoor scene fog without mutating the shared material.

Be careful with `sharedGpu`: `exemptCavePresentationFromSceneFog()` clones shared materials before changing fog state. Any inverse operation must likewise avoid mutating a cached/shared material used by full cave presentation.

## Cave lifecycle seams

`src/world/createCaves.ts` owns `mouthProxies` and calls `createCaveMouthProxy(...)` with the shared `maskMaterial`. Preserve the plan-026 ordering guarantees:

- proxy exists while full presentation is inactive;
- hide proxy only after full cave presentation is successfully attached;
- restore proxy before/when full presentation is dropped;
- failed full-presentation build must not leave a naked terrain aperture.

Do not raise full-cave activation distance to hide the problem.

## Focused fog-bypass audit

Only inspect exterior presentation that can silhouette beyond terrain:

- terrain chunk material/shader;
- settlement house/prop materials;
- cave mouth proxy specifically;
- large landmark presentation/custom shaders.

Known deliberate exemptions that should remain exempt unless directly required:

- sky dome;
- full cave/interior presentation;
- cave-specific dark local presentation whose semantics depend on not washing toward exterior fog.

Avoid a repository-wide material rewrite.

## Tests worth adding

### `src/terrain/terrainVisualHorizon.test.ts`

Test the pure contract directly:

- default `64 / 3` yields `fadeStart < opaqueAt` and `opaqueAt` inside guaranteed desired coverage;
- doubling `chunkSize` scales both distances predictably;
- increasing `loadRadius` expands the horizon predictably;
- supported minimum radius still gives positive transition width;
- no `unloadRadius` input exists / hysteresis cannot expand the result.

### `src/world/weatherVisuals.test.ts`

Extend existing tests around `resolveSceneFog()`:

- clear/day outdoor far distance is capped by `opaqueAt`;
- outdoor near distance is capped by `fadeStart` without crossing far;
- rain/storm/fog that are already nearer remain unchanged;
- cave interior still returns exact `CAVE_INTERIOR_FOG_*` constants;
- lightning path still modifies presentation as today and does not move fog beyond the horizon.

### Cave tests

Reuse existing cave presentation tests rather than creating E2E browser tests:

- proxy material behavior is isolated from full cave material fog behavior;
- shared `maskMaterial` is not accidentally mutated when proxy fog participation differs;
- `createCaveMouthProxy()` remains presentation-only with non-empty geometry for representative production mouths;
- existing `createCaves` lifecycle tests keep proxy/full ordering guarantees.

If the reported bright aperture requires geometry repair, add the smallest buffer-level regression in `caveHeightfieldMesh` tests for the failing sightline/contour case.

## Files likely touched

Core:

- `src/terrain/terrainVisualHorizon.ts` — new pure contract.
- `src/terrain/terrainVisualHorizon.test.ts` — pure geometry/config tests.
- `src/world/weatherVisuals.ts` — outdoor horizon cap while preserving cave override.
- `src/world/weatherVisuals.test.ts` — precedence/composition tests.
- `src/app/gameLoop.ts` — pass/read the current horizon in `applyDayNight()`; no new per-frame scans.
- app/world composition (`src/app/worldBundle.ts` and/or `src/app/createApp.ts`) — compute/thread current horizon without stale rebuild capture.
- `src/world/dayNight.ts` — correct the obsolete `unloadRadius × chunkSize` comment; fog numbers themselves should stay atmospheric inputs and be capped downstream.

Conditional after focused recon/reproduction:

- `src/world/caves/caveHeightfieldPresentation.ts` — proxy-only fog behavior and/or geometry wrapper fix.
- `src/world/caves/caveHeightfieldMesh.ts` — only if aperture coverage itself is wrong.
- `src/world/createCaves.ts` — only if lifecycle ordering is the leak or a proxy-specific material is best owned there.
- existing cave tests beside those modules.
- settlement/landmark material files only for confirmed `fog` bypasses.

Documentation after implementation:

- `docs/STATE.md` / relevant state rendering section: record the terrain visual horizon as the shared exterior presentation contract if implemented as planned.

## Important pitfalls

- Do not use `unloadRadius` to make the horizon look farther; retained chunks are historical/hysteresis state, not a guarantee.
- Do not capture a horizon derived from the old config across world rebuilds.
- Do not make horizon fog a simulation condition; settlements/NPCs/fauna must continue independently.
- Do not globally enable scene fog on all cave presentation; cave interior intentionally has separate fog semantics.
- Do not mutate shared cave materials when making proxy-specific fog changes.
- Do not solve the visual bug by increasing terrain radius, camera far plane or full cave activation radius.
- Do not add per-object distance loops when standard Three.js fog already performs the fade in material shaders.

## Suggested implementation order

1. Implement/test `terrainVisualHorizon()` with a conservative guaranteed-coverage formula.
2. Thread the live horizon through the stable world/app lifecycle without stale capture.
3. Cap outdoor fog in the existing weather/fog composition and update tests.
4. Correct the misleading `dayNight.ts` comment.
5. Focus-audit settlement/landmark fog participation; change nothing if standard materials already comply.
6. Check cave proxy behavior. If the leak is only horizon-related, make the proxy honor exterior fog without changing full cave presentation. If it leaks inside readable range, repair existing plan-026 geometry/lifecycle and add its focused regression test.
7. Update current-state docs and run focused tests + `npx tsc --noEmit`.

Manual browser verification remains the User's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**