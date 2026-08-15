# 010 — Mobile black flicker: `InstancedMesh` + foliage-wind shader

**Status:** `verification needed` (mobile fix confirmed working; exact GLSL/program-cache defect not yet root-caused — separate task)
**Date:** 2026-08-15
**Related:** [issue 032 — Sporadyczny czarny świat 3D na telefonie](../issues/2026-08-15--032--mobile-black-world-screen.md)

## Symptom

Recurring on mobile, distinct from the two causes already fixed in issue 032 (camera-in-geometry; 0-height resize/composer). Distinguishing characteristics for *this* variant:

- Cyclical/recurring during a play session, not a one-off.
- Screen goes black, or shows black "flying" polygons, rather than a clean black frame.
- Occurred **outside settlements too** (open terrain, no houses/props nearby) — ruled out anything settlement-specific as the sole cause.
- `?camdebug=1` showed no camera anomaly: valid position/rotation, sane `terrainY`/`cam-ground`.
- `contextLost=false`, `gl error NONE` — not a WebGL context loss, not a driver-reported GL error.
- The minimal scene (terrain + lighting + NPC labels only, everything else hidden) rendered correctly with no flicker — confirming the cause was in one of the hidden object categories, not in terrain/camera/renderer/lighting itself.

## Method

Diagnostic-only `?debugMinimalScene=1` + `?debugSceneGroup=<group>` query params (since removed — see "Cleanup" below) hid every rendered object except terrain/lights/NPC labels, then re-revealed one category at a time so each could be isolated and tested independently on the affected device without a new deploy per test.

### Isolation results

```text
props-environment  → OK
props-settlement   → FLICKERING
props-fire         → OK
props-dropped      → OK
props-tents        → OK
props-other        → FLICKERING

trees-living       → FLICKERING
trees-extra        → OK
trees-settlement   → OK

npcs               → OK
buildings          → OK
```

Minimal scene (terrain + lighting + NPC labels) → **OK**.

## Common denominator found

Cross-referencing what the three flickering groups actually contain (not just their debug-bucket names) against the eight non-flickering groups narrowed it to one precise intersection:

**`THREE.InstancedMesh` rendering a material patched by `src/world/foliageWind.ts`'s wind-sway shader.**

Every flickering group contained at least one `InstancedMesh` built by `buildInstancedProps` (`src/render/instancedProps.ts`) from a foliage-named material (matches `FOLIAGE_NAME_RE = /leaves|green|flowers/i`):

- `trees-living` — `chunk-vegetation-tree-living` (terrain/chunkManager.ts), the only instanced bucket for living trees.
- `props-other` — chunk-level instanced bush/cactus/reed vegetation (`chunk-vegetation-bush/cactus/reed`), also foliage-instanced, and not covered by any of the other named debug buckets at the time.
- `props-settlement` — `settlement-bushes` (`settlement/props.ts`, `buildSettlementProps`), the settlement's own instanced bush planting.

None of the eight OK groups have both properties at once:

- `props-environment` (rocks/logs) — also `InstancedMesh` via the same `buildInstancedProps`, but stone/wood materials never match `FOLIAGE_NAME_RE`, so the wind patch never attaches. Rules out "instancing alone."
- `trees-settlement` (forest-belt trees) — same foliage-patched material and templates as `trees-living`, but placed via individual `cloneProp()` clones, **not** `InstancedMesh`. Rules out "foliage shader alone."
- `buildings` — heavily instanced (`houseBuilder.ts`), but wood/stone/plaster materials, never foliage-patched.
- `npcs`, `props-fire`, `props-dropped`, `props-tents`, `trees-extra` — neither instanced nor foliage-patched.

Only the **AND** of (rendered via `InstancedMesh`) and (material passed through the wind-sway patch) matches all three flickering groups and none of the eight working ones.

### Commit that introduced the risky code path

