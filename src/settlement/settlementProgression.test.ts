import { afterEach, describe, expect, it } from 'vitest'
import type { RegionParams } from '../terrain/chunkHeightmap'
import type { SettlementResolveContext } from './settlementPlanCache'
import type { TerrainSamplers } from './settlementTerrain'
import { rollVillageSize } from './families'
import { cellSeed, generateSettlementDef, SETTLEMENT_GRID_STEP } from './settlementGenerator'
import {
  cachedSettlementProgressionPolicy,
  clearSettlementDefCache,
  settlementDefFor,
} from './settlementPlanCache'
import {
  orderProgressionCandidates,
  resolveSettlementProgressionPolicy,
  SETTLEMENT_PROGRESSION_FAR_ORDER_SALT,
  SETTLEMENT_PROGRESSION_FAR_RING,
  SETTLEMENT_PROGRESSION_NEAR_ORDER_SALT,
  SETTLEMENT_PROGRESSION_NEAR_RING,
  settlementProgressionRingCells,
} from './settlementProgression'

const flatHeight = (): number => 12
const samplers: TerrainSamplers = {
  sampleContinentalness: () => 0.55,
  sampleMountainRidge: () => 0.05,
  sampleMoistureRegion: () => 0.45,
}
const mountainSamplers: TerrainSamplers = {
  sampleContinentalness: () => 0.7,
  sampleMountainRidge: () => 0.9,
  sampleMoistureRegion: () => 0.35,
}

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

function ctxFor(
  seed: number,
  extras?: Partial<SettlementResolveContext>,
): SettlementResolveContext {
  return {
    seed,
    sampleHeight: flatHeight,
    waterLevel: 0,
    localSearchRadius: 56,
    terrainSamplers: samplers,
    heightScale: 1,
    region,
    ...extras,
  }
}

function wetAroundCell(cell: { gx: number, gz: number }, dry: (x: number, z: number) => number = flatHeight) {
  const cx = cell.gx * SETTLEMENT_GRID_STEP
  const cz = cell.gz * SETTLEMENT_GRID_STEP
  return (x: number, z: number): number => {
    if (Math.abs(x - cx) < 160 && Math.abs(z - cz) < 160) return -2
    return dry(x, z)
  }
}

afterEach(() => {
  clearSettlementDefCache()
})

