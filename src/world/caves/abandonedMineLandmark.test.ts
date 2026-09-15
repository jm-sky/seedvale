/** Plan world-terrain-017 — abandoned mine identity, ranking and eligibility. */

import { describe, expect, it } from 'vitest'
import type { LargeCavePlacementInput, LargeCaveSite } from '../largeCaves'
import type { CaveArchetype } from './caveArchetype'
import type { CaveTopology } from './caveTopology'
import {
  type AbandonedMineEligibleCave,
  caveHasMineCapacity,
  caveIsMineEligible,
  landmarkRequiredMineCaveId,
  makeMineId,
  MINE_SEARCH_ENVELOPES,
  resolveAbandonedMineLandmark,
} from './abandonedMineLandmark'
import { makeCaveId } from './caveIdentity'
import { type MassifSampleFns } from './mountainMassif'

function topologyAt(caveId: string, x: number, z: number, opts?: { chamber?: boolean }): CaveTopology {
  const nodes = opts?.chamber === false
    ? [
        { id: 'entrance', kind: 'entrance' as const, position: { x, y: 0, z }, targetWidth: 3, targetHeight: 3 },
      ]
    : [
        { id: 'entrance', kind: 'entrance' as const, position: { x, y: 0, z }, targetWidth: 3, targetHeight: 3 },
        { id: 'chamber', kind: 'chamber' as const, position: { x, y: -4, z: z + 12 }, targetWidth: 8, targetHeight: 8 },
      ]
  const segments = nodes.length > 1
    ? [{
        id: 'seg-0',
        from: 'entrance',
        to: 'chamber',
        centerline: [
          { x, y: 0, z },
          { x, y: -4, z: z + 12 },
        ],
      }]
    : []
  return {
    caveId,
    seed: 1,
    entrance: { x, y: 0, z, yaw: 0, width: 3, height: 3 },
    nodes,
    segments,
    features: [],
    minClearance: 1.8,
  }
}

function cave(opts: {
  id: string
  x: number
  z: number
  archetype?: CaveArchetype
  chamber?: boolean
  contentAnchorIds?: readonly string[]
}): AbandonedMineEligibleCave {
  return {
    caveId: opts.id,
    archetype: opts.archetype ?? 'natural',
    x: opts.x,
    z: opts.z,
    topology: topologyAt(opts.id, opts.x, opts.z, { chamber: opts.chamber }),
    contentAnchorIds: opts.contentAnchorIds,
  }
}

function mountainAround(cx: number, cz: number): MassifSampleFns {
  return {
    sampleMountainRidge: (x, z) => (Math.hypot(x - cx, z - cz) < 140 ? 0.6 : 0.03),
    sampleHeight: (x, z) => {
      const dist = Math.hypot(x - cx, z - cz)
      if (dist < 110) return 28 + (x - cx) * 0.3
      return 8
    },
    waterLevel: 0,
  }
}

function placement(samples: MassifSampleFns): LargeCavePlacementInput {
  return {
    seed: 42,
    sampleHeight: samples.sampleHeight,
    sampleContinentalness: () => 0.8,
    sampleMountainRidge: samples.sampleMountainRidge,
    waterLevel: 0,
    coastThreshold: 0.45,
    roadsNear: () => [],
    villages: [{ x: 0, z: 0, radius: 48 }],
  }
}

function acceptSite(site: LargeCaveSite): CaveTopology {
  const caveId = makeCaveId(42, site)
  return topologyAt(caveId, site.x, site.z)
}

describe('makeMineId', () => {
  it('is stable for the same seed and independent of cave identity', () => {
    expect(makeMineId(99)).toBe(makeMineId(99))
    expect(makeMineId(99)).not.toBe(makeMineId(100))
    expect(makeMineId(99).startsWith('abandonedMine:')).toBe(true)
    expect(makeMineId(99)).not.toContain('cave:')
  })
})

describe('caveIsMineEligible', () => {
  const mountain = mountainAround(400, 0)

  it('rejects dungeon caves even on a massif', () => {
    expect(caveIsMineEligible(cave({ id: 'd', x: 400, z: 0, archetype: 'dungeon' }), mountain)).toBe(false)
  })

  it('rejects a cave whose anchors are already claimed without mutating the set', () => {
    const claimed = new Set(['anchor-a'])
    const candidate = cave({
      id: 'n',
      x: 400,
      z: 0,
      contentAnchorIds: ['anchor-a', 'anchor-b'],
    })
    expect(caveIsMineEligible(candidate, mountain, { claimedAnchorIds: claimed })).toBe(false)
    expect(claimed.has('anchor-a')).toBe(true)
    expect(claimed.size).toBe(1)
  })

  it('rejects a reserved cave id without touching profile RNG', () => {
    const reserved = new Set(['cave-reserved'])
    expect(caveIsMineEligible(
      cave({ id: 'cave-reserved', x: 400, z: 0 }),
      mountain,
      { reservedCaveIds: reserved },
    )).toBe(false)
    expect([...reserved]).toEqual(['cave-reserved'])
  })

  it('accepts a natural cave on a coherent massif', () => {
    expect(caveIsMineEligible(cave({ id: 'n', x: 400, z: 0 }), mountain)).toBe(true)
  })

  it('rejects a cave that lacks a chamber', () => {
    expect(caveHasMineCapacity(topologyAt('x', 400, 0, { chamber: false }))).toBe(false)
    expect(caveIsMineEligible(cave({ id: 'thin', x: 400, z: 0, chamber: false }), mountain)).toBe(false)
  })
})

