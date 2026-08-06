import * as THREE from 'three'
import type { Heightmap } from './generateHeightmap'
import {
  applyMicroTint,
  applySlopeRock,
  colorForTerrain,
} from './biomeColors'

export type Terrain = {
  mesh: THREE.Mesh
  heightmap: Heightmap
  sampleHeight: (x: number, z: number) => number
  halfExtent: number
  waterLevel: number
  dispose: () => void
}

export function createTerrainMesh(
  heightmap: Heightmap,
  flatShading = false,
): Terrain {
  const { size, resolution, waterLevel, heightScale } = heightmap.params
  const segments = resolution - 1
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments)
  geometry.rotateX(-Math.PI / 2)

  const positions = geometry.attributes.position as THREE.BufferAttribute

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i)
    const z = positions.getZ(i)
    positions.setY(i, heightmap.sample(x, z))
  }

  geometry.computeVertexNormals()

  const normals = geometry.attributes.normal as THREE.BufferAttribute
  const colors = new Float32Array(positions.count * 3)
  const tmp = new THREE.Color()

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i)
    const z = positions.getZ(i)
    const h = positions.getY(i)
    const m = heightmap.sampleBiome(x, z)
    // 1 - ny: flat ≈ 0, cliff ≈ 1 (terrain normals point roughly +Y)
    const steepness = 1 - normals.getY(i)

    colorForTerrain(h, m, waterLevel, heightScale, tmp)
    applySlopeRock(tmp, h, waterLevel, steepness)
    applyMicroTint(tmp, h, waterLevel, x, z)

    colors[i * 3] = tmp.r
    colors[i * 3 + 1] = tmp.g
    colors[i * 3 + 2] = tmp.b
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading,
    roughness: 0.92,
    metalness: 0.04,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  mesh.castShadow = true

  return {
    mesh,
    heightmap,
    sampleHeight: heightmap.sample,
    halfExtent: size / 2,
    waterLevel,
    dispose: () => {
      geometry.dispose()
      material.dispose()
    },
  }
}
