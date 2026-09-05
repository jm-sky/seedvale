# Plan: Macro meadow variation

**Created:** 2026-09-05
**Status:** `planned` 📋
**Priority:** medium · **Effort:** S
**Depends on:** none
**Domain:** `world-terrain`
**Type:** `feature`
**Subdomains:** `vegetation` `rendering`
**Tags:** `grass` `meadow` `performance`
**Roadmap:** -

## Goal

Increase large-scale visual variety of grassland without introducing a new biome or vegetation system.

Create deterministic, softly blending meadow patches on the scale of roughly tens of metres (target order: ~30–80 m), so predominantly green grassland can contain organic areas that are drier/yellower or otherwise visibly different at macro scale.

The feature must reuse the existing grass placement/color pipeline and must be cheap enough to compare directly against the current baseline.

## Current state

Grass placement is already generated deterministically in `src/terrain/grassPlacement.ts`, worker-safe, and produces per-instance base/tip colors for the existing `tri`, `grain`, `herb` and `filler` buckets.

The current renderer in `src/terrain/grass.ts` consumes that placement data as instanced meshes. Existing grass performance work showed that grass can contain hundreds of thousands of instances, so macro variation must not add objects, instances or draw calls merely to create differently coloured meadow regions.

This is separate from `world-terrain-009-seasonal-ground-and-grass-appearance`: plan 009 changes grass appearance over world time using shared climate state; this plan adds stable spatial variation across the world. Both effects should be able to compose later without either becoming authoritative for the other.

## Scope

### 1. Deterministic macro meadow signal

Extend the existing worker-safe grass placement path with one low-frequency deterministic world-space signal derived from the world seed and `(x, z)`.

Requirements:

- continuous across chunk boundaries,
- stable for the same seed,
- world-space scale in the order of tens of metres rather than per-blade noise,
- broad organic regions rather than visible square/chunk patches,
- no new persistent world state.

Start with the smallest useful model: one macro signal controlling a blend between the existing green appearance and one drier/yellower meadow appearance. Do not add a general meadow taxonomy in this plan.

### 2. Soft transitions

Avoid hard thresholds between green and dry meadow regions.

Use a smooth blend band so nearby instances can progressively/intermittently mix both appearances at the boundary. The result should read as interpenetrating meadow areas rather than a painted contour line.

The implementation may reuse the existing per-instance colour variation/jitter, but the macro signal should remain visually dominant at the intended 30–80 m scale.

### 3. Preserve existing grass structure

Do not change:

- grass density,
- instance positions,
- species bucket counts,
- geometry,
- grass LOD,
- draw-call structure.

Macro variation should affect colour selection/tinting during the existing placement computation only.

### 4. Benchmark/debug toggle

Add an explicit boolean configuration switch under the existing grass configuration, e.g. `config.terrain.grass.macroVariationEnabled`.

Requirements:

- `false` reproduces the current grass colour-placement path as closely as possible and acts as the benchmark baseline,
- `true` enables only the new macro variation work,
- expose the switch in the existing grass section of lil-gui,
- changing it may use the existing terrain/grass rebuild path; a special live-update system is not required,
- make the active value visible in benchmark/report context so `OFF` and `ON` captures cannot be confused later.

Do not create a separate benchmark scenario solely for this feature. Use the existing deterministic benchmark scenarios and compare the same seed/scenario/config with the switch changed.

### 5. Performance comparison

The implementation must make A/B measurement straightforward.

Compare at minimum the same canonical benchmark scene with:

- macro variation `OFF`,
- macro variation `ON`.

Keep seed, resolution, quality preset, viewport and scenario identical.

Record at least:

- FPS / frame-time,
- `RENDER` timing,
- grass instance count,
- grass draw calls,
- triangle count,
- any chunk-generation/streaming timing already exposed by the benchmark that can reveal additional CPU generation cost.

Expected structural invariant: instance count, draw calls and triangles should remain unchanged. Any measurable regression should therefore be attributable mainly to the added placement computation/data work rather than extra rendering geometry.

## Constraints

- Reuse `grassPlacement.ts`; do not create a parallel meadow placement system.
- Prefer the existing seeded noise/FBM utilities rather than a new dependency.
- Keep the signal world-space based so chunk boundaries cannot affect the pattern.
- No extra meshes, materials or draw calls for colour regions.
- No per-frame CPU meadow calculations.
- No additional worker solely for meadow variation; it belongs in the existing grass generation work.
- Do not couple spatial meadow variation to seasons, weather or biome redesign in this plan.
- Important new public/architectural helpers should receive concise JSDoc where useful for preflight discovery, using `@domain world-terrain` where appropriate.

## Non-goals

- Multiple named meadow biomes/types.
- New plant species or geometry.
- Seasonal colour progression — owned by `world-terrain-009`.
- Gameplay effects such as forage quality, soil fertility or animal preference.
- Changing grass density according to meadow type.
- A new texture/material splat system.
- Runtime simulation of meadow expansion or succession.

## Verification

### Automated

- Typecheck/build/tests pass.
- Add focused tests for deterministic macro variation if a pure helper is introduced:
  - same seed/position gives the same result,
  - neighbouring chunks sample continuously from world coordinates,
  - output/blend remains bounded,
  - disabling the feature preserves baseline placement counts.

### Benchmark

Run the existing benchmark with identical settings for `macroVariationEnabled=false` and `true`.

Success criteria:

- grass instance count, draw calls and triangle count remain unchanged,
- no meaningful render-time regression attributable to the feature,
- any increase in grass/chunk generation cost is small enough to accept for the visual benefit.

Do not infer success from a single noisy FPS number; use the existing benchmark timings/census and repeat when results are ambiguous.

### Browser / manual

Player verifies:

1. Broad green and dry/yellow regions are visible on open grassland at roughly tens-of-metres scale.
2. Boundaries blend naturally rather than forming hard lines.
3. No chunk seams or obvious square tiling are visible.
4. Fine per-instance colour variation is still present inside macro regions.
5. Turning the debug switch off restores the previous appearance.
6. The effect remains coherent while moving across streamed chunks.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
