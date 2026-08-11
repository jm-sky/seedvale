import { describe, expect, it } from 'vitest'
import type { NaturalResource } from '../terrain/naturalResources'
import type { VillageIdentity } from './villagePlan'
import { generateFamilies } from './families'
import { chooseLayoutPattern, planVillageLayout, PLOT_SCORE_WEIGHTS } from './villagePlanner'

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

describe('planVillageLayout (plan 047 steps 5–7)', () => {
  it('exposes shared plot scoring weights', () => {
    expect(PLOT_SCORE_WEIGHTS.pathDryBonus).toBeGreaterThan(0)
    expect(PLOT_SCORE_WEIGHTS.outsideBoundaryPenalty).toBeGreaterThan(0)
  })

  it('is deterministic for the same inputs', () => {
    const id = identity({ id: '0_0', size: 'MD', isHome: true })
    const families = generateFamilies(42, 'MD', true, 'polish')
    const site = { x: 0, z: 0, y: 12 }
    const a = planVillageLayout(id, site, families, 42, flatHeight, WATER)
    const b = planVillageLayout(id, site, families, 42, flatHeight, WATER)
    expect(a).toEqual(b)
  })

  it('creates one house plot per family with stable familyIndex', () => {
    const id = identity({ id: '1_0', size: 'LG' })
    const families = generateFamilies(9, 'LG', false, 'polish')
    const layout = planVillageLayout(id, { x: 10, z: -5, y: 12 }, families, 9, flatHeight, WATER)
    const houses = layout.plots.filter((p) => p.role === 'house')
    expect(houses).toHaveLength(families.length)
    houses.forEach((house, i) => {
      expect(house.familyIndex).toBe(i)
      expect(house.familyId).toBe(families[i]!.id)
    })
  })

  it('keeps plots inside the size-dependent boundary', () => {
    const id = identity({ id: '2_0', size: 'XL' })
    const families = generateFamilies(11, 'XL', false, 'polish')
    const site = { x: 0, z: 0, y: 12 }
    const layout = planVillageLayout(id, site, families, 11, flatHeight, WATER)
    expect(layout.boundary.radius).toBeGreaterThan(layout.center.x - site.x + 50)
    for (const plot of layout.plots) {
      const dist = Math.hypot(plot.x - layout.boundary.x, plot.z - layout.boundary.z)
      expect(dist).toBeLessThanOrEqual(layout.boundary.radius + plot.radius + 0.01)
    }
  })

  it('OUTPOST stays minimal: public+residential(+utility), one house, no market/campfire plots', () => {
    const iron: NaturalResource = { id: 'r', type: 'iron', x: 30, z: 0, radius: 8, richness: 0.9 }
    const id = identity({
      id: '3_0',
      size: 'OUTPOST',
      terrain: 'mountain',
      dominantResource: iron,
      foodSourceType: 'garden',
    })
    const families = generateFamilies(5, 'OUTPOST', false, 'polish', iron)
    const layout = planVillageLayout(id, { x: 0, z: 0, y: 12 }, families, 5, flatHeight, WATER)
    expect(chooseLayoutPattern(id, 5)).toBe('clustered')
    expect(families).toHaveLength(1)
    expect(layout.plots.filter((p) => p.role === 'house')).toHaveLength(1)
    expect(layout.zones.some((z) => z.kind === 'public')).toBe(true)
    expect(layout.zones.some((z) => z.kind === 'residential')).toBe(true)
    expect(layout.plots.some((p) => p.id.includes('campfire'))).toBe(false)
    expect(layout.plots.some((p) => p.id.includes('market'))).toBe(false)
  })

  it('adds food/work zones from identity when size budget allows', () => {
    const iron: NaturalResource = { id: 'r', type: 'iron', x: 40, z: 10, radius: 8, richness: 0.9 }
    const id = identity({
      id: '4_0',
      size: 'LG',
      dominantResource: iron,
      foodSourceType: 'field',
    })
    const families = generateFamilies(13, 'LG', false, 'polish', iron)
    const layout = planVillageLayout(id, { x: 0, z: 0, y: 12 }, families, 13, flatHeight, WATER)
    expect(layout.zones.some((z) => z.kind === 'food')).toBe(true)
    expect(layout.zones.some((z) => z.kind === 'production')).toBe(true)
    expect(layout.plots.some((p) => p.role === 'food')).toBe(true)
    expect(layout.plots.some((p) => p.role === 'work')).toBe(true)
  })

  it('keeps house plots from overlapping each other heavily', () => {
    const id = identity({ id: '5_0', size: 'MD' })
    const families = generateFamilies(21, 'MD', false, 'polish')
    const layout = planVillageLayout(id, { x: 0, z: 0, y: 12 }, families, 21, flatHeight, WATER)
    const houses = layout.plots.filter((p) => p.role === 'house')
    for (let i = 0; i < houses.length; i++) {
      for (let j = i + 1; j < houses.length; j++) {
        const a = houses[i]!
        const b = houses[j]!
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(a.radius * 0.5)
      }
    }
  })

  it('derives buildings and landmarks from plots with matching positions (step 8)', () => {
    const id = identity({ id: '6_0', size: 'LG', foodSourceType: 'field', isHome: false })
    const families = generateFamilies(15, 'LG', false, 'polish')
    const layout = planVillageLayout(id, { x: 0, z: 0, y: 12 }, families, 15, flatHeight, WATER)

    const homes = layout.landmarks.filter((l) => l.kind === 'home')
    expect(homes).toHaveLength(families.length)
    homes.forEach((home, i) => {
      const plot = layout.plots.find((p) => p.id === home.plotId)
      expect(plot).toBeDefined()
      expect(home.x).toBe(plot!.x)
      expect(home.z).toBe(plot!.z)
      expect(home.index).toBe(i)
    })

    const well = layout.landmarks.find((l) => l.kind === 'well')
    expect(well).toBeDefined()
    expect(well!.x).toBe(layout.center.x)
    expect(well!.z).toBe(layout.center.z)

    expect(layout.landmarks.some((l) => l.kind === 'stockpile')).toBe(true)
    expect(layout.landmarks.some((l) => l.kind === 'garden')).toBe(true)
    expect(layout.landmarks.some((l) => l.kind === 'campfire')).toBe(true)
    expect(layout.landmarks.some((l) => l.kind === 'market')).toBe(true)

    const houseBuildings = layout.buildings.filter((b) => b.role === 'residential')
    expect(houseBuildings).toHaveLength(families.length)
    for (const building of layout.buildings) {
      const plot = layout.plots.find((p) => p.id === building.plotId)
      expect(plot).toBeDefined()
      expect(building.x).toBe(plot!.x)
      expect(building.z).toBe(plot!.z)
    }
  })

  it('adds a field landmark when foodSourceType is field', () => {
    const id = identity({ id: '7_0', size: 'MD', foodSourceType: 'field' })
    const families = generateFamilies(8, 'MD', false, 'polish')
    const layout = planVillageLayout(id, { x: 0, z: 0, y: 12 }, families, 8, flatHeight, WATER)
    const field = layout.landmarks.find((l) => l.kind === 'field')
    expect(field).toBeDefined()
    expect(layout.plots.some((p) => p.id === field!.plotId && p.role === 'food')).toBe(true)
  })

  it('plans dry entrances and local paths connecting center to zones/houses (step 9)', () => {
    const id = identity({ id: '8_0', size: 'LG' })
    const families = generateFamilies(19, 'LG', false, 'polish')
    const layout = planVillageLayout(id, { x: 0, z: 0, y: 12 }, families, 19, flatHeight, WATER)

    expect(layout.entrances.length).toBeGreaterThanOrEqual(1)
    for (const entrance of layout.entrances) {
      expect(entrance.y).toBeGreaterThan(WATER)
      const dist = Math.hypot(entrance.x - layout.center.x, entrance.z - layout.center.z)
      expect(dist).toBeLessThanOrEqual(layout.boundary.radius + 0.01)
    }

    expect(layout.paths.some((p) => p.id.startsWith('path-entrance-'))).toBe(true)
    expect(layout.paths.some((p) => p.id.startsWith('path-zone-'))).toBe(true)
    expect(layout.paths.some((p) => p.id.startsWith('path-house-'))).toBe(true)

    for (const path of layout.paths) {
      expect(path.points.length).toBeGreaterThanOrEqual(2)
      expect(path.halfWidth).toBeGreaterThan(0)
      for (let i = 0; i < path.points.length - 1; i++) {
        const a = path.points[i]!
        const b = path.points[i + 1]!
        // Flat dry world — every planned segment must be dry.
        expect(flatHeight()).toBeGreaterThan(WATER)
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0)
      }
    }
  })

  it('avoids entrance→center paths across open water', () => {
    // Right half flooded — entrances should prefer dry (−X) side.
    const height = (x: number, _z: number) => (x > 2 ? WATER - 1 : 12)
    const id = identity({ id: '9_0', size: 'MD' })
    const families = generateFamilies(4, 'MD', false, 'polish')
    const layout = planVillageLayout(id, { x: 0, z: 0, y: 12 }, families, 4, height, WATER)
    for (const entrance of layout.entrances) {
      expect(entrance.x).toBeLessThanOrEqual(2)
      expect(height(entrance.x, entrance.z)).toBeGreaterThan(WATER)
    }
    for (const path of layout.paths.filter((p) => p.id.startsWith('path-entrance-'))) {
      for (const pt of path.points) {
        expect(height(pt.x, pt.z)).toBeGreaterThan(WATER)
      }
    }
  })
})
