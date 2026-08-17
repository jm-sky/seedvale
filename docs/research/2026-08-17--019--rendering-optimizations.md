# Research 019: rendering optimizations — reflection pass, post chain

**Status:** `verification needed` (implemented + technically verified; **no browser benchmark run**)
**Date:** 2026-08-17
**Context:** [015](2026-08-17--015--streaming-hitch-gl-errors-handoff.md) · [016](2026-08-17--016--threejs-source-pack.md) · [017](2026-08-17--017--threejs-rendering-audit.md) · [018](2026-08-17--018--stream-isolation-probes.md)

Acts on research 018's conclusion that the water mirror is the largest concrete
sustained bottleneck. Everything below is implemented on `main`.

---

## 1. Baseline

`?benchmark=stream`, 30 s, seed 42, quality `High`, pixel ratio 1 — the
`baseline` probe from research 018 §2:

| metric | value |
|---|---:|
| FPS avg | 23.3 |
| frame avg / p95 / max | 43.0 / 69.8 / 390.8 ms |
| draw calls avg | 2298 (mirror 858, main pass 1440) |
| triangles avg | 18.81 M |
| `RENDER` | 28.7 ms |
| `WATER` (≈ the mirror pass) | 10.5 ms |

Scene census at the end of that run — the population each pass submits:

| bucket | meshes | draw calls | triangles |
|---|---:|---:|---:|
| grass | 60 | 60 | **2 438 922** |
| vegetation | 311 | 311 | 1 343 266 |
| settlement | 585 | 585 | 785 494 |
| terrain | 68 | 68 | 557 056 |
| water | 45 | 45 | 368 640 |
| npc / fauna | 339 | 339 | 171 414 |
| items | 126 | 126 | 9 305 |
| environment / other | 459 | 459 | 57 797 |
| **total** | **1993** | **1993** | **5 731 894** |

Grass alone is **43 % of the scene's triangles** in 60 draw calls, and it is on
layer 0, so the reflection pass submits all of it.

### 1.1 The measurement that drives every decision below

The reflection is weighted far more weakly than the pass's cost suggests.
From `src/world/waterMaterial.ts`:

```glsl
float reflectance = min(0.4, rf0 + (1.0 - rf0) * pow(1.0 - facing, 5.0)) * uReflections;
vec3 tinted    = mix(mirrorSample, body, 0.55);
col            = mix(col, tinted, reflectance);
```

- `reflectance` is hard-clamped to **0.4**, and the sample is then diluted 55 %
  toward the water body colour, so the mirror texture can never contribute more
  than **0.4 × 0.45 ≈ 18 %** of the final water pixel.
- That 18 % only occurs at extreme grazing angles. At an ordinary third-person
  view of a lake (`facing ≈ 0.7`), `pow(1 − 0.7, 5) ≈ 0.0024`, so
  `reflectance ≈ 0.024` and the mirror contributes **~1 %** of the water colour.

A 128 × 128 target, resampled with animated distortion, weighted ≤18 % and
typically ~1 %. Fine detail inside that budget is not representable — which is
what makes §2.1 and §2.3 look-preserving rather than a quality trade.

---

## 2. Implemented

### 2.1 Grass is skipped by the reflection pass

**Problem.** Grass is the heaviest bucket in the scene (2.44 M triangles,
84 504 instances) and was submitted a second time, at full detail, into the
128² reflection target. A blade is orders of magnitude below one texel there.

**Solution.** New `REFLECTION_SKIPPED_LAYER = 3`, set on every grass
`InstancedMesh`. The mirror camera stays on layer 0 and therefore skips them;
the main camera enables the layer. This reuses the mechanism already
established for water (`WATER_RENDER_LAYER`) and agents
(`AGENT_RENDER_LAYER`, plan 113 P1) — no new system.

The sun's shadow camera deliberately does **not** enable the layer: grass sets
`castShadow = false` / `receiveShadow = false` (`grass.ts`), so it was never
drawn by the shadow pass and nothing changes there.

**Files.** `src/world/waterMirror.ts`, `src/terrain/grass.ts`,
`src/app/createApp.ts`.

