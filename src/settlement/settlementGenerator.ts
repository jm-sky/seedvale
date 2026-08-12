import type { HomeVillageSize } from '../config/worldConfig'
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
import {
  type FamilyDef,
  generateFamilies,
  type RolledVillageSize,
  rollVillageSize,
  type VillageSize,
  villageSizeConfig,
} from './families'
import { findSettlementSite } from './findSettlementSite'
import { findDockLocation } from './minorLocations'
import { classifySettlementTerrain, type TerrainSamplers } from './settlementTerrain'
import { type ClearingLayout, layoutClearingsFromPlan } from './villageClearing'
import { type FoodSourceType, type VillageIdentity, type VillagePlan } from './villagePlan'
import { planVillageLayout } from './villagePlanner'

export type { FoodSourceType } from './villagePlan'

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
  /** SM/MD/LG/XL, rolled from `terrain` — see `families.ts`'s `rollVillageSize`.
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
   *  family for its house) — see `villageClearing.ts`. Compatibility
   *  projection until plan 047 migrates clearings into plan-derived terrain
   *  modifiers; must not diverge from `plan` site/identity. */
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
  /** Authoritative local layout (plan 047). `SettlementDef` remains a thin
   *  compatibility projection for existing runtime consumers. */
  plan: VillagePlan
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

type SettlementGenContext = {
  cell: SettlementCell
  seed: number
  seedForCell: number
  isHome: boolean
  center: { x: number, z: number }
  resourceEnv: ResourceEnv
  resourceAttraction: (x: number, z: number) => number
  sampleHeight: HeightSampler
  waterLevel: number
  localSearchRadius: number
  terrainSamplers: TerrainSamplers
  heightScale: number
  region: RegionParams
  /**
   * Size rolled once from terrain at the cell center *before* site search
   * (plan 047 §6). Used for footprint scoring and locked into identity
   * unless the final site becomes an OUTPOST. Never re-rolled after site.
   */
  provisionalSize: RolledVillageSize
}

/** Step 1 of the plan 047 seam: cell + world seed → resource scan context. */
function resolveSettlementContext(
  cell: SettlementCell,
  seed: number,
  sampleHeight: HeightSampler,
  waterLevel: number,
  localSearchRadius: number,
  terrainSamplers: TerrainSamplers,
  heightScale: number,
  region: RegionParams,
  homeSize: HomeVillageSize = 'auto',
): SettlementGenContext {
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
  // generowane niezależnie od wiosek"), not re-randomized per settlement.
  const candidateResources = resourcesNear(
    center.x,
    center.z,
    localSearchRadius + RESOURCE_ATTRACTION_MARGIN,
    seed,
    resourceEnv,
  )
  const resourceAttraction = (x: number, z: number): number => resourceAttractionAt(x, z, candidateResources)

  // Provisional size for footprint-aware site search (plan 047 §6): classify
  // terrain at the cell center, roll size once, then lock that roll after the
  // site is chosen (OUTPOST may still override). Final naming/terrain flavor
  // still uses classification at the *selected* site.
  // Home may override the roll via `WorldConfig.settlements.homeSize` (issue 020).
  const centerY = sampleHeight(center.x, center.z)
  const provisionalTerrain = classifySettlementTerrain(
    center.x,
    center.z,
    centerY,
    waterLevel,
    heightScale,
    region,
    terrainSamplers,
  )
  const provisionalSize =
    isHome && homeSize !== 'auto'
      ? homeSize
      : rollVillageSize(provisionalTerrain, seedForCell)

  return {
    cell,
    seed,
    seedForCell,
    isHome,
    center,
    resourceEnv,
    resourceAttraction,
    sampleHeight,
    waterLevel,
    localSearchRadius,
    terrainSamplers,
    heightScale,
    region,
    provisionalSize,
  }
}

/** Step 2: footprint-aware site search using `provisionalSize` knobs. */
function chooseSettlementSite(ctx: SettlementGenContext): { x: number, z: number, y: number } {
  const sizeCfg = villageSizeConfig(ctx.provisionalSize)
  return findSettlementSite(
    ctx.sampleHeight,
    ctx.waterLevel,
    ctx.localSearchRadius,
    ctx.seedForCell,
    ctx.center,
    ctx.resourceAttraction,
    { footprintRadius: sizeCfg.footprintRadius, houseRingMax: sizeCfg.houseRingMax },
  )
}

