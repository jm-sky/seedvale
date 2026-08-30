import { describe, expect, it } from 'vitest'
import type { NaturalResource } from '../terrain/naturalResources'
import type { VillageIdentity } from './villagePlan'
import { generateFamilies } from './families'
import { gardenClearingRadius, gardenPlazaMinCenterDist, type GardenScale } from './gardenScale'
import { householdYardRadius } from './householdYard'
import { plazaCoreRadius } from './villageClearing'
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

  it('keeps house plots clear of the plaza well', () => {
    const id = identity({ id: '5_1', size: 'SM' })
    const families = generateFamilies(7, 'SM', false, 'polish')
    const layout = planVillageLayout(id, { x: 0, z: 0, y: 12 }, families, 7, flatHeight, WATER)
    const well = layout.plots.find((p) => p.id === 'plot-infra-well')!
    const minDist = 4.5 + 2.4 + 2.5 // HOUSE_PLOT_RADIUS + INFRA_PLOT_RADIUS + gap
    for (const house of layout.plots.filter((p) => p.role === 'house')) {
      expect(Math.hypot(house.x - well.x, house.z - well.z)).toBeGreaterThanOrEqual(minDist - 0.01)
    }
  })

  it('keeps garden plots outside the plaza disk (plan 095)', () => {
    const cases: Array<{ id: string, size: VillageIdentity['size'], seed: number }> = [
      { id: 'g_out', size: 'OUTPOST', seed: 5 },
      { id: 'g_sm', size: 'SM', seed: 7 },
      { id: 'g_md', size: 'MD', seed: 21 },
      { id: 'g_lg', size: 'LG', seed: 15 },
      { id: 'g_xl', size: 'XL', seed: 11 },
    ]
    for (const c of cases) {
      const id = identity({ id: c.id, size: c.size, isHome: false })
      const families = generateFamilies(c.seed, c.size, false, 'polish')
      const layout = planVillageLayout(
        id, { x: 0, z: 0, y: 12 }, families, c.seed, flatHeight, WATER,
      )
      const plazaR = plazaCoreRadius(c.size, 9)
      const gardens = layout.plots.filter((p) => p.id.startsWith('plot-infra-garden-'))
      expect(gardens.length, c.size).toBeGreaterThan(0)
      for (const plot of gardens) {
        const scale = (plot.id.match(/-(S|M|L)$/)?.[1] ?? 'S') as GardenScale
        const min = gardenPlazaMinCenterDist(plazaR, scale)
        expect(
          Math.hypot(plot.x - layout.center.x, plot.z - layout.center.z),
          `${c.size} ${plot.id}`,
        ).toBeGreaterThanOrEqual(min - 0.01)
      }
    }
  })

  it('keeps house pads off neighbouring plaza→house path spokes', () => {
    const id = identity({ id: '5_2', size: 'MD' })
    const families = generateFamilies(21, 'MD', false, 'polish')
    const layout = planVillageLayout(id, { x: 0, z: 0, y: 12 }, families, 21, flatHeight, WATER)
    const houses = layout.plots.filter((p) => p.role === 'house')
    const center = layout.center
    // Same clearance as villagePlanner HOUSE_SPOKE_CLEARANCE (1.5 + 4.5*0.55).
    const clearance = 1.5 + 4.5 * 0.55
    for (let i = 0; i < houses.length; i++) {
      for (let j = 0; j < houses.length; j++) {
        if (i === j) continue
        const a = houses[i]!
        const b = houses[j]!
        const { distSq, t } = (() => {
          const dx = b.x - center.x
          const dz = b.z - center.z
          const lenSq = dx * dx + dz * dz
          if (lenSq < 1e-6) return { distSq: 0, t: 0 }
          const tt = Math.max(0, Math.min(1, ((a.x - center.x) * dx + (a.z - center.z) * dz) / lenSq))
          const cx = center.x + dx * tt
          const cz = center.z + dz * tt
          const ddx = a.x - cx
          const ddz = a.z - cz
          return { distSq: ddx * ddx + ddz * ddz, t: tt }
        })()
        if (t <= 0.1 || t >= 0.9) continue
        expect(Math.sqrt(distSq)).toBeGreaterThanOrEqual(clearance - 0.05)
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

describe('sale plots (plan 129)', () => {
  it('is deterministic for the same seed + settlement identity', () => {
    const id = identity({ id: '10_0', size: 'LG' })
    const families = generateFamilies(77, 'LG', false, 'polish')
    const site = { x: 0, z: 0, y: 12 }
    const a = planVillageLayout(id, site, families, 77, flatHeight, WATER)
    const b = planVillageLayout(id, site, families, 77, flatHeight, WATER)
    expect(a.plots.filter((p) => p.role === 'sale')).toEqual(b.plots.filter((p) => p.role === 'sale'))
  })

  it('never exceeds the size-configured maximum and prices every sale plot', () => {
    for (const size of ['SM', 'MD', 'LG', 'XL'] as const) {
      const max = size === 'LG' || size === 'XL' ? 2 : 1
      for (let seed = 0; seed < 12; seed++) {
        const id = identity({ id: `sale_${size}_${seed}`, size })
        const families = generateFamilies(seed, size, false, 'polish')
        const layout = planVillageLayout(id, { x: 0, z: 0, y: 12 }, families, seed, flatHeight, WATER)
        const salePlots = layout.plots.filter((p) => p.role === 'sale')
        expect(salePlots.length, `${size} seed ${seed}`).toBeLessThanOrEqual(max)
        for (const plot of salePlots) {
          expect(plot.price, plot.id).toBeGreaterThan(0)
        }
      }
    }
  })

  it('OUTPOST never generates a sale plot', () => {
    const iron: NaturalResource = { id: 'r', type: 'iron', x: 30, z: 0, radius: 8, richness: 0.9 }
    for (let seed = 0; seed < 12; seed++) {
      const id = identity({ id: `outpost_${seed}`, size: 'OUTPOST', terrain: 'mountain', dominantResource: iron })
      const families = generateFamilies(seed, 'OUTPOST', false, 'polish', iron)
      const layout = planVillageLayout(id, { x: 0, z: 0, y: 12 }, families, seed, flatHeight, WATER)
      expect(layout.plots.some((p) => p.role === 'sale')).toBe(false)
    }
  })

  it('gives sale plots stable ids and no building/landmark entry', () => {
    let sawSalePlot = false
    for (let seed = 0; seed < 30 && !sawSalePlot; seed++) {
      const id = identity({ id: `bl_${seed}`, size: 'MD' })
      const families = generateFamilies(seed, 'MD', false, 'polish')
      const layout = planVillageLayout(id, { x: 0, z: 0, y: 12 }, families, seed, flatHeight, WATER)
      const salePlots = layout.plots.filter((p) => p.role === 'sale')
      if (salePlots.length === 0) continue
      sawSalePlot = true
      const ids = new Set(salePlots.map((p) => p.id))
      expect(ids.size).toBe(salePlots.length)
      for (const plot of salePlots) {
        expect(layout.buildings.some((b) => b.plotId === plot.id)).toBe(false)
        expect(layout.landmarks.some((l) => l.plotId === plot.id)).toBe(false)
      }
    }
    expect(sawSalePlot).toBe(true)
  })

  it('keeps sale plots inside the size-dependent boundary', () => {
    const id = identity({ id: '10_1', size: 'XL' })
    const families = generateFamilies(2, 'XL', false, 'polish')
    const layout = planVillageLayout(id, { x: 0, z: 0, y: 12 }, families, 2, flatHeight, WATER)
    for (const plot of layout.plots.filter((p) => p.role === 'sale')) {
      const dist = Math.hypot(plot.x - layout.boundary.x, plot.z - layout.boundary.z)
      expect(dist).toBeLessThanOrEqual(layout.boundary.radius + plot.radius + 0.01)
    }
  })
})

describe('household yard & settlement space (plan settlements-npcs-011)', () => {
  const SIZES: VillageIdentity['size'][] = ['SM', 'MD', 'LG', 'XL']
  const SEEDS = Array.from({ length: 15 }, (_, i) => i * 11 + 3)
  const yardR = householdYardRadius()

  // One deterministic layout per size/seed, reused by every check below —
  // regenerating per-assertion would just multiply the same seeded work.
  function layoutsFor(size: VillageIdentity['size']) {
    return SEEDS.map((seed) => {
      const id = identity({ id: `yard_${size}_${seed}`, size })
      const families = generateFamilies(seed, size, false, 'polish')
      return { seed, layout: planVillageLayout(id, { x: 0, z: 0, y: 12 }, families, seed, flatHeight, WATER) }
    })
  }

  it.each(SIZES)('%s: household yards do not overlap each other', (size) => {
    for (const { seed, layout } of layoutsFor(size)) {
      const houses = layout.plots.filter((p) => p.role === 'house')
      for (let i = 0; i < houses.length; i++) {
        for (let j = i + 1; j < houses.length; j++) {
          const a = houses[i]!
          const b = houses[j]!
          const gap = Math.hypot(a.x - b.x, a.z - b.z) - yardR * 2
          expect(gap, `${size} seed ${seed} house${i}<->house${j}`).toBeGreaterThanOrEqual(-0.01)
        }
      }
    }
  })

  it.each(SIZES)('%s: household yards do not overlap garden clearings', (size) => {
    for (const { seed, layout } of layoutsFor(size)) {
      const houses = layout.plots.filter((p) => p.role === 'house')
      const gardens = layout.plots.filter((p) => p.id.startsWith('plot-infra-garden-'))
      for (let i = 0; i < houses.length; i++) {
        for (const garden of gardens) {
          const scale = (garden.id.match(/-(S|M|L)$/)?.[1] ?? 'S') as GardenScale
          const gap =
            Math.hypot(houses[i]!.x - garden.x, houses[i]!.z - garden.z) - yardR - gardenClearingRadius(scale)
          expect(gap, `${size} seed ${seed} house${i}<->${garden.id}`).toBeGreaterThanOrEqual(-0.01)
        }
      }
    }
  })

  it.each(SIZES)('%s: household yards do not overlap other infrastructure plots', (size) => {
    for (const { seed, layout } of layoutsFor(size)) {
      const houses = layout.plots.filter((p) => p.role === 'house')
      const infra = layout.plots.filter(
        (p) => p.role === 'infrastructure' && !p.id.startsWith('plot-infra-garden-'),
      )
      for (let i = 0; i < houses.length; i++) {
        for (const other of infra) {
          const gap = Math.hypot(houses[i]!.x - other.x, houses[i]!.z - other.z) - yardR - other.radius
          expect(gap, `${size} seed ${seed} house${i}<->${other.id}`).toBeGreaterThanOrEqual(-0.01)
        }
      }
    }
  })

  it.each(SIZES)('%s: house/garden/infra plots fit inside the settlement boundary with margin', (size) => {
    // Sale plots (plan 129) deliberately hug the outer ring and are not
    // part of the household-yard/garden capacity this plan calibrates.
    for (const { seed, layout } of layoutsFor(size)) {
      for (const plot of layout.plots) {
        if (plot.role === 'sale') continue
        const dist = Math.hypot(plot.x - layout.center.x, plot.z - layout.center.z)
        expect(dist + plot.radius, `${size} seed ${seed} ${plot.id}`).toBeLessThanOrEqual(
          layout.boundary.radius + 0.5,
        )
      }
    }
  })
})
