import { describe, expect, it } from 'vitest'
import type { LargeCaveSite } from '../largeCaves'
import type { CaveTopology } from './caveTopology'
import { heightfieldGroundColumn } from './caveHeightfieldQuery'
import {
  buildCaveHeightfieldRepresentation,
  type CaveHeightfieldRepresentation,
  type SurfaceSampler,
} from './caveHeightfieldRepresentation'
import { resolveCaveInteriorPlacementView } from './caveInteriorPlacement'
import { mouthCarveDepth } from './mouthCarve'
import { buildNaturalCaveTopology } from './productionTopology'

function baseSite(overrides: Partial<LargeCaveSite> = {}): LargeCaveSite {
  return { x: 200, z: -140, yaw: 0.6, length: 12, variant: 0.4, ...overrides }
}

function gentleHillFor(site: LargeCaveSite): (x: number, z: number) => number {
  const intoDx = -Math.sin(site.yaw)
  const intoDz = -Math.cos(site.yaw)
  return (x, z) => 130 + 0.5 * ((x - site.x) * intoDx + (z - site.z) * intoDz)
}

function buildFixture(topology: CaveTopology): {
  topology: CaveTopology
  heightfield: CaveHeightfieldRepresentation
  surfaceHeightAt: SurfaceSampler
} {
  const sampleBaseHeight = gentleHillFor(baseSite())
  const walkSurfaceAt: SurfaceSampler = (x, z) => sampleBaseHeight(x, z) - mouthCarveDepth(x, z, topology.entrance)
  const { heightfield } = buildCaveHeightfieldRepresentation(topology, walkSurfaceAt)
  return { topology, heightfield, surfaceHeightAt: sampleBaseHeight }
}

describe('resolveCaveInteriorPlacementView (plan world-018)', () => {
  it('returns connected chamber/widening candidates with heightfield floor Y, not surface height', () => {
    const sampleBaseHeight = gentleHillFor(baseSite())
    const topology = buildNaturalCaveTopology({
      seed: 42,
      site: baseSite(),
      sampleHeight: sampleBaseHeight,
      sampleBaseHeight,
    })
    if (!topology) throw new Error('test fixture: natural topology rejected')
    const { heightfield, surfaceHeightAt } = buildFixture(topology)
    const view = resolveCaveInteriorPlacementView(topology, heightfield, surfaceHeightAt)
    expect(view.caveId).toBe(topology.caveId)
    expect(view.candidates.length).toBeGreaterThan(0)
    for (const candidate of view.candidates) {
      const column = heightfieldGroundColumn(heightfield, surfaceHeightAt, candidate.x, candidate.z)
      expect(column).not.toBeNull()
      expect(candidate.y).toBeCloseTo(column!.floorY, 5)
      expect(candidate.y).not.toBeCloseTo(sampleBaseHeight(candidate.x, candidate.z), 1)
      expect(candidate.depthFromEntrance).toBeGreaterThan(0)
    }
  })

  it('is deterministic and presentation-free', () => {
    const sampleBaseHeight = gentleHillFor(baseSite())
    const topology = buildNaturalCaveTopology({
      seed: 42,
      site: baseSite(),
      sampleHeight: sampleBaseHeight,
      sampleBaseHeight,
    })
    if (!topology) throw new Error('test fixture: natural topology rejected')
    const { heightfield, surfaceHeightAt } = buildFixture(topology)
    const a = resolveCaveInteriorPlacementView(topology, heightfield, surfaceHeightAt)
    const b = resolveCaveInteriorPlacementView(topology, heightfield, surfaceHeightAt)
    expect(a).toEqual(b)
  })
})