describe('resolveAbandonedMineLandmark', () => {
  it('prefers an existing suitable cave over guaranteeing a new site', () => {
    const samples = mountainAround(400, 0)
    const existing = cave({ id: 'cave:existing', x: 400, z: 0, archetype: 'adventure' })
    const result = resolveAbandonedMineLandmark({
      seed: 42,
      placement: placement(samples),
      samples,
      acceptedCaves: [existing],
      buildTopology: () => {
        throw new Error('must not generate a cave when an eligible one exists')
      },
    })
    expect(result?.landmark.caveId).toBe('cave:existing')
    expect(result?.landmark.caveSource).toBe('existing-cave')
    expect(result?.extraAssignment).toBeNull()
    expect(result?.usedGuarantee).toBe(false)
    expect(result?.landmark.mineId).toBe(makeMineId(42))
    expect(landmarkRequiredMineCaveId(result?.landmark ?? null)).toBeNull()
  })

  it('does not pick a dungeon even when it is the only cave on the massif', () => {
    const samples = mountainAround(400, 0)
    const result = resolveAbandonedMineLandmark({
      seed: 42,
      placement: placement(samples),
      samples,
      acceptedCaves: [cave({ id: 'cave:dungeon', x: 400, z: 0, archetype: 'dungeon' })],
      buildTopology: acceptSite,
    })
    expect(result?.landmark.caveId).not.toBe('cave:dungeon')
    expect(result?.usedGuarantee).toBe(true)
    expect(result?.extraAssignment?.archetype).not.toBe('dungeon')
  })

  it('expands to the next envelope before guaranteeing on a farther massif', () => {
    const near = { x: 250, z: 0 }
    const far = { x: 1200, z: 0 }
    const samples: MassifSampleFns = {
      sampleMountainRidge: (x, z) => (Math.hypot(x - far.x, z - far.z) < 140 ? 0.6 : 0.03),
      sampleHeight: (x, z) => {
        const dist = Math.hypot(x - far.x, z - far.z)
        if (dist < 110) return 28 + (x - far.x) * 0.3
        return 8
      },
      waterLevel: 0,
    }
    const result = resolveAbandonedMineLandmark({
      seed: 42,
      placement: placement(samples),
      samples,
      acceptedCaves: [cave({ id: 'cave:lowland', x: near.x, z: near.z })],
      buildTopology: acceptSite,
    })
    expect(result).not.toBeNull()
    expect(result!.envelopeIndex).toBeGreaterThanOrEqual(1)
    expect(result!.envelopeIndex).toBeLessThan(MINE_SEARCH_ENVELOPES.length)
    expect(homeish(result!.landmark)).toBeGreaterThan(MINE_SEARCH_ENVELOPES[0]!.maxDist)
    expect(result!.usedGuarantee).toBe(true)
  })

  it('is independent of accepted-cave array order', () => {
    const samples = mountainAround(500, 40)
    const a = cave({ id: 'cave:aaa', x: 500, z: 40 })
    const b = cave({ id: 'cave:bbb', x: 505, z: 38, archetype: 'adventure' })
    const forward = resolveAbandonedMineLandmark({
      seed: 7,
      placement: placement(samples),
      samples,
      acceptedCaves: [a, b],
      buildTopology: acceptSite,
    })
    const reverse = resolveAbandonedMineLandmark({
      seed: 7,
      placement: placement(samples),
      samples,
      acceptedCaves: [b, a],
      buildTopology: acceptSite,
    })
    expect(forward?.landmark).toEqual(reverse?.landmark)
  })

  it('does not use quest/discovery/save inputs — only exclusions and terrain', () => {
    const samples = mountainAround(400, 0)
    const result = resolveAbandonedMineLandmark({
      seed: 42,
      placement: placement(samples),
      samples,
      acceptedCaves: [cave({ id: 'cave:ok', x: 400, z: 0 })],
      buildTopology: acceptSite,
      exclusions: {},
    })
    expect(result?.landmark.caveId).toBe('cave:ok')
  })

  it('same seed yields the same mineId, caveId and entrance', () => {
    const samples = mountainAround(380, 20)
    const caves = [cave({ id: 'cave:one', x: 380, z: 20 })]
    const a = resolveAbandonedMineLandmark({
      seed: 11,
      placement: { ...placement(samples), seed: 11 },
      samples,
      acceptedCaves: caves,
      buildTopology: acceptSite,
    })
    const b = resolveAbandonedMineLandmark({
      seed: 11,
      placement: { ...placement(samples), seed: 11 },
      samples,
      acceptedCaves: caves,
      buildTopology: acceptSite,
    })
    expect(a?.landmark).toEqual(b?.landmark)
  })
})

function homeish(landmark: { x: number, z: number }): number {
  return Math.hypot(landmark.x, landmark.z)
}
