import { MathUtils } from 'three'
import type { Role } from '../ai/characters'
import type { HeightSampler } from '../player/PlayerController'
import type { RegionParams } from './chunkHeightmap'
import { createSeededRandom } from '../world/parseSeed'
import { biomeWeightsAt } from './biomeRegions'

/**
 * Natural resources (plan 032) — generated independently of settlements, as a
 * deterministic function of world position + seed, queried on demand by
 * `settlement/settlementGenerator.ts` (site attractiveness, dedicated family/
 * role, food source flavor, settlement naming). No world-visible geometry in
 * v1 — "Na tym etapie nie tworzymy jeszcze pełnego inventory zasobu" (plan
 * §4) — this is a settlement-generation-time data layer, not a
 * collectible/interactable world object (unlike `items/`).
 *
 * Deliberately a small pool per the plan's own advice ("Pula na początku
 * powinna być niewielka i możliwa do późniejszego rozszerzania") — generic
 * wood/stone are left out since the game already has forest/rock terrain
 * everywhere as ambient world content; these are the resources specific/
 * significant enough to justify a dedicated family, food source, or name.
 */
export type ResourceType =
  | 'clay'
  | 'fertile_soil'
  | 'fish'
  | 'gold'
  | 'herbs'
  | 'iron'
  | 'resin'
  | 'salt'

export const RESOURCE_TYPES: readonly ResourceType[] = [
  'iron', 'gold', 'fish', 'fertile_soil', 'clay', 'salt', 'resin', 'herbs',
]

export type NaturalResource = {
  type: ResourceType
  x: number
  z: number
  radius: number
  /** 0..1 — how significant this deposit is. Feeds site-attractiveness
   *  scoring, the "is this worth a dedicated family/outpost/name" gate
   *  (`SIGNIFICANT_RICHNESS`), and (in the future) production yield. */
  richness: number
}

/** Above this `richness`, a resource is worth a dedicated family (§6), a
 *  name mention (§9), or — combined with harsh terrain — an outpost (§7).
 *  Below it, a resource still nudges site selection (§5) and food-source
 *  flavor (§8) but isn't "significant" on its own. */
export const SIGNIFICANT_RICHNESS = 0.55

/** Only resource types with a clean 1:1 role mapping spawn a dedicated
 *  family/outpost NPC in v1 — clay/salt/resin/herbs stay naming/food-source
 *  flavor only (no natural role to force without inventing one; `ai/
 *  characters.ts`'s `Role` stays a closed, curated pool). */
export const RESOURCE_ROLE: Partial<Record<ResourceType, Role>> = {
  iron: 'miner',
  gold: 'miner',
  fish: 'fisher',
  fertile_soil: 'farmer',
}

/** World-unit spacing of the resource grid — finer than `SETTLEMENT_GRID_STEP`
 *  (280, see `settlementGenerator.ts`) so several candidate deposits surround
 *  any given settlement site, matching plan §1's "teren → środowisko →
 *  zasoby → wioski" ordering (resources exist at a finer grain than villages). */
const RESOURCE_GRID_STEP = 90
const CELL_JITTER = RESOURCE_GRID_STEP * 0.35

/** Most cells are barren — resources are meant to be a sparse, occasional
 *  find, not a wall-to-wall grid. Scales the roll a cell's own environmental
 *  fit (`totalWeight`, always <= ~3 given the weight functions below) needs
 *  to clear before it spawns anything at all — tuned so a "generic" mid-range
 *  environment lands well under half occupancy (see `naturalResources.test
 *  .ts`'s sparsity test). */
const RESOURCE_DENSITY_SCALE = 0.1

const MIN_RADIUS = 8
const RADIUS_RANGE = 12

/** How far out (world units) a deposit's own ring-scan looks for adjacent
 *  water when classifying "near water" (rivers/lakes/coast) — a resource
 *  itself sits on dry land (fish are caught *from* the shore, not spawned
 *  underwater), but several preferences (fish/fertile_soil/clay/gold) care
 *  about proximity to water the way `villageClearing.ts`'s `pathIsDry`
 *  already cares about it for house placement. */
