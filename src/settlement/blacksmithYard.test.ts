import { describe, expect, it } from 'vitest'
import {
  BLACKSMITH_YARD_BASE_OFFSET,
  BLACKSMITH_YARD_SECTOR_OFFSET,
  blacksmithYardGeometry,
} from './blacksmithYard'
import { HOUSEHOLD_YARD_PROP_OFFSETS } from './householdYard'

const HOUSE_CENTER = { x: 10, z: -6 }

/** Legacy `HOUSE_CATALOG` max plus the active modular `HOME_HOUSE_DEFINITIONS`
 *  footprint radii called out by the plan (scenario E/F) — proves Stage 1
 *  uses the actual materialized house footprint, not just the legacy max. */
const FOOTPRINT_RADII = [2.2, 3.28, 4.06, 4.69, 5.45]

const OUTWARD_ANGLES = [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2, 2.7]

/** Mirrors `props.ts`'s `houseYardPlacements()` — same outward-angle +
 *  jitter + footprint-edge-offset formula used for the common household
 *  barrel/trough/storage slots, at max jitter magnitude (closest they ever
 *  get to the blacksmith sector). */
function commonYardSlot(
  outwardAngle: number,
  footprintRadius: number,
  offset: number,
  jitter: number,
): { x: number, z: number } {
  const angle = outwardAngle + jitter
  const dist = footprintRadius + offset
  return {
    x: HOUSE_CENTER.x + Math.cos(angle) * dist,
    z: HOUSE_CENTER.z + Math.sin(angle) * dist,
  }
}

function dist(a: { x: number, z: number }, b: { x: number, z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

describe('blacksmithYardGeometry (plan settlements-npcs-024 Stage 1)', () => {
  it('is deterministic — same inputs always produce the same geometry', () => {
    const a = blacksmithYardGeometry(HOUSE_CENTER, 3.28, Math.PI / 3)
    const b = blacksmithYardGeometry(HOUSE_CENTER, 3.28, Math.PI / 3)
    expect(a).toEqual(b)
  })

  it.each(FOOTPRINT_RADII)(
    'house clearance — every equipment/anchor point stays outside houseFootprintRadius=%d',
    (footprintRadius) => {
      for (const outwardAngle of OUTWARD_ANGLES) {
        const g = blacksmithYardGeometry(HOUSE_CENTER, footprintRadius, outwardAngle)
        expect(dist(HOUSE_CENTER, g.anvil)).toBeGreaterThan(footprintRadius)
        expect(dist(HOUSE_CENTER, g.workbench)).toBeGreaterThan(footprintRadius)
        expect(dist(HOUSE_CENTER, g.anchor)).toBeGreaterThan(footprintRadius)
      }
    },
  )

  it.each(FOOTPRINT_RADII)(
    'common-yard clearance — equipment/anchor never overlap the barrel/trough/storage slots (footprintRadius=%d)',
    (footprintRadius) => {
      // Same ±jitter magnitude `props.ts`'s `houseYardPlacements()` allows
      // (`(coreRandom() - 0.5) * 0.9`), i.e. the closest a common-yard prop
      // can swing toward the blacksmith sector.
      const maxJitter = 0.45
      for (const outwardAngle of OUTWARD_ANGLES) {
        const g = blacksmithYardGeometry(HOUSE_CENTER, footprintRadius, outwardAngle)
        const equipment = [g.anvil, g.workbench, g.anchor]
        for (const jitter of [-maxJitter, maxJitter]) {
          const barrel = commonYardSlot(outwardAngle, footprintRadius, HOUSEHOLD_YARD_PROP_OFFSETS.barrel, jitter)
          const trough = commonYardSlot(outwardAngle, footprintRadius, HOUSEHOLD_YARD_PROP_OFFSETS.trough, jitter)
          const storage = commonYardSlot(outwardAngle, footprintRadius, HOUSEHOLD_YARD_PROP_OFFSETS.storage, jitter)
          for (const point of equipment) {
            // 1 m is comfortably larger than any individual prop's own
            // footprint (anvil/workbench/barrel/trough/crate are all well
            // under 1 m radius) — a conservative non-overlap margin.
            expect(dist(point, barrel)).toBeGreaterThan(1)
            expect(dist(point, trough)).toBeGreaterThan(1)
            expect(dist(point, storage)).toBeGreaterThan(1)
          }
        }
      }
    },
  )

  it('preserves the original anvil -> grind-workbench relative arrangement (plan settlements-npcs-002)', () => {
    const g = blacksmithYardGeometry(HOUSE_CENTER, 3.28, 0)
    expect(dist(g.anvil, g.workbench)).toBeCloseTo(Math.hypot(1.0, 0.4), 5)
  })

  it('the NPC access anchor sits outside both equipment envelopes, never at a mesh center', () => {
    for (const footprintRadius of FOOTPRINT_RADII) {
      const g = blacksmithYardGeometry(HOUSE_CENTER, footprintRadius, Math.PI / 6)
      expect(dist(g.anchor, g.anvil)).toBeGreaterThan(0.5)
      expect(dist(g.anchor, g.workbench)).toBeGreaterThan(0.5)
    }
  })

  it('regression — never reproduces the old settlement-center fallback offset (-2, -5)', () => {
    // The original bug materialized the forge at `site + (-2, -5)`
    // regardless of any house. The household-yard geometry has no
    // settlement-site input at all, so this is structurally impossible, but
    // assert the shape directly: workplace geometry is a function of the
    // house, not a fixed world-relative offset.
    const site = { x: 0, z: 0 }
    const oldForgeOffset = { x: site.x - 2, z: site.z - 5 }
    const g = blacksmithYardGeometry(HOUSE_CENTER, 3.28, Math.PI / 4)
    expect(dist(g.anvil, oldForgeOffset)).toBeGreaterThan(1)
  })

  it('sector offset keeps the workplace off the house entrance side (outwardAngle + PI, plan yard-basis contract)', () => {
    for (const outwardAngle of OUTWARD_ANGLES) {
      const entranceAngle = outwardAngle + Math.PI
      // basisAngle = outwardAngle + SECTOR_OFFSET must differ from the
      // entrance angle by a comfortable margin (> 45°) for every outward angle.
      const basisAngle = outwardAngle + BLACKSMITH_YARD_SECTOR_OFFSET
      let delta = (basisAngle - entranceAngle) % (Math.PI * 2)
      if (delta > Math.PI) delta -= Math.PI * 2
      if (delta < -Math.PI) delta += Math.PI * 2
      expect(Math.abs(delta)).toBeGreaterThan(Math.PI / 4)
    }
  })

  it('BLACKSMITH_YARD_BASE_OFFSET is positive (equipment always clears the footprint edge)', () => {
    expect(BLACKSMITH_YARD_BASE_OFFSET).toBeGreaterThan(0)
  })
})
