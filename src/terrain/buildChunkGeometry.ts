import * as THREE from 'three'
import type { DetailNormalConfig } from '../config/worldConfig'
import {
  applyMicroTint,
  applyMountainRock,
  applyOceanDepthTint,
  applyRoadTint,
  applySlopeRock,
  colorForTerrain,
  sandBandAt,
} from './biomeColors'
import { biomeWeightsAt } from './biomeRegions'
import {
  apronGridWeights,
  type ChunkTileData,
  type RegionParams,
  sampleApronGridWeighted,
} from './chunkHeightmap'
import { createTerrainNormalMap } from './terrainDetailNormalMap'

export type ChunkMeshResult = {
  mesh: THREE.Mesh
  dispose: () => void
}

/** World-space burn patches applied as vertex-color charcoal (plan 137) —
 *  the same `{x,z,radius}` as `TerrainModification` mode `'scorch'`. Kept as
 *  a narrow type so `buildChunkGeometry` doesn't import `chunkManager`. */
export type TerrainScorchPatch = { x: number, z: number, radius: number }

/** Charcoal ground color for a fully-scorched vertex. */
export const SCORCH_CHARCOAL = new THREE.Color(0x1a1410)

/** Radial scorch amount in [0, 1] at a world XZ point — 1 at the center,
 *  0 at/beyond `radius`. Overlapping patches take the max. Pure/exported
 *  so the falloff is unit-tested without building a chunk mesh. */
export function scorchFalloffAt(
  wx: number,
  wz: number,
  patches: readonly TerrainScorchPatch[],
): number {
  let best = 0
  for (const patch of patches) {
    const dist = Math.hypot(wx - patch.x, wz - patch.z)
    if (dist >= patch.radius) continue
    const falloff = 1 - THREE.MathUtils.smoothstep(dist, 0, patch.radius)
    if (falloff > best) best = falloff
  }
  return best
}

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

/** Where the surface reads as packed dirt/sand rather than vegetated ground:
 *  road & village-clearing corridors (`tile.roadTint`), the shore sand band,
 *  and desert regions. Drives the tiling blend above. */
function bareGroundWeight(
  roadTint: number,
  height: number,
  waterLevel: number,
  desert: number,
  sandBand: number,
): number {
  // `applyRoadTint` saturates toward dirt; keep a longer mixed band so the
  // soft corridor edge still shows meadow normals/color before full bare grain.
  const road = Math.min(1, Math.pow(Math.max(0, roadTint), 0.85) * 1.35)
  const sand =
    1 -
    THREE.MathUtils.smoothstep(height, waterLevel + sandBand * 0.5, waterLevel + sandBand * 1.5)
  return Math.min(1, Math.max(road, sand, desert))
}

/** Grid indices of the apron texel nearest `(x, z)` — every core vertex lands
 *  exactly on an apron grid point (the apron is the same step spacing, one
 *  ring wider), so this is exact, not a nearest-neighbor approximation. */
function apronGridIJ(
  apronRes: number,
  apronOriginX: number,
  apronOriginZ: number,
  step: number,
  x: number,
  z: number,
): { ix: number; iz: number } {
  return {
    ix: Math.max(0, Math.min(apronRes - 1, Math.round((x - apronOriginX) / step))),
    iz: Math.max(0, Math.min(apronRes - 1, Math.round((z - apronOriginZ) / step))),
  }
}

/**
 * Builds one chunk's render mesh from its apron-inclusive tile. Vertex Y, normals
 * and shore/seabed colour use `tile.floorHeights` (true bathymetry) so underwater
 * terrain is a bathtub under the water plane, not a flat lid at `waterLevel`.
 * `tile.heights` stays clamped for the water mask, grass reject and `sampleHeight`.
 *
 * Normals are central differences on that same floor grid (the apron ring exists
 * so every core-edge vertex has a same-grid neighbor on both sides of the seam) —
 * mathematically identical to `computeVertexNormals()` on this grid's regular
 * triangulation, verified numerically against three's own implementation, but without
 * allocating and immediately discarding a helper `PlaneGeometry` per chunk.
 * `computeVertexNormals()` must NOT be called on the core geometry itself, since that
 * would recompute from core-only faces and reintroduce the seam mismatch the apron
 * exists to avoid.
 */
