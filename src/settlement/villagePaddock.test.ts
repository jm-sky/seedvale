import { describe, expect, it } from 'vitest'
import type { RiverChannelSegment } from '../terrain/chunkHeightmap'
import type { FamilyDef } from './families'
import type { VillageIdentity } from './villagePlan'
import { segmentHitsCorridor } from '../math/segment'
import { generateFamilies } from './families'
import { fencePlacementColliders } from './settlementPalisade'
import {
  horseVendorSetupChance,
  paddockFencePlacements,
  paddockRadiusFor,
  paddockSlotCountForRadius,
  planSettlementPaddock,
  settlementRollsHorseVendor,
  vendorHorseAnimalId,
} from './villagePaddock'
import { PADDOCK_ID, paddockPathId } from './villagePlan'
import { pathPlansToCorridorData, planVillageLayout } from './villagePlanner'

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

describe('paddock fence road clearance (plan settlements-018)', () => {
  function findPaddockLayout(): { layout: ReturnType<typeof layoutFor>, seed: number } {
    for (let seed = 0; seed < 80; seed++) {
      const layout = layoutFor('XL', seed)
      if (layout.paddock) return { layout, seed }
    }
    throw new Error('expected an XL paddock within 80 seeds')
  }

  it('keeps every ring fence segment clear of final local path corridors', () => {
    const { layout } = findPaddockLayout()
    const paddock = layout.paddock!
    const corridors = pathPlansToCorridorData(layout.paths, flatHeight).map((seg) => ({
      ax: seg.ax,
      az: seg.az,
      bx: seg.bx,
      bz: seg.bz,
      halfWidth: seg.halfWidth,
    }))
    for (const seg of paddock.fenceSegments) {
      expect(
        segmentHitsCorridor(seg.ax, seg.az, seg.bx, seg.bz, corridors, 0.3),
        seg.id,
      ).toBe(false)
    }
  })

  it('omits fence segments across the entrance gap', () => {
    const { layout } = findPaddockLayout()
    const paddock = layout.paddock!
    const gapHalf = Math.min(0.42, Math.max(0.28, 2.6 / paddock.radius))
    const inward = Math.atan2(layout.center.z - paddock.z, layout.center.x - paddock.x)
    for (const seg of paddock.fenceSegments) {
      const midX = (seg.ax + seg.bx) * 0.5
      const midZ = (seg.az + seg.bz) * 0.5
      const midAngle = Math.atan2(midZ - paddock.z, midX - paddock.x)
      let d = Math.abs(midAngle - inward) % (Math.PI * 2)
      if (d > Math.PI) d = Math.PI * 2 - d
      expect(d).toBeGreaterThanOrEqual(gapHalf - 1e-6)
    }
  })

  it('projects colliders only for actual fence placements, not the entrance gap', () => {
    const { layout } = findPaddockLayout()
    const paddock = layout.paddock!
    const placements = paddockFencePlacements(paddock, flatHeight)
    const colliders = fencePlacementColliders(placements)
    expect(colliders).toHaveLength(placements.length)
    expect(placements.length).toBeGreaterThan(0)
    // A continuous 12-step ring would be denser; gap omission must leave holes.
    expect(paddock.fenceSegments.length).toBeLessThan(12)
  })

  it('rejects a ring whose segment would cross an injected path corridor', () => {
    const { layout, seed } = findPaddockLayout()
    const paddock = layout.paddock!
    const seg = paddock.fenceSegments[0]!
    const midX = (seg.ax + seg.bx) * 0.5
    const midZ = (seg.az + seg.bz) * 0.5
    const dx = seg.bx - seg.ax
    const dz = seg.bz - seg.az
    const len = Math.hypot(dx, dz) || 1
    const nx = -dz / len
    const nz = dx / len
    const crossing = [{
      ax: midX - nx * 8,
      az: midZ - nz * 8,
      bx: midX + nx * 8,
      bz: midZ + nz * 8,
      halfWidth: 2,
    }]
    const forced = planSettlementPaddock({
      identity: identity({ id: `XL_${seed}`, size: 'XL' }),
      center: layout.center,
      boundary: layout.boundary,
      plots: layout.plots,
      entrances: layout.entrances,
      seedForCell: seed,
      sampleHeight: flatHeight,
      waterLevel: WATER,
      riverSegments: [],
      pasture: layout.pasture,
      pathCorridors: crossing,
    })
    if (!forced) return
    for (const fence of forced.fenceSegments) {
      expect(segmentHitsCorridor(fence.ax, fence.az, fence.bx, fence.bz, crossing, 0.3)).toBe(false)
    }
  })
})
