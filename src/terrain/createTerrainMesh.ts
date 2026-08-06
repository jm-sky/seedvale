import * as THREE from 'three'
import type { Heightmap } from './generateHeightmap'
import { colorForTerrain } from './biomeColors'

export type Terrain = {
  mesh: THREE.Mesh
  sampleHeight: (x: number, z: number) => number
  halfExtent: number
  waterLevel: number
  dispose: () => void
}

export function createTerrainMesh(heightmap: Heightmap): Terrain {
  const { size, resolution, waterLevel, heightScale } = heightmap.params
  const segments = resolution - 1
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments)
  geometry.rotateX(-Math.PI / 2)

  const positions = geometry.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(positions.count * 3)
  const tmp = new THREE.Color()

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i)
    const z = positions.getZ(i)
    const h = heightmap.sample(x, z)
    const m = heightmap.sampleBiome(x, z)
    positions.setY(i, h)
    colorForTerrain(h, m, waterLevel, heightScale, tmp)
    colors[i * 3] = tmp.r
    colors[i * 3 + 1] = tmp.g
    colors[i * 3 + 2] = tmp.b
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.92,
    metalness: 0.04,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  mesh.castShadow = true

  return {
    mesh,
    sampleHeight: heightmap.sample,
    halfExtent: size / 2,
    waterLevel,
    dispose: () => {
      geometry.dispose()
      material.dispose()
    },
  }
}