```text
commit  cee1a4c500723d8ca85763d9a0b191efb482a273
Date    2026-08-13
Msg     "Add tests for `disposeObject3D` functionality in `loadGltf.test.ts`"
        (misleading title — the commit also ships real GLSL + a new
        instancing pipeline, not just tests)

Files:
  src/world/foliageWind.ts      (+19/-4)
  src/render/instancedProps.ts  (new file, 215 lines — buildInstancedProps)
  src/assets/loadGltf.ts        (+7 — InstancedMesh.dispose() in disposeObject3D)
```

`src/world/foliageWind.ts`'s `BEGIN_VERTEX_WIND` gained an instancing branch (`plan 087 §2.2`), and `WIND_CACHE_KEY` was bumped `v1 → v2` because of it:

```glsl
mat4 propMatrix = modelMatrix;
#ifdef USE_INSTANCING
  propMatrix = modelMatrix * instanceMatrix;
#endif
float objScale = length( propMatrix[ 0 ].xyz );
...
vec3 world = ( propMatrix * vec4( transformed, 1.0 ) ).xyz;
```

This is the only code in the repo that makes a shared, patched (`onBeforeCompile` + `customProgramCacheKey`) `MeshStandardMaterial` behave differently depending on whether the consuming object is an `InstancedMesh` or a plain `Mesh` — and it is two days old, unexercised on mobile before this diagnostic. `render/instancedProps.ts` (`buildInstancedProps`, same commit) is the shared code path all three flickering groups' `InstancedMesh` buckets are built through.

## Experimental confirmation

```text
commit  a75ed440a7be0ac000f09f4d8584ee248b25568b
Msg     "TEST: disable foliage wind on InstancedMesh"
```

Wrapped the sway-applying body of `BEGIN_VERTEX_WIND` in `#ifndef USE_INSTANCING` — instanced foliage compiles with the wind displacement entirely absent (static position), non-instanced foliage keeps swaying exactly as before. `buildInstancedProps`/`InstancedMesh` usage itself was left untouched; instancing stayed fully active. `WIND_CACHE_KEY` bumped to `v3`.

**After deploy: black flickering → does not occur.**

This is currently the strongest evidence for `InstancedMesh + foliageWind` as the cause. We do **not** yet claim to know the exact shader/program-cache defect inside that combination — root-causing the precise GLSL/WebGL mechanism (and shipping a real fix that restores wind sway for instanced foliage) is a separate follow-up task. For now the instancing branch stays disabled (see `src/world/foliageWind.ts`, `#ifndef USE_INSTANCING`) — non-instanced foliage (individual clones, e.g. forest-belt trees) is unaffected and still sways.

## Alternative hypotheses considered (not ruled out, weaker fit)

1. `buildInstancedProps`/`instancedProps.ts` itself (dispose, `computeBoundingSphere()`, shared-geometry cache) independent of the shader — weaker fit because `props-environment`/`buildings` use the same function and are unaffected.
2. `InstancedMesh.dispose()` (added in the same commit, `loadGltf.ts`'s `disposeObject3D`) combined with how often vegetation chunks stream in/out vs. lower-churn rocks/logs.
3. WebGL program-cache handling of a shared `Material` across instanced and non-instanced consumers with a context-independent `customProgramCacheKey()`.

## Cleanup

The diagnostic-only mechanisms used to reach this conclusion (`?debugMinimalScene=1`, `?debugSceneGroup=<group>`, `src/debug/minimalSceneDebug.ts`, and several forced-disable `TEST:` commits for grass/weather/N8AO/EffectComposer/shadows/player mesh & animation/fauna spawn/chunk-finalize-budget) were removed as part of restoring the full application (see commit "Restore full app and centralize debug config"). Kept, as genuinely reusable lightweight tools: `?camdebug=1`, `?debugRenderState=1`, `?debugNoShadows=1`, `?debugCameraMesh=1`, and a new central `?debugDisableSystems=grass,trees,animals,npcs,playerModel,weather` switch (`src/debug/debugMode.ts`, `isSystemEnabled`) for future perf/mobile/isolation testing without adding a new query param per system.

## Next step (separate task)

Root-cause the exact GLSL/program-cache failure inside `InstancedMesh` + `onBeforeCompile`-patched shared material, then re-enable wind sway for instanced foliage without reintroducing the flicker.
