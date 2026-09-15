import { describe, expect, it } from 'vitest'
import type { VillageIdentity } from './villagePlan'
import { generateFamilies } from './families'
import {
  centralPlazaReservedFootprints,
  fullPlazaSurfaceHoles,
  generateFullPlazaCobbles,
  generateSparsePlazaCobbles,
  plazaPavingMode,
} from './plazaPaving'
import { planVillageLayout } from './villagePlanner'

const flatHeight = (): number => 12
const WATER = 0

function id(size: VillageIdentity['size']): VillageIdentity {
  return {
    id: `pave_${size}`,
    cell: { gx: 0, gz: 0 },
    isHome: false,
    terrain: 'forest',
    dominantResource: null,
    foodSourceType: 'garden',
    name: 'Testowo',
    nameCulture: 'polish',
    size,
  }
}

describe('plaza paving (settlements-011)', () => {
  it('maps size to none / sparse / full', () => {
    expect(plazaPavingMode('OUTPOST')).toBe('none')
    expect(plazaPavingMode('SM')).toBe('none')
    expect(plazaPavingMode('MD')).toBe('sparse')
    expect(plazaPavingMode('LG')).toBe('full')
    expect(plazaPavingMode('XL')).toBe('full')
  })

  it('MD sparse cobbles miss reserved footprints and stay on the plaza', () => {
    const families = generateFamilies(21, 'MD', false, 'polish')
    const layout = planVillageLayout(id('MD'), { x: 0, z: 0, y: 12 }, families, 21, flatHeight, WATER)
    const exclusions = centralPlazaReservedFootprints(layout)
    expect(exclusions.some((e) => e.x === layout.plaza.x && e.z === layout.plaza.z)).toBe(true)
    const plates = generateSparsePlazaCobbles(layout.plaza, exclusions, 21)
    expect(plates.length).toBeGreaterThan(0)
    expect(plates.length).toBeLessThanOrEqual(4)
    for (const plate of plates) {
      expect(Math.hypot(plate.x - layout.plaza.x, plate.z - layout.plaza.z)).toBeLessThanOrEqual(
        layout.plaza.radius,
      )
      for (const exclusion of exclusions) {
        expect(Math.hypot(plate.x - exclusion.x, plate.z - exclusion.z)).toBeGreaterThanOrEqual(
          exclusion.radius,
        )
      }
    }
    expect(generateSparsePlazaCobbles(layout.plaza, exclusions, 21)).toEqual(plates)
  })

  it('LG/XL full paving holes follow reserved footprints', () => {
    for (const size of ['LG', 'XL'] as const) {
      const seed = size === 'LG' ? 15 : 11
      const families = generateFamilies(seed, size, false, 'polish')
      const layout = planVillageLayout(id(size), { x: 0, z: 0, y: 12 }, families, seed, flatHeight, WATER)
      const exclusions = centralPlazaReservedFootprints(layout)
      expect(exclusions.length).toBeGreaterThan(1)
      const holes = fullPlazaSurfaceHoles(layout.plaza, exclusions)
      expect(holes.length).toBeGreaterThan(0)
      for (const hole of holes) {
        expect(Math.hypot(hole.dx, hole.dz) + hole.radius).toBeLessThanOrEqual(layout.plaza.radius + 1e-6)
      }
      const plates = generateFullPlazaCobbles(layout.plaza, exclusions, seed)
      expect(plates.length).toBeGreaterThan(8)
      for (const plate of plates) {
        expect(Math.hypot(plate.x - layout.plaza.x, plate.z - layout.plaza.z)).toBeLessThanOrEqual(
          layout.plaza.radius,
        )
        for (const exclusion of exclusions) {
          expect(Math.hypot(plate.x - exclusion.x, plate.z - exclusion.z)).toBeGreaterThanOrEqual(
            exclusion.radius - 0.01,
          )
        }
      }
    }
  })
})
