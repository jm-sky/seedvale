import * as THREE from 'three'
import {
  applyMicroTint,
  applyMountainRock,
  applyOceanDepthTint,
  applyRoadTint,
  applySlopeRock,
  colorForTerrain,
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

/** How many times the detail normal map tiles across one chunk edge. Doubled
 *  (4 → 8) alongside `terrainDetailNormalMap.ts`'s higher noise frequencies —
 *  reported blotches were tile-sized (several meters), not grain-sized; both
 *  changes shrink the apparent patch size, this one on top of that by
 *  halving how much world space one tile covers. Safe to raise now that the
 *  texture has mipmapping (`terrainDetailNormalMap.ts`) — that's what
 *  minification aliasing at high tile counts actually needed, not a low
 *  count. Still high enough to hide the chunk-border tiling seam (each
 *  chunk's UVs run 0..1 independently, so the pattern isn't phase-continuous
 *  across chunks) without reading as an obvious repeated motif. */
const NORMAL_MAP_TILES_PER_CHUNK = 8

/** Built once and shared by every chunk's material — same reasoning as
 *  `createOcean.ts`'s procedural water normal map: no external asset, no
 *  per-chunk cost beyond a cheap texture reference. */
let terrainNormalMap: THREE.Texture | null = null
function getTerrainNormalMap(): THREE.Texture {
  if (!terrainNormalMap) {
    terrainNormalMap = createTerrainNormalMap()
    terrainNormalMap.repeat.set(NORMAL_MAP_TILES_PER_CHUNK, NORMAL_MAP_TILES_PER_CHUNK)
  }
  return terrainNormalMap
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

    colorForTerrain(h, m, waterLevel, heightScale, biomeWeights, tmp)
    applySlopeRock(tmp, h, waterLevel, steepness)
    applyMountainRock(tmp, mountainRidge, h, waterLevel, heightScale)
    applyOceanDepthTint(tmp, continentalness, h, waterLevel)
    applyMicroTint(tmp, h, waterLevel, chunkOriginX + x, chunkOriginZ + z)
    applyRoadTint(tmp, roadTint)

    colors[i * 3] = tmp.r
    colors[i * 3 + 1] = tmp.g
    colors[i * 3 + 2] = tmp.b
  }

  geometry.setAttribute('normal', new THREE.BufferAttribute(normalAttr, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  apronGeometry.dispose()

  const normalMap = getTerrainNormalMap()
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading,
    roughness: 0.92,
    metalness: 0.04,
    normalMap,
    // Subtle — this is close-up surface grain, not a substitute for real
    // geometry (plan 044 §4.5, "teren wygląda płasko"). Patch size fixed by
    // the previous pass, but contrast (reported: still looks like a camo
    // pattern) was still too strong — cut hard this time (0.035 → 0.015)
    // alongside halving the noise map's own amplitude again
    // (terrainDetailNormalMap.ts) rather than another small nudge.
    normalScale: new THREE.Vector2(0.015, 0.015),
  })

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
