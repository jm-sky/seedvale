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
  sampleApronGrid,
  sampleApronGridWeighted,
} from './chunkHeightmap'
import { createTerrainNormalMap } from './terrainDetailNormalMap'

export type ChunkMeshResult = {
  mesh: THREE.Mesh
  dispose: () => void
}

/** Built once and shared by every chunk's material — same reasoning as
 *  `createOcean.ts`'s procedural water normal map: no external asset, no
 *  per-chunk cost beyond a cheap texture reference. `repeat` is deliberately
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

/** Stands in for three's `normal_fragment_maps` (r180) — only the
 *  `USE_NORMALMAP_TANGENTSPACE` branch, which is the only one a chunk material
 *  can take (it always gets a tangent-space `normalMap`, never an object-space
 *  one or a bump map). `tbn` comes from `normal_fragment_begin`, which still
 *  runs ahead of this. */
const NORMAL_MAP_TWO_TAP = /* glsl */ `
  vec3 mapNGrass = texture2D( normalMap, vNormalMapUv * uDetailTilesGrass ).xyz * 2.0 - 1.0;
  vec3 mapNBare = texture2D( normalMap, vNormalMapUv * uDetailTilesBare ).xyz * 2.0 - 1.0;
  vec3 mapN = mix( mapNGrass, mapNBare, vBareGround );
  mapN.xy *= normalScale;
  normal = normalize( tbn * mapN );
`

let warnedMissingInclude = false

/**
 * Samples the shared detail normal map at two tilings and blends them per
 * fragment by `aBareGround` — large, soft lumps under grass, fine sand-like
 * grain on roads/clearings/beach/desert. One texture, two `repeat`s, which is
 * why this needs a shader injection instead of `Texture.repeat`.
 */
function applyDetailNormalTiling(
  material: THREE.MeshStandardMaterial,
  detailNormal: DetailNormalConfig,
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDetailTilesGrass = { value: detailNormal.tilesGrass }
    shader.uniforms.uDetailTilesBare = { value: detailNormal.tilesBare }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aBareGround;\nvarying float vBareGround;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBareGround = aBareGround;')

    if (!shader.fragmentShader.includes(NORMAL_MAP_INCLUDE)) {
      // A three upgrade restructured the normal pipeline — fall back to the
      // stock single tiling (which looks wrong, but only flat-ish, not broken)
      // and say so once, instead of silently compiling a shader whose uniforms
      // nothing reads. That silent-failure mode is exactly what shipped when
      // this replaced a line of the chunk body instead of the include.
      if (!warnedMissingInclude) {
        warnedMissingInclude = true
        console.warn(
          `[terrain] fragment shader has no ${NORMAL_MAP_INCLUDE} — ` +
            'detail-normal tiling disabled; update buildChunkGeometry.ts',
        )
      }
      return
    }

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uDetailTilesGrass;\nuniform float uDetailTilesBare;\nvarying float vBareGround;',
      )
      .replace(NORMAL_MAP_INCLUDE, NORMAL_MAP_TWO_TAP)
  }
  // Every chunk injects identical code, so they can share one compiled program —
  // but three's default cache key ignores `onBeforeCompile`, so say so explicitly
  // rather than relying on that happening to work out.
  material.customProgramCacheKey = () => 'chunk-detail-normal'
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
  // `applyRoadTint` saturates at roadTint = 1; reach full "bare" earlier than
  // that so a path that already reads as dirt also reads as dirt-grained.
  const road = Math.min(1, roadTint * 2)
  const sand =
    1 -
    THREE.MathUtils.smoothstep(height, waterLevel + sandBand * 0.5, waterLevel + sandBand * 1.5)
  return Math.min(1, Math.max(road, sand, desert))
}

/**
 * Builds one chunk's render mesh from its apron-inclusive tile. Normals are computed
 * on a temporary apron-sized geometry (so every core-edge vertex sees triangles on
 * both sides of the seam), then copied onto the trimmed core geometry. The core
 * geometry's normal attribute is set directly — `computeVertexNormals()` must NOT be
 * called on it, since that would recompute from core-only faces and reintroduce the
 * seam mismatch this whole apron trick exists to avoid.
 */
export function buildChunkGeometry(
  tile: ChunkTileData,
  resolution: number,
  chunkSize: number,
  chunkOriginX: number,
  chunkOriginZ: number,
  waterLevel: number,
  heightScale: number,
  flatShading: boolean,
  region: RegionParams,
  detailNormal: DetailNormalConfig,
  seed: number,
): ChunkMeshResult {
  const step = chunkSize / (resolution - 1)
  const apronRes = resolution + 2
  const apronOriginX = -chunkSize / 2 - step
  const apronOriginZ = -chunkSize / 2 - step

  const apronSize = chunkSize + 2 * step
  const apronGeometry = new THREE.PlaneGeometry(
    apronSize,
    apronSize,
    apronRes - 1,
    apronRes - 1,
  )
  apronGeometry.rotateX(-Math.PI / 2)
  const apronPositions = apronGeometry.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < apronPositions.count; i++) {
    const x = apronPositions.getX(i)
    const z = apronPositions.getZ(i)
    apronPositions.setY(
      i,
      sampleApronGrid(tile.heights, apronRes, apronOriginX, apronOriginZ, step, x, z),
    )
  }
  apronGeometry.computeVertexNormals()
  const apronNormals = apronGeometry.attributes.normal as THREE.BufferAttribute

  const normalIndexAt = (x: number, z: number): number => {
    const ix = Math.max(0, Math.min(apronRes - 1, Math.round((x - apronOriginX) / step)))
    const iz = Math.max(0, Math.min(apronRes - 1, Math.round((z - apronOriginZ) / step)))
    return iz * apronRes + ix
  }

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

    const nIdx = normalIndexAt(x, z)
    const nx = apronNormals.getX(nIdx)
    const ny = apronNormals.getY(nIdx)
    const nz = apronNormals.getZ(nIdx)
    normalAttr[i * 3] = nx
    normalAttr[i * 3 + 1] = ny
    normalAttr[i * 3 + 2] = nz

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
    applyMicroTint(tmp, h, waterLevel, wx, wz)
    applyRoadTint(tmp, roadTint)

    colors[i * 3] = tmp.r
    colors[i * 3 + 1] = tmp.g
    colors[i * 3 + 2] = tmp.b
    bareGround[i] = bareGroundWeight(roadTint, h, waterLevel, biomeWeights.desert, sandBand)
  }

  geometry.setAttribute('normal', new THREE.BufferAttribute(normalAttr, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('aBareGround', new THREE.BufferAttribute(bareGround, 1))
  apronGeometry.dispose()

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
  if (detailOn) applyDetailNormalTiling(material, detailNormal)

  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(chunkOriginX, 0, chunkOriginZ)
  mesh.receiveShadow = true
  mesh.castShadow = true
  mesh.name = 'chunk'

  return {
    mesh,
    dispose: () => {
      geometry.dispose()
      material.dispose()
    },
  }
}
