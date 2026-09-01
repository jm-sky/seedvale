import { describe, expect, it } from 'vitest'
import {
  computeMaterialRecovery,
  type MaterialRecoveryPolicy,
} from '../items/constructionMaterials'
import {
  nearestPalisadeConnection,
  PALISADE_LENGTH,
  PALISADE_MATERIAL_REQUIREMENTS,
  PALISADE_RECOVERY_RATE,
  palisadeEndpoints,
  type PalisadeSegmentRecord,
  resolvePalisadeSite,
} from './palisade'

describe('palisadeEndpoints', () => {
  it('places back/front symmetrically along the segment yaw', () => {
    const { back, front } = palisadeEndpoints({ x: 0, z: 0, yaw: 0 })
    expect(back.x).toBeCloseTo(0)
    expect(back.z).toBeCloseTo(-PALISADE_LENGTH / 2)
    expect(front.x).toBeCloseTo(0)
    expect(front.z).toBeCloseTo(PALISADE_LENGTH / 2)
  })

  it('rotates endpoints with yaw (90°)', () => {
    const { back, front } = palisadeEndpoints({ x: 5, z: 5, yaw: Math.PI / 2 })
    expect(front.x).toBeCloseTo(5 + PALISADE_LENGTH / 2)
    expect(front.z).toBeCloseTo(5)
    expect(back.x).toBeCloseTo(5 - PALISADE_LENGTH / 2)
    expect(back.z).toBeCloseTo(5)
  })
})

describe('nearestPalisadeConnection', () => {
  const segments: PalisadeSegmentRecord[] = [
    { id: 'a', x: 0, z: 0, yaw: 0 },
    { id: 'b', x: 0, z: 10, yaw: 0 },
  ]

  it('finds the nearest endpoint within radius', () => {
    const front = palisadeEndpoints(segments[0]!).front
    const connection = nearestPalisadeConnection({ x: front.x + 0.1, z: front.z + 0.1 }, segments, 1.5)
    expect(connection).toEqual(front)
  })

  it('returns null when nothing is within radius', () => {
    expect(nearestPalisadeConnection({ x: 100, z: 100 }, segments, 1.5)).toBeNull()
  })

  it('breaks ties deterministically by segment id then endpoint (back before front)', () => {
    // Two segments placed so one endpoint of each coincides exactly.
    const tied: PalisadeSegmentRecord[] = [
      { id: 'z', x: 0, z: PALISADE_LENGTH / 2, yaw: 0 }, // back at (0,0)
      { id: 'a', x: 0, z: -PALISADE_LENGTH / 2, yaw: 0 }, // front at (0,0)
    ]
    const connection = nearestPalisadeConnection({ x: 0, z: 0 }, tied, 1.5)
    // Both endpoints are exactly at (0,0) — tie-break picks the lower segment
    // id ('a'), independent of array order.
    expect(connection).toEqual({ x: 0, z: 0 })
  })
})

describe('resolvePalisadeSite', () => {
  const existing: PalisadeSegmentRecord[] = [{ id: 'a', x: 0, z: 0, yaw: 0 }]

  it('snaps a straight continuation onto the nearest endpoint', () => {
    const front = palisadeEndpoints(existing[0]!).front
    const site = resolvePalisadeSite({ x: front.x + 0.2, z: front.z + 0.2, yaw: 0 }, existing, 1.5)
    expect(site.x).toBeCloseTo(0)
    expect(site.z).toBeCloseTo(PALISADE_LENGTH)
    expect(site.yaw).toBe(0)
  })

  it('forms a corner when the aim yaw differs from the neighbour', () => {
    const front = palisadeEndpoints(existing[0]!).front
    const cornerYaw = Math.PI / 2
    const site = resolvePalisadeSite({ x: front.x + 0.2, z: front.z + 0.2, yaw: cornerYaw }, existing, 1.5)
    // New segment's own back endpoint must land exactly on the connection point.
    const newBack = palisadeEndpoints({ x: site.x, z: site.z, yaw: site.yaw }).back
    expect(newBack.x).toBeCloseTo(front.x)
    expect(newBack.z).toBeCloseTo(front.z)
  })

  it('leaves the aim unchanged when no endpoint is in range', () => {
    const aim = { x: 50, z: 50, yaw: 1.2 }
    expect(resolvePalisadeSite(aim, existing, 1.5)).toEqual(aim)
  })
})

describe('computeMaterialRecovery (palisade recipe)', () => {
  it('floors and never exceeds the original cost', () => {
    const policy: MaterialRecoveryPolicy = { requirements: PALISADE_MATERIAL_REQUIREMENTS, recoveryRate: PALISADE_RECOVERY_RATE }
    const recovered = computeMaterialRecovery(policy)
    expect(recovered).toEqual([{ kind: 'beam', count: 1 }])
    for (const r of recovered) {
      const original = PALISADE_MATERIAL_REQUIREMENTS.find((req) => req.kind === r.kind)!
      expect(r.count).toBeLessThanOrEqual(original.count)
    }
  })

  it('is deterministic (no randomness) across repeated calls', () => {
    const policy: MaterialRecoveryPolicy = { requirements: PALISADE_MATERIAL_REQUIREMENTS, recoveryRate: PALISADE_RECOVERY_RATE }
    const first = computeMaterialRecovery(policy)
    const second = computeMaterialRecovery(policy)
    expect(first).toEqual(second)
  })

  it('omits materials that round down to zero', () => {
    const policy: MaterialRecoveryPolicy = { requirements: [{ kind: 'beam', count: 1 }], recoveryRate: 0.3 }
    expect(computeMaterialRecovery(policy)).toEqual([])
  })
})
