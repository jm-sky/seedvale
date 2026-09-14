/** Plan world-terrain-028 — dungeon content anchor contract. */

import { describe, expect, it } from 'vitest'
import type { LargeCaveSite } from '../largeCaves'
import { type CaveContentAnchor, resolveCaveContentAnchors } from './caveContentAnchors'
import { sampleHeightfieldAt } from './caveHeightfieldRepresentation'
import { buildDungeonHeightfieldWithPool } from './caveUndergroundPool'
import { dungeonChambersFromTopology } from './dungeonChambers'
import { buildDungeonCaveTopology } from './dungeonTopology'
import { mouthCarveDepth } from './mouthCarve'

function baseSite(): LargeCaveSite {
  return { x: 200, z: -140, yaw: 0.6, length: 12, variant: 0.4 }
}

function dungeonFixture(seed: number) {
  const site = baseSite()
  const sampleBaseHeight = (x: number, z: number): number => {
    const intoDx = -Math.sin(site.yaw)
    const intoDz = -Math.cos(site.yaw)
    return 130 + 0.5 * ((x - site.x) * intoDx + (z - site.z) * intoDz)
  }
  const topology = buildDungeonCaveTopology({ seed, site, sampleHeight: sampleBaseHeight, sampleBaseHeight })!
  const walkSurfaceAt = (x: number, z: number): number =>
    sampleBaseHeight(x, z) - mouthCarveDepth(x, z, topology.entrance)
  const built = buildDungeonHeightfieldWithPool(topology, walkSurfaceAt)
  if (!built) throw new Error('dungeon fixture rejected')
  return { topology, heightfield: built.heightfield, pool: built.pool }
}

describe('dungeon cave content anchors (plan world-terrain-028)', () => {
  it('maps side treasure anchors to stable side-chamber source ids', () => {
    const { topology, heightfield, pool } = dungeonFixture(6)
    const anchors = resolveCaveContentAnchors({
      archetype: 'dungeon',
      topology,
      heightfield,
      undergroundPool: pool,
    })
    const sideChambers = dungeonChambersFromTopology(topology).filter((c) => c.class === 'side')
    for (const ch of sideChambers) {
      const anchor = anchors.find((a) => a.role === 'sideTreasure' && a.sourceNodeId === ch.nodeId)
      if (anchor) {
        expect(anchor.id).toBe(`${topology.caveId}:sideTreasure:${ch.nodeId}`)
      }
    }
    expect(anchors.some((a) => a.role === 'sideTreasure')).toBe(sideChambers.length > 0)
  })

  it('requires one final-chamber finalTreasure with semantic id', () => {
    const { topology, heightfield, pool } = dungeonFixture(9)
    const anchors = resolveCaveContentAnchors({
      archetype: 'dungeon',
      topology,
      heightfield,
      undergroundPool: pool,
    })
    const finals = anchors.filter((a) => a.role === 'finalTreasure')
    expect(finals).toHaveLength(1)
    expect(finals[0]!.id).toBe(`${topology.caveId}:finalTreasure:dungeon-final-chamber`)
    expect(finals[0]!.sourceNodeId).toBe('dungeon-final-chamber')
  })

  it('uses heightfield floor Y and keeps same-node anchors separated', () => {
    const { topology, heightfield, pool } = dungeonFixture(11)
    const anchors = resolveCaveContentAnchors({
      archetype: 'dungeon',
      topology,
      heightfield,
      undergroundPool: pool,
    })
    for (const anchor of anchors) {
      const sample = sampleHeightfieldAt(heightfield, anchor.x, anchor.z)
      expect(anchor.y).toBe(sample.floorY)
    }
    const byNode = new Map<string, CaveContentAnchor[]>()
    for (const a of anchors) {
      const key = a.sourceNodeId ?? a.id
      const list = byNode.get(key) ?? []
      list.push(a)
      byNode.set(key, list)
    }
    for (const [, group] of byNode) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const dist = Math.hypot(group[i]!.x - group[j]!.x, group[i]!.z - group[j]!.z)
          expect(dist).toBeGreaterThan(0.9)
        }
      }
    }
  })
})
