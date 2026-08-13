/** Garden visual / plot scale (plan 077) — packed from house-count units. */
export type GardenScale = 'S' | 'M' | 'L'

/** ~1 garden unit per 3 houses; always at least one when gardens are planned. */
export function gardenUnitsFromHouses(houseCount: number): number {
  const n = Math.max(0, Math.floor(houseCount))
  if (n <= 0) return 1
  return Math.max(1, Math.ceil(n / 3))
}

/**
 * Greedy pack: 3→L, 2→M, 1→S. Emits largest first so index 0 is the primary
 * garden for NPC / shovel landmarks.
 */
export function packGardenScales(units: number): GardenScale[] {
  let remaining = Math.max(0, Math.floor(units))
  const out: GardenScale[] = []
  while (remaining >= 3) {
    out.push('L')
    remaining -= 3
  }
  while (remaining >= 2) {
    out.push('M')
    remaining -= 2
  }
  while (remaining >= 1) {
    out.push('S')
    remaining -= 1
  }
  return out.length > 0 ? out : ['S']
}

/** Plot / spacing radius for planner (world units). */
export function gardenPlotRadius(scale: GardenScale): number {
  switch (scale) {
    case 'L':
      return 8.4
    case 'M':
      return 6.4
    default:
      return 4.8
  }
}

/** Gap between plaza rim and garden plot edge (plan 095). */
export const GARDEN_PLAZA_GAP = 1.5

/**
 * Minimum distance from plaza center to a garden plot center so the beds
 * sit outside packed dirt (`plazaCoreRadius + plot radius + gap`).
 */
export function gardenPlazaMinCenterDist(
  plazaR: number,
  scale: GardenScale,
  gap = GARDEN_PLAZA_GAP,
): number {
  return plazaR + gardenPlotRadius(scale) + gap
}

/** Unit bed size — `crops.glb` fit and procedural `createGarden` fallback. */
export const GARDEN_BED_W = 4.8
export const GARDEN_BED_D = 3.2
export const GARDEN_BED_GAP = 0.35

/** Dirt skirt past the bed corners so grass starts just outside the mesh. */
const GARDEN_PAD_SKIRT = 1.2

/** How many unit beds the procedural mesh lays out. */
export function gardenBedCount(scale: GardenScale): number {
  switch (scale) {
    case 'L':
      return 3
    case 'M':
      return 2
    default:
      return 1
  }
}

/** Terrain / grass-reject pad — hugs the tiled beds (not a large plaza disk). */
export function gardenClearingRadius(scale: GardenScale): number {
  const beds = gardenBedCount(scale)
  const halfW = (beds * GARDEN_BED_W + Math.max(0, beds - 1) * GARDEN_BED_GAP) * 0.5
  const halfD = GARDEN_BED_D * 0.5
  return Math.hypot(halfW, halfD) + GARDEN_PAD_SKIRT
}
