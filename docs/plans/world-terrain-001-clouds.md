# Plan: Cloud System

**Created:** 2026-08-24
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** none

**domain:** `world-terrain`
**tags:** `[weather]`

## Goal

Add a simple, performant visual cloud layer to Seedvale using the existing cloud PNG assets and the existing weather state. Clouds should move across the sky, with dark clouds visually indicating rainy weather.

The existing rain and snow systems remain unchanged and are reused rather than reimplemented.

## Current state

- `src/world/weather.ts` already owns the weather state and weather transitions.
- Rain and snow visual effects already exist.
- Cloud textures are available in `public/images/clouds/`:
  - `cloud1.png`
  - `cloud2.png`
  - `cloud3.png`
  - `cloud4.png`
- No volumetric cloud or cloud-mesh system is required for this version.

## Scope

### 1. Cloud rendering

Create a small `CloudSystem` responsible for the visual cloud layer.

- Use `THREE.Sprite` / `THREE.SpriteMaterial` with the existing PNG textures.
- Load and reuse the four textures instead of creating duplicate texture resources.
- Spawn a limited number of clouds around/above the playable world.
- Randomize texture, position, scale and slight vertical/depth variation.
- Use transparent PNGs and normal alpha blending.
- Keep the implementation lightweight and compatible with the existing rendering architecture.

### 2. Cloud movement

- Clouds slowly move across the sky in one consistent direction.
- Movement is smooth and frame-rate independent.
- Clouds leaving the configured cloud area are recycled rather than continuously created/destroyed.
- Use a simple configurable movement speed; do not introduce a full wind simulation yet.

### 3. Weather integration

Use the existing weather state from `weather.ts`.

Initial visual mapping:

| Weather | Cloud appearance |
|---|---|
| clear | few or no clouds |
| cloudy | normal white/grey-blue clouds |
| rain | dark grey/blue-tinted clouds |
| snow | normal/light clouds |
| fog | no special cloud behaviour |

- Use the same PNG assets for normal and rainy clouds.
- Change the cloud material tint for rainy weather instead of requiring separate rain-cloud PNGs.
- Do not make cloud position control weather in this version.
- Do not create a second weather state or duplicate weather logic.
- Existing rain/snow effects continue to be controlled by the existing weather system.

### 4. Lifecycle and integration

- Add the cloud system at the appropriate existing world/rendering ownership point rather than introducing a new global manager.
- Clouds should be created/updated/destroyed together with the relevant world/render lifecycle.
- Avoid coupling clouds to individual chunks unless existing rendering architecture requires it.
- Ensure clouds remain visible independently of terrain/chunk streaming.

## Out of scope

- Volumetric clouds.
- Raymarching/cloud shaders.
- Cloud shadows on terrain.
- Cloud collision or physical cloud volumes.
- Cloud-driven weather changes.
- Real wind simulation.
- Localized precipitation zones based on cloud position.
- New rain or snow particle systems.
- Separate rainy-cloud texture assets.
- Multiplayer/network synchronization of cloud visuals.

## Performance requirements

- Reuse the four loaded textures.
- Keep the number of sprites bounded and configurable.
- Recycle cloud sprites instead of allocating every time they cross the world boundary.
- Avoid per-cloud allocations during normal updates.
- Do not introduce Web Workers; cloud movement is trivial CPU work.
- Avoid additional expensive shader programs or post-processing.

## Implementation guidance

Before coding:

1. Read `CLAUDE.md`.
2. Read `docs/STATE.md` and verify the current weather/rendering ownership.
3. Inspect the existing world/render lifecycle and identify the correct owner for `CloudSystem`.
4. Inspect existing texture-loading/material conventions and reuse them.
5. Verify the actual `weather.ts` API and do not assume the state shape from this plan if the code differs.

Prefer the smallest implementation that fits the existing architecture. If the current code already has an appropriate reusable sprite/effect manager, extend it instead of creating a parallel rendering mechanism.

## Verification

### Technical

- `tsc` passes.
- lint passes.
- build passes.
- existing tests pass.

### Browser/manual

Verify in the running game:

- clouds render correctly with transparent edges,
- white clouds are clearly visible against the sky,
- rainy weather produces visibly darker clouds,
- clouds move smoothly and continuously,
- clouds recycle without visible popping or uncontrolled growth,
- clear/cloudy/rain/snow weather transitions do not break existing precipitation,
- no obvious frame-time or draw-call regression is introduced.

### Visual/performance

Check a representative scene with multiple clouds and compare rendering metrics where practical. Confirm that cloud rendering does not create an unnecessary draw-call or texture-memory spike.

## Expected result

Seedvale has a simple moving cloud layer. White/grey-blue clouds communicate normal/cloudy weather, while darker tinted clouds visually precede and accompany the already-existing rain effect. The implementation remains a lightweight rendering layer on top of the existing deterministic weather system.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
