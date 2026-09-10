import { describe, expect, it } from 'vitest'
import type { VillageBuildingPlan, VillagePlan } from './villagePlan'
import { placeRatNest } from './ratNestPlacement'

function building(partial: Pick<VillageBuildingPlan, 'id' | 'role' | 'x' | 'z' | 'footprint' | 'rotation'>): VillageBuildingPlan {
  return {
    y: 0,
    plotId: null,
    zoneId: null,
    familyIndex: null,
    familyId: null,
    ...partial,
  }
}

function planWith(buildings: VillageBuildingPlan[]): VillagePlan {
  return {
    identity: {
      id: 'home',
      cell: { gx: 0, gz: 0 },
      isHome: true,
      size: 'MD',
      terrain: 'forest',
      dominantResource: null,
      foodSourceType: 'garden',
      name: 'Test',
      nameCulture: 'polish',
    },
    site: { x: 0, z: 0, y: 0, radius: 20 },
    boundary: { kind: 'circle', x: 0, z: 0, radius: 20 },
    center: { x: 0, z: 0, y: 0 },
    pattern: 'central',
    zones: [],
    plots: [],
    buildings,
    landmarks: [],
    paths: [],
    entrances: [],
  }
}

describe('placeRatNest (plan quests-progression-013 §7)', () => {
  const houses = [
    building({ id: 'building-house-0', role: 'residential', x: 8, z: 0, footprint: 3, rotation: 0 }),
    building({ id: 'building-house-1', role: 'residential', x: -8, z: 0, footprint: 3, rotation: Math.PI }),
  ]

  it('picks the same residential building and offset for the same seed/id', () => {
    const plan = planWith(houses)
    const a = placeRatNest({
      settlementId: 'home',
      settlementSeed: 99,
      plan,
      sampleHeight: () => 4,
      waterLevel: 0,
    })
    const b = placeRatNest({
      settlementId: 'home',
      settlementSeed: 99,
      plan,
      sampleHeight: () => 4,
      waterLevel: 0,
    })
    expect(a).not.toBeNull()
    expect(a).toEqual(b)
    expect(houses.some((house) => house.id === a!.buildingId)).toBe(true)
  })

  it('places the nest behind the chosen house, outside its footprint', () => {
    const plan = planWith(houses)
    const nest = placeRatNest({
      settlementId: 'home',
      settlementSeed: 7,
      plan,
      sampleHeight: () => 2,
      waterLevel: 0,
    })
    expect(nest).not.toBeNull()
    const house = houses.find((candidate) => candidate.id === nest!.buildingId)!
    expect(Math.hypot(nest!.x - house.x, nest!.z - house.z)).toBeGreaterThan(house.footprint)
  })

  it('falls back deterministically when the first site is underwater', () => {
    const plan = planWith(houses)
    const flooded = placeRatNest({
      settlementId: 'home',
      settlementSeed: 3,
      plan,
      sampleHeight: (x) => (x > 0 ? -1 : 3),
      waterLevel: 0,
    })
    expect(flooded).not.toBeNull()
    expect(flooded!.x).toBeLessThanOrEqual(0)
  })

  it('returns null when there are no residential buildings', () => {
    expect(placeRatNest({
      settlementId: 'home',
      settlementSeed: 1,
      plan: planWith([building({ id: 'building-well', role: 'public', x: 0, z: 0, footprint: 1, rotation: 0 })]),
      sampleHeight: () => 1,
      waterLevel: 0,
    })).toBeNull()
  })
})
