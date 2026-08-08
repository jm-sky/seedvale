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

export type ChunkMeshResult = {
  mesh: THREE.Mesh
  dispose: () => void
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

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading,
    roughness: 0.92,
    metalness: 0.04,
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