describe('settlement progression around home', () => {
  it('resolves identical near/far targets regardless of lookup order', () => {
    const seed = 42
    const ctx = ctxFor(seed)
    const policyA = resolveSettlementProgressionPolicy(ctx)
    expect(policyA).not.toBeNull()

    const farFirst = settlementDefFor(policyA!.far!.cell, ctx)
    const nearFirst = settlementDefFor(policyA!.near!.cell, ctx)
    const home = settlementDefFor({ gx: 0, gz: 0 }, ctx)

    clearSettlementDefCache()
    const homeFirst = settlementDefFor({ gx: 0, gz: 0 }, ctx)
    const nearSecond = settlementDefFor(policyA!.near!.cell, ctx)
    const farSecond = settlementDefFor(policyA!.far!.cell, ctx)
    const policyB = cachedSettlementProgressionPolicy()

    expect(policyB?.near?.cell).toEqual(policyA!.near!.cell)
    expect(policyB?.far?.cell).toEqual(policyA!.far!.cell)
    expect(policyB?.near?.minimum).toBe(policyA!.near!.minimum)
    expect(policyB?.far?.minimum).toBe(policyA!.far!.minimum)
    expect(nearFirst).toEqual(nearSecond)
    expect(farFirst).toEqual(farSecond)
    expect(home).toEqual(homeFirst)
  })

  it('near minimum follows auto home and far minimum is LG', () => {
    const seeds = [7, 19, 88, 201, 404, 1001]
    for (const seed of seeds) {
      clearSettlementDefCache()
      const policy = resolveSettlementProgressionPolicy(ctxFor(seed))
      expect(policy).not.toBeNull()
      expect(policy!.homeSize === 'SM' || policy!.homeSize === 'MD').toBe(true)
      expect(policy!.near).not.toBeNull()
      expect(policy!.far).not.toBeNull()
      expect(policy!.near!.minimum).toBe(policy!.homeSize === 'SM' ? 'MD' : 'LG')
      expect(policy!.far!.minimum).toBe('LG')

      const nearDef = settlementDefFor(policy!.near!.cell, ctxFor(seed))
      const farDef = settlementDefFor(policy!.far!.cell, ctxFor(seed))
      expect(nearDef).not.toBeNull()
      expect(farDef).not.toBeNull()
      expect(nearDef!.size).not.toBe('OUTPOST')
      expect(farDef!.size).not.toBe('OUTPOST')
      const nearRank = ['SM', 'MD', 'LG', 'XL'].indexOf(nearDef!.size)
      const farRank = ['SM', 'MD', 'LG', 'XL'].indexOf(farDef!.size)
      expect(nearRank).toBeGreaterThanOrEqual(['SM', 'MD', 'LG', 'XL'].indexOf(policy!.near!.minimum))
      expect(farRank).toBeGreaterThanOrEqual(['SM', 'MD', 'LG', 'XL'].indexOf('LG'))
    }
  })

  it('explicit homeSize does not rewrite home or apply ring overrides', () => {
    const seed = 88
    const ctx = ctxFor(seed, { homeSize: 'XL' })
    expect(resolveSettlementProgressionPolicy(ctx)).toBeNull()
    const home = settlementDefFor({ gx: 0, gz: 0 }, ctx)
    expect(home?.size).toBe('XL')
    const other = { gx: 2, gz: 1 }
    const fromCache = settlementDefFor(other, ctx)
    const ordinary = generateSettlementDef(
      other, seed, flatHeight, 0, 56, samplers, 1, region, 'XL',
    )
    expect(fromCache).toEqual(ordinary)
  })

  it('skips an unfit first near candidate and takes the next seeded cell', () => {
    const seed = 42
    const ordered = orderProgressionCandidates(
      seed,
      settlementProgressionRingCells(SETTLEMENT_PROGRESSION_NEAR_RING),
      SETTLEMENT_PROGRESSION_NEAR_ORDER_SALT,
    )
    const first = ordered[0]!
    const second = ordered[1]!
    const ctx = ctxFor(seed, { sampleHeight: wetAroundCell(first) })
    const policy = resolveSettlementProgressionPolicy(ctx)
    expect(policy?.near?.cell).toEqual(second)
    expect(policy?.minimumFor(first)).toBeNull()
  })

  it('skips a candidate that would resolve as OUTPOST', () => {
    let found = false
    for (let seed = 1; seed <= 400 && !found; seed++) {
      const ordered = orderProgressionCandidates(
        seed,
        settlementProgressionRingCells(SETTLEMENT_PROGRESSION_NEAR_RING),
        SETTLEMENT_PROGRESSION_NEAR_ORDER_SALT,
      )
      const first = ordered[0]!
      const firstDef = generateSettlementDef(
        first, seed, flatHeight, 0, 56, mountainSamplers, 1, region,
      )
      if (firstDef?.size !== 'OUTPOST') continue
      const mountainCtx = ctxFor(seed, { terrainSamplers: mountainSamplers })
      const policy = resolveSettlementProgressionPolicy(mountainCtx)
      expect(policy?.minimumFor(first)).toBeNull()
      expect(policy?.near?.cell).not.toEqual(first)
      if (policy?.near) {
        const nearDef = generateSettlementDef(
          policy.near.cell,
          seed,
          flatHeight,
          0,
          56,
          mountainSamplers,
          1,
          region,
          'auto',
          undefined,
          policy.near.minimum,
        )
        expect(nearDef?.size).not.toBe('OUTPOST')
      }
      found = true
    }
    expect(found).toBe(true)
  })

  it('leaves ordinary non-target cells on the rollVillageSize path', () => {
    const seed = 19
    const policy = resolveSettlementProgressionPolicy(ctxFor(seed))
    const outsider = { gx: 8, gz: 8 }
    expect(policy?.minimumFor(outsider)).toBeNull()
    const fromCache = settlementDefFor(outsider, ctxFor(seed))
    const ordinary = generateSettlementDef(
      outsider, seed, flatHeight, 0, 56, samplers, 1, region,
    )
    expect(fromCache).not.toBeNull()
    expect(ordinary).not.toBeNull()
    expect(fromCache!.size).toBe(ordinary!.size)
    expect(fromCache!.x).toBe(ordinary!.x)
    expect(fromCache!.z).toBe(ordinary!.z)
    expect(fromCache!.families).toEqual(ordinary!.families)
    expect(ordinary!.size).toBe(rollVillageSize('forest', cellSeed(seed, outsider)))
  })

  it('clears progression-policy memoization with the settlement cache', () => {
    expect(cachedSettlementProgressionPolicy()).toBeUndefined()
    settlementDefFor({ gx: 0, gz: 0 }, ctxFor(11))
    expect(cachedSettlementProgressionPolicy()).toBeTruthy()
    clearSettlementDefCache()
    expect(cachedSettlementProgressionPolicy()).toBeUndefined()
  })

  it('far ring cells sit at Chebyshev 3–5 and near at 1–2', () => {
    const near = settlementProgressionRingCells(SETTLEMENT_PROGRESSION_NEAR_RING)
    const far = settlementProgressionRingCells(SETTLEMENT_PROGRESSION_FAR_RING)
    expect(near.every((c) => {
      const d = Math.max(Math.abs(c.gx), Math.abs(c.gz))
      return d >= 1 && d <= 2
    })).toBe(true)
    expect(far.every((c) => {
      const d = Math.max(Math.abs(c.gx), Math.abs(c.gz))
      return d >= 3 && d <= 5
    })).toBe(true)
    expect(orderProgressionCandidates(1, near, SETTLEMENT_PROGRESSION_NEAR_ORDER_SALT)).toEqual(
      orderProgressionCandidates(1, near, SETTLEMENT_PROGRESSION_NEAR_ORDER_SALT),
    )
    const farOrderA = orderProgressionCandidates(1, far, SETTLEMENT_PROGRESSION_FAR_ORDER_SALT)
    const farOrderB = orderProgressionCandidates(7919, far, SETTLEMENT_PROGRESSION_FAR_ORDER_SALT)
    expect(farOrderA).not.toEqual(farOrderB)
  })
})
