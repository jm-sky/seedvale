import * as THREE from 'three'
import type { Heightmap } from './generateHeightmap'

const COLOR_WATER = new THREE.Color(0x3a7ca5)
const COLOR_SAND = new THREE.Color(0xc2b280)
const COLOR_GRASS = new THREE.Color(0x5d9b45)
const COLOR_ROCK = new THREE.Color(0x7a7a72)
const COLOR_PEAK = new THREE.Color(0xd8dde3)

function colorForHeight(
  h: number,
  waterLevel: number,
  heightScale: number,
  out: THREE.Color,
): void {
  if (h <= waterLevel + 0.02) {
    out.copy(COLOR_WATER)
    return
  }
  if (h < waterLevel + 1.2) {
    out.copy(COLOR_SAND)
    return
  }
  const t = (h - waterLevel) / Math.max(heightScale, 0.001)
  if (t < 0.45) {
    out.copy(COLOR_GRASS)
    return
  }
  if (t < 0.75) {
    out.lerpColors(COLOR_GRASS, COLOR_ROCK, (t - 0.45) / 0.3)
    return
  }
  out.lerpColors(COLOR_ROCK, COLOR_PEAK, Math.min(1, (t - 0.75) / 0.25))
}

export type Terrain = {
  mesh: THREE.Mesh
  sampleHeight: (x: number, z: number) => number
  /** Half-extent of playable XZ (map is centered at origin). */
  halfExtent: number
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
    positions.setY(i, h)
    colorForHeight(h, waterLevel, heightScale, tmp)
    colors[i * 3] = tmp.r
    colors[i * 3 + 1] = tmp.g
    colors[i * 3 + 2] = tmp.b
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.9,
    metalness: 0.05,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  mesh.castShadow = true

  return {
    mesh,
    sampleHeight: heightmap.sample,
    halfExtent: size / 2,
    dispose: () => {
      geometry.dispose()
      material.dispose()
    },
  }
}
