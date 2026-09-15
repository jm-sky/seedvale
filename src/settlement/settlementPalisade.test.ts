import { describe, expect, it } from 'vitest'
import type { ObbCollider } from '../world/collision'
import type { SettlementSite } from './findSettlementSite'
import type { VillageEntrance, VillagePlan } from './villagePlan'
import { colliderContainsPoint } from '../world/collision'
import {
  PALISADE_GATE_HALF_ANGLE,
  PALISADE_WALL_HALF_DEPTH,
  resolveEntrancePalisadePlacements,
  resolveEntranceTorchPlacements,
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

function entrance(overrides: Partial<VillageEntrance> & Pick<VillageEntrance, 'id' | 'kind'>): VillageEntrance {
  const angle = overrides.angle ?? 0
  const radius = 20
  return {
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
    y: 10,
    angle,
    ...overrides,
  }
}

function planWith(
  character: VillagePlan['identity']['character'],
  entrances: readonly VillageEntrance[],
): VillagePlan {
  return {
    identity: {
      id: '1_0',
      cell: { gx: 1, gz: 0 },
      isHome: false,
      size: 'MD',
      terrain: 'forest',
      dominantResource: null,
      foodSourceType: 'garden',
      name: 'Testowo',
      nameCulture: 'polish',
      character,
    },
    site: { x: 0, z: 0, y: 10, radius: 22 },
    boundary: { kind: 'circle', x: 0, z: 0, radius: 22 },
    center: { x: 0, z: 0, y: 10 },
    plaza: { x: 0, z: 0, radius: 9 },
    pattern: 'central',
    zones: [],
    plots: [],
    buildings: [],
    landmarks: [],
    paths: [],
    entrances,
  }
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

describe('closed palisade / entrance torches (plan settlements-010)', () => {
  const roadA = entrance({ id: 'entrance-0', kind: 'road', angle: 0 })
  const roadB = entrance({ id: 'entrance-1', kind: 'road', angle: Math.PI })
  const path = entrance({ id: 'entrance-2', kind: 'path', angle: Math.PI / 2 })
  const inlandCoast = { sampleHeight: flatSampleHeight, waterLevel }

  it('gives closed settlements higher perimeter coverage than the matching default village', () => {
    const defaultPlan = planWith('default', [roadA, roadB])
    const closedPlan = planWith('closed', [roadA, roadB])
    const baseline = resolveEntrancePalisadePlacements(
      site, 'MD', flatSampleHeight, waterLevel, defaultPlan,
    )
    const closed = resolveEntrancePalisadePlacements(
      site, 'MD', flatSampleHeight, waterLevel, closedPlan,
    )
    expect(closed.length).toBeGreaterThan(baseline.length)
  })

  it('leaves a gate gap at every inland road and path entrance', () => {
    const closedPlan = planWith('closed', [roadA, roadB, path])
    const placements = resolveEntrancePalisadePlacements(
      site, 'MD', flatSampleHeight, waterLevel, closedPlan,
    )
    expect(placements.length).toBeGreaterThan(0)
    for (const gate of [roadA, roadB, path]) {
      const outward = Math.atan2(gate.z - site.z, gate.x - site.x)
      for (const p of placements) {
        const ang = Math.atan2(p.z - site.z, p.x - site.x)
        let delta = Math.abs(ang - outward)
        if (delta > Math.PI) delta = Math.PI * 2 - delta
        expect(delta).toBeGreaterThan(PALISADE_GATE_HALF_ANGLE)
      }
    }
  })

  it('still rejects a corridor that crosses the closed ring', () => {
    const closedPlan = planWith('closed', [roadA])
    const baseline = resolveEntrancePalisadePlacements(
      site, 'MD', flatSampleHeight, waterLevel, closedPlan,
    )
    const target = baseline[0]!
    const corridors = [{
      ax: target.x, az: target.z, ah: 10, bx: target.x, bz: target.z, bh: 10,
      halfWidth: 0.1, heightStrength: 0, tintStrength: 0,
    }]
    const filtered = resolveEntrancePalisadePlacements(
      site, 'MD', flatSampleHeight, waterLevel, closedPlan, undefined, corridors,
    )
    expect(filtered.some((p) => p.x === target.x && p.z === target.z)).toBe(false)
    expect(filtered.length).toBe(baseline.length - 1)
  })

  it('places exactly one torch pair per inland road entrance on a closed village', () => {
    const closedPlan = planWith('closed', [roadA, roadB, path])
    const torches = resolveEntranceTorchPlacements(site, 'MD', closedPlan, inlandCoast)
    expect(torches).toHaveLength(4)
    const slots = torches.map((torch) => torch.slot).sort()
    expect(slots).toEqual(['gate:entrance-1:left', 'gate:entrance-1:right', 'gate:left', 'gate:right'])
  })

  it('keeps a single default gate pair and does not torch path-only extra entrances', () => {
    const defaultPlan = planWith('default', [roadA, roadB, path])
    const torches = resolveEntranceTorchPlacements(site, 'MD', defaultPlan, inlandCoast)
    expect(torches).toHaveLength(2)
    expect(torches.map((torch) => torch.slot).sort()).toEqual(['gate:left', 'gate:right'])
  })

  it('keeps torches outside the angular gate gap', () => {
    const closedPlan = planWith('closed', [roadA, roadB])
    const torches = resolveEntranceTorchPlacements(site, 'MD', closedPlan, inlandCoast)
    expect(torches.length).toBeGreaterThan(0)
    for (const torch of torches) {
      const ang = Math.atan2(torch.z - site.z, torch.x - site.x)
      const nearestGate = [roadA, roadB].reduce((best, gate) => {
        const outward = Math.atan2(gate.z - site.z, gate.x - site.x)
        let delta = Math.abs(ang - outward)
        if (delta > Math.PI) delta = Math.PI * 2 - delta
        return delta < best ? delta : best
      }, Infinity)
      expect(nearestGate).toBeGreaterThan(PALISADE_GATE_HALF_ANGLE)
    }
  })

  it('is deterministic for closed palisade and torch placement', () => {
    const closedPlan = planWith('closed', [roadA, roadB])
    expect(
      resolveEntrancePalisadePlacements(site, 'MD', flatSampleHeight, waterLevel, closedPlan),
    ).toEqual(
      resolveEntrancePalisadePlacements(site, 'MD', flatSampleHeight, waterLevel, closedPlan),
    )
    expect(resolveEntranceTorchPlacements(site, 'MD', closedPlan, inlandCoast)).toEqual(
      resolveEntranceTorchPlacements(site, 'MD', closedPlan, inlandCoast),
    )
  })
})
