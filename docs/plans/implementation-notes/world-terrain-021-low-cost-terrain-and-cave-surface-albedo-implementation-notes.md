# Implementation notes: world-terrain-021 low-cost terrain and cave surface albedo

**Reviewed:** 2026-09-11  
**Plan:** `docs/plans/world-terrain-021-low-cost-terrain-and-cave-surface-albedo.md`  
**Baseline:** `main` at `05f12eb1efaced5e3819bc92bfb1a13b1831db69`

Focused implementation handoff based on current code. Do not repeat broad
terrain/cave recon unless `main` materially changed.

## Asset facts

Both intended runtime assets already exist:

- `public/images/textures/dirt_diff_1k.jpg` — 1024×1024, sRGB, about 714 KiB;
- `public/images/textures/rock_surface_diff_1k.jpg` — 1024×1024, sRGB, about
  866 KiB.

ImageMagick reports mean sRGB channels of approximately:

- dirt: `(0.388, 0.322, 0.244)`, composite mean `0.318`;
- rock: `(0.434, 0.377, 0.319)`, composite mean `0.377`.

Three.js decodes an `SRGBColorSpace` texture before shader use. Do not use the
sRGB composite means directly as linear shader neutral points. Rock's measured
mean corresponds to roughly `0.12` linear luminance; treat that only as an
initial tuning value and verify visually. A scalar luminance modulation is
preferable to multiplying by raw RGB because both existing materials already
own their palette.

The downloaded displacement/normal/roughness files are not present on the
current baseline and are not needed.

## Shared texture loading: synchronous material contract

Relevant existing modules:

- `src/assets/loadTexture.ts` — module-level `TextureLoader`, URL-keyed cache,
  returns `Promise<Texture>` and sets sRGB after `loadAsync()` resolves;
- `src/terrain/terrainDetailNormalMap.ts` — lazy process-wide `DataTexture`,
  `RepeatWrapping`, mipmaps, linear filtering, anisotropy `8`;
- `src/shared/getFireParticles.ts` — synchronous `TextureLoader.load()` with a
  browser guard.

Do **not** call/await `loadTexture()` from `createTerrainMaterial()` or
`createCaveHeightfieldMaterial()`. Both material factories are synchronous and
are called during world construction; changing either to async would expand
through `ChunkManager`, `createCaves()` and `WorldBundle` for no gameplay gain.

Use a small presentation-only shared module, preferably under `src/terrain/`,
with two lazy getters backed by `TextureLoader.load()`:

- one cached `Texture` object per URL/process;
- configure `colorSpace`, wrapping, mip filters and anisotropy immediately on
  the returned placeholder texture;
- no promise/boot wait and no per-world reload;
- provide a Node-safe injected/fallback texture seam so existing Vitest suites
  (default Node environment, no `document`) can construct materials without
  invoking browser image loading.

Do not add these two URLs to `loadTexture()` and then introduce an async
preloading dependency merely to retrieve its resolved values. If the generic
loader is extended in a future refactor, that is separate work.

Process-wide albedo textures must not be disposed by either world owner. This
matches the existing detail-normal lifetime: a New Game/world rebuild may
dispose materials, but the cached textures remain reusable.

## Terrain ownership and exact insertion points

Relevant files/symbols:

- `src/terrain/buildChunkGeometry.ts`
  - `createTerrainMaterial()`;
  - `applyTerrainSurfaceShader()`;
  - `MACRO_COLOR_CHUNK`, `WET_SAND_CHUNK`,
    `WEATHER_SURFACE_COLOR_CHUNK`;
  - `NORMAL_MAP_TWO_TAP`;
- `src/terrain/chunkManager.ts`
  - creates exactly one `terrainMaterial` near the start of `createChunkManager`;
  - passes it into every `buildChunkGeometry()` call;
  - mutates only its shared weather uniforms at runtime;
  - calls `terrainMaterial.dispose()` once from manager `dispose()`.

`applyTerrainSurfaceShader()` already injects `vWorldPos` and `vBareGround` and
places all colour work by replacing `#include <color_fragment>`. Add the dirt
sampler/uniforms through the same hook; no geometry or `ChunkMeshData` change is
needed.

Keep the established ordering by inserting the dirt modulation after Three's
base vertex colour but before `MACRO_COLOR_CHUNK`, `WET_SAND_CHUNK` and
`WEATHER_SURFACE_COLOR_CHUNK`. This lets the existing waterline/weather layers
remain final surface-state effects, especially snow replacement and puddle
tinting.

Use exactly one `texture2D(uTerrainDirtAlbedo, vWorldPos.xz * scale)` call. A
good cheap blend contract is:

- derive a scalar luminance/detail factor rather than applying the source RGB;
- center the factor around a linear neutral value;
- gate influence with a smooth high-bare-ground mask derived from
  `vBareGround`;
- multiply influence by `1.0 - smoothstep(fadeStart, fadeEnd,
  length(vViewPosition))`;
- make the high-bare mask exactly zero for `vBareGround == 0`.

The sample remains unconditional in the first version. The distance fade is
visual only and must not be described/tested as avoiding the fetch.

`NORMAL_MAP_TWO_TAP` already declares its own local `detailFade` inside the
normal include. Do not try to share that local across separate Three.js shader
chunks; either use distinct well-named locals or centralized matching constants.

After changing injected GLSL, bump both terrain `customProgramCacheKey()` values
from their current `v6` generation. Three's default cache key does not see
`onBeforeCompile`, and stale program reuse is a real failure mode here.

