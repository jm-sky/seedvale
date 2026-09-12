import { describe, expect, it } from 'vitest'
import type { LargeCaveSite } from '../largeCaves'
import {
  resolveCaveRouteBetweenNodes,
  resolveCaveTraversal,
  resolveStandableHomePoint,
} from './caveHabitat'
import { heightfieldGroundColumn } from './caveHeightfieldQuery'
import { type SurfaceSampler } from './caveHeightfieldRepresentation'
import { buildDungeonHeightfieldWithPool } from './caveUndergroundPool'
import { dungeonChambersFromTopology } from './dungeonChambers'
import { buildDungeonCaveTopology } from './dungeonTopology'
import { mouthCarveDepth } from './mouthCarve'

function baseSite(): LargeCaveSite {
  return { x: 200, z: -140, yaw: 0.6, length: 12, variant: 0.4 }
}

function hillSample(site: LargeCaveSite): SurfaceSampler {
  const intoDx = -Math.sin(site.yaw)
  const intoDz = -Math.cos(site.yaw)
  return (x, z) => 130 + 0.5 * ((x - site.x) * intoDx + (z - site.z) * intoDz)
}

function dungeonFixture(seed: number) {
  const site = baseSite()
  const sampleBaseHeight = hillSample(site)
  const topology = buildDungeonCaveTopology({ seed, site, sampleHeight: sampleBaseHeight, sampleBaseHeight })!
  const walkSurfaceAt: SurfaceSampler = (x, z) => sampleBaseHeight(x, z) - mouthCarveDepth(x, z, topology.entrance)
  const built = buildDungeonHeightfieldWithPool(topology, walkSurfaceAt)
  if (!built) throw new Error('dungeon fixture: pool rejected')
  const { heightfield, pool } = built
  return { topology, heightfield, sampleBaseHeight, pool }
}

const BEAR_HEIGHT = 1.5

describe('resolveCaveTraversal homeNodeId (plan fauna-027)', () => {
  it('places different homes for different chamber node ids', () => {
    const { topology, heightfield, sampleBaseHeight } = dungeonFixture(5)
    const chambers = dungeonChambersFromTopology(topology).filter((c) => c.class !== 'entrance-adjacent')
    const a = chambers[0]!
    const b = chambers[1]!
    const homeA = resolveCaveTraversal(topology, heightfield, sampleBaseHeight, BEAR_HEIGHT, { homeNodeId: a.nodeId })
    const homeB = resolveCaveTraversal(topology, heightfield, sampleBaseHeight, BEAR_HEIGHT, { homeNodeId: b.nodeId })
    expect(homeA).not.toBeNull()
    expect(homeB).not.toBeNull()
    expect(Math.hypot(homeA!.home.x - homeB!.home.x, homeA!.home.z - homeB!.home.z)).toBeGreaterThan(1)
  })

  it('prefers dry shoreline approach for pool chamber homes', () => {
    const { topology, heightfield, sampleBaseHeight, pool } = dungeonFixture(8)
    if (!pool) return
    const home = resolveStandableHomePoint(
      topology,
      heightfield,
      sampleBaseHeight,
      pool.chamberNodeId,
      BEAR_HEIGHT,
      { dryApproach: { x: pool.shorelineApproach.x, z: pool.shorelineApproach.z } },
    )
    expect(home).not.toBeNull()
    expect(home!.x).toBeCloseTo(pool.shorelineApproach.x, 3)
    expect(home!.z).toBeCloseTo(pool.shorelineApproach.z, 3)
    const column = heightfieldGroundColumn(heightfield, sampleBaseHeight, home!.x, home!.z)
    expect(column).not.toBeNull()
  })

  it('builds a topology route between home and pool chambers', () => {
    const { topology, heightfield, sampleBaseHeight, pool } = dungeonFixture(12)
    if (!pool) return
    const chambers = dungeonChambersFromTopology(topology).filter((c) => c.class !== 'entrance-adjacent')
    const homeNode = chambers.find((c) => c.nodeId !== pool.chamberNodeId) ?? chambers[0]!
    const route = resolveCaveRouteBetweenNodes(topology, heightfield, sampleBaseHeight, homeNode.nodeId, pool.chamberNodeId)
    expect(route).not.toBeNull()
    expect(route!.length).toBeGreaterThan(0)
  })
})