/** Step 3: terrain + resources + locked size + naming → `VillageIdentity`. */
function resolveVillageIdentity(
  ctx: SettlementGenContext,
  site: { x: number, z: number, y: number },
): VillageIdentity {
  const terrain = classifySettlementTerrain(
    site.x,
    site.z,
    site.y,
    ctx.waterLevel,
    ctx.heightScale,
    ctx.region,
    ctx.terrainSamplers,
  )
  const dominantResource = dominantResourceNear(
    site.x,
    site.z,
    RESOURCE_INFLUENCE_RADIUS,
    ctx.seed,
    ctx.resourceEnv,
  )
  const nameCulture = pickNameCulture(ctx.seedForCell)

  // Resource Outposts (§7) — never for the home settlement.
  const isOutpost =
    !ctx.isHome &&
    terrain === 'mountain' &&
    dominantResource !== null &&
    dominantResource.richness >= OUTPOST_RICHNESS_THRESHOLD &&
    RESOURCE_ROLE[dominantResource.type] !== undefined &&
    rollIsOutpost(ctx.seedForCell)

  // Lock provisional size — do not call `rollVillageSize` again (plan 047 §6).
  const size = isOutpost ? 'OUTPOST' : ctx.provisionalSize
  const name = generateSettlementName(ctx.seedForCell, terrain, dominantResource)
  const foodSourceType = foodSourceTypeFor(terrain, dominantResource)

  return {
    id: cellKey(ctx.cell),
    cell: { gx: ctx.cell.gx, gz: ctx.cell.gz },
    isHome: ctx.isHome,
    size,
    terrain,
    dominantResource,
    foodSourceType,
    name,
    nameCulture,
  }
}

/** Steps 4–9: identity + site + families → authoritative `VillagePlan` with
 *  boundary/center/pattern/zones/plots/buildings/landmarks/paths/entrances.
 *  Clearings still compatibility-projected separately until terrain adapter. */
function createVillagePlan(
  identity: VillageIdentity,
  site: { x: number, z: number, y: number },
  families: readonly FamilyDef[],
  seedForCell: number,
  sampleHeight: HeightSampler,
  waterLevel: number,
): VillagePlan {
  const sizeCfg = villageSizeConfig(identity.size)
  const layout = planVillageLayout(identity, site, families, seedForCell, sampleHeight, waterLevel)
  return {
    identity,
    site: { x: site.x, z: site.z, y: site.y, radius: sizeCfg.footprintRadius },
    boundary: layout.boundary,
    center: layout.center,
    pattern: layout.pattern,
    zones: layout.zones,
    plots: layout.plots,
    buildings: layout.buildings,
    landmarks: layout.landmarks,
    paths: layout.paths,
    entrances: layout.entrances,
  }
}

type SettlementCore = {
  plan: VillagePlan
  families: FamilyDef[]
  seedForCell: number
  sampleHeight: HeightSampler
  waterLevel: number
  region: RegionParams
}

/** Single generation pass shared by `generateVillagePlan` / `generateSettlementDef`. */
function generateSettlementCore(
  cell: SettlementCell,
  seed: number,
  sampleHeight: HeightSampler,
  waterLevel: number,
  localSearchRadius: number,
  terrainSamplers: TerrainSamplers,
  heightScale: number,
  region: RegionParams,
  homeSize: HomeVillageSize = 'auto',
): SettlementCore {
  const ctx = resolveSettlementContext(
    cell,
    seed,
    sampleHeight,
    waterLevel,
    localSearchRadius,
    terrainSamplers,
    heightScale,
    region,
    homeSize,
  )
  const site = chooseSettlementSite(ctx)
  const identity = resolveVillageIdentity(ctx, site)
  const families = generateFamilies(
    ctx.seedForCell,
    identity.size,
    identity.isHome,
    identity.nameCulture,
    identity.dominantResource,
  )
  const plan = attachPlannedDock(
    createVillagePlan(
      identity,
      site,
      families,
      ctx.seedForCell,
      ctx.sampleHeight,
      ctx.waterLevel,
    ),
    {
      sampleHeight: ctx.sampleHeight,
      sampleContinentalness: ctx.terrainSamplers.sampleContinentalness,
      region: ctx.region,
      dockSearchRadius: ctx.region.roadNetwork.dockSearchRadius,
    },
  )
  return {
    plan,
    families,
    seedForCell: ctx.seedForCell,
    sampleHeight: ctx.sampleHeight,
    waterLevel: ctx.waterLevel,
    region: ctx.region,
  }
}