const NEAR_WATER_SEARCH_RADIUS = 24
const NEAR_WATER_SAMPLE_COUNT = 8

/** Minimum clearance above `waterLevel` for the deposit's own position —
 *  same margin `findSettlementSite`/`villageClearing` use elsewhere. */
const LAND_MARGIN = 0.5

export type ResourceEnv = {
  sampleHeight: HeightSampler
  sampleContinentalness: (x: number, z: number) => number
  sampleMountainRidge: (x: number, z: number) => number
  sampleMoistureRegion: (x: number, z: number) => number
  waterLevel: number
  heightScale: number
  region: RegionParams
}

type ResourceCell = { rx: number, rz: number }

function worldToResourceCell(x: number, z: number): ResourceCell {
  return { rx: Math.round(x / RESOURCE_GRID_STEP), rz: Math.round(z / RESOURCE_GRID_STEP) }
}

/** Deterministic per-cell seed — same xor/imul-hash idiom as `settlementGenerator
 *  .ts`'s `cellSeed`, just with different magic constants so the two grids'
 *  streams don't correlate. */
function resourceCellSeed(seed: number, cell: ResourceCell): number {
  let h = (cell.rx * 668265263 + cell.rz * 374761393) | 0
  h = (h ^ (h >>> 13)) | 0
  h = Math.imul(h, 2246822519)
  h = (h ^ (h >>> 16)) | 0
  return (seed ^ h ^ 0x4e415452) >>> 0
}

function isNearWater(x: number, z: number, env: ResourceEnv): boolean {
  for (let i = 0; i < NEAR_WATER_SAMPLE_COUNT; i++) {
    const angle = (i / NEAR_WATER_SAMPLE_COUNT) * Math.PI * 2
    const sx = x + Math.cos(angle) * NEAR_WATER_SEARCH_RADIUS
    const sz = z + Math.sin(angle) * NEAR_WATER_SEARCH_RADIUS
    if (env.sampleHeight(sx, sz) <= env.waterLevel) return true
  }
  return false
}

/** How well each resource type fits the sampled environment (§3's table,
 *  expressed as weights on existing terrain axes instead of a new biome
 *  split — `continentalness`/`mountainRidge`/`moistureRegion` are exactly
 *  what `terrain/`'s own biome rendering already uses). Every type gets a
 *  nonzero weight everywhere — "Preferencja nie powinna być twardym
 *  ograniczeniem" (§3) — just biased toward its ideal environment. */
function resourceWeights(
  continentalness: number,
  mountainRidge: number,
  altitude01: number,
  nearWater: boolean,
  biome: { desert: number, swamp: number, forest: number },
  region: RegionParams,
): Record<ResourceType, number> {
  // Peaks right around the coastline band (§3: "sól: wybrzeże") — fades both
  // out to open ocean and further inland.
  const coastal =
    MathUtils.smoothstep(continentalness, region.oceanThreshold, region.coastThreshold) *
    (1 - MathUtils.smoothstep(continentalness, region.coastThreshold, region.coastThreshold + 0.15))

  return {
    iron: 0.15 + mountainRidge * 0.9 + altitude01 * 0.25,
    gold: 0.05 + mountainRidge * 0.65 + (nearWater ? 0.3 : 0),
    fish: nearWater ? 0.9 : 0.02,
    fertile_soil: (nearWater ? 0.75 : 0.08) * (0.3 + biome.forest * 0.7),
    clay: (nearWater ? 0.6 : 0.08) * (0.35 + biome.swamp * 0.65),
    salt: 0.1 + coastal * 0.85 + biome.desert * 0.3,
    resin: 0.1 + biome.forest * 0.8,
    herbs: 0.25 + biome.forest * 0.35 + (nearWater ? 0.15 : 0),
  }
}

/** The one deposit (if any) generated at resource-grid cell `cell` — pure
 *  function of `(seed, cell, env)`, so callers can query any area without a
 *  pregeneration pass (same "compute on demand" spirit as `chunkHeightmap
 *  .ts`'s analytic samplers). */
