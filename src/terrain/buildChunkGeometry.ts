import * as THREE from 'three'
import type { DetailNormalConfig } from '../config/worldConfig'
import type { ChunkMeshData } from './chunkMeshData'
import { createTerrainNormalMap } from './terrainDetailNormalMap'

export type ChunkMeshResult = {
  mesh: THREE.Mesh
  dispose: () => void
}

/** Re-exported for existing callers/tests — the scorch falloff/patch types
 *  and the worker-safe mesh-data computation itself now live in
 *  `chunkMeshData.ts` (plan world-terrain-004), so this module only
 *  assembles Three.js objects from an already-computed `ChunkMeshData`. */
export { SCORCH_CHARCOAL, scorchFalloffAt, type TerrainScorchPatch } from './chunkMeshData'

/** Every chunk's material is stateless per-chunk (all differences live in
 *  vertex attributes), so `ChunkManager` builds exactly one and passes it to
 *  every `buildChunkGeometry` call instead of paying for 49 materials/
 *  compiled-shader-uniform-sets. Config changes to `flatShading`/
 *  `detailNormal` go through `onTerrainChange` → full world rebuild (see
 *  `createApp.ts`), which recreates the `ChunkManager` and this material with
 *  it — so it never needs to be mutated in place. */
/** Shared, mutable weather-surface uniform pair — one `THREE.Uniform`-shaped
 *  object per value, referenced (not copied) by every compiled instance of
 *  the shared terrain program so `ChunkManager.setWeatherSurface()` can
 *  update `.value` in place without touching per-chunk geometry or
 *  triggering a recompile (plan 133). */
export type TerrainWeatherUniforms = {
  uWetness: { value: number }
  uSnowAmount: { value: number }
}

export function createTerrainMaterial(
  flatShading: boolean,
  detailNormal: DetailNormalConfig,
  waterLevel: number,
): THREE.MeshStandardMaterial & { weatherUniforms: TerrainWeatherUniforms } {
  // Surface grain, not a substitute for real geometry (plan 044 §4.5, "teren
  // wygląda płasko"). Strength/tiling are GUI knobs — do not hardcode a "cut"
  // here again; see issue 014 for why the last four attempts to tune it in
  // source went nowhere.
  const detailOn = detailNormal.enabled && detailNormal.strength > 0
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading,
    roughness: 0.92,
    metalness: 0.04,
    ...(detailOn
      ? {
          normalMap: getTerrainNormalMap(),
          normalScale: new THREE.Vector2(detailNormal.strength, detailNormal.strength),
        }
      : {}),
  }) as THREE.MeshStandardMaterial & { weatherUniforms: TerrainWeatherUniforms }
  const weatherUniforms: TerrainWeatherUniforms = {
    uWetness: { value: 0 },
    uSnowAmount: { value: 0 },
  }
  material.weatherUniforms = weatherUniforms
  // Macro color/roughness always; dual-tile normals + distance fade when enabled.
  applyTerrainSurfaceShader(material, detailOn ? detailNormal : null, waterLevel, weatherUniforms)
  return material
}

/** Built once and shared by every chunk's material — same reasoning as the
 *  water shader's sine ripples: no external asset, no per-chunk cost beyond a
 *  cheap texture reference. `repeat` is deliberately
 *  left at 1: tiling is applied per-fragment in the injected shader below,
 *  because the two surface types need two different tilings out of the same
 *  texture and `Texture.repeat` can only express one. */
let terrainNormalMap: THREE.Texture | null = null
function getTerrainNormalMap(): THREE.Texture {
  if (!terrainNormalMap) terrainNormalMap = createTerrainNormalMap()
  return terrainNormalMap
}

/** `onBeforeCompile` sees the shader with its `#include` directives still
 *  unexpanded — three's `resolveIncludes()` runs later, inside `WebGLProgram`.
 *  So the thing to replace is the directive, not any line of the chunk's body. */
const NORMAL_MAP_INCLUDE = '#include <normal_fragment_maps>'
const COLOR_FRAGMENT_INCLUDE = '#include <color_fragment>'
const ROUGHNESSMAP_FRAGMENT_INCLUDE = '#include <roughnessmap_fragment>'

