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
import { type ChunkTileData, type RegionParams, sampleApronGrid } from './chunkHeightmap'

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

  const normalAt = (x: number, z: number): THREE.Vector3 => {
    const ix = Math.max(0, Math.min(apronRes - 1, Math.round((x - apronOriginX) / step)))
    const iz = Math.max(0, Math.min(apronRes - 1, Math.round((z - apronOriginZ) / step)))
    const idx = iz * apronRes + ix
    return new THREE.Vector3(
      apronNormals.getX(idx),
      apronNormals.getY(idx),
      apronNormals.getZ(idx),
    )
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
    const h = sampleApronGrid(tile.heights, apronRes, apronOriginX, apronOriginZ, step, x, z)
    positions.setY(i, h)

    const n = normalAt(x, z)
    normalAttr[i * 3] = n.x
    normalAttr[i * 3 + 1] = n.y
    normalAttr[i * 3 + 2] = n.z

    const m = sampleApronGrid(tile.biomes, apronRes, apronOriginX, apronOriginZ, step, x, z)
    const continentalness = sampleApronGrid(
      tile.continentalness,
      apronRes,
      apronOriginX,
      apronOriginZ,
      step,
      x,
      z,
    )
    const mountainRidge = sampleApronGrid(
      tile.mountainRidge,
      apronRes,
      apronOriginX,
      apronOriginZ,
      step,
      x,
      z,
    )
    const moistureRegion = sampleApronGrid(
      tile.moistureRegion,
      apronRes,
      apronOriginX,
      apronOriginZ,
      step,
      x,
      z,
    )
    const roadTint = sampleApronGrid(
      tile.roadTint,
      apronRes,
      apronOriginX,
      apronOriginZ,
      step,
      x,
      z,
    )
    const steepness = 1 - n.y
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