function resourceAtCell(cell: ResourceCell, seed: number, env: ResourceEnv): NaturalResource | null {
  const seedForCell = resourceCellSeed(seed, cell)
  const random = createSeededRandom(seedForCell)
  const x = cell.rx * RESOURCE_GRID_STEP + (random() * 2 - 1) * CELL_JITTER
  const z = cell.rz * RESOURCE_GRID_STEP + (random() * 2 - 1) * CELL_JITTER

  const h = env.sampleHeight(x, z)
  if (h <= env.waterLevel + LAND_MARGIN) return null

  const continentalness = env.sampleContinentalness(x, z)
  const mountainRidge = env.sampleMountainRidge(x, z)
  const moistureRegion = env.sampleMoistureRegion(x, z)
  const altitude01 = MathUtils.clamp((h - env.waterLevel) / Math.max(env.heightScale, 0.001), 0, 1)
  const nearWater = isNearWater(x, z, env)
  const biome = biomeWeightsAt(moistureRegion, altitude01, env.region)

  const weights = resourceWeights(continentalness, mountainRidge, altitude01, nearWater, biome, env.region)
  const totalWeight = RESOURCE_TYPES.reduce((sum, t) => sum + weights[t], 0)

  if (random() > totalWeight * RESOURCE_DENSITY_SCALE) return null

  let roll = random() * totalWeight
  let picked: ResourceType = 'herbs'
  for (const type of RESOURCE_TYPES) {
    roll -= weights[type]
    if (roll <= 0) {
      picked = type
      break
    }
  }

  const bestWeight = Math.max(...RESOURCE_TYPES.map((t) => weights[t]))
  const fit = bestWeight > 0 ? weights[picked] / bestWeight : 0
  const richness = MathUtils.clamp(0.2 + fit * 0.5 + random() * 0.3, 0, 1)
  const radius = MIN_RADIUS + random() * RADIUS_RANGE

  return { type: picked, x, z, radius, richness }
}

/** All resources within `radius` of `(x, z)` — scans the handful of resource
 *  grid cells that could possibly overlap, evaluating each deterministically. */
export function resourcesNear(
  x: number,
  z: number,
  radius: number,
  seed: number,
  env: ResourceEnv,
): NaturalResource[] {
  const cellRadius = Math.ceil((radius + RESOURCE_GRID_STEP * 0.5) / RESOURCE_GRID_STEP)
  const center = worldToResourceCell(x, z)
  const out: NaturalResource[] = []
  for (let drz = -cellRadius; drz <= cellRadius; drz++) {
    for (let drx = -cellRadius; drx <= cellRadius; drx++) {
      const resource = resourceAtCell({ rx: center.rx + drx, rz: center.rz + drz }, seed, env)
      if (!resource) continue
      if (Math.hypot(resource.x - x, resource.z - z) > radius) continue
      out.push(resource)
    }
  }
  return out
}

/** The single most significant resource within `radius`, or null. */
export function dominantResourceNear(
  x: number,
  z: number,
  radius: number,
  seed: number,
  env: ResourceEnv,
): NaturalResource | null {
  const found = resourcesNear(x, z, radius, seed, env)
  if (found.length === 0) return null
  return found.reduce((best, r) => (r.richness > best.richness ? r : best))
}

/** How far a deposit's influence on site-attractiveness (§5) reaches beyond
 *  its own `radius`, in multiples of it — a wide, soft falloff rather than a
 *  hard cutoff, since "wioska nie musi znajdować się przy zasobie" (§5). */
const ATTRACTION_FALLOFF_RADII = 6

/** Site-attractiveness contribution (0..1-ish, unbounded on the low end but
 *  clamped) of `resources` at `(x, z)` — consumed by `findSettlementSite`'s
 *  candidate scoring as an additive bonus alongside flatness/dryness, so a
 *  significant nearby resource can tip the choice between two similarly flat
 *  candidates without ever overriding the flatness/water gate itself. */
export function resourceAttractionAt(x: number, z: number, resources: readonly NaturalResource[]): number {
  let sum = 0
  for (const r of resources) {
    const dist = Math.hypot(r.x - x, r.z - z)
    const influence = Math.max(0, 1 - dist / (r.radius * ATTRACTION_FALLOFF_RADII))
    sum += influence * r.richness
  }
  return Math.min(1, sum)
}
