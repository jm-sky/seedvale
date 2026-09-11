# Plan: Low-Cost Terrain and Cave Surface Albedo

**Created:** 2026-09-11
**Status:** `verification needed` 🔍
**Type:** `polish`
**Priority:** medium · **Effort:** S
**Depends on:** ~~world-terrain-019~~
**Domain:** `world-terrain`
**Subdomains:** `terrain` `rendering`
**Tags:** `textures` `caves` `performance`
**Roadmap:** -

## Goal

Improve close-range terrain and cave surface readability with two shared 1K
diffuse textures while preserving the existing vertex-colour/procedural surface
system and keeping GPU cost low.

Use only:

- `/images/textures/dirt_diff_1k.jpg`,
- `/images/textures/rock_surface_diff_1k.jpg`.

The textures are presentation-only detail. Biomes, roads, bare-ground state,
weather, cave wetness and vertex colours remain authoritative.

## Existing architecture to preserve

### Terrain

`src/terrain/buildChunkGeometry.ts` owns `createTerrainMaterial()` and
`applyTerrainSurfaceShader()`. `ChunkManager` creates one material and shares it
across all chunk meshes. The shader already exposes world position,
`vBareGround`, slope, procedural macro colour/roughness, weather effects and a
shared procedural detail normal map.

Extend this material. Do not add materials, textures or shader programs per
chunk.

### Caves

`src/world/caves/caveHeightfieldMaterial.ts` owns the shared-compatible cave
surface shader. It already has world-space triplanar normal sampling,
procedural rock variation, wetness and roughness. Cave presentation remains
relevance-streamed by the existing heightfield presentation lifecycle from
`world-terrain-019`; its unfinished semantic-interior Milestone C is not needed
for this visual polish.

Extend this material and its existing world-space inputs. Do not add resources
per cave.

## A. Shared diffuse texture ownership

Load both diffuse textures once through small, explicit shared-resource helpers:

- set `THREE.SRGBColorSpace`,
- use `RepeatWrapping`,
- retain mipmaps and suitable filtering,
- use one reasonable anisotropy policy,
- never clone either texture per material, chunk or cave.

Reuse the URL cache in `src/assets/loadTexture.ts` through shared surface
uniforms. Keep material factories synchronous and do not await loading during
world construction. Bind a tiny shared neutral fallback and keep influence
zero until success; on failure preserve the existing procedural appearance.
Diffuse textures must not be disposed with individual terrain/cave materials.

Do not load the downloaded displacement, EXR normal or EXR roughness maps. The
existing shared procedural normal map and procedural roughness remain unchanged.

## B. Cave rock colour detail

Extend `src/world/caves/caveHeightfieldMaterial.ts` with
`rock_surface_diff_1k.jpg` projected by the existing world-space triplanar
coordinates and orientation weights.

Treat the photograph as a **colour-detail modulator**, not replacement albedo:

- neutralize/remove its broad average colour in shader or via a fixed tuning
  value established from the asset,
- retain primarily local luminance/low-amplitude colour variation,
- multiply/blend it subtly into the existing cave vertex colour,
- preserve procedural macro variation, wetness darkening/tint and procedural
  roughness,
- keep the result recognisably within Seedvale's colour palette.

Intended pipeline:

```text
cave vertex colour
  → subtle neutralized rock colour detail
  → existing macro variation
  → existing wetness
  → lighting
```

### Cave sampling budget

The current triplanar detail normal costs three texture samples. Rock diffuse
may add exactly one three-way triplanar sample set, bringing cave surface detail
to six shader-level sampling calls total. Filtering, mipmaps and anisotropy
can perform more physical texel reads; this is not a GPU-time guarantee.

Do not add triplanar roughness, AO, displacement or another cave surface map in
this plan. Roughness stays procedural. Do not add a second cave material or draw
call.

## C. Terrain bare-ground colour detail

Extend `createTerrainMaterial()` / `applyTerrainSurfaceShader()` in
`src/terrain/buildChunkGeometry.ts` with `dirt_diff_1k.jpg`.

Use one world-space XZ sample per fragment. Terrain is predominantly horizontal,
so triplanar projection is not justified here; XZ coordinates also avoid chunk
seams without adding UV state.

Use the texture primarily where `vBareGround` identifies roads, plazas, dirt,
beach or other exposed ground:

- strongest only at high `vBareGround`, with a smooth threshold/blend,
- at most very subtle influence on transitional ground,
- zero influence on fully grassy ground by default,
- preserve biome and vertex-colour identity,
- preserve wet sand, rain, puddle and snow behaviour.

`vBareGround` also covers shore/desert sand and scorch patches. Include these
in visual verification rather than assuming the mask identifies only roads.

