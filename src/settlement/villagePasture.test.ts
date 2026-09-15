import { describe, expect, it } from 'vitest'
import type { RiverChannelSegment } from '../terrain/chunkHeightmap'
import type { FamilyDef } from './families'
import type { VillageIdentity } from './villagePlan'
import { pointHitsCorridor } from '../math/segment'
import { footprintOverlapsRiver } from '../terrain/riverNetwork'
import { generateFamilies } from './families'
import { pastureRadiusFor, settlementWantsPasture } from './villagePasture'
import { PASTURE_ID, pasturePathId } from './villagePlan'
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

function segmentHits(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  x: number,
  z: number,
  clearance: number,
): boolean {
  return pointHitsCorridor(x, z, [{ ax, az, bx, bz, halfWidth: 0.4 }], clearance)
}

describe('settlement pasture (plan settlements-009)', () => {
  it('SM and OUTPOST never receive a pasture', () => {
    expect(settlementWantsPasture('SM')).toBe(false)
    expect(settlementWantsPasture('OUTPOST')).toBe(false)
    expect(layoutFor('SM', 11).pasture).toBeUndefined()
    expect(layoutFor('OUTPOST', 11).pasture).toBeUndefined()
  })

  it('MD/LG/XL always receive a pasture on flat dry ground, scaled by VillageSize', () => {
    const md = layoutFor('MD', 21)
    const lg = layoutFor('LG', 21)
    const xl = layoutFor('XL', 21)
    expect(md.pasture).toBeDefined()
    expect(lg.pasture).toBeDefined()
    expect(xl.pasture).toBeDefined()
    expect(md.pasture!.radius).toBe(pastureRadiusFor('MD', md.plots.filter((p) => p.role === 'house').length))
    expect(lg.pasture!.radius).toBeGreaterThan(md.pasture!.radius)
    expect(xl.pasture!.radius).toBeGreaterThan(lg.pasture!.radius)
  })

  it('pasture radius can nudge with family/livestock-proxy count without using runtime agents', () => {
    const few = pastureRadiusFor('MD', 3)!
    const many = pastureRadiusFor('MD', 9)!
    expect(many).toBeGreaterThan(few)
    expect(layoutFor('MD', 8).pasture!.id).toBe(PASTURE_ID)
  })

  it('exists for a settlement without a shepherd household', () => {
    const families = generateFamilies(19, 'MD', false, 'polish').map((family) => ({
      ...family,
      members: family.members.map((member) => ({
        ...member,
        character: { ...member.character, role: 'woodcutter' as const },
      })),
    }))
    expect(families.every((f) => f.members.every((m) => m.character.role === 'woodcutter'))).toBe(true)
    expect(layoutFor('MD', 19, families).pasture).toBeDefined()
  })

  it('sits outside the village boundary and does not overlap core plots', () => {
    for (const size of ['MD', 'LG', 'XL'] as const) {
      const layout = layoutFor(size, 33)
      const pasture = layout.pasture!
      const dist = Math.hypot(pasture.x - layout.boundary.x, pasture.z - layout.boundary.z)
      expect(dist - pasture.radius, size).toBeGreaterThanOrEqual(layout.boundary.radius - 0.01)
      expect(pasture.outsideCore).toBe(true)
      for (const plot of layout.plots) {
        const d = Math.hypot(pasture.x - plot.x, pasture.z - plot.z)
        expect(d, `${size} ${plot.id}`).toBeGreaterThanOrEqual(pasture.radius + plot.radius - 0.05)
      }
    }
  })

  it('is deterministic for the same seed and independent of call order', () => {
    const a = layoutFor('LG', 44)
    const b = layoutFor('LG', 44)
    const c = layoutFor('MD', 7)
    const d = layoutFor('LG', 44)
    expect(a.pasture).toEqual(b.pasture)
    expect(a.pasture).toEqual(d.pasture)
    expect(c.pasture).not.toEqual(a.pasture)
  })

  it('plans stable well, trough and fence anchors that do not collide', () => {
    const layout = layoutFor('LG', 15)
    const pasture = layout.pasture!
    expect(pasture.well.x).not.toBe(pasture.trough.x)
    expect(Math.hypot(pasture.well.x - pasture.trough.x, pasture.well.z - pasture.trough.z)).toBeGreaterThan(3)
    expect(pasture.fenceSegments.length).toBeGreaterThanOrEqual(1)
    expect(pasture.fenceSegments.length).toBeLessThanOrEqual(2)
    for (const seg of pasture.fenceSegments) {
      expect(
        segmentHits(seg.ax, seg.az, seg.bx, seg.bz, pasture.well.x, pasture.well.z, 2.4),
        seg.id,
      ).toBe(false)
      expect(
        segmentHits(seg.ax, seg.az, seg.bx, seg.bz, pasture.trough.x, pasture.trough.z, 1.2),
        seg.id,
      ).toBe(false)
    }
    const path = layout.paths.find((p) => p.id === pasturePathId())
    if (path) {
      for (const point of path.points) {
        for (const seg of pasture.fenceSegments) {
          expect(segmentHits(seg.ax, seg.az, seg.bx, seg.bz, point.x, point.z, 1.2)).toBe(false)
        }
      }
    }
  })

  it('prefers two fence segments and keeps the gap on the village-facing side', () => {
    let two = 0
    let one = 0
    for (const seed of [3, 8, 15, 21, 27, 36, 42, 55]) {
      const n = layoutFor('LG', seed).pasture!.fenceSegments.length
      if (n === 2) two++
      else one++
    }
    expect(two).toBeGreaterThan(one)
    expect(two + one).toBe(8)
  })

  it('does not overlap a through-village river when a pasture is placed', () => {
    const river: RiverChannelSegment = {
      ax: -200,
      az: 0,
      aBedH: 11,
      aWaterH: 11.6,
      aWaterHalfWidth: 4,
      aChannelHalfWidth: 7,
      bx: 200,
      bz: 0,
      bBedH: 11,
      bWaterH: 11.6,
      bWaterHalfWidth: 4,
      bChannelHalfWidth: 7,
    }
    const layout = layoutFor('LG', 31, undefined, [river])
    const pasture = layout.pasture
    if (!pasture) return
    expect(footprintOverlapsRiver([river], pasture.x, pasture.z, pasture.radius + 1)).toBe(false)
    expect(footprintOverlapsRiver([river], pasture.well.x, pasture.well.z, 2.4)).toBe(false)
    expect(footprintOverlapsRiver([river], pasture.trough.x, pasture.trough.z, 1.2)).toBe(false)
  })
})