## Cave ownership and the missing colour-orientation input

Relevant files/symbols:

- `src/world/caves/caveHeightfieldMaterial.ts`
  - `CAVE_SURFACE_MATERIAL_TUNING`;
  - `CAVE_SURFACE_GLSL`, `CAVE_COLOR_CHUNK`, `CAVE_NORMAL_CHUNK`;
  - `applyCaveSurfaceShader()`;
  - `createCaveHeightfieldMaterial()`;
  - `disposeCaveHeightfieldMaterialGpu()`;
- `src/world/createCaves.ts`
  - creates one cave material for all presentations;
  - marks it `userData.sharedGpu = true`;
  - disposes it once after streaming/presentations are cleared;
- `src/world/caves/caveHeightfieldMaterial.test.ts` — current shader contract
  and helper tests.

Current triplanar weights are **not** a reusable varying. They are calculated
inside `caveTriplanarWorldNormal()` from `geoWorld`, which exists only in
`CAVE_NORMAL_CHUNK`. `CAVE_COLOR_CHUNK` runs at the colour include and currently
has only `vWorldPos`. Therefore the plan phrase “reuse existing orientation
weights” means reuse the weighting formula/convention, not a currently exposed
value.

Add the smallest correct geometric-normal input for colour triplanar blending.
Prefer one world-normal varying populated through Three's existing normal
vertex chunks over recomputing derivatives or adding UVs. Keep its transform
correct if a cave mesh is later transformed; do not assume `objectNormal` is
always world-space merely because current heightfield positions are authored in
world coordinates. Then share a GLSL helper that produces normalized absolute
axis weights for both rock colour and normal reconstruction where practical.

Projection convention must remain consistent with the working normal shader:

- X projection samples `worldPos.zy`;
- Y projection samples `worldPos.xz`;
- Z projection samples `worldPos.xy`;
- blend weights are normalized `abs(worldNormal)` with a small non-zero floor.

Add exactly three rock-albedo texture calls. Convert their blended RGB to a
centered, low-amplitude scalar detail before modifying `diffuseColor`; do not
replace cave vertex colour. Keep this in `CAVE_COLOR_CHUNK` before its existing
macro and wetness logic.

The cave `surfaceDetail: false` path is an existing debug A/B contract. It must
remain loader-free/plain: no albedo or normal sampler, no injected triplanar
GLSL, and the plain cache key must remain distinct.

Extend `CAVE_SURFACE_MATERIAL_TUNING` rather than adding unrelated globals.
Expected additions are rock albedo scale/influence/linear neutral value. Decide
explicitly whether albedo and normal share scale; do not silently overload
`rockDetailScale` if browser tuning may need them independently.

Bump `SHADER_CACHE_KEY_DETAIL` from current `v5`; bump the plain key only if its
compiled GLSL contract changes.

`disposeCaveHeightfieldMaterialGpu()` currently clears only normal-map metadata.
Clear the new albedo reference from `userData` before disposing the material,
but do not call `Texture.dispose()`. `material.map` should remain `null`: both
cave and terrain albedos are custom samplers, so assigning `map` would enable
Three's UV path on cave geometry that has no UVs.

## Tests that prevent likely regressions

### Shared texture helper

Add focused tests for:

- identity-stable lazy caching per asset;
- sRGB, repeat wrapping, mip filters and anisotropy configuration;
- distinct dirt/rock texture objects;
- Node-safe construction without real image/network loading.

Prefer an injectable loader/factory seam over switching the whole material
suite to jsdom or depending on an image load completing.

### Cave material

Extend `caveHeightfieldMaterial.test.ts` and its `injectDetailShader()` helper:

- the injected rock uniform references the shared/injected rock texture;
- shader contains exactly three calls for the rock albedo sampler and the
  existing three calls for the normal sampler;
- projection planes and normalized orientation weighting are present;
- `surfaceDetail: false` contains neither sampler;
- `material.map` and `material.normalMap` stay null;
- two materials reuse both process-wide textures;
- material disposal does not invalidate either shared texture;
- existing `FrontSide`, geometric-hemisphere normal and no-UV assertions stay
  intact.

Update the current assertion that `vWorldNormal` is absent: it was valid for
the normal-only shader but conflicts with the new colour triplanar requirement.
Replace it with an assertion for the correct transformed geometric-normal
varying, not simply removal of coverage.

### Terrain material

There is no focused `buildChunkGeometry` material/shader suite today;
`terrainCutout.test.ts` supplies a plain `MeshStandardMaterial` and does not call
`createTerrainMaterial()`. Add a small `buildChunkGeometryMaterial.test.ts` (or
equivalent focused suite) using the same fake shader-injection style as the cave
test.

Assert:

- exactly one dirt sampler call;
- world XZ coordinates, high-`vBareGround` gating and visual distance fade;
- dirt modulation occurs before wet sand/weather chunks;
- custom program cache key has the new generation;
- repeated terrain material creation shares the dirt texture;
- disposing a terrain material does not dispose the process-wide texture.

Do not attempt to prove shader appearance numerically in Vitest. Shader compile
success comes from build/runtime; final strengths and scales require the User's
browser comparison.

## Implementation order

1. Add/test the shared synchronous texture getters with a Node-safe seam.
2. Implement cave albedo, update the world-normal contract and cave tests.
3. Implement terrain albedo and its new focused shader test.
4. Run typecheck, focused suites and production build.
5. Update state/code documentation only if the final module creates a new
   discovery/lifecycle boundary worth recording.

Do not run browser verification; the User performs it.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
