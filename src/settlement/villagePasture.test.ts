import { describe, expect, it } from 'vitest'
import type { RiverChannelSegment } from '../terrain/chunkHeightmap'
import type { FamilyDef } from './families'
import type { VillageIdentity, VillagePasturePlan } from './villagePlan'
import { directionFromYaw, pointHitsCorridor, segmentHitsCorridor, yawToward } from '../math/segment'
import { footprintOverlapsRiver } from '../terrain/riverNetwork'
import { generateFamilies } from './families'
import {
  pastureFencePlacements,
  pastureRadiusFor,
  planSettlementPasture,
  settlementWantsPasture,
} from './villagePasture'
import { PASTURE_ID, pasturePathId } from './villagePlan'
import { pathPlansToCorridorData, planVillageLayout } from './villagePlanner'
import { fencePlacementColliders } from './settlementPalisade'

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

describe('pasture fence road clearance (plan settlements-018)', () => {
  it('keeps every fence segment clear of final local path corridors', () => {
    for (const seed of [3, 8, 15, 21, 27, 36, 42, 55]) {
      const layout = layoutFor('LG', seed)
      const pasture = layout.pasture
      if (!pasture) continue
      const corridors = pathPlansToCorridorData(layout.paths, flatHeight).map((seg) => ({
        ax: seg.ax,
        az: seg.az,
        bx: seg.bx,
        bz: seg.bz,
        halfWidth: seg.halfWidth,
      }))
      for (const seg of pasture.fenceSegments) {
        expect(
          segmentHitsCorridor(seg.ax, seg.az, seg.bx, seg.bz, corridors, 0.3),
          `seed ${seed} ${seg.id}`,
        ).toBe(false)
      }
    }
  })

  it('rejects a candidate whose fence would cross an injected path corridor', () => {
    const baseline = layoutFor('LG', 15)
    expect(baseline.pasture).toBeDefined()
    const pasture = baseline.pasture!
    const seg = pasture.fenceSegments[0]!
    const midX = (seg.ax + seg.bx) * 0.5
    const midZ = (seg.az + seg.bz) * 0.5
    const dx = seg.bx - seg.ax
    const dz = seg.bz - seg.az
    const len = Math.hypot(dx, dz) || 1
    // Perpendicular corridor through the fence midpoint — forces segmentHits.
    const nx = -dz / len
    const nz = dx / len
    const crossing = [{
      ax: midX - nx * 8,
      az: midZ - nz * 8,
      bx: midX + nx * 8,
      bz: midZ + nz * 8,
      halfWidth: 2,
    }]
    const families = generateFamilies(15, 'LG', false, 'polish')
    const forced = planSettlementPasture({
      identity: identity({ id: 'LG_15', size: 'LG' }),
      center: baseline.center,
      boundary: baseline.boundary,
      plots: baseline.plots,
      families,
      entrances: baseline.entrances,
      seedForCell: 15,
      sampleHeight: flatHeight,
      waterLevel: WATER,
      riverSegments: [],
      pathCorridors: crossing,
    })
    if (!forced) return
    for (const fence of forced.fenceSegments) {
      expect(segmentHitsCorridor(fence.ax, fence.az, fence.bx, fence.bz, crossing, 0.3)).toBe(false)
    }
  })

  it('projects one collider per pasture fence placement', () => {
    const pasture = pastureWithSegment(0, 0, 10, 0)
    const placements = pastureFencePlacements(pasture, () => 12)
    const colliders = fencePlacementColliders(placements)
    expect(colliders).toHaveLength(placements.length)
    expect(colliders.length).toBeGreaterThan(0)
  })
})

function pastureWithSegment(
  ax: number,
  az: number,
  bx: number,
  bz: number,
): VillagePasturePlan {
  const origin = { x: 0, z: 0, y: 12 }
  return {
    id: PASTURE_ID,
    outsideCore: true,
    x: 0,
    z: 0,
    y: 12,
    radius: 11,
    well: origin,
    trough: origin,
    connection: origin,
    fenceSegments: [{ id: 'pasture-fence-a', ax, az, bx, bz }],
  }
}

/** `wall.glb` long axis is local +X — the same contract as settlement palisade. */
function expectFenceYawAlong(dx: number, dz: number, rotationY: number): void {
  const len = Math.hypot(dx, dz)
  expect(rotationY).toBeCloseTo(yawToward(dx, dz), 6)
  const dir = directionFromYaw(rotationY)
  expect(dir.x).toBeCloseTo(dx / len, 6)
  expect(dir.z).toBeCloseTo(dz / len, 6)
  // Guard the 90° comb regression: character-facing `atan2(dx, dz)` is
  // exactly a quarter-turn off the local-+X convention.
  const quarterTurn = Math.abs(
    Math.atan2(Math.sin(rotationY - Math.atan2(dx, dz)), Math.cos(rotationY - Math.atan2(dx, dz))),
  )
  expect(quarterTurn).toBeCloseTo(Math.PI / 2, 6)
}

describe('pastureFencePlacements yaw', () => {
  const sampleHeight = (): number => 12

  it('orients wall.glb local +X along a world-X segment', () => {
    const placements = pastureFencePlacements(pastureWithSegment(0, 0, 10, 0), sampleHeight)
    expect(placements.length).toBeGreaterThan(0)
    for (const p of placements) expectFenceYawAlong(10, 0, p.rotationY)
  })

  it('orients wall.glb local +X along a world-Z segment', () => {
    const placements = pastureFencePlacements(pastureWithSegment(0, 0, 0, 10), sampleHeight)
    expect(placements.length).toBeGreaterThan(0)
    for (const p of placements) expectFenceYawAlong(0, 10, p.rotationY)
  })

  it('orients wall.glb local +X along a diagonal A→B segment', () => {
    const placements = pastureFencePlacements(pastureWithSegment(0, 0, 10, 10), sampleHeight)
    expect(placements.length).toBeGreaterThan(0)
    for (const p of placements) expectFenceYawAlong(10, 10, p.rotationY)
  })
})
