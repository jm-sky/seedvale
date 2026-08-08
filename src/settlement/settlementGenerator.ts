import type { HeightSampler } from '../player/PlayerController'
import type { RegionParams } from '../terrain/chunkHeightmap'
import { type NameCulture, pickNameCulture } from '../ai/nameCultures'
import { generateSettlementName, type SettlementTerrain } from '../shared/SettlementName'
import { createSeededRandom } from '../world/parseSeed'
import { type FamilyDef, generateFamilies, rollVillageSize, type VillageSize } from './families'
import { findSettlementSite } from './findSettlementSite'
import { classifySettlementTerrain, type TerrainSamplers } from './settlementTerrain'
import { type ClearingLayout, layoutClearings } from './villageClearing'

/** World-unit spacing between settlement grid cells. Large enough that even
 *  the worst-case combination of per-cell noise offset and the local flat-site
 *  search jitter (±24 units, see `findSettlementSite`) keeps neighbors well
 *  above the ~150 unit minimum separation the design calls for. */
export const SETTLEMENT_GRID_STEP = 280

/** Fraction of half the grid step a cell's center may drift by — keeps the
 *  layout from reading as a perfect grid without risking overlap. */
const OFFSET_FRACTION = 0.3

export type SettlementCell = { gx: number, gz: number }

export type SettlementDef = {
  /** Stable id derived from grid coords — used as the streaming key and to
   *  namespace per-settlement ids (e.g. tree interactables). */
  id: string
  gx: number
  gz: number
  x: number
  z: number
  y: number
  /** SM/MD/LG, rolled from `terrain` — see `families.ts`'s `rollVillageSize`.
   *  Drives `families.length` (a floor of 2 reserved families for home, see
   *  `families.ts`'s `generateFamilies`), which in turn drives NPC/house count. */
  size: VillageSize
  /** Each family gets one house (`props.ts`) and contributes its members as
   *  NPCs (`createSettlement.ts`). The home settlement's first 2 families are
   *  always the reserved Anna+Piotr/Kasia+Marek pairing — quest defs
   *  (`quests/quests.ts`) hardcode those names, and randomizing them would
   *  silently break the only quests the game has (see `families.ts`). */
  families: readonly FamilyDef[]
  /** Terrain clearing layout (well/stockpile/garden core + one patch per
   *  family for its house) — see `villageClearing.ts`. */
  clearings: ClearingLayout
  /** True only for cell (0,0) — the settlement the player spawns in, always
   *  loaded, and the only one built with the full forest belt in v1. */
  isHome: boolean
  /** Terrain feature the naming generator picked up around the site — see
   *  `settlementTerrain.ts`. Kept alongside `name` mostly for debugging. */
  terrain: SettlementTerrain
  name: string
  /** The settlement's dominant name culture — most procedurally generated
   *  family members draw their name from this pool (`ai/nameCultures.ts`),
   *  with a small chance per NPC of a name from elsewhere. Doesn't apply to
   *  the home settlement's 2 reserved families, whose names are fixed. */
  nameCulture: NameCulture
}

export function cellKey(cell: SettlementCell): string {
  return `${cell.gx}_${cell.gz}`
}

export function worldToCell(x: number, z: number): SettlementCell {
  return {
    gx: Math.round(x / SETTLEMENT_GRID_STEP),
    gz: Math.round(z / SETTLEMENT_GRID_STEP),
  }
}

/** All grid cells within Chebyshev `radius` of `center` (inclusive). */
export function cellsWithinRadius(center: SettlementCell, radius: number): SettlementCell[] {
  const cells: SettlementCell[] = []
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      cells.push({ gx: center.gx + dx, gz: center.gz + dz })
    }
  }
  return cells
}

/** Deterministic per-cell seed. Cell (0,0) maps to `seed` unchanged so that,
 *  combined with `center = {0,0}` in `generateSettlementDef`, the home
 *  settlement reproduces `findSettlementSite`'s original `seed ^ 0xc0ffee`
 *  stream exactly — no regression for existing saves/seeds. Exported so other
 *  per-settlement seeded rolls (e.g. `createSettlement.ts`'s night-fire
 *  ignition) reuse the same settlement identity instead of a separate hash. */
export function cellSeed(seed: number, cell: SettlementCell): number {
  if (cell.gx === 0 && cell.gz === 0) return seed
  let h = (cell.gx * 374761393 + cell.gz * 668265263) | 0
  h = (h ^ (h >>> 13)) | 0
  h = Math.imul(h, 1274126177)
  h = (h ^ (h >>> 16)) | 0
  return (seed ^ h) >>> 0
}

function offsetCellCenter(cell: SettlementCell, seedForCell: number): { x: number, z: number } {
  const random = createSeededRandom(seedForCell ^ 0x9e3779)
  const maxOffset = SETTLEMENT_GRID_STEP * 0.5 * OFFSET_FRACTION
  return {
    x: cell.gx * SETTLEMENT_GRID_STEP + (random() * 2 - 1) * maxOffset,
    z: cell.gz * SETTLEMENT_GRID_STEP + (random() * 2 - 1) * maxOffset,
  }
}

/** Generates a settlement's site + metadata for a grid cell, seeded
 *  deterministically from the world seed — same seed ⇒ same layout. */
export function generateSettlementDef(
  cell: SettlementCell,
  seed: number,
  sampleHeight: HeightSampler,
  waterLevel: number,
  localSearchRadius: number,
  terrainSamplers: TerrainSamplers,
  heightScale: number,
  region: RegionParams,
): SettlementDef {
  const isHome = cell.gx === 0 && cell.gz === 0
  const seedForCell = cellSeed(seed, cell)
  const center = isHome ? { x: 0, z: 0 } : offsetCellCenter(cell, seedForCell)

  const site = findSettlementSite(sampleHeight, waterLevel, localSearchRadius, seedForCell, center)

  const terrain = classifySettlementTerrain(
    site.x,
    site.z,
    site.y,
    waterLevel,
    heightScale,
    region,
    terrainSamplers,
  )
  const name = generateSettlementName(seedForCell, terrain)
  const nameCulture = pickNameCulture(seedForCell)

  const size = rollVillageSize(terrain, seedForCell)
  const families = generateFamilies(seedForCell, size, isHome, nameCulture)
  const clearings = layoutClearings(site, families, terrain, seedForCell, sampleHeight, waterLevel, region.village)

  return {
    id: cellKey(cell),
    gx: cell.gx,
    gz: cell.gz,
    x: site.x,
    z: site.z,
    y: site.y,
    size,
    families,
    clearings,
    isHome,
    terrain,
    name,
    nameCulture,
  }
}
