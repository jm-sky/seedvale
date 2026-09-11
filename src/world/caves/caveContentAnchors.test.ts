/** Plan world-terrain-020 Stage B — content-anchor contract: semantic
 *  assignment from adventure topology, floor Y from the cave's own
 *  heightfield, bounded deterministic fitting, no adventure content on
 *  natural caves. */

import { describe, expect, it } from 'vitest'
import type { LargeCaveSite } from '../largeCaves'
import type { CaveTopology } from './caveTopology'
import {
  ADVENTURE_DEEP_CHAMBER_NODE_ID,
  ADVENTURE_FINAL_CHAMBER_NODE_ID,
  ADVENTURE_SIDE_CHAMBER_NODE_ID,
  buildAdventureCaveTopology,
} from './adventureTopology'
import {
  CAVE_CONTENT_PLACEMENT,
  type CaveContentAnchor,
  caveContentAnchorId,
  chamberContentCandidates,
  CONTENT_ANCHOR_CANDIDATE_LIMIT,
  passageWallContentCandidates,
  resolveCaveContentAnchors,
} from './caveContentAnchors'
import {
  buildCaveHeightfieldRepresentation,
  type CaveHeightfieldRepresentation,
  sampleHeightfieldAt,
} from './caveHeightfieldRepresentation'
import { mouthCarveDepth } from './mouthCarve'
import { buildProductionCaveTopology } from './productionTopology'

function baseSite(overrides: Partial<LargeCaveSite> = {}): LargeCaveSite {
  return { x: 200, z: -140, yaw: 0.6, length: 12, variant: 0.4, ...overrides }
}

function terrainAlongTunnel(site: LargeCaveSite, entranceHeight: number, riseRate: number): (x: number, z: number) => number {
  const intoDx = -Math.sin(site.yaw)
  const intoDz = -Math.cos(site.yaw)
  return (x, z) => entranceHeight + riseRate * ((x - site.x) * intoDx + (z - site.z) * intoDz)
}

function gentleHillFor(site: LargeCaveSite): (x: number, z: number) => number {
  return terrainAlongTunnel(site, 130, 0.5)
}

function buildAdventure(seed: number, site: LargeCaveSite): {
  topology: CaveTopology
  heightfield: CaveHeightfieldRepresentation
  hill: (x: number, z: number) => number
} {
  const hill = gentleHillFor(site)
  const topology = buildAdventureCaveTopology({ seed, site, sampleHeight: hill, sampleBaseHeight: hill })
  if (!topology) throw new Error(`adventure topology rejected seed ${seed}`)
  const walkSurfaceAt = (x: number, z: number): number => hill(x, z) - mouthCarveDepth(x, z, topology.entrance)
  return {
    topology,
    heightfield: buildCaveHeightfieldRepresentation(topology, walkSurfaceAt).heightfield,
    hill,
  }
}

function byRole(anchors: readonly CaveContentAnchor[], role: CaveContentAnchor['role']): CaveContentAnchor[] {
  return anchors.filter((a) => a.role === role)
}

const SITE = baseSite()
const FIXTURE = buildAdventure(42, SITE)