/** Stands in for three's `normal_fragment_maps` (r180) — only the
 *  `USE_NORMALMAP_TANGENTSPACE` branch, which is the only one a chunk material
 *  can take (it always gets a tangent-space `normalMap`, never an object-space
 *  one or a bump map). `tbn` comes from `normal_fragment_begin`, which still
 *  runs ahead of this. Distance fade (plan 066): full detail near the camera,
 *  none past ~50 m, so close ground can stay grainy without paying for it on
 *  the whole streamed horizon.
 *  User: Used to be 0.28, now 0.50 - because road was flat */
const NORMAL_MAP_TWO_TAP = /* glsl */ `
  vec3 mapNGrass = texture2D( normalMap, vNormalMapUv * uDetailTilesGrass ).xyz * 2.0 - 1.0;
  vec3 mapNBare = texture2D( normalMap, vNormalMapUv * uDetailTilesBare ).xyz * 2.0 - 1.0;
  vec3 mapN = mix( mapNGrass, mapNBare, vBareGround );
  float detailFade = 1.0 - smoothstep( 20.0, 50.0, length( vViewPosition ) );
  // Packed dirt (plaza / roads): keep light grit, not crumpled-foil bumps.
  // Roads still read as dirt; village squares stop looking like crumpled mesh.
  float bareQuiet = mix( 1.0, 0.50, vBareGround );
  mapN.xy *= normalScale * detailFade * bareQuiet;
  normal = normalize( tbn * mapN );
`

/** Cheap tileable value noise in world XZ — drives macro color/roughness
 *  variation so the ground stops reading as a flat vertex-color carpet
 *  (plan 066). No texture sample. */
const MACRO_NOISE_FUNCS = /* glsl */ `
float terrainHash21( vec2 p ) {
  p = fract( p * vec2( 123.34, 456.21 ) );
  p += dot( p, p + 45.32 );
  return fract( p.x * p.y );
}
float terrainValueNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  float a = terrainHash21( i );
  float b = terrainHash21( i + vec2( 1.0, 0.0 ) );
  float c = terrainHash21( i + vec2( 0.0, 1.0 ) );
  float d = terrainHash21( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}
`

const MACRO_COLOR_CHUNK = /* glsl */ `
  {
    float macro = terrainValueNoise( vWorldPos.xz * 0.045 );
    float mid = terrainValueNoise( vWorldPos.xz * 0.12 );
    float micro = terrainValueNoise( vWorldPos.xz * 0.32 );
    float n = ( macro * 0.55 + mid * 0.30 + micro * 0.15 ) * 2.0 - 1.0;
    float grassAmt = 1.0 - vBareGround;
    // Stronger than vertex micro-tint alone — large irregular patches of
    // greener / browner / darker ground so the carpet breaks up at a glance.
    diffuseColor.rgb *= 1.0 + n * 0.18;
    diffuseColor.g = clamp( diffuseColor.g + n * 0.09 * grassAmt, 0.0, 1.0 );
    diffuseColor.r = clamp( diffuseColor.r + n * 0.07 * vBareGround - n * 0.03 * grassAmt, 0.0, 1.0 );
    diffuseColor.b = clamp( diffuseColor.b - abs( n ) * 0.04 * grassAmt, 0.0, 1.0 );

    // Meadow carpet between blade clumps — extra mid/fine green variation so
    // the ground doesn't read as golf-course fill (issue 023).
    float meadow = terrainValueNoise( vWorldPos.xz * 0.07 );
    float fineG = terrainValueNoise( vWorldPos.xz * 0.26 );
    float m = ( meadow * 0.65 + fineG * 0.35 ) * 2.0 - 1.0;
    diffuseColor.g = clamp( diffuseColor.g + m * 0.12 * grassAmt, 0.0, 1.0 );
    diffuseColor.r = clamp( diffuseColor.r - m * 0.05 * grassAmt, 0.0, 1.0 );
    diffuseColor.rgb *= 1.0 + m * 0.07 * grassAmt;

    // Packed dirt / road grain — lighter than before so plaza/roads don't
    // read as crumpled geometry under daylight (plan 076 plaza playtest).
    float dirt = terrainValueNoise( vWorldPos.xz * 0.9 ) * 2.0 - 1.0;
    float grit = terrainValueNoise( vWorldPos.xz * 2.1 ) * 2.0 - 1.0;
    float d = dirt * 0.7 + grit * 0.3;
    diffuseColor.rgb *= 1.0 + d * 0.07 * vBareGround;
    diffuseColor.r = clamp( diffuseColor.r + d * 0.025 * vBareGround, 0.0, 1.0 );
    diffuseColor.g = clamp( diffuseColor.g - abs( d ) * 0.015 * vBareGround, 0.0, 1.0 );
  }
`

