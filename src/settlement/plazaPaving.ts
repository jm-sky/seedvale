import type { VillageSize } from './families'
import type { VillagePlan, VillagePlaza } from './villagePlan'
import { createSeededRandom } from '../world/parseSeed'
import { cobbleCountForSize } from './families'

/**
 * Plaza paving placement (plan settlements-011). Planner-owned plaza + reserved
 * footprints in; no scene-object discovery. Three.js-free so tests can assert
 * the contract without meshes.
 * @domain settlements
 */

export type PlazaPavingMode = 'none' | 'sparse' | 'full'

export type PlazaExclusion = {
  x: number
  z: number
  radius: number
}

export type PlazaPavingPlacement = {
  x: number
  z: number
  rotationY: number
  scale: number
}

export type PlazaSurfaceHole = {
  dx: number
  dz: number
  radius: number
}

export function plazaPavingMode(size: VillageSize): PlazaPavingMode {
  switch (size) {
    case 'LG':
    case 'XL':
      return 'full'
    case 'MD':
      return 'sparse'
    default:
      return 'none'
  }
}

const CENTRAL_INFRA_PLOT = /^(plot-infra-well|plot-infra-stockpile-\d+|plot-infra-campfire-\d+|plot-infra-market-\d+|plot-infra-notice-board)$/

/**
 * Reserved circles the paved surface must not cover — well, fire, market,
 * stockpiles, notice board, and any other infrastructure whose disk meets
 * the plaza. Gardens / household wells sit off the square and are omitted.
 */
export function centralPlazaReservedFootprints(plan: Pick<VillagePlan, 'plaza' | 'plots'>): PlazaExclusion[] {
  const { plaza } = plan
  const out: PlazaExclusion[] = []
  for (const plot of plan.plots) {
    if (plot.role !== 'infrastructure') continue
    if (!CENTRAL_INFRA_PLOT.test(plot.id)) continue
    const dist = Math.hypot(plot.x - plaza.x, plot.z - plaza.z)
    if (dist > plaza.radius + plot.radius) continue
    out.push({ x: plot.x, z: plot.z, radius: plot.radius })
  }
  return out
}

function hitsExclusion(
  x: number,
  z: number,
  exclusions: readonly PlazaExclusion[],
  pad: number,
): boolean {
  for (const exclusion of exclusions) {
    if (Math.hypot(x - exclusion.x, z - exclusion.z) < exclusion.radius + pad) return true
  }
  return false
}

/** MD sparse cobbles — the existing `cobbleCountForSize` handful, now exclusion-aware. */
export function generateSparsePlazaCobbles(
  plaza: VillagePlaza,
  exclusions: readonly PlazaExclusion[],
  seed: number,
  count = cobbleCountForSize('MD', seed),
): PlazaPavingPlacement[] {
  const random = createSeededRandom(seed ^ 0xc0bb1e)
  const cobbleR = Math.max(2.2, plaza.radius * 0.55)
  const placements: PlazaPavingPlacement[] = []
  let guard = 0
  while (placements.length < count && guard < count * 12) {
    guard++
    const ang = random() * Math.PI * 2
    const dist = cobbleR * (0.5 + random() * 0.6)
    const x = plaza.x + Math.cos(ang) * dist
    const z = plaza.z + Math.sin(ang) * dist
    if (Math.hypot(x - plaza.x, z - plaza.z) > plaza.radius - 0.4) continue
    if (hitsExclusion(x, z, exclusions, 0.35)) continue
    placements.push({
      x,
      z,
      rotationY: random() * Math.PI * 2,
      scale: 0.85 + random() * 0.3,
    })
  }
  return placements
}

/**
 * Local-space holes for one ShapeGeometry plaza disc. Holes are clamped so
 * they stay inside the plaza (THREE.Shape requires contained holes).
 */
export function fullPlazaSurfaceHoles(
  plaza: VillagePlaza,
  exclusions: readonly PlazaExclusion[],
): PlazaSurfaceHole[] {
  const holes: PlazaSurfaceHole[] = []
  for (const exclusion of exclusions) {
    const dx = exclusion.x - plaza.x
    const dz = exclusion.z - plaza.z
    const dist = Math.hypot(dx, dz)
    if (dist >= plaza.radius - 0.35) continue
    const radius = Math.min(exclusion.radius, plaza.radius - dist - 0.2)
    if (radius < 0.4) continue
    holes.push({ dx, dz, radius })
  }
  return holes
}

/** LG/XL fallback plate grid when a disc mesh is unavailable — one instanced batch. */
export function generateFullPlazaCobbles(
  plaza: VillagePlaza,
  exclusions: readonly PlazaExclusion[],
  seed: number,
): PlazaPavingPlacement[] {
  const random = createSeededRandom(seed ^ 0x51a2a)
  const spacing = 1.45
  const hexH = spacing * Math.sqrt(3) / 2
  const rowMax = Math.ceil(plaza.radius / hexH)
  const colMax = Math.ceil(plaza.radius / spacing)
  const placements: PlazaPavingPlacement[] = []
  for (let row = -rowMax; row <= rowMax; row++) {
    const z = plaza.z + row * hexH
    const xOff = row % 2 === 0 ? 0 : spacing * 0.5
    for (let col = -colMax; col <= colMax; col++) {
      const x = plaza.x + col * spacing + xOff
      if (Math.hypot(x - plaza.x, z - plaza.z) > plaza.radius - 0.45) continue
      if (hitsExclusion(x, z, exclusions, 0.3)) continue
      placements.push({
        x,
        z,
        rotationY: random() * Math.PI * 2,
        scale: 0.92 + random() * 0.16,
      })
    }
  }
  return placements
}
