/** Plan world-terrain-025 — streamed cave-local water surface for dungeon pools.
 *
 * @domain world-terrain
 */

import {
  BufferAttribute,
  BufferGeometry,
  type Material,
  Mesh,
  type Object3D,
  type Vector3,
} from 'three'
import type { CaveUndergroundPool } from './caveUndergroundPool'
import { createWaterMaterial, setWaterDayNight, tickWaterTime } from '../waterMaterial'
import { WATER_RENDER_LAYER } from '../waterMirror'
import { undergroundPoolFootprintStrength } from './caveUndergroundPoolFootprint'

const POOL_MESH_SEGMENTS = 28

export type CaveUndergroundPoolPresentation = {
  group: Object3D
  update: (dt: number) => void
  setDayNight: (dayFactor: number, sunDirection: Vector3) => void
  dispose: () => void
}

function footprintBoundaryPoint(
  pool: CaveUndergroundPool,
  t: number,
  scale: number,
): { x: number, z: number } {
  const intent = pool.footprint
  const cos = Math.cos(intent.rotation)
  const sin = Math.sin(intent.rotation)
  const lx = Math.cos(t) * intent.radiusX * scale
  const lz = Math.sin(t) * intent.radiusZ * scale
  return {
    x: intent.centerX + lx * cos - lz * sin,
    z: intent.centerZ + lx * sin + lz * cos,
  }
}

/**
 * Local water mesh clipped to the authoritative pool footprint. No terrain
 * masks or mirror pass — small lake shader ripples only.
 *
 * @domain world-terrain
 */
export function createCaveUndergroundPoolPresentation(
  pool: CaveUndergroundPool,
  sharedMaterial?: Material,
): CaveUndergroundPoolPresentation {
  const material = sharedMaterial ?? createWaterMaterial({ ocean: 0, waterLevel: pool.waterLevel })
  const ownsMaterial = !sharedMaterial

  const positions: number[] = []
  const indices: number[] = []
  const y = pool.waterLevel + 0.04
  const centerIdx = 0
  positions.push(pool.footprint.centerX, y, pool.footprint.centerZ)

  const rimScale = 0.88
  for (let i = 0; i < POOL_MESH_SEGMENTS; i++) {
    const t = (i / POOL_MESH_SEGMENTS) * Math.PI * 2
    const p = footprintBoundaryPoint(pool, t, rimScale)
    if (undergroundPoolFootprintStrength(pool.footprint, p.x, p.z) < 0.15) continue
    positions.push(p.x, y, p.z)
  }

  const ringCount = (positions.length / 3) - 1
  for (let i = 1; i < ringCount; i++) {
    indices.push(centerIdx, i, i + 1)
  }
  if (ringCount >= 2) {
    indices.push(centerIdx, ringCount, 1)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  const mesh = new Mesh(geometry, material)
  mesh.name = 'cave-underground-pool-water'
  mesh.renderOrder = 2
  mesh.layers.set(WATER_RENDER_LAYER)

  const group = mesh
  return {
    group,
    update(dt) {
      tickWaterTime(material as ReturnType<typeof createWaterMaterial>, dt)
    },
    setDayNight(dayFactor, sunDirection) {
      setWaterDayNight(material as ReturnType<typeof createWaterMaterial>, dayFactor, sunDirection)
    },
    dispose() {
      geometry.dispose()
      if (ownsMaterial) material.dispose()
      mesh.removeFromParent()
    },
  }
}