const MACRO_ROUGHNESS_CHUNK = /* glsl */ `
  {
    float n = terrainValueNoise( vWorldPos.xz * 0.09 ) * 2.0 - 1.0;
    roughnessFactor = clamp( roughnessFactor + n * 0.12, 0.3, 1.0 );
  }
`

/** Darken albedo in a band just above the waterline (W11) — wet sand/soil,
 *  not a second mesh and not a hard cutoff in `colorForTerrain`. */
const WET_SAND_CHUNK = /* glsl */ `
  {
    float wet = 1.0 - smoothstep( uWaterLevel, uWaterLevel + 0.4, vWorldPos.y );
    diffuseColor.rgb *= 1.0 - wet * 0.38;
  }
`

/** Plan 133 — deterministic, weather-derived surface visuals (wet ground,
 *  puddles, snow cover). `uWetness`/`uSnowAmount` are the only new uniforms;
 *  everything else reuses `vWorldPos`, `vBareGround` and `terrainValueNoise`
 *  already injected above. `vSlopeUp` is the cheapest available flatness
 *  signal: the terrain mesh only ever translates (no rotation/scale), so the
 *  vertex-shader `objectNormal` is already world-space — its `.y` component
 *  is `cos(slope angle)` with zero extra per-vertex cost beyond the varying
 *  itself, no new attribute needed. */
const WEATHER_SURFACE_COLOR_CHUNK = /* glsl */ `
  float wetGroundAmt = 0.0;
  float puddleEdgeAmt = 0.0;
  float puddleCoreAmt = 0.0;
  float snowCoverAmt = 0.0;
  {
    float aboveWater = smoothstep( uWaterLevel, uWaterLevel + 0.3, vWorldPos.y );
    float flatUp = clamp( vSlopeUp, 0.0, 1.0 );

    // Broad darkening — dirt/roads read wetter than grass.
    wetGroundAmt = uWetness * mix( 0.28, 0.82, vBareGround ) * aboveWater;

    // Puddles: low-frequency irregular patches, gated to flat, bare-ish,
    // above-water ground; threshold tightens as wetness rises so coverage
    // grows with it instead of popping in at full extent. Wider band + lower
    // ceiling than V1 so patches read bigger/more contiguous at gameplay
    // camera distance (plan world-terrain-003 v2).
    float puddleNoise = terrainValueNoise( vWorldPos.xz * 0.02 ) * 0.6
      + terrainValueNoise( vWorldPos.xz * 0.05 ) * 0.4;
    float puddleThreshold = mix( 0.86, 0.32, uWetness );
    float puddleFlat = smoothstep( 0.72, 0.95, flatUp );
    float puddleBare = mix( 0.08, 1.0, smoothstep( 0.15, 0.75, vBareGround ) );
    float puddleGate = puddleFlat * puddleBare * aboveWater * uWetness;

    // Same noise field, two nested bands — an outer edge (wet rim easing
    // into standing water) and a smaller inner core (the water itself), so
    // a puddle reads as dry -> wet -> edge -> center depth instead of one
    // flat-toned patch. No extra noise evaluation.
    float puddleOuter = smoothstep( puddleThreshold, puddleThreshold + 0.18, puddleNoise );
    float puddleInner = smoothstep( puddleThreshold + 0.09, puddleThreshold + 0.26, puddleNoise );
    puddleEdgeAmt = ( puddleOuter - puddleInner ) * puddleGate;
    puddleCoreAmt = puddleInner * puddleGate;

    // Snow cover: brighter blend favoring flat ground, subtle noise breakup
    // so edges don't read as a hard fill line.
    float snowNoise = terrainValueNoise( vWorldPos.xz * 0.03 ) * 0.5 + 0.5;
    float snowFlat = smoothstep( 0.5, 0.9, flatUp );
    snowCoverAmt = clamp(
      uSnowAmount * mix( 0.5, 1.0, snowFlat ) * mix( 0.7, 1.05, snowNoise ),
      0.0, 1.0
    );
  }
  diffuseColor.rgb *= 1.0 - wetGroundAmt * 0.32;
  diffuseColor.rgb *= 1.0 - puddleEdgeAmt * 0.34;
  diffuseColor.rgb *= 1.0 - puddleCoreAmt * 0.52;
  // Slight cool cast in the puddle core reads as a thin water layer rather
  // than just darker dirt — kept subtle to avoid a "wet plastic" look.
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.12, 0.16, 0.20 ), puddleCoreAmt * 0.32 );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.90, 0.94, 0.98 ), snowCoverAmt );
`

