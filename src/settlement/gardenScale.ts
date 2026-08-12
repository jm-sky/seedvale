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
      return 4.2
    case 'M':
      return 3.2
    default:
      return 2.4
  }
}

/** Terrain / tree-reject clearing radius (world units). */
export function gardenClearingRadius(scale: GardenScale): number {
  switch (scale) {
    case 'L':
      return 7
    case 'M':
      return 5.5
    default:
      return 4
  }
}

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
