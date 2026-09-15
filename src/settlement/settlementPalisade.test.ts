import { describe, expect, it } from 'vitest'
import type { ObbCollider } from '../world/collision'
import type { SettlementSite } from './findSettlementSite'
import { colliderContainsPoint } from '../world/collision'
import {
  PALISADE_GATE_HALF_ANGLE,
  PALISADE_WALL_HALF_DEPTH,
  resolveEntrancePalisadePlacements,
  settlementPalisadeColliders,
  type SettlementPalisadePlacement,
  WALL_HALF_LENGTH,
} from './settlementPalisade'

const flatSampleHeight = (): number => 10
const waterLevel = 0
const site: SettlementSite = { x: 0, z: 0, y: 10 }

function placement(overrides: Partial<SettlementPalisadePlacement> = {}): SettlementPalisadePlacement {
  return { speciesIndex: 0, x: 5, z: 0, groundY: 10, rotationY: 0, scale: 1, ...overrides }
}

describe('settlementPalisadeColliders', () => {
  it('projects one obb collider per finished placement', () => {
    const colliders = settlementPalisadeColliders([placement()])
    expect(colliders).toHaveLength(1)
    expect(colliders[0]).toEqual({
      type: 'obb',
      x: 5,
      z: 0,
      halfWidth: WALL_HALF_LENGTH,
      halfDepth: PALISADE_WALL_HALF_DEPTH,
      rotationY: 0,
    })
  })

  it('copies x/z/rotationY straight from the source placement', () => {
    const [collider] = settlementPalisadeColliders([
      placement({ x: 12.5, z: -7.25, rotationY: 1.234 }),
    ])
    expect(collider!.x).toBe(12.5)
    expect(collider!.z).toBe(-7.25)
    expect((collider as ObbCollider).rotationY).toBe(1.234)
  })

  it('produces exactly as many colliders as placements', () => {
    const placements = [placement({ x: 1 }), placement({ x: 2 }), placement({ x: 3 })]
    expect(settlementPalisadeColliders(placements)).toHaveLength(3)
  })

  it('returns nothing for an empty placement list', () => {
    expect(settlementPalisadeColliders([])).toEqual([])
  })

  it('orients the long axis (WALL_HALF_LENGTH) along the placement tangent, not the depth axis', () => {
    // Unrotated: local +x is the long axis, so a point offset along world x
    // (within WALL_HALF_LENGTH) is blocked, while the same offset along
    // world z (only PALISADE_WALL_HALF_DEPTH thick) is not.
    const [unrotated] = settlementPalisadeColliders([placement({ x: 0, z: 0, rotationY: 0 })])
    expect(colliderContainsPoint(unrotated!, WALL_HALF_LENGTH - 0.1, 0)).toBe(true)
    expect(colliderContainsPoint(unrotated!, 0, PALISADE_WALL_HALF_DEPTH + 0.5)).toBe(false)

    // Rotated 90°: the long axis now runs along world z instead.
    const [rotated] = settlementPalisadeColliders([
      placement({ x: 0, z: 0, rotationY: Math.PI / 2 }),
    ])
    expect(colliderContainsPoint(rotated!, 0, WALL_HALF_LENGTH - 0.1)).toBe(true)
    expect(colliderContainsPoint(rotated!, PALISADE_WALL_HALF_DEPTH + 0.5, 0)).toBe(false)
  })

  it('is a pure function of its input (same input, same output)', () => {
    const placements = [placement({ x: 3, z: 4, rotationY: 0.7 })]
    expect(settlementPalisadeColliders(placements)).toEqual(settlementPalisadeColliders(placements))
  })
})

describe('resolveEntrancePalisadePlacements', () => {
  it('places segments symmetric about the gate and skips the gate gap itself', () => {
    const placements = resolveEntrancePalisadePlacements(
      site, 'OUTPOST', flatSampleHeight, waterLevel, undefined,
    )
    expect(placements.length).toBeGreaterThan(0)
    for (const p of placements) {
      const ang = Math.atan2(p.z - site.z, p.x - site.x)
      // No segment sits inside the gate's own gap around the entrance ray.
      expect(Math.abs(ang)).toBeGreaterThan(PALISADE_GATE_HALF_ANGLE)
    }
  })

  it('rejects a candidate segment that falls in a road corridor without dropping the rest', () => {
    const baseline = resolveEntrancePalisadePlacements(
      site, 'OUTPOST', flatSampleHeight, waterLevel, undefined,
    )
    expect(baseline.length).toBeGreaterThan(1)
    const target = baseline[0]!
    const corridors = [{
      ax: target.x, az: target.z, ah: 10, bx: target.x, bz: target.z, bh: 10,
      halfWidth: 3, heightStrength: 0, tintStrength: 0,
    }]
    const filtered = resolveEntrancePalisadePlacements(
      site, 'OUTPOST', flatSampleHeight, waterLevel, undefined, undefined, corridors,
    )
    expect(filtered.length).toBe(baseline.length - 1)
    expect(filtered.some((p) => p.x === target.x && p.z === target.z)).toBe(false)
  })

  it('rejects an individual coastal candidate without walling off the whole village', () => {
    const baseline = resolveEntrancePalisadePlacements(
      site, 'OUTPOST', flatSampleHeight, waterLevel, undefined,
    )
    const target = baseline[0]!
    const coast = {
      sampleHeight: (x: number, z: number) => (x === target.x && z === target.z ? -100 : 10),
      waterLevel,
    }
    const filtered = resolveEntrancePalisadePlacements(
      site, 'OUTPOST', flatSampleHeight, waterLevel, undefined, coast,
    )
    expect(filtered.length).toBe(baseline.length - 1)
    expect(filtered.some((p) => p.x === target.x && p.z === target.z)).toBe(false)
  })

  it('skips the whole palisade when the gate itself sits on the coast', () => {
    const coast = { sampleHeight: () => -100, waterLevel }
    const placements = resolveEntrancePalisadePlacements(
      site, 'OUTPOST', flatSampleHeight, waterLevel, undefined, coast,
    )
    expect(placements).toEqual([])
  })

  it('is deterministic for identical inputs', () => {
    const a = resolveEntrancePalisadePlacements(site, 'MD', flatSampleHeight, waterLevel, undefined)
    const b = resolveEntrancePalisadePlacements(site, 'MD', flatSampleHeight, waterLevel, undefined)
    expect(a).toEqual(b)
  })
})