The dirt asset is a surface-detail modulator, not the terrain's literal base
colour. Do not place photographic dirt uniformly over every biome and do not
introduce a splat/control map.

Intended pipeline:

```text
biome / height / slope / road vertex colour
  → bare-ground-gated dirt colour detail
  → existing procedural macro variation
  → existing waterline and weather effects
  → lighting
```

## D. Terrain distance fade

Fade the **visual influence** of diffuse terrain detail over approximately the
same near-camera range as the current detail normal:

- full influence nearby,
- fade from about 20 m,
- no visible influence around 50 m.

This fade does not by itself save the texture fetch when sampling happens before
the result is multiplied by zero. Treat it as visual noise control, not a GPU
optimization claim.

Keep the initial shader branch-free unless a measured regression justifies a
safe alternative. Do not add a far-distance material, extra draw pass or shader
LOD system for this feature.

## E. Tuning surface

Expose only a few centralized constants:

- cave texture world scale,
- cave colour-detail influence and neutralization value,
- terrain texture world scale,
- terrain bare-ground threshold/influence,
- terrain detail fade start/end.

Do not add GUI/config surface unless browser tuning proves it necessary. Start
subtle and remove experimental knobs that are not needed after tuning.

## Performance constraints

Target:

- two additional shared 1K textures plus a tiny shared neutral loading fallback,
- one diffuse sample for terrain,
- three diffuse samples for cave triplanar projection,
- at most six shader sampling calls for cave surface detail including its
  existing three-sample normal,
- zero per-chunk and per-cave texture allocations,
- zero displacement and additional geometry,
- zero splat/control textures,
- zero new terrain or cave draw calls,
- no additional material variant for distance.

If measurement shows a meaningful GPU/frame-time regression, first reduce or
remove diffuse detail rather than introducing a more complex material/LOD
system.

## Non-goals

- PBR material overhaul,
- displacement, parallax or tessellation,
- EXR normal/roughness map integration,
- terrain UV generation,
- texture arrays or atlases,
- biome-specific material libraries,
- grass, sand, snow and rock material sets,
- new splat maps,
- replacing procedural normal detail or roughness,
- changing cave geometry, spatial queries or streaming.

## Implementation order

### Stage A — Cave

1. Add shared rock diffuse loading and ownership.
2. Integrate one triplanar diffuse sample set into the existing cave shader.
3. Neutralize it and blend it as subtle colour detail.
4. Preserve existing vertex colour, macro variation, wetness and roughness.
5. Extend `caveHeightfieldMaterial.test.ts` with shader wiring, shared ownership
   and sampler-budget contract checks where practical.

### Stage B — Terrain

1. Add shared dirt diffuse loading and ownership.
2. Integrate one world-space XZ sample into the shared terrain shader.
3. Gate it strongly through `vBareGround`; leave full grass unaffected.
4. Add the visual distance fade without a new material/branching LOD system.
5. Preserve existing macro, waterline and weather ordering.
6. Add focused material/shader contract tests where practical.

### Stage C — Cleanup and documentation

1. Remove unused tuning experiments.
2. Confirm both diffuse textures are loaded once and are not disposed by
   individual materials.
3. Confirm no downloaded PBR maps are imported or loaded.
4. Update relevant state/code documentation if implementation changes discovery
   boundaries.

Add JSDoc with `@domain world-terrain` to any important new shared texture
ownership function where that improves preflight discovery.

## Verification

Automated:

- `pnpm typecheck`,
- relevant terrain/cave unit tests,
- production build,
- static/test assertion that terrain adds one diffuse sampler and cave adds only
  the three triplanar diffuse reads.

These checks do not compile injected GLSL on the GPU. Shader text assertions
and a successful production build are not proof of WebGL shader validity.

Manual browser verification — User:

- confirm both material shaders compile without WebGL errors,
- verify slow/failed image loading retains the procedural appearance.

### Cave

- close surfaces gain readable rock colour detail,
- floor, walls and ceiling have no obvious stretching or projection seams,
- existing cave colour and wet areas still read correctly,
- photographic colour does not dominate the cave.

### Terrain

- roads, plazas and other bare ground gain close-range structure,
- fully grassy ground does not look dirt-covered,
- transitions are smooth and chunk seams are absent,
- distant terrain is not noisy,
- wet sand, rain, puddles and snow remain correct.
- shore sand, desert and scorched ground retain their intended appearance.

### Performance

Compare before/after in the same ordinary-terrain, settlement-road and cave
scenes. Reject or simplify the feature if GPU/frame time regresses meaningfully.

## Architectural guardrails

- Extend the existing shared material mechanisms.
- Do not create a parallel terrain or cave material system.
- Textures remain presentation-only and are never simulation state.
- World, biome, road, bare-ground and weather state remain authoritative.
- Preserve streamed/off-screen world simulation independence.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
