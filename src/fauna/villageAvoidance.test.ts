import { describe, expect, it } from 'vitest'
import { isWithinVillageRadius, villageFleeBiasFalloff, type VillageInfo } from './AnimalAgent'

describe('isWithinVillageRadius (plan 080 — footprint-radius-aware village avoidance)', () => {
  const villageAt = (radius: number): VillageInfo => ({ x: 0, z: 0, radius })

  it.each([22, 40, 48, 56, 72])(
    'is true just inside radius %i + margin, false just outside',
    (radius) => {
      const margin = 6
      const village = villageAt(radius)
      expect(isWithinVillageRadius({ x: radius + margin - 1, z: 0 }, village, margin)).toBe(true)
      expect(isWithinVillageRadius({ x: radius + margin + 1, z: 0 }, village, margin)).toBe(false)
    },
  )

  it('a point well inside a large (XL) village footprint is near it', () => {
    // Before plan 080 a flat 20-unit radius would have missed this entirely
    // for an XL (footprintRadius 72) village.
    expect(isWithinVillageRadius({ x: 50, z: 0 }, villageAt(72), 6)).toBe(true)
  })

  it('a point just past a small (SM) village footprint is not near it', () => {
    expect(isWithinVillageRadius({ x: 47, z: 0 }, villageAt(40), 6)).toBe(false)
  })
})

describe('villageFleeBiasFalloff (plan 080)', () => {
  it('is 1 at the village center and 0 at radius + margin', () => {
    const village: VillageInfo = { x: 0, z: 0, radius: 40 }
    expect(villageFleeBiasFalloff(0, village, 25)).toBe(1)
    expect(villageFleeBiasFalloff(65, village, 25)).toBe(0)
  })

  it('never goes negative beyond the influence radius', () => {
    const village: VillageInfo = { x: 0, z: 0, radius: 22 }
    expect(villageFleeBiasFalloff(200, village, 25)).toBe(0)
  })

  it('scales the influence radius with the village footprint', () => {
    const margin = 25
    const small: VillageInfo = { x: 0, z: 0, radius: 22 }
    const large: VillageInfo = { x: 0, z: 0, radius: 72 }
    // Same absolute distance from center reads as "closer" (weaker falloff)
    // to a small village's edge than a large village's.
    expect(villageFleeBiasFalloff(50, small, margin)).toBeLessThan(
      villageFleeBiasFalloff(50, large, margin),
    )
  })
})