**Why it is safe.** Per §1.1. Also verified that nothing raycasts grass — the
only two `Raycaster`s in `src/` are the `?debugCameraMesh` helper
(`gameLoop.ts`) and the house-lamp wall-mount search (`settlement/props.ts`),
neither of which targets grass. `Raycaster.layers` defaults to layer 0 only, so
this is the failure mode worth checking, and it does not apply.

**Source.** Layer filtering per camera is the documented Three.js mechanism
(`Object3D.layers`, `Camera.layers`); `WebGLRenderer.projectObject` tests
`object.layers.test(camera.layers)` per object.

### 2.2 The mirror honours "every other frame" below 30 FPS

**Problem.** `MIRROR_MAX_HZ = 30` is enforced against wall-clock time. Once
frames get longer than 33 ms the gate stops rejecting anything: at the measured
23 FPS every call was already 43 ms apart, so the documented "every-other-frame
at 60 Hz" silently became **every frame** — exactly when the ~10.5 ms pass is
least affordable.

**Solution.** Keep the 30 Hz cap, and add one rule: while frames are longer
than 33 ms, never run the pass on two consecutive frames. Extracted as a pure
`shouldRenderMirror()` so it is unit-testable without a WebGL context — the
same split as `shouldSuppressAo` in `render/aoBudget.ts`.

The new rule is strictly a subset of the old cadence: at ≥30 FPS behaviour is
byte-identical, at 120 FPS it still caps at 30 Hz. It only ever engages when
the frame budget is already blown.

**Files.** `src/world/waterMirror.ts`, `src/world/waterMirror.test.ts` (new,
5 tests).

**Trade-off — stated explicitly.** This is a *temporal* reduction: at 23 FPS
the reflection refreshes at ~11.5 Hz instead of ~23 Hz. It is not a spatial or
colour change and it is invisible on a static camera; it can show as slight
reflection lag during fast camera rotation, damped by the shader's animated
distortion and the ≤18 % weight. Revert by deleting the
`MIRROR_BUDGET_FRAME_S` branch in `shouldRenderMirror`.

### 2.3 Ground pickups are skipped by the reflection pass

**Problem.** `chunk-items` (loose sticks, stones, berries) is 126 meshes for
9 305 triangles — ~6 % of the scene's draw calls for 0.16 % of its geometry,
submitted twice.

**Solution.** `assignRenderLayer(rec.items, REFLECTION_SKIPPED_LAYER)` after
the group is built.

**Files.** `src/terrain/chunkManager.ts`.

**Why it is safe.** Same argument as §2.1, and item pickup is not raycast-based
(see §2.1). Resource-deposit ore piles were deliberately **left in** the
reflection — they are substantial props, not clutter.

### 2.4 God rays leave the chain when intensity is zero

**Problem.** `GodRaysShader` fades to `intensity = 0` outside dawn/dusk and
whenever the camera is not looking toward the sun — i.e. most of the time. The
fragment shader already early-outs (`if (intensity <= 0.001) { gl_FragColor =
base; return; }`), but the `ShaderPass` stayed `enabled`, so every frame still
paid a full-screen read + write of a half-float composer target and one extra
`EffectComposer` buffer swap to reproduce its input exactly.

