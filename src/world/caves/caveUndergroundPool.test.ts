/** Plan world-terrain-025 — underground pool contract and guardrails. */

import { describe, expect, it } from 'vitest'
import type { LargeCaveSite } from '../largeCaves'
import { buildAdventureCaveTopology } from './adventureTopology'
import { buildCaveHeightfieldRepresentation, DEFAULT_HEIGHTFIELD_CONFIG } from './caveHeightfieldRepresentation'
import {
  buildDungeonHeightfieldWithPool,
  undergroundPoolId,
  walkSurfaceForTopology,
} from './caveUndergroundPool'
import { resolveUndergroundPoolFootprintIntent } from './caveUndergroundPoolFootprint'
import { buildDungeonCaveTopology } from './dungeonTopology'
import { mouthCarveDepth } from './mouthCarve'
import { buildProductionCaveTopology } from './productionTopology'

function baseSite(overrides: Partial<LargeCaveSite> = {}): LargeCaveSite {
  return { x: 420, z: -180, yaw: 0.6, length: 12, variant: 0.4, ...overrides }
}

function gentleHillFor(site: LargeCaveSite): (x: number, z: number) => number {
  const intoDx = -Math.sin(site.yaw)
  const intoDz = -Math.cos(site.yaw)
  return (x, z) => 130 + 0.5 * ((x - site.x) * intoDx + (z - site.z) * intoDz)
}

describe('underground pool footprint', () => {
  it('is deterministic for the same dungeon topology', () => {
    const site = baseSite()
    const hill = gentleHillFor(site)
    const topology = buildDungeonCaveTopology({ seed: 42, site, sampleHeight: hill, sampleBaseHeight: hill })
    expect(topology).not.toBeNull()
    const a = resolveUndergroundPoolFootprintIntent(topology!)
    const b = resolveUndergroundPoolFootprintIntent(topology!)
    expect(a).toEqual(b)
    expect(a!.chamberNodeId.startsWith('dungeon-')).toBe(true)
    expect(undergroundPoolId(topology!.caveId)).toBe(`${topology!.caveId}:underground-pool`)
  })

  it('does not attach to natural or adventure topologies', () => {
    const site = baseSite()
    const hill = gentleHillFor(site)
    const natural = buildProductionCaveTopology({ seed: 7, site, archetype: 'natural', sampleHeight: hill, sampleBaseHeight: hill })
    const adventure = buildAdventureCaveTopology({ seed: 7, site, sampleHeight: hill, sampleBaseHeight: hill })
    expect(natural).not.toBeNull()
    expect(adventure).not.toBeNull()
    expect(resolveUndergroundPoolFootprintIntent(natural!)).toBeNull()
    expect(resolveUndergroundPoolFootprintIntent(adventure!)).toBeNull()
  })
})

describe('accepted dungeon heightfield pool', () => {
  it('produces lake/unsafe semantics and bounded depth', () => {
    const site = baseSite()
    const hill = gentleHillFor(site)
    const topology = buildDungeonCaveTopology({ seed: 99, site, sampleHeight: hill, sampleBaseHeight: hill })
    expect(topology).not.toBeNull()
    const walk = walkSurfaceForTopology(topology!, hill)
    const built = buildDungeonHeightfieldWithPool(topology!, walk)
    expect(built).not.toBeNull()
    const pool = built!.pool
    expect(pool.waterSource).toEqual({ kind: 'lake', quality: 'unsafe' })
    expect(pool.maxDepth).toBeGreaterThan(0)
    expect(pool.maxDepth).toBeLessThanOrEqual(0.4)
    expect(pool.shorelineApproach.y).toBeGreaterThan(pool.waterLevel)
  })

  it('leaves non-pool heightfield bytes unchanged when pool intent is absent', () => {
    const site = baseSite()
    const hill = gentleHillFor(site)
    const topology = buildProductionCaveTopology({ seed: 3, site, archetype: 'natural', sampleHeight: hill, sampleBaseHeight: hill })!
    const walk = (x: number, z: number) => hill(x, z) - mouthCarveDepth(x, z, topology.entrance)
    const plain = buildCaveHeightfieldRepresentation(topology, walk, DEFAULT_HEIGHTFIELD_CONFIG).heightfield
    const again = buildCaveHeightfieldRepresentation(topology, walk, DEFAULT_HEIGHTFIELD_CONFIG, null).heightfield
    expect(again.floorY).toEqual(plain.floorY)
    expect(again.ceilY).toEqual(plain.ceilY)
  })
})

describe('dungeon acceptance with pool', () => {
  it('accepts a dungeon for a seed where pool guardrails pass', () => {
    const site = baseSite()
    const hill = gentleHillFor(site)
    const topology = buildDungeonCaveTopology({ seed: 12, site, sampleHeight: hill, sampleBaseHeight: hill })
    expect(topology).not.toBeNull()
  })
})
