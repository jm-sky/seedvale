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
sRGB composite means directly as linear shader neutral points. Neutral values
must be calculated offline by decoding each pixel to linear RGB, computing
luminance, then averaging. Do not linearize the already averaged sRGB values.
Record the resulting neutral values for both assets; no runtime pixel scan.
A scalar luminance modulation is
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

Keep both material factories synchronous. Start the existing cached
`loadTexture()` asynchronously without awaiting it in world construction.
A small shared surface-resource module can own one stable sampler uniform and
one readiness uniform per asset; every shader references these same objects.
On success, configure repeat wrapping, mip filters and modest anisotropy,
assign the loaded texture, then enable influence. No material recompile is
needed for uniform-value changes.

Before loading completes, bind a valid shared 1×1 neutral fallback and keep
influence at zero. A bare `TextureLoader.load()` return value has no image yet;
it is not a neutral fallback. On failure, handle the rejection, leave influence
zero and retain the original procedural appearance. Do not poll or retry per
frame: the existing loader caches rejected promises too.

This adds two full-size assets plus a tiny shared fallback, not a second URL
cache/loader. Avoid per-material completion callbacks: resource-level completion
updates only shared uniforms, so disposal during loading cannot resurrect a
material or retain old worlds. Test the loader with a mock/deferred promise in
Node; no browser image loading is needed in unit tests.

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
needed. The mask also includes shore/desert sand and scorch patches through
`bareGroundWeight()` and `Math.max(..., scorchAmt)` in `chunkMeshData.ts`.
It is not a road-only semantic mask; verify all these surfaces visually.

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
The cave material has `flatShading: false`, so Three's existing `vNormal`
varying is available at the colour include. Use
`caveViewToWorldDir(normalize(vNormal))`; it converts the existing transformed
view-space normal into world space. Do not add `vWorldNormal` or use the local
`normal` variable here: `normal_fragment_begin` executes later.
Then share a GLSL helper that produces normalized absolute
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
- Node-safe construction without real image/network loading;
- deferred load keeps influence zero, success updates shared uniforms, and
  rejection keeps a valid fallback without an unhandled rejection;
- material disposal before resolution does not recreate or mutate that material.

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

Keep the assertion that `vWorldNormal` is absent. Assert reuse of `vNormal`
and `caveViewToWorldDir` for colour weights. Use Three's actual standard shader
source for injection/order checks where useful; a minimal fake shader cannot
prove that a referenced variable is declared at the insertion point.

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
success requires runtime WebGL compilation. Vite build and typecheck do not
compile injected GLSL; text assertions also cannot prove GLSL validity.
The User checks browser shader errors, appearance and frame time.

## Implementation order

1. Add/test shared surface uniforms around the existing async texture cache,
   including neutral loading/error behavior and Node-safe loader mocks.
2. Implement cave albedo using existing normals and extend cave tests.
3. Implement terrain albedo and its new focused shader test.
4. Run typecheck, focused suites and production build.
5. Update state/code documentation only if the final module creates a new
   discovery/lifecycle boundary worth recording.

Do not run browser verification; the User performs it.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
