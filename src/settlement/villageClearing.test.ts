import { describe, expect, it } from 'vitest'
import type { VillageClearingParams } from '../terrain/chunkHeightmap'
import { generateFamilies } from './families'
import { layoutClearings } from './villageClearing'

const PARAMS: VillageClearingParams = {
  coreRadius: 9,
  houseRadius: 4.5,
  heightStrength: 0.8,
  tintStrength: 0.75,
  regionalHeightStrengthFlat: 0.3,
  regionalHeightStrengthMountain: 0.15,
}

const SITE = { x: 0, z: 0, y: 5 }
const WATER_LEVEL = 0

function flatSampleHeight(): number {
  return 5
}

/** A vertical water stripe crossing x∈(15,25) at every z — any straight line
 *  from the core (0,0) out past x=15 in roughly the +x direction crosses it,
 *  regardless of exact angle, while the house-placement fallback (which
 *  never reaches past x≈14, see `villageClearing.ts`'s `fallbackDist`) stays
 *  clear of it no matter the angle. Used to exercise the water-avoidance
 *  retry/fallback in `layoutClearings`. */
function stripedSampleHeight(x: number): number {
  return x > 15 && x < 25 ? WATER_LEVEL - 1 : 5
}

describe('layoutClearings', () => {
  it('is deterministic for the same inputs', () => {
    const families = generateFamilies(7, 'LG', false, 'polish')
    const a = layoutClearings(SITE, families, 'forest', 42, flatSampleHeight, WATER_LEVEL, PARAMS)
    const b = layoutClearings(SITE, families, 'forest', 42, flatSampleHeight, WATER_LEVEL, PARAMS)
    expect(a).toEqual(b)
  })

  it('picks regional height strength from terrain (mountain vs flat)', () => {
    const families = generateFamilies(7, 'MD', false, 'polish')
    const flat = layoutClearings(SITE, families, 'forest', 42, flatSampleHeight, WATER_LEVEL, PARAMS)
    const mountain = layoutClearings(SITE, families, 'mountain', 42, flatSampleHeight, WATER_LEVEL, PARAMS)
    expect(flat.regional.heightStrength).toBe(PARAMS.regionalHeightStrengthFlat)
    expect(mountain.regional.heightStrength).toBe(PARAMS.regionalHeightStrengthMountain)
  })

  it('never lets a house end up across water from the core, even when the ring keeps landing in it', () => {
    const families = generateFamilies(3, 'LG', false, 'polish')
    for (let seed = 0; seed < 30; seed++) {
      const layout = layoutClearings(SITE, families, 'forest', seed, stripedSampleHeight, WATER_LEVEL, PARAMS)
      for (const house of layout.houses) {
        for (let i = 0; i <= 10; i++) {
          const t = i / 10
          const x = SITE.x + (house.x - SITE.x) * t
          expect(stripedSampleHeight(x)).toBeGreaterThan(WATER_LEVEL)
        }
      }
    }
  })

  it('regional patch radius covers the whole house ring', () => {
    const families = generateFamilies(9, 'LG', false, 'polish')
    const layout = layoutClearings(SITE, families, 'forest', 9, flatSampleHeight, WATER_LEVEL, PARAMS)
    for (const house of layout.houses) {
      const dist = Math.hypot(house.x - layout.regional.x, house.z - layout.regional.z)
      expect(dist).toBeLessThan(layout.regional.radius)
    }
  })

  it('regional target height is the average of the core and all house heights', () => {
    const families = generateFamilies(4, 'MD', false, 'polish')
    const layout = layoutClearings(SITE, families, 'forest', 4, flatSampleHeight, WATER_LEVEL, PARAMS)
    const expected =
      [layout.core.targetH, ...layout.houses.map((h) => h.targetH)].reduce((a, b) => a + b, 0) /
      (layout.houses.length + 1)
    expect(layout.regional.targetH).toBeCloseTo(expected)
  })
})
