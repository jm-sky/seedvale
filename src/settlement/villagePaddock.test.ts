import { describe, expect, it } from 'vitest'
import type { RiverChannelSegment } from '../terrain/chunkHeightmap'
import type { FamilyDef } from './families'
import type { VillageIdentity } from './villagePlan'
import { generateFamilies } from './families'
import {
  horseVendorSetupChance,
  paddockRadiusFor,
  paddockSlotCountForRadius,
  planSettlementPaddock,
  settlementRollsHorseVendor,
  vendorHorseAnimalId,
} from './villagePaddock'
import { PADDOCK_ID, paddockPathId } from './villagePlan'
import { planVillageLayout } from './villagePlanner'

const flatHeight = (): number => 12
const WATER = 0

function identity(partial: Partial<VillageIdentity> & Pick<VillageIdentity, 'size' | 'id'>): VillageIdentity {
  return {
    cell: { gx: 0, gz: 0 },
    isHome: false,
    terrain: 'forest',
    dominantResource: null,
    foodSourceType: 'garden',
    name: 'Testowo',
    nameCulture: 'polish',
    character: 'default',
    ...partial,
  }
}

function layoutFor(
  size: VillageIdentity['size'],
  seed: number,
  families?: readonly FamilyDef[],
  river: readonly RiverChannelSegment[] = [],
) {
  const id = identity({ id: `${size}_${seed}`, size })
  const fams = families ?? generateFamilies(seed, size, false, 'polish')
  return planVillageLayout(id, { x: 0, z: 0, y: 12 }, fams, seed, flatHeight, WATER, river)
}

describe('horse vendor paddock (plan settlements-013)', () => {
  it('SM and OUTPOST never roll a horse-vendor setup', () => {
    expect(horseVendorSetupChance('SM')).toBe(0)
    expect(horseVendorSetupChance('OUTPOST')).toBe(0)
    expect(settlementRollsHorseVendor('SM', 99)).toBe(false)
    expect(layoutFor('SM', 11).paddock).toBeUndefined()
    expect(layoutFor('OUTPOST', 11).paddock).toBeUndefined()
  })

  it('uses settlement-level chances MD < LG < XL', () => {
    expect(horseVendorSetupChance('MD')).toBeCloseTo(0.1)
    expect(horseVendorSetupChance('LG')).toBeCloseTo(0.5)
    expect(horseVendorSetupChance('XL')).toBeCloseTo(0.8)
  })

  it('is deterministic for the same seed', () => {
    expect(settlementRollsHorseVendor('LG', 42)).toBe(settlementRollsHorseVendor('LG', 42))
    const a = layoutFor('XL', 3)
    const b = layoutFor('XL', 3)
    expect(a.paddock).toEqual(b.paddock)
  })

  it('places a fenced paddock with an explicit entrance, trough, haystack and capacity slots', () => {
    let found: ReturnType<typeof layoutFor> | null = null
    for (let seed = 0; seed < 80; seed++) {
      const layout = layoutFor('XL', seed)
      if (layout.paddock) {
        found = layout
        break
      }
    }
    expect(found?.paddock).toBeDefined()
    const paddock = found!.paddock!
    expect(paddock.id).toBe(PADDOCK_ID)
    expect(paddock.fenceSegments.length).toBeGreaterThanOrEqual(6)
    expect(paddock.entranceWidth).toBeGreaterThan(2)
    expect(paddock.horseSlots.length).toBe(paddockSlotCountForRadius(paddock.radius))
    expect(paddock.horseSlots.length).toBeGreaterThanOrEqual(2)
    expect(Math.hypot(paddock.trough.x - paddock.haystack.x, paddock.trough.z - paddock.haystack.z)).toBeGreaterThan(2)
    expect(found!.paths.some((path) => path.id === paddockPathId())).toBe(true)
    for (const slot of paddock.horseSlots) {
      expect(Math.hypot(slot.x - paddock.x, slot.z - paddock.z)).toBeLessThan(paddock.radius)
    }
  })

  it('rejects SM even when the planner is asked directly', () => {
    const id = identity({ id: 'sm-direct', size: 'SM' })
    const families = generateFamilies(4, 'SM', false, 'polish')
    expect(planSettlementPaddock({
      identity: id,
      center: { x: 0, z: 0, y: 12 },
      boundary: { kind: 'circle', x: 0, z: 0, radius: 24 },
      plots: [],
      entrances: [],
      seedForCell: 4,
      sampleHeight: flatHeight,
      waterLevel: WATER,
      riverSegments: [],
    })).toBeUndefined()
    expect(paddockRadiusFor('SM')).toBeNull()
    expect(families.length).toBeGreaterThan(0)
  })

  it('derives vendor horse ids from settlement + slot', () => {
    expect(vendorHorseAnimalId('home', 0)).toBe('vendor-horse-home-0')
    expect(vendorHorseAnimalId('v2', 3)).toBe('vendor-horse-v2-3')
  })
})