/** Wet ground lowers roughness a little; puddle edge more so; the puddle
 *  core drops it hard — still nowhere near a mirror (metalness stays 0.04,
 *  plan 133/world-terrain-003 both explicitly avoid a reflection pass), but
 *  low enough that `MeshStandardMaterial`'s existing specular response reads
 *  as a distinct wet-water highlight instead of just a darker patch; snow
 *  reads slightly rougher (fresh snow, not ice). Reuses `wetGroundAmt`/
 *  `puddleEdgeAmt`/`puddleCoreAmt`/`snowCoverAmt` computed above — same
 *  fragment-shader function body, so the un-braced `float` declarations in
 *  the color chunk are still in scope here even though three.js splices this
 *  in at a separate `#include`. */
const WEATHER_SURFACE_ROUGHNESS_CHUNK = /* glsl */ `
  roughnessFactor = clamp(
    roughnessFactor - wetGroundAmt * 0.18 - puddleEdgeAmt * 0.22 - puddleCoreAmt * 0.58 + snowCoverAmt * 0.05,
    0.05, 1.0
  );
`

let warnedMissingInclude = false

/**
 * Injects per-fragment terrain surface polish (plan 066):
 * - always: world-space macro color + roughness variation (breaks flat vertex colors)
 * - when detail normals are on: dual-tile normal map + distance fade
 *
 * Samples the shared detail normal map at two tilings and blends them per
 * fragment by `aBareGround` — large, soft lumps under grass, fine sand-like
 * grain on roads/clearings/beach/desert. One texture, two `repeat`s, which is
 * why this needs a shader injection instead of `Texture.repeat`.
 */
function applyTerrainSurfaceShader(
  material: THREE.MeshStandardMaterial,
  detailNormal: DetailNormalConfig | null,
  waterLevel: number,
  weatherUniforms: TerrainWeatherUniforms,
): void {
  const detailOn = detailNormal !== null
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterLevel = { value: waterLevel }
    // Referenced, not copied — `ChunkManager.setWeatherSurface()` mutates
    // `weatherUniforms.uWetness.value` directly, so this stays live without
    // needing to re-fetch the compiled shader later (plan 133).
    shader.uniforms.uWetness = weatherUniforms.uWetness
    shader.uniforms.uSnowAmount = weatherUniforms.uSnowAmount
    if (detailOn) {
      shader.uniforms.uDetailTilesGrass = { value: detailNormal.tilesGrass }
      shader.uniforms.uDetailTilesBare = { value: detailNormal.tilesBare }
    }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aBareGround;\nvarying float vBareGround;\nvarying vec3 vWorldPos;\nvarying float vSlopeUp;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvBareGround = aBareGround;',
      )
      .replace(
        '#include <beginnormal_vertex>',
        // Terrain chunks only ever translate (see `buildChunkGeometry()`
        // below — no rotation/scale), so `objectNormal` is already
        // world-space here; its .y is the cheapest available flatness signal.
        '#include <beginnormal_vertex>\nvSlopeUp = objectNormal.y;',
      )
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
      )

    let frag = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vBareGround;