/** Attach a dock landmark (+ path) when ocean/fishing and a shore exists —
 *  plan 047 step 13. Analytic search matches `minorLocations`; result is
 *  stored on the plan so runtime adapters do not invent a second dock. */
function attachPlannedDock(
  plan: VillagePlan,
  opts: {
    sampleHeight: HeightSampler
    sampleContinentalness: (x: number, z: number) => number
    region: RegionParams
    dockSearchRadius: number
  },
): VillagePlan {
  if (plan.landmarks.some((l) => l.kind === 'dock')) return plan
  if (plan.identity.terrain !== 'ocean' && plan.identity.foodSourceType !== 'fishing') return plan

  const dock = findDockLocation(
    plan.site,
    opts.sampleHeight,
    opts.sampleContinentalness,
    opts.region,
    opts.dockSearchRadius,
  )
  if (!dock) return plan

  const dockLandmark = {
    id: 'landmark-dock-0',
    kind: 'dock' as const,
    x: dock.x,
    z: dock.z,
    y: dock.y,
    rotation: dock.angle,
    plotId: null,
    index: 0,
  }
  const dockPath = {
    id: 'path-dock-0',
    points: [
      { x: plan.center.x, z: plan.center.z },
      { x: dock.x, z: dock.z },
    ],
    halfWidth: 1.5,
    kind: 'path' as const,
  }
  return {
    ...plan,
    landmarks: [...plan.landmarks, dockLandmark],
    paths: [...plan.paths, dockPath],
  }
}

/**
 * Authoritative plan generation seam (plan 047 §9.3):
 * context → site → identity → families → VillagePlan (zones/plots).
 */
export function generateVillagePlan(
  cell: SettlementCell,
  seed: number,
  sampleHeight: HeightSampler,
  waterLevel: number,
  localSearchRadius: number,
  terrainSamplers: TerrainSamplers,
  heightScale: number,
  region: RegionParams,
  homeSize: HomeVillageSize = 'auto',
): VillagePlan {
  return generateSettlementCore(
    cell,
    seed,
    sampleHeight,
    waterLevel,
    localSearchRadius,
    terrainSamplers,
    heightScale,
    region,
    homeSize,
  ).plan
}

/** Compatibility projection: one plan + families + clearings → `SettlementDef`.
 *  Must not invent a second site/size/name — all identity fields come from
 *  `plan.identity` / `plan.site`. */
function settlementDefFromPlan(
  plan: VillagePlan,
  families: readonly FamilyDef[],
  clearings: ClearingLayout,
): SettlementDef {
  const { identity, site } = plan
  return {
    id: identity.id,
    gx: identity.cell.gx,
    gz: identity.cell.gz,
    x: site.x,
    z: site.z,
    y: site.y,
    size: identity.size,
    families,
    clearings,
    isHome: identity.isHome,
    terrain: identity.terrain,
    name: identity.name,
    nameCulture: identity.nameCulture,
    dominantResource: identity.dominantResource,
    foodSourceType: identity.foodSourceType,
    plan,
  }
}

/** Generates a settlement's site + metadata for a grid cell, seeded
 *  deterministically from the world seed — same seed ⇒ same layout.
 *
 *  Thin compatibility wrapper over `generateSettlementCore` (plan 047): one
 *  generation pass, then clearings + `SettlementDef` projection.
 *  Order still follows plan 032 §1's "teren → środowisko → zasoby → wioski".
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
  homeSize: HomeVillageSize = 'auto',
): SettlementDef {
  const { plan, families, sampleHeight: height, region: reg } =
    generateSettlementCore(
      cell,
      seed,
      sampleHeight,
      waterLevel,
      localSearchRadius,
      terrainSamplers,
      heightScale,
      region,
      homeSize,
    )
  const clearings = layoutClearingsFromPlan(plan, height, reg.village)
  return settlementDefFromPlan(plan, families, clearings)
}