**Solution.** Track `godRaysWanted` (user/preset intent) separately from
`godRaysPass.enabled` (this frame's need), and let `updateGodRays` — which
already runs every frame, before `composer.render()` — set `enabled` from the
same `intensity > 0.001` test the shader uses.

**Files.** `src/render/createPostProcessing.ts`.

**Why it is safe.** The disabled pass and the early-outing shader produce the
same pixels by construction; the threshold is copied from the shader. The AO
and bloom passes already toggle `enabled` mid-chain, and `EffectComposer`
assigns `renderToScreen` to the last *enabled* pass, so dropping a middle pass
is supported. `OutputPass` is last and always enabled.

**Source.** `three/examples/jsm/postprocessing/EffectComposer.js` — `render()`
skips `pass.enabled === false` and resolves `renderToScreen` against the last
enabled pass.

### 2.5 Removed the dead `mirrorCamera.far` assignment

**Problem.** `mirrorCamera.far = camera.far` read as a reflection view-distance
control (research 018 §3 cited it as one) but had **no effect**: the very next
line copies the main camera's `projectionMatrix` wholesale, and Three.js builds
the culling frustum from `projectionMatrix × matrixWorldInverse`, never from
`camera.far`. `updateProjectionMatrix()` is never called on this camera.

**Solution.** Removed the line, replaced with a comment recording why a shorter
far plane is not the lever it appears to be — see §4.1.

**Files.** `src/world/waterMirror.ts`.

---

## 3. Verification

| check | result |
|---|---|
| `npx tsc --noEmit` | pass |
| `npm run lint` | pass |
| `npm run build` (`vue-tsc`) | pass |
| `npm run test` | pass — 115 files, 915 tests (5 new) |
| browser benchmark | **not run** |

**No performance claim in this document has been measured.** The `stream`
benchmark has not been re-run since these changes landed. Expected direction
(prediction, not evidence): mirror draw calls and triangles down, `WATER` down,
frame avg/p95 down. Max frame is expected to be unchanged — research 018 §4
showed it survives even with the mirror fully disabled.

### 3.1 What to check in the browser

1. Reflections still show sky, terrain silhouettes, trees and buildings.
2. Grass is absent from reflections — confirm this reads as a slight colour
   shift on reflected ground, not as a visible hole.
3. Reflection lag while spinning the camera fast at low FPS (§2.2).
4. God rays still appear at dawn/dusk when looking toward the sun, and fade in
   and out without popping.
5. Grass itself is unchanged in the main view — a mistake in the layer plumbing
   would make grass vanish entirely, which is unmissable.
6. `?benchmark=stream` against §1.

---

## 4. Not implemented — follow-ups

### 4.1 Shorter reflection far plane

Doing this properly means rebuilding the projection (§2.5), not setting `far`.
The win is small: `camera.far` is 500, but the streamed world only reaches
`loadRadius` chunks — 3 × 64 = ±224, so ~316 units at the diagonal. Culling
between 316 and 500 removes nothing. Culling at the fog-out distance instead
(`scene.fog = new Fog(0x6a93b0, 160, 280)`, `createScene.ts`) would remove only
corner chunks, and would swap flat fog colour for the sky dome at the horizon.
Not worth the risk for the size of the win.

### 4.2 N8AO renders the scene a second time

`N8AOPass` renders its own depth/normal buffer with a material override, i.e. a
full extra scene submission inside `RENDER`, on top of the beauty pass. This is
consistent with the arithmetic: the scene census is ~5.7 M triangles while
`mirror-off` measured 9.83 M rendered triangles per frame. `N8AOPostPass`
(reusing an existing depth texture) is the alternative, but it is a
rendering-architecture change, and research 015 recorded a `GL_INVALID_OPERATION`
sampler-mismatch already suspected to involve n8ao's MRT handling against
three@0.185. Needs its own plan and benchmark.

### 4.3 Instanced-prop fragmentation

Vegetation is **311 `InstancedMesh`es for 709 instances** — 2.3 instances per
draw call. `buildInstancedProps` batches per `(chunk, species, primitive)`, so
instancing buys almost nothing at this population. Batching across chunks would
be the single largest draw-call reduction available, and it applies to *every*
pass. It is a real refactor of `render/instancedProps.ts` +
`terrain/chunkManager.ts`, out of scope here.

Settlement has the same shape from the other direction: 585 meshes, only 92 of
them instanced.

### 4.4 Shadow map re-renders every frame

`gameLoop.ts` sets `renderer.shadowMap.needsUpdate = true` unconditionally each
frame, so every caster is resubmitted at 1024² every frame. Throttling it is a
second *temporal* degradation on top of §2.2, and NPC/fauna motion makes it
more visible than a stale reflection. Deliberately not stacked here.

### 4.5 Instrumentation still missing

Research 018 §8.2 stands: `withCategory()` never calls `recordHitch()`, so the
300–900 ms frames remain unattributed. Adding `performance.mark`/`measure`
around `renderMirror()` and `composer.render()` is a prerequisite for
attributing max frame time. Untouched by this batch.

### 4.6 First-use program stalls

Out of scope per research 017 §3.1 and the standing decision not to revisit
`compileAsync()` prewarming (research 014). Nothing here changes program
variants: both the mirror and the composer still render into non-null,
non-XR targets and therefore still share one cache key.