varying vec3 vWorldPos;
varying float vSlopeUp;
uniform float uWaterLevel;
uniform float uWetness;
uniform float uSnowAmount;
${MACRO_NOISE_FUNCS}${
          detailOn
            ? '\nuniform float uDetailTilesGrass;\nuniform float uDetailTilesBare;'
            : ''
        }`,
      )
      .replace(
        COLOR_FRAGMENT_INCLUDE,
        `${COLOR_FRAGMENT_INCLUDE}\n${MACRO_COLOR_CHUNK}\n${WET_SAND_CHUNK}\n${WEATHER_SURFACE_COLOR_CHUNK}`,
      )
      .replace(
        ROUGHNESSMAP_FRAGMENT_INCLUDE,
        `${ROUGHNESSMAP_FRAGMENT_INCLUDE}\n${MACRO_ROUGHNESS_CHUNK}\n${WEATHER_SURFACE_ROUGHNESS_CHUNK}`,
      )

    if (detailOn) {
      if (!frag.includes(NORMAL_MAP_INCLUDE)) {
        if (!warnedMissingInclude) {
          warnedMissingInclude = true
          console.warn(
            `[terrain] fragment shader has no ${NORMAL_MAP_INCLUDE} — ` +
              'detail-normal tiling disabled; update buildChunkGeometry.ts',
          )
        }
      } else {
        frag = frag.replace(NORMAL_MAP_INCLUDE, NORMAL_MAP_TWO_TAP)
      }
    }

    shader.fragmentShader = frag
  }
  // Every chunk injects identical code for a given detail mode, so they can
  // share one compiled program — but three's default cache key ignores
  // `onBeforeCompile`, so say so explicitly. Bumped to v6 for plan
  // world-terrain-003's edge/core puddle split so three never reuses a v5
  // program compiled against the old single `puddleAmt` chunk.
  material.customProgramCacheKey = () =>
    detailOn ? 'chunk-terrain-surface-detail-v6' : 'chunk-terrain-surface-v6'
}

/**
 * Assembles one chunk's `THREE.Mesh` from an already-computed `ChunkMeshData`
 * (plan world-terrain-004) — the data-only per-vertex terrain math (position
 * Y, seam-safe normals, vertex colors, `aBareGround`) now lives in
 * `chunkMeshData.ts`'s `computeChunkMeshData()`, which `chunkManager.ts` runs
 * in the existing chunk worker (`chunkHeightmap.worker.ts`) instead of on the
 * main thread. This function only builds/positions the Three.js objects, and
 * still owns their disposal.
 */
export function buildChunkGeometry(
  meshData: ChunkMeshData,
  resolution: number,
  chunkSize: number,
  chunkOriginX: number,
  chunkOriginZ: number,
  material: THREE.MeshStandardMaterial,
  castShadow: boolean,
): ChunkMeshResult {
  const geometry = new THREE.PlaneGeometry(chunkSize, chunkSize, resolution - 1, resolution - 1)
  geometry.rotateX(-Math.PI / 2)
  const positions = geometry.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < positions.count; i++) {
    positions.setY(i, meshData.positionY[i]!)
  }
  positions.needsUpdate = true

  geometry.setAttribute('normal', new THREE.BufferAttribute(meshData.normal, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(meshData.color, 3))
  geometry.setAttribute('aBareGround', new THREE.BufferAttribute(meshData.bareGround, 1))

  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(chunkOriginX, 0, chunkOriginZ)
  mesh.receiveShadow = true
  // Terrain casting a shadow onto itself is mostly shadow acne at this map's
  // resolution (1024², 160×160 frustum) plus the cost of rendering every
  // chunk into the shadow pass a second time — the directional light + N8AO
  // already carry most of the terrain's own silhouette shading (perf review
  // A2). Real visual risk on steep slopes at low sun angle though, so it's a
  // GUI-exposed toggle (`ChunkManager.setTerrainCastsShadow`, default on)
  // rather than a hardcoded change — see review 005 #13 follow-up.
  mesh.castShadow = castShadow
  mesh.name = 'chunk'

  return {
    mesh,
    // `material` is shared across every chunk (`createTerrainMaterial`,
    // owned/disposed by `ChunkManager`) — only this chunk's own geometry is
    // per-instance and needs disposing here.
    dispose: () => {
      geometry.dispose()
    },
  }
}
