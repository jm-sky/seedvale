import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { GrassGeometryLodTier } from './distanceLod'
import { createGrassSystem, grassBladeLocalPositions } from './grass'
import {
  createGrassBoundsAccumulator,
  expandGrassInstanceBounds,
  finalizeGrassBounds,
  grassBoundsContainsPoint,
  grassInstanceConservativeRadius,
  grassSpeciesLocalExtent,
  transformGrassLocalPoint,
} from './grassBounds'
import {
  GRASS_SPECIES_ORDER,
  type GrassBucketData,
} from './grassPlacement'

const LOD_TIERS: readonly GrassGeometryLodTier[] = ['near', 'mid', 'far']

function syntheticTriBucket(): GrassBucketData {
  const scaleX = 0.16 * 1.22
  const scaleY = 0.52 * 1.22
  const windFactor = 1
  const pos = new THREE.Vector3(12.5, 3.2, -7.1)
  const quat = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), 2.4)
    .multiply(new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0.6, 0, -0.8).normalize(),
      THREE.MathUtils.degToRad(14),
    ))
  const scale = new THREE.Vector3(scaleX, scaleY, scaleX)
  const matrices = new THREE.Matrix4().compose(pos, quat, scale).toArray(new Float32Array(16))
  const acc = createGrassBoundsAccumulator()
  expandGrassInstanceBounds(acc, 'tri', pos.x, pos.y, pos.z, scaleX, scaleY, windFactor)
  const bounds = finalizeGrassBounds(acc)!
  return {
    count: 1,
    matrices,
    phases: new Float32Array(1),
    baseColors: new Float32Array(3),
    tipColors: new Float32Array(3),
    windFactors: new Float32Array([windFactor]),
    bounds,
  }
}

describe('grass bucket bounds', () => {
  it('returns null for an empty accumulator', () => {
    expect(finalizeGrassBounds(createGrassBoundsAccumulator())).toBeNull()
  })

  it('covers a single instance at any rotation and non-uniform scale', () => {
    const bucket = syntheticTriBucket()
    const local = grassBladeLocalPositions('tri', 'near')
    for (let v = 0; v < local.length; v += 3) {
      const p = transformGrassLocalPoint(bucket.matrices, 0, local[v]!, local[v + 1]!, local[v + 2]!)
      expect(grassBoundsContainsPoint(bucket.bounds, p.x, p.y, p.z)).toBe(true)
    }
    expect(grassInstanceConservativeRadius('tri', 0.16 * 1.22, 0.52 * 1.22, 1)).toBeGreaterThan(0)
  })

  it('local extents cover every geometry LOD vertex, including filler', () => {
    for (const id of GRASS_SPECIES_ORDER) {
      const extent = grassSpeciesLocalExtent(id)
      const tiers: readonly GrassGeometryLodTier[] = id === 'filler' ? ['near'] : LOD_TIERS
      for (const tier of tiers) {
        const pos = grassBladeLocalPositions(id, tier)
        expect(pos.length).toBeGreaterThan(0)
        for (let i = 0; i < pos.length; i += 3) {
          const horiz = Math.hypot(pos[i]!, pos[i + 2]!)
          const y = Math.abs(pos[i + 1]!)
          expect(horiz).toBeLessThanOrEqual(extent.horiz + 1e-9)
          expect(y).toBeLessThanOrEqual(extent.y + 1e-9)
        }
      }
    }
  })

  it('buildGrassChunkMeshes assigns worker bounds instead of scanning instances', () => {
    const tri = syntheticTriBucket()
    const system = createGrassSystem()
    try {
      const chunk = system.buildGrassChunkMeshes({ tri }, 0, 0)
      expect(chunk).not.toBeNull()
      const mesh = chunk!.mesh.children[0] as THREE.InstancedMesh
      expect(mesh.boundingSphere).not.toBeNull()
      expect(mesh.boundingSphere!.center.x).toBe(tri.bounds.centerX)
      expect(mesh.boundingSphere!.center.y).toBe(tri.bounds.centerY)
      expect(mesh.boundingSphere!.center.z).toBe(tri.bounds.centerZ)
      expect(mesh.boundingSphere!.radius).toBe(tri.bounds.radius)

      const assigned = mesh.boundingSphere!.clone()
      mesh.boundingSphere = null
      mesh.computeBoundingSphere()
      const scanned = mesh.boundingSphere!
      const centerDist = assigned.center.distanceTo(scanned.center)
      expect(assigned.radius).toBeGreaterThanOrEqual(scanned.radius + centerDist - 1e-4)

      mesh.boundingSphere = assigned
      chunk!.setGeometryLod('far')
      expect(mesh.boundingSphere!.radius).toBe(tri.bounds.radius)
      expect(mesh.boundingSphere!.center.equals(assigned.center)).toBe(true)
      chunk!.dispose()
    } finally {
      system.dispose()
    }
  })

  it('empty GrassChunkData does not throw and produces no mesh', () => {
    const system = createGrassSystem()
    try {
      expect(system.buildGrassChunkMeshes({}, 10, 20)).toBeNull()
    } finally {
      system.dispose()
    }
  })
})
