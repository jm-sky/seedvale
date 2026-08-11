import { describe, expect, it } from 'vitest'
import type { RegionParams } from '../terrain/chunkHeightmap'
import type { TerrainSamplers } from './settlementTerrain'
import { rollVillageSize } from './families'
import { cellSeed, generateSettlementDef, generateVillagePlan } from './settlementGenerator'

/** Flat dry plateau — site search always succeeds without resource bias. */
const flatHeight = (): number => 12
const samplers: TerrainSamplers = {
  sampleContinentalness: () => 0.55,
  sampleMountainRidge: () => 0.05,
  sampleMoistureRegion: () => 0.45,
}

/** Minimal region stub: only fields touched by settlement generation /
 *  terrain classification in these unit tests. */
const region = {
  coastThreshold: 0.45,
  desertThreshold: 0.35,
  desertThresholdWidth: 0.12,
  swampThreshold: 0.72,
  swampThresholdWidth: 0.15,
  village: {
    coreRadius: 9,
    houseRadius: 4.5,
    heightStrength: 0.8,
    tintStrength: 0.75,
    regionalHeightStrengthFlat: 0.3,
    regionalHeightStrengthMountain: 0.15,
  },
  roadNetwork: {
    dockSearchRadius: 140,
  },
} as RegionParams

describe('generateVillagePlan / generateSettlementDef (plan 047 seam)', () => {
  it('is deterministic for the same seed/cell', () => {
    const a = generateVillagePlan({ gx: 1, gz: -2 }, 4242, flatHeight, 0, 56, samplers, 1, region)
    const b = generateVillagePlan({ gx: 1, gz: -2 }, 4242, flatHeight, 0, 56, samplers, 1, region)
    expect(a).toEqual(b)
  })

  it('SettlementDef projects identity/site from the same plan without a second roll', () => {
    const plan = generateVillagePlan({ gx: 0, gz: 0 }, 99, flatHeight, 0, 56, samplers, 1, region)
    const def = generateSettlementDef({ gx: 0, gz: 0 }, 99, flatHeight, 0, 56, samplers, 1, region)
    expect(def.plan).toEqual(plan)
    expect(def.id).toBe(plan.identity.id)
    expect(def.size).toBe(plan.identity.size)
    expect(def.x).toBe(plan.site.x)
    expect(def.z).toBe(plan.site.z)
    expect(def.y).toBe(plan.site.y)
    expect(def.name).toBe(plan.identity.name)
    expect(def.foodSourceType).toBe(plan.identity.foodSourceType)
    expect(def.isHome).toBe(true)
  })

  it('home settlement keeps reserved families and a filled boundary/center', () => {
    const def = generateSettlementDef({ gx: 0, gz: 0 }, 7, flatHeight, 0, 56, samplers, 1, region)
    const names = def.families.flatMap((f) => f.members.map((m) => m.name))
    expect(names).toContain('Anna')
    expect(names).toContain('Piotr')
    expect(def.plan.boundary.kind).toBe('circle')
    expect(def.plan.boundary.radius).toBeGreaterThan(0)
    expect(def.plan.center.x).toBe(def.plan.site.x)
    expect(def.plan.center.z).toBe(def.plan.site.z)
    expect(def.plan.site.radius).toBe(def.plan.boundary.radius)
  })

  it('XL footprint radius is larger than LG when those sizes appear', () => {
    const seeds = Array.from({ length: 400 }, (_, i) => i + 1)
    const plans = seeds.map((seed) =>
      generateVillagePlan({ gx: 2, gz: 3 }, seed, flatHeight, 0, 56, samplers, 1, region),
    )
    const lg = plans.find((p) => p.identity.size === 'LG')
    const xl = plans.find((p) => p.identity.size === 'XL')
    expect(lg).toBeDefined()
    expect(xl).toBeDefined()
    expect(xl!.site.radius).toBeGreaterThan(lg!.site.radius)
  })

  it('locks provisional size from cell-center terrain (no second roll after site)', () => {
    // Flat forest-ish center → rollVillageSize(forest, seed) must equal plan size
    // for non-outpost cells. Site may jitter, but size must not be re-rolled.
    for (const seed of [3, 17, 88, 201, 404]) {
      const cell = { gx: 1, gz: 1 }
      const plan = generateVillagePlan(cell, seed, flatHeight, 0, 56, samplers, 1, region)
      expect(plan.identity.size).not.toBe('OUTPOST')
      expect(plan.identity.size).toBe(rollVillageSize('forest', cellSeed(seed, cell)))
    }
  })

  it('fills zones and 1:1 house plots on the authoritative plan', () => {
    const def = generateSettlementDef({ gx: 0, gz: 0 }, 7, flatHeight, 0, 56, samplers, 1, region)
    expect(def.plan.zones.length).toBeGreaterThanOrEqual(2)
    expect(def.plan.zones.some((z) => z.kind === 'public')).toBe(true)
    expect(def.plan.zones.some((z) => z.kind === 'residential')).toBe(true)
    const houses = def.plan.plots.filter((p) => p.role === 'house')
    expect(houses).toHaveLength(def.families.length)
    houses.forEach((h, i) => {
      expect(h.familyId).toBe(def.families[i]!.id)
    })
    const well = def.plan.plots.find((p) => p.id === 'plot-infra-well')
    expect(well?.x).toBe(def.plan.center.x)
    expect(well?.z).toBe(def.plan.center.z)
  })

  it('exposes plan landmarks/buildings aligned with plots (step 8)', () => {
    const def = generateSettlementDef({ gx: 0, gz: 0 }, 7, flatHeight, 0, 56, samplers, 1, region)
    expect(def.plan.landmarks.some((l) => l.kind === 'well')).toBe(true)
    expect(def.plan.landmarks.filter((l) => l.kind === 'home')).toHaveLength(def.families.length)
    expect(def.plan.buildings.filter((b) => b.role === 'residential')).toHaveLength(def.families.length)
    for (const landmark of def.plan.landmarks) {
      const plot = def.plan.plots.find((p) => p.id === landmark.plotId)
      expect(plot).toBeDefined()
      expect(landmark.x).toBe(plot!.x)
      expect(landmark.z).toBe(plot!.z)
    }
  })

  it('includes deterministic entrances and local paths on the plan (step 9)', () => {
    const a = generateVillagePlan({ gx: 0, gz: 0 }, 7, flatHeight, 0, 56, samplers, 1, region)
    const b = generateVillagePlan({ gx: 0, gz: 0 }, 7, flatHeight, 0, 56, samplers, 1, region)
    expect(a.entrances).toEqual(b.entrances)
    expect(a.paths).toEqual(b.paths)
    expect(a.entrances.length).toBeGreaterThanOrEqual(1)
    expect(a.paths.some((p) => p.id.startsWith('path-entrance-'))).toBe(true)
  })
})