describe('cave content anchors (plan world-terrain-020 Stage B)', () => {
  it('assigns exactly one side treasure, one final treasure and one wagon on an adventure cave', () => {
    const anchors = resolveCaveContentAnchors({
      archetype: 'adventure',
      topology: FIXTURE.topology,
      heightfield: FIXTURE.heightfield,
    })
    expect(byRole(anchors, 'sideTreasure')).toHaveLength(1)
    expect(byRole(anchors, 'finalTreasure')).toHaveLength(1)
    expect(byRole(anchors, 'wagon')).toHaveLength(1)
  })

  it('is deterministic for the same seed + cave identity and ignores node iteration order', () => {
    const input = {
      archetype: 'adventure' as const,
      topology: FIXTURE.topology,
      heightfield: FIXTURE.heightfield,
    }
    const first = resolveCaveContentAnchors(input)
    const shuffled: CaveTopology = {
      ...FIXTURE.topology,
      nodes: [...FIXTURE.topology.nodes].reverse(),
      segments: [...FIXTURE.topology.segments].reverse(),
    }
    const fromShuffled = resolveCaveContentAnchors({ ...input, topology: shuffled })
    const rebuilt = buildAdventure(42, SITE)
    const second = resolveCaveContentAnchors({
      archetype: 'adventure',
      topology: rebuilt.topology,
      heightfield: rebuilt.heightfield,
    })
    expect(fromShuffled).toEqual(first)
    expect(second).toEqual(first)
    expect(byRole(first, 'sideTreasure')[0]!.id).toBe(caveContentAnchorId(FIXTURE.topology.caveId, 'sideTreasure'))
    expect(byRole(first, 'finalTreasure')[0]!.id).toBe(caveContentAnchorId(FIXTURE.topology.caveId, 'finalTreasure'))
    expect(byRole(first, 'wagon')[0]!.id).toBe(caveContentAnchorId(FIXTURE.topology.caveId, 'wagon'))
    expect(new Set(first.map((a) => a.id)).size).toBe(first.length)
  })

  it('keeps stable semantic ids that do not depend on topology array position', () => {
    const caveId = FIXTURE.topology.caveId
    const anchors = resolveCaveContentAnchors({
      archetype: 'adventure',
      topology: FIXTURE.topology,
      heightfield: FIXTURE.heightfield,
    })
    expect(byRole(anchors, 'sideTreasure')[0]!.id).toBe(`${caveId}:sideTreasure`)
    expect(byRole(anchors, 'finalTreasure')[0]!.id).toBe(`${caveId}:finalTreasure`)
    expect(byRole(anchors, 'wagon')[0]!.id).toBe(`${caveId}:wagon`)
    expect(anchors.some((a) => a.id.includes('undefined'))).toBe(false)
    expect(anchors.every((a) => a.caveId === caveId)).toBe(true)
  })

  it('places side treasure in the side chamber and final treasure in the final chamber', () => {
    const anchors = resolveCaveContentAnchors({
      archetype: 'adventure',
      topology: FIXTURE.topology,
      heightfield: FIXTURE.heightfield,
    })
    const sideNode = FIXTURE.topology.nodes.find((n) => n.id === ADVENTURE_SIDE_CHAMBER_NODE_ID)!
    const finalNode = FIXTURE.topology.nodes.find((n) => n.id === ADVENTURE_FINAL_CHAMBER_NODE_ID)!
    const deepNode = FIXTURE.topology.nodes.find((n) => n.id === ADVENTURE_DEEP_CHAMBER_NODE_ID)!
    const side = byRole(anchors, 'sideTreasure')[0]!
    const final = byRole(anchors, 'finalTreasure')[0]!
    const wagon = byRole(anchors, 'wagon')[0]!
    expect(Math.hypot(side.x - sideNode.position.x, side.z - sideNode.position.z))
      .toBeLessThan(sideNode.targetWidth * 0.5)
    expect(Math.hypot(final.x - finalNode.position.x, final.z - finalNode.position.z))
      .toBeLessThan(finalNode.targetWidth * 0.5)
    expect(Math.hypot(wagon.x - deepNode.position.x, wagon.z - deepNode.position.z))
      .toBeLessThan(deepNode.targetWidth * 0.6)
    expect(Math.hypot(side.x - finalNode.position.x, side.z - finalNode.position.z))
      .toBeGreaterThan(Math.hypot(final.x - finalNode.position.x, final.z - finalNode.position.z))
  })

  it('takes floor Y from the cave heightfield, not from surface terrain or topology node Y', () => {
    const anchors = resolveCaveContentAnchors({
      archetype: 'adventure',
      topology: FIXTURE.topology,
      heightfield: FIXTURE.heightfield,
    })
    expect(anchors.length).toBeGreaterThan(0)
    for (const anchor of anchors) {
      const sample = sampleHeightfieldAt(FIXTURE.heightfield, anchor.x, anchor.z)
      expect(anchor.y).toBe(sample.floorY)
      expect(sample.outsideGrid).toBe(false)
      expect(sample.openSky).toBe(false)
      expect(sample.gap).toBeGreaterThan(0)
      expect(anchor.y).toBeLessThan(sample.surfaceY - 0.5)
      expect(anchor.y).not.toBeCloseTo(FIXTURE.hill(anchor.x, anchor.z), 0)
    }
  })

  it('keeps each required anchor inside the cave void with its role clearance', () => {
    const anchors = resolveCaveContentAnchors({
      archetype: 'adventure',
      topology: FIXTURE.topology,
      heightfield: FIXTURE.heightfield,
    })
    for (const role of ['sideTreasure', 'finalTreasure', 'wagon'] as const) {
      const anchor = byRole(anchors, role)[0]!
      const spec = CAVE_CONTENT_PLACEMENT[role]
      const sample = sampleHeightfieldAt(FIXTURE.heightfield, anchor.x, anchor.z)
      expect(sample.gap, role).toBeGreaterThanOrEqual(spec.minGap)
      expect(sample.coreT, role).toBeLessThanOrEqual(spec.maxCoreT)
    }
  })

  it('requires a larger placement clearance for the wagon than for a chest', () => {
    expect(CAVE_CONTENT_PLACEMENT.wagon.minGap).toBeGreaterThan(CAVE_CONTENT_PLACEMENT.sideTreasure.minGap)
    expect(CAVE_CONTENT_PLACEMENT.wagon.footprintRadius)
      .toBeGreaterThan(CAVE_CONTENT_PLACEMENT.sideTreasure.footprintRadius)
    const anchors = resolveCaveContentAnchors({
      archetype: 'adventure',
      topology: FIXTURE.topology,
      heightfield: FIXTURE.heightfield,
    })
    const wagonGap = sampleHeightfieldAt(FIXTURE.heightfield, byRole(anchors, 'wagon')[0]!.x, byRole(anchors, 'wagon')[0]!.z).gap
    const chestGap = sampleHeightfieldAt(
      FIXTURE.heightfield,
      byRole(anchors, 'sideTreasure')[0]!.x,
      byRole(anchors, 'sideTreasure')[0]!.z,
    ).gap
    expect(wagonGap).toBeGreaterThanOrEqual(CAVE_CONTENT_PLACEMENT.wagon.minGap)
    expect(chestGap).toBeGreaterThanOrEqual(CAVE_CONTENT_PLACEMENT.sideTreasure.minGap)
  })

  it('keeps candidate fitting bounded and deterministic', () => {
    const node = FIXTURE.topology.nodes.find((n) => n.id === ADVENTURE_FINAL_CHAMBER_NODE_ID)!
    const incoming = { dx: 1, dz: 0 }
    const chamber = chamberContentCandidates(node, incoming, 1)
    expect(chamber.length).toBeGreaterThan(0)
    expect(chamber.length).toBeLessThanOrEqual(CONTENT_ANCHOR_CANDIDATE_LIMIT)
    const seg = FIXTURE.topology.segments.find((s) => s.to === ADVENTURE_FINAL_CHAMBER_NODE_ID)!
    const wall = passageWallContentCandidates(seg, 0.5, 1, node.targetWidth / 2)
    expect(wall.candidates.length).toBeGreaterThan(0)
    expect(wall.candidates.length).toBeLessThanOrEqual(CONTENT_ANCHOR_CANDIDATE_LIMIT)
    expect(chamberContentCandidates(node, incoming, 1)).toEqual(chamber)
  })

  it('gives a natural cave no adventure content anchors', () => {
    const hill = gentleHillFor(SITE)
    const topology = buildProductionCaveTopology({
      seed: 42,
      site: SITE,
      sampleHeight: hill,
      sampleBaseHeight: hill,
    })
    expect(topology).not.toBeNull()
    const walkSurfaceAt = (x: number, z: number): number => hill(x, z) - mouthCarveDepth(x, z, topology!.entrance)
    const heightfield = buildCaveHeightfieldRepresentation(topology!, walkSurfaceAt).heightfield
    expect(resolveCaveContentAnchors({ archetype: 'natural', topology: topology!, heightfield })).toEqual([])
    expect(resolveCaveContentAnchors({
      archetype: 'natural',
      topology: FIXTURE.topology,
      heightfield: FIXTURE.heightfield,
    })).toEqual([])
  })

  it('does not freeze callers into mutating the returned descriptors', () => {
    const anchors = resolveCaveContentAnchors({
      archetype: 'adventure',
      topology: FIXTURE.topology,
      heightfield: FIXTURE.heightfield,
    })
    expect(Object.isFrozen(anchors)).toBe(true)
    expect(Object.isFrozen(anchors[0])).toBe(true)
  })
})
