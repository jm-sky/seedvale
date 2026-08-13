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

/** Every chunk's material is stateless per-chunk (all differences live in
 *  vertex attributes), so `ChunkManager` builds exactly one and passes it to
 *  every `buildChunkGeometry` call instead of paying for 49 materials/
 *  compiled-shader-uniform-sets. Config changes to `flatShading`/
 *  `detailNormal` go through `onTerrainChange` → full world rebuild (see
 *  `createApp.ts`), which recreates the `ChunkManager` and this material with
 *  it — so it never needs to be mutated in place. */
export function createTerrainMaterial(
  flatShading: boolean,
  detailNormal: DetailNormalConfig,
  waterLevel: number,
): THREE.MeshStandardMaterial {
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
  })
  // Macro color/roughness always; dual-tile normals + distance fade when enabled.
  applyTerrainSurfaceShader(material, detailOn ? detailNormal : null, waterLevel)
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
 *  the whole streamed horizon. */
const NORMAL_MAP_TWO_TAP = /* glsl */ `
  vec3 mapNGrass = texture2D( normalMap, vNormalMapUv * uDetailTilesGrass ).xyz * 2.0 - 1.0;
  vec3 mapNBare = texture2D( normalMap, vNormalMapUv * uDetailTilesBare ).xyz * 2.0 - 1.0;
  vec3 mapN = mix( mapNGrass, mapNBare, vBareGround );
  float detailFade = 1.0 - smoothstep( 20.0, 50.0, length( vViewPosition ) );
  // Packed dirt (plaza / roads): keep light grit, not crumpled-foil bumps.
  // Roads still read as dirt; village squares stop looking like crumpled mesh.
  float bareQuiet = mix( 1.0, 0.28, vBareGround );
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
): void {
  const detailOn = detailNormal !== null
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterLevel = { value: waterLevel }
    if (detailOn) {
      shader.uniforms.uDetailTilesGrass = { value: detailNormal.tilesGrass }
      shader.uniforms.uDetailTilesBare = { value: detailNormal.tilesBare }
    }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aBareGround;\nvarying float vBareGround;\nvarying vec3 vWorldPos;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvBareGround = aBareGround;',
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
uniform float uWaterLevel;
${MACRO_NOISE_FUNCS}${
          detailOn
            ? '\nuniform float uDetailTilesGrass;\nuniform float uDetailTilesBare;'
            : ''
        }`,
      )
      .replace(
        COLOR_FRAGMENT_INCLUDE,
        `${COLOR_FRAGMENT_INCLUDE}\n${MACRO_COLOR_CHUNK}\n${WET_SAND_CHUNK}`,
      )
      .replace(
        ROUGHNESSMAP_FRAGMENT_INCLUDE,
        `${ROUGHNESSMAP_FRAGMENT_INCLUDE}\n${MACRO_ROUGHNESS_CHUNK}`,
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
  // `onBeforeCompile`, so say so explicitly.
  material.customProgramCacheKey = () =>
    detailOn ? 'chunk-terrain-surface-detail-v4' : 'chunk-terrain-surface-v4'
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
 * Builds one chunk's render mesh from its apron-inclusive tile. Normals are computed
 * by central differences directly on `tile.heights` (the apron ring exists precisely
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
    const h = sampleApronGridWeighted(tile.heights, apronRes, w)
    positions.setY(i, h)

    const { ix, iz } = apronGridIJ(apronRes, apronOriginX, apronOriginZ, step, x, z)
    const hE = tile.heights[iz * apronRes + Math.min(apronRes - 1, ix + 1)]!
    const hW = tile.heights[iz * apronRes + Math.max(0, ix - 1)]!
    const hN = tile.heights[Math.min(apronRes - 1, iz + 1) * apronRes + ix]!
    const hS = tile.heights[Math.max(0, iz - 1) * apronRes + ix]!
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

    colors[i * 3] = tmp.r
    colors[i * 3 + 1] = tmp.g
    colors[i * 3 + 2] = tmp.b
    bareGround[i] = bareGroundWeight(roadTint, h, waterLevel, biomeWeights.desert, sandBand)
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
