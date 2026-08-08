import type { HeightSampler } from '../player/PlayerController'
import type { RegionParams } from '../terrain/chunkHeightmap'
import type { NaturalResource } from '../terrain/naturalResources'
import { type NameCulture, pickNameCulture } from '../ai/nameCultures'
import { generateSettlementName, type SettlementTerrain } from '../shared/SettlementName'
import {
  dominantResourceNear,
  RESOURCE_ROLE,
  resourceAttractionAt,
  type ResourceEnv,
  resourcesNear,
  SIGNIFICANT_RICHNESS,
} from '../terrain/naturalResources'
import { createSeededRandom } from '../world/parseSeed'
import { type FamilyDef, generateFamilies, rollVillageSize, type VillageSize } from './families'
import { findSettlementSite } from './findSettlementSite'
import { classifySettlementTerrain, type TerrainSamplers } from './settlementTerrain'
import { type ClearingLayout, layoutClearings } from './villageClearing'

/** How a settlement's population mainly feeds itself (plan 032 §8) — v1 is
 *  data/flavor only (no dedicated visual per type yet, see review note in
 *  the plan doc): every settlement still gets the same `garden` prop
 *  (`props.ts`) regardless of this field. Consumed today only by the
 *  Villagers screen's settlement badge. */
export type FoodSourceType = 'field' | 'fishing' | 'foraging' | 'garden'

/** Search radius (world units) beyond `localSearchRadius` the pre-site
 *  resource scan looks out to — a deposit just outside the site-search box
 *  can still pull site selection toward it via `resourceAttractionAt`'s wide
 *  falloff (up to `radius * 6`, see `naturalResources.ts`), so the scan has
 *  to reach further than the search box itself to not miss that influence
 *  right at the box's edge. */
const RESOURCE_ATTRACTION_MARGIN = 130

/** Radius (world units) around the *final* site a resource can be "the
 *  settlement's" dominant one (plan 032 §5's "wioska nie musi znajdować się
 *  przy zasobie" — moderate distance is fine). Comparable to half a
 *  settlement grid cell (`SETTLEMENT_GRID_STEP` / 2) so neighboring
 *  settlements don't typically both claim the same deposit. */
const RESOURCE_INFLUENCE_RADIUS = 140

/** How significant a resource needs to be, combined with harsh (`mountain`)
 *  terrain, to spawn a Resource Outpost (§7) instead of a normal village —
 *  stricter than `SIGNIFICANT_RICHNESS` (which only gates the *dedicated
 *  family* on an otherwise-normal settlement): an outpost replaces the whole
 *  village, so it should be reserved for genuinely exceptional deposits. */
const OUTPOST_RICHNESS_THRESHOLD = 0.78
/** Not every qualifying mountain+resource combo becomes an outpost —
 *  "Opcjonalne resource outposts" (plan 032 §14 checklist item 7). */
const OUTPOST_CHANCE = 0.45

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
  /** The most significant natural resource within `RESOURCE_INFLUENCE_RADIUS`
   *  of the site (plan 032, `terrain/naturalResources.ts`), or `null` if none
   *  is close enough to matter. Already factored into `size`/`families`/
   *  `name` above where relevant — kept here too for future consumers
   *  (production/goods, plan 032 §10-11) and UI flavor. */
  dominantResource: NaturalResource | null
  /** Plan 032 §8 — data/flavor only in v1, see `FoodSourceType`'s doc comment. */
  foodSourceType: FoodSourceType
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

/** Deterministic seeded roll for whether a qualifying resource+terrain
 *  combo actually becomes an outpost (`OUTPOST_CHANCE`) — separate xor salt
 *  from every other per-cell roll so it doesn't correlate with them. */
function rollIsOutpost(seedForCell: number): boolean {
  const random = createSeededRandom(seedForCell ^ 0x0057057)
  return random() < OUTPOST_CHANCE
}

function foodSourceTypeFor(terrain: SettlementTerrain, dominantResource: NaturalResource | null): FoodSourceType {
  if (dominantResource && dominantResource.richness >= SIGNIFICANT_RICHNESS) {
    if (dominantResource.type === 'fish') return 'fishing'
    if (dominantResource.type === 'fertile_soil') return 'field'
  }
  if (terrain === 'forest') return 'foraging'
  return 'garden'
}

/** Generates a settlement's site + metadata for a grid cell, seeded
 *  deterministically from the world seed — same seed ⇒ same layout.
 *
 *  Order follows plan 032 §1's "teren → środowisko → zasoby → wioski":
 *  natural resources are sampled from the terrain/environment `sampleHeight`/
 *  `terrainSamplers` already expose, *before* the site search runs, and feed
 *  into it as an attractiveness bonus (§5) — resources aren't generated *for*
 *  the settlement, the settlement's placement responds to resources that
 *  would exist there regardless.
 */
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

  const resourceEnv: ResourceEnv = {
    sampleHeight,
    sampleContinentalness: terrainSamplers.sampleContinentalness,
    sampleMountainRidge: terrainSamplers.sampleMountainRidge,
    sampleMoistureRegion: terrainSamplers.sampleMoistureRegion,
    waterLevel,
    heightScale,
    region,
  }
  // `seed` (the world seed), not `seedForCell` — the resource grid is one
  // consistent layer across the whole world (plan 032 §1: "Zasoby są
  // generowane niezależnie od wiosek"), not re-randomized per settlement. A
  // world position must resolve to the same resource regardless of which
  // settlement (or the world-wide `resourceDeposits` visualizer) asks.
  const candidateResources = resourcesNear(
    center.x,
    center.z,
    localSearchRadius + RESOURCE_ATTRACTION_MARGIN,
    seed,
    resourceEnv,
  )
  const resourceAttraction = (x: number, z: number): number => resourceAttractionAt(x, z, candidateResources)

  const site = findSettlementSite(sampleHeight, waterLevel, localSearchRadius, seedForCell, center, resourceAttraction)

  const terrain = classifySettlementTerrain(
    site.x,
    site.z,
    site.y,
    waterLevel,
    heightScale,
    region,
    terrainSamplers,
  )
  const dominantResource = dominantResourceNear(site.x, site.z, RESOURCE_INFLUENCE_RADIUS, seed, resourceEnv)
  const nameCulture = pickNameCulture(seedForCell)

  // Resource Outposts (§7) — a genuinely exceptional deposit ("złoto → wysokie
  // góry → zbyt trudne miejsce na wioskę") in harsh (mountain) terrain
  // sometimes replaces the whole village with a single lone resident tied to
  // it, instead of the normal SM/MD/LG roll. Never for the home settlement —
  // it always needs its full reserved-family roster (see `families.ts`).
  const isOutpost =
    !isHome &&
    terrain === 'mountain' &&
    dominantResource !== null &&
    dominantResource.richness >= OUTPOST_RICHNESS_THRESHOLD &&
    RESOURCE_ROLE[dominantResource.type] !== undefined &&
    rollIsOutpost(seedForCell)

  const size = isOutpost ? 'OUTPOST' : rollVillageSize(terrain, seedForCell)
  const name = generateSettlementName(seedForCell, terrain, dominantResource)
  const families = generateFamilies(seedForCell, size, isHome, nameCulture, dominantResource)
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
    dominantResource,
    foodSourceType: foodSourceTypeFor(terrain, dominantResource),
  }
}
