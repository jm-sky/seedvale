import { afterEach, describe, expect, it } from 'vitest'
import type { RegionParams } from '../terrain/chunkHeightmap'
import type { SettlementResolveContext } from './settlementPlanCache'
import type { TerrainSamplers } from './settlementTerrain'
import { generateSettlementName } from '../shared/SettlementName'
import {
  cellSeed,
  cellsWithinRadius,
  probeSettlementSite,
  type SettlementCell,
} from './settlementGenerator'
import {
  compareSettlementNameOrder,
  fallbackSettlementName,
  pickUniqueSettlementName,
  predecessorSettlementCells,
} from './settlementNameUniqueness'
import { clearSettlementDefCache, settlementDefFor } from './settlementPlanCache'
import { resolveSettlementProgressionPolicy } from './settlementProgression'

const flatHeight = (): number => 12
const samplers: TerrainSamplers = {
  sampleContinentalness: () => 0.55,
  sampleMountainRidge: () => 0.05,
  sampleMoistureRegion: () => 0.45,
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

function ctxFor(seed: number): SettlementResolveContext {
  return {
    seed,
    sampleHeight: flatHeight,
    waterLevel: 0,
    localSearchRadius: 56,
    terrainSamplers: samplers,
    heightScale: 1,
    region,
  }
}

function attempt0Name(cell: SettlementCell, ctx: SettlementResolveContext): string | null {
  const minimumSize = resolveSettlementProgressionPolicy(ctx)?.minimumFor(cell) ?? undefined
  const probe = probeSettlementSite(
    cell,
    ctx.seed,
    ctx.sampleHeight,
    ctx.waterLevel,
    ctx.localSearchRadius,
    ctx.terrainSamplers,
    ctx.heightScale,
    ctx.region,
    ctx.homeSize ?? 'auto',
    undefined,
    minimumSize,
  )
  if (!probe.site || probe.terrain === undefined) return null
  return generateSettlementName(cellSeed(ctx.seed, cell), probe.terrain, probe.dominantResource ?? null, 0)
}

function nameMap(cells: readonly SettlementCell[], ctx: SettlementResolveContext): Map<string, string> {
  const names = new Map<string, string>()
  for (const cell of cells) {
    const def = settlementDefFor(cell, ctx)
    if (def) names.set(def.id, def.name)
  }
  return names
}

afterEach(() => {
  clearSettlementDefCache()
})

describe('generateSettlementName attempt salt', () => {
  it('applies resource flavor deterministically on attempt 0', () => {
    const resource = { type: 'iron' as const, richness: 1 }
    const named = generateSettlementName(99, 'mountain', resource, 0)
    expect(named).toBe(generateSettlementName(99, 'mountain', resource))
  })
})

describe('pickUniqueSettlementName', () => {
  it('returns attempt 0 when the name is free', () => {
    expect(
      pickUniqueSettlementName({
        takenNames: new Set(),
        candidate: (attempt) => (attempt === 0 ? 'Lipowo' : 'Zalesie'),
        fallback: 'Lipowo 1:0',
      }),
    ).toBe('Lipowo')
  })

  it('retries then falls back when the candidate pool is exhausted', () => {
    expect(
      pickUniqueSettlementName({
        takenNames: new Set(['Lipowo']),
        candidate: () => 'Lipowo',
        fallback: 'Lipowo 1:0',
        maxAttempts: 3,
      }),
    ).toBe('Lipowo 1:0')
  })

  it('disambiguates a taken fallback', () => {
    expect(
      pickUniqueSettlementName({
        takenNames: new Set(['Lipowo', 'Lipowo 1:0']),
        candidate: () => 'Lipowo',
        fallback: 'Lipowo 1:0',
        maxAttempts: 2,
      }),
    ).toBe('Lipowo 1:0~2')
  })
})

describe('predecessorSettlementCells', () => {
  it('is the finite disk before the cell in name order', () => {
    const preds = predecessorSettlementCells({ gx: 1, gz: 0 })
    expect(preds.some((cell) => cell.gx === 0 && cell.gz === 0)).toBe(true)
    expect(preds.every((cell) => !(cell.gx === 1 && cell.gz === 0))).toBe(true)
  })
})

describe('settlementDefFor unique names (plan settlements-017)', () => {
  const sampleRadius = 4
  const seed = 7

  it('keeps attempt 0 when no predecessor claimed that name', () => {
    const ctx = ctxFor(seed)
    const home = settlementDefFor({ gx: 0, gz: 0 }, ctx)
    expect(home).not.toBeNull()
    expect(home!.name).toBe(attempt0Name({ gx: 0, gz: 0 }, ctx))
    expect(home!.name).toBe(home!.plan.identity.name)
  })

  it('gives colliding attempt-0 cells different final names; earlier cell keeps attempt 0', () => {
    const ctx = ctxFor(seed)
    const cells = cellsWithinRadius({ gx: 0, gz: 0 }, sampleRadius)
    const byAttempt0 = new Map<string, SettlementCell[]>()
    for (const cell of cells) {
      const name = attempt0Name(cell, ctx)
      if (!name) continue
      const list = byAttempt0.get(name) ?? []
      list.push(cell)
      byAttempt0.set(name, list)
    }
    const collision = [...byAttempt0.values()].find((group) => group.length >= 2)
    expect(collision, 'expected a duplicate attempt-0 name in the sample').toBeTruthy()
    const [first, second] = [...collision!].sort(compareSettlementNameOrder)
    const firstDef = settlementDefFor(first, ctx)
    const secondDef = settlementDefFor(second, ctx)
    expect(firstDef).not.toBeNull()
    expect(secondDef).not.toBeNull()
    expect(secondDef!.name).not.toBe(firstDef!.name)
    expect(firstDef!.name).toBe(firstDef!.plan.identity.name)
  })

  it('is deterministic across cache clears', () => {
    const cells = cellsWithinRadius({ gx: 0, gz: 0 }, sampleRadius)
    const first = nameMap(cells, ctxFor(seed))
    clearSettlementDefCache()
    const second = nameMap(cells, ctxFor(seed))
    expect([...second.entries()]).toEqual([...first.entries()])
  })

  it('does not change names when lookup order is reversed', () => {
    const cells = cellsWithinRadius({ gx: 0, gz: 0 }, sampleRadius)
    const forward = nameMap(cells, ctxFor(seed))
    clearSettlementDefCache()
    const reversed = nameMap([...cells].reverse(), ctxFor(seed))
    expect(reversed).toEqual(forward)
  })

  it('has no duplicate names in a bounded sample', () => {
    const names = [...nameMap(cellsWithinRadius({ gx: 0, gz: 0 }, 5), ctxFor(seed)).values()]
    expect(new Set(names).size).toBe(names.length)
  })

  it('fallbackSettlementName is unique per cell', () => {
    expect(fallbackSettlementName('Lipowo', { gx: 1, gz: -2 })).toBe('Lipowo 1:-2')
    expect(fallbackSettlementName('Lipowo', { gx: 2, gz: -2 })).not.toBe(
      fallbackSettlementName('Lipowo', { gx: 1, gz: -2 }),
    )
  })
})
