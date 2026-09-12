# Cave surface wetness (heightfield material)

**Purpose:** how Cave V2/V3 shared surface wetness is computed and applied today.

**Owner:** [`src/world/caves/caveHeightfieldMaterial.ts`](../../src/world/caves/caveHeightfieldMaterial.ts)

**Last verified against code:** 2026-09-12

Wetness is **presentation-only**. It does not affect simulation, occupancy, persistence or collision. It lives entirely in the shared `MeshStandardMaterial` `onBeforeCompile` path used by streamed cave heightfield meshes (`surfaceDetail: true`).

---

## Pipeline

```text
vWorldPos (world XYZ)
vNormal   (view-space geometric normal, Three varying)
        │
        ▼
caveViewToWorldDir(normalize(vNormal))  →  geoWorld   (main() scope, after #include <color_fragment>)
        │
        ▼
caveWetnessMask(vWorldPos, geoWorld)  →  wetMask      (computed once per fragment)
  ├─ two octaves of caveTriplanarWetnessNoise
  ├─ mix 0.68 / 0.32
  └─ smoothstep × uCaveWetnessAmount
        │
        ├─ CAVE_COLOR_CHUNK     → darken + cool tint (reuses wetMask)
        └─ CAVE_ROUGHNESS_CHUNK → mix dry/wet roughness (reuses wetMask)
```

`geoWorld` and `wetMask` are declared at `main()` function scope immediately after Three’s `color_fragment` include and before `roughnessmap_fragment`, so color and roughness share one mask evaluation. They are **not** recomputed in each injected block.

Both colour and roughness use the same **geometric** `geoWorld` derived from `vNormal` / `caveViewToWorldDir`. Detail normals (triplanar rock normal map, procedural rock perturb) are **not** inputs to wetness, so normal-map grain cannot crawl the mask.

---

## World normal from view space

Three.js exposes `vNormal` in view space. Wetness (and rock albedo triplanar) need a stable world-space orientation.

`caveViewToWorldDir` converts view → world as:

```glsl
( vec4( viewDir, 0.0 ) * viewMatrix ).xyz
```

That is the transpose of the view rotation — the same convention as Three’s `transformDirectionByInverseViewMatrix`. Using `mat3(viewMatrix) * viewDir` instead would apply world→view again and make blend weights (hence wet patches) swim with the camera.

Do **not** add a `vWorldNormal` varying for this path; the shader contract tests assert it stays absent.

---

## Triplanar wetness (normal-aware)

`caveTriplanarWetnessNoise(worldPos, worldN, scale)`:

1. `blend = caveTriplanarBlendWeights(worldN)` — normalized `abs(worldN)` (same helper as rock albedo / detail normals).
2. Sample three projections with wetness-specific noise (`caveWetnessSample`):
   - **X** (walls ±X): `vec2(p.y * anisotropy, p.z)`
   - **Y** (floor/ceiling): `p.xz` (isotropic)
   - **Z** (walls ±Z): `vec2(p.x, p.y * anisotropy)`
3. Return `x*blend.x + y*blend.y + z*blend.z`.

Equal-average of three projections (`caveTriplanarValueNoise`) is **not** used for wetness. That helper remains for **macro colour variation** only.

### Wall anisotropy (seepage streaks)

`uCaveWetnessWallAnisotropy` (`wetnessWallAnisotropy` in `CAVE_SURFACE_MATERIAL_TUNING`) scales the world-**Y** component of wall UVs. Values below `1` stretch features vertically on walls (path-of-least-resistance “drips”). Floor/ceiling stay isotropic on XZ.

There is **no** additive Y-column bias in the current build. Floor and ceiling share the XZ field at a given `(x,z)`, but vertical walls primarily show their own anisotropic projections, so blotches need not form perfect floor→ceiling columns.

---

## Noise (organic blotches)

Value noise + a hard threshold produces axis-aligned / square-looking edges. Wetness therefore uses a separate sample path:

| Helper | Role |
|--------|------|
| `caveGradientNoise` | 2D gradient noise remapped to ~`[0,1]` |
| `caveRotate2` | rotates the domain off world axes |
| `caveWetnessSample` | rotate + light domain warp, then gradient noise |

Macro albedo still uses `caveValueNoise` / `caveTriplanarValueNoise`. Do not conflate the two.

---

## Mask → look

`caveWetnessMask`:

```text
wetNoise = wetMacro * 0.68 + wetMacro2 * 0.32
mask     = saturate( smoothstep(lo, hi, wetNoise) * uCaveWetnessAmount )
```

Applied:

- **Colour:** multiply by `1 - mask * uCaveWetDarkening`, plus a small cool tint mix.
- **Roughness:** `mix(uCaveDryRoughness, uCaveWetRoughness, mask)`.

Exact `smoothstep` edges and tuning floats live in source (`CAVE_SURFACE_MATERIAL_TUNING` + GLSL). Prefer changing those knobs over inventing a second wetness path.

---

## Tuning knobs

Central JS object: `CAVE_SURFACE_MATERIAL_TUNING` → uniforms in `applyCaveSurfaceShader`.

| Knob | Effect |
|------|--------|
| `wetnessScale` | Feature size (higher → smaller blotches) |
| `wetnessAmount` | Mask strength after threshold |
| `wetnessWallAnisotropy` | Vertical stretch on wall projections |
| `dryRoughness` / `wetRoughness` | Gloss of dry vs wet (higher wet → less shiny) |
| `wetDarkening` | How much wet areas darken |

After GLSL contract changes, bump `SHADER_CACHE_KEY_DETAIL` so browsers do not reuse a stale program.

---

## Invariants

1. Wetness depends on **world position** + **geometric world normal**, not detail normals.
2. View→world for directions must stay transpose-of-view (camera-stable masks).
3. One shared material for all cave presentations — no per-cave wetness GPU state.
4. `surfaceDetail: false` skips the whole injected surface GLSL (including wetness).
5. Do not assign Three `normalMap` / `map` on this material; custom samplers only (heightfield has no UVs).

---

## Related

- Rock diffuse triplanar: same `geoWorld` + `caveTriplanarBlendWeights` (plan `world-terrain-021`).
- Detail normals: `caveTriplanarWorldNormal` in `CAVE_NORMAL_CHUNK` (whiteout blend; JS helpers mirror GLSL for tests).
- Graphics standing decisions / visual log: [`GRAPHICS.md`](GRAPHICS.md).
- Harness: `?caveHeightfieldTest=&fixture=basic&mode=walk`.
