import { describe, expect, it } from 'vitest'
import type { LargeCaveSite } from '../largeCaves'
import type { CaveTopology } from './caveTopology'
import { buildAdventureCaveTopology } from './adventureTopology'
import { resolveCaveTraversal } from './caveHabitat'
import { heightfieldGroundColumn, heightfieldStandingClearance } from './caveHeightfieldQuery'
import {
  buildCaveHeightfieldRepresentation,
  type CaveHeightfieldRepresentation,
  type SurfaceSampler,
} from './caveHeightfieldRepresentation'
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

/** Builds a real production topology + heightfield the same way
 *  `createCaves()` does, so these tests exercise the actual `Caves` contract
 *  shape rather than a synthetic fixture. */
function buildFixture(topology: CaveTopology): { topology: CaveTopology, heightfield: CaveHeightfieldRepresentation, surfaceHeightAt: SurfaceSampler } {
  const sampleBaseHeight = gentleHillFor(baseSite())
  const walkSurfaceAt: SurfaceSampler = (x, z) => sampleBaseHeight(x, z) - mouthCarveDepth(x, z, topology.entrance)
  const { heightfield } = buildCaveHeightfieldRepresentation(topology, walkSurfaceAt)
  return { topology, heightfield, surfaceHeightAt: sampleBaseHeight }
}

function naturalFixture(seed = 42) {
  const sampleBaseHeight = gentleHillFor(baseSite())
  const topology = buildNaturalCaveTopology({ seed, site: baseSite(), sampleHeight: sampleBaseHeight, sampleBaseHeight })
  if (!topology) throw new Error('test fixture: natural topology rejected')
  return buildFixture(topology)
}

function adventureFixture(seed = 42) {
  const sampleBaseHeight = gentleHillFor(baseSite())
  const topology = buildAdventureCaveTopology({ seed, site: baseSite(), sampleHeight: sampleBaseHeight, sampleBaseHeight })
  if (!topology) throw new Error('test fixture: adventure topology rejected')
  return buildFixture(topology)
}

const BEAR_HEIGHT = 1.5

describe('resolveCaveTraversal (plan fauna-019)', () => {
  it('resolves the same descriptor deterministically by caveId, with zero presentation involved', () => {
    const { topology, heightfield, surfaceHeightAt } = naturalFixture()
    const a = resolveCaveTraversal(topology, heightfield, surfaceHeightAt, BEAR_HEIGHT)
    const b = resolveCaveTraversal(topology, heightfield, surfaceHeightAt, BEAR_HEIGHT)
    expect(a).not.toBeNull()
    expect(a).toEqual(b)
    expect(a!.caveId).toBe(topology.caveId)
  })

  it('picks the natural recipe\'s literal main chamber as home, standable and floor-snapped', () => {
    const { topology, heightfield, surfaceHeightAt } = naturalFixture()
    const descriptor = resolveCaveTraversal(topology, heightfield, surfaceHeightAt, BEAR_HEIGHT)
    expect(descriptor).not.toBeNull()
    const chamber = topology.nodes.find((n) => n.id === 'chamber')!
    expect(descriptor!.home.x).toBeCloseTo(chamber.position.x, 5)
    expect(descriptor!.home.z).toBeCloseTo(chamber.position.z, 5)

    const column = heightfieldGroundColumn(heightfield, surfaceHeightAt, descriptor!.home.x, descriptor!.home.z)
    expect(column).not.toBeNull()
    expect(descriptor!.home.y).toBeCloseTo(column!.floorY, 5)
    expect(column!.ceilingY - column!.floorY).toBeGreaterThanOrEqual(heightfieldStandingClearance(BEAR_HEIGHT))
  })

  it('picks the adventure recipe\'s first main-route chamber, not the side/deep/final chambers', () => {
    const { topology, heightfield, surfaceHeightAt } = adventureFixture()
    const descriptor = resolveCaveTraversal(topology, heightfield, surfaceHeightAt, BEAR_HEIGHT)
    expect(descriptor).not.toBeNull()
    const firstChamber = topology.nodes.find((n) => n.id === 'adventure-chamber-1')!
    expect(descriptor!.home.x).toBeCloseTo(firstChamber.position.x, 5)
    expect(descriptor!.home.z).toBeCloseTo(firstChamber.position.z, 5)
  })

  it('builds a route that starts at home and ends at the entrance, deriving from topology segments', () => {
    const { topology, heightfield, surfaceHeightAt } = naturalFixture()
    const descriptor = resolveCaveTraversal(topology, heightfield, surfaceHeightAt, BEAR_HEIGHT)!
    const route = descriptor.routeToEntrance
    expect(route.length).toBeGreaterThan(2)
    expect(route[0]).toEqual(descriptor.home)
    const last = route[route.length - 1]!
    expect(last.x).toBeCloseTo(descriptor.entrance.x, 5)
    expect(last.z).toBeCloseTo(descriptor.entrance.z, 5)

    // Every consecutive pair must be a real topology waypoint step (no
    // teleport): each hop should be within the natural recipe's own segment
    // length scale, not an arbitrary straight jump across the whole cave.
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1]!
      const b = route[i]!
      const dist = Math.hypot(b.x - a.x, b.z - a.z)
      expect(dist).toBeLessThan(6)
    }
  })

  it('reverses cleanly for the return leg (entrance -> home) with the same waypoints', () => {
    const { topology, heightfield, surfaceHeightAt } = naturalFixture()
    const descriptor = resolveCaveTraversal(topology, heightfield, surfaceHeightAt, BEAR_HEIGHT)!
    const reversed = [...descriptor.routeToEntrance].reverse()
    expect(reversed[0]).toEqual({ x: descriptor.entrance.x, y: descriptor.entrance.y, z: descriptor.entrance.z })
    expect(reversed[reversed.length - 1]).toEqual(descriptor.home)
  })

  it('rejects rather than approximating when no chamber has standing clearance for entityHeight', () => {
    const { topology, heightfield, surfaceHeightAt } = naturalFixture()
    const impossibleHeight = 50
    expect(resolveCaveTraversal(topology, heightfield, surfaceHeightAt, impossibleHeight)).toBeNull()
  })

  it('is independent of which cave a caller starts from — same seed/site always resolves the same result', () => {
    const first = naturalFixture(7)
    const second = naturalFixture(7)
    expect(resolveCaveTraversal(first.topology, first.heightfield, first.surfaceHeightAt, BEAR_HEIGHT))
      .toEqual(resolveCaveTraversal(second.topology, second.heightfield, second.surfaceHeightAt, BEAR_HEIGHT))
  })
})