export function buildChunkGeometry(
  tile: ChunkTileData,
  resolution: number,
  chunkSize: number,
  chunkOriginX: number,
  chunkOriginZ: number,
  waterLevel: number,
  heightScale: number,
  material: THREE.MeshStandardMaterial,
  region: RegionParams,
  seed: number,
  castShadow: boolean,
  scorches: readonly TerrainScorchPatch[] = [],
): ChunkMeshResult {
  const step = chunkSize / (resolution - 1)
  const apronRes = resolution + 2
  const apronOriginX = -chunkSize / 2 - step
  const apronOriginZ = -chunkSize / 2 - step

  const geometry = new THREE.PlaneGeometry(chunkSize, chunkSize, resolution - 1, resolution - 1)
  geometry.rotateX(-Math.PI / 2)
  const positions = geometry.attributes.position as THREE.BufferAttribute
  const normalAttr = new Float32Array(positions.count * 3)
  const colors = new Float32Array(positions.count * 3)
  const bareGround = new Float32Array(positions.count)
  const tmp = new THREE.Color()

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i)
    const z = positions.getZ(i)
    // One set of bilinear weights per vertex, reused for all 6 apron-grid
    // samples below instead of each recomputing fx/fz/floor/clamp from scratch.
    const w = apronGridWeights(apronRes, apronOriginX, apronOriginZ, step, x, z)
    const h = sampleApronGridWeighted(tile.floorHeights, apronRes, w)
    positions.setY(i, h)

    const { ix, iz } = apronGridIJ(apronRes, apronOriginX, apronOriginZ, step, x, z)
    const hE = tile.floorHeights[iz * apronRes + Math.min(apronRes - 1, ix + 1)]!
    const hW = tile.floorHeights[iz * apronRes + Math.max(0, ix - 1)]!
    const hN = tile.floorHeights[Math.min(apronRes - 1, iz + 1) * apronRes + ix]!
    const hS = tile.floorHeights[Math.max(0, iz - 1) * apronRes + ix]!
    const dHdx = (hE - hW) / (2 * step)
    const dHdz = (hN - hS) / (2 * step)
    const nLen = Math.hypot(dHdx, 1, dHdz)
    const ny = 1 / nLen
    normalAttr[i * 3] = -dHdx / nLen
    normalAttr[i * 3 + 1] = ny
    normalAttr[i * 3 + 2] = -dHdz / nLen

    const m = sampleApronGridWeighted(tile.biomes, apronRes, w)
    const continentalness = sampleApronGridWeighted(tile.continentalness, apronRes, w)
    const mountainRidge = sampleApronGridWeighted(tile.mountainRidge, apronRes, w)
    const moistureRegion = sampleApronGridWeighted(tile.moistureRegion, apronRes, w)
    const roadTint = sampleApronGridWeighted(tile.roadTint, apronRes, w)
    const steepness = 1 - ny
    const altitude01 = (h - waterLevel) / Math.max(heightScale, 0.001)
    const biomeWeights = biomeWeightsAt(moistureRegion, altitude01, region)
    const wx = chunkOriginX + x
    const wz = chunkOriginZ + z
    const sandBand = sandBandAt(wx, wz, seed)

    colorForTerrain(h, m, waterLevel, heightScale, biomeWeights, tmp, sandBand)
    applySlopeRock(tmp, h, waterLevel, steepness, sandBand)
    applyMountainRock(tmp, mountainRidge, h, waterLevel, heightScale)
    applyOceanDepthTint(tmp, continentalness, h, waterLevel)
    applyMicroTint(tmp, h, waterLevel, wx, wz, 0.045 + Math.min(1, roadTint) * 0.05)
    applyRoadTint(tmp, roadTint, wx, wz)
    const scorchAmt = scorchFalloffAt(wx, wz, scorches)
    if (scorchAmt > 0) {
      tmp.lerp(SCORCH_CHARCOAL, scorchAmt)
    }

    colors[i * 3] = tmp.r
    colors[i * 3 + 1] = tmp.g
    colors[i * 3 + 2] = tmp.b
    bareGround[i] = Math.max(
      bareGroundWeight(roadTint, h, waterLevel, biomeWeights.desert, sandBand),
      scorchAmt,
    )
  }

  geometry.setAttribute('normal', new THREE.BufferAttribute(normalAttr, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('aBareGround', new THREE.BufferAttribute(bareGround, 1))

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
