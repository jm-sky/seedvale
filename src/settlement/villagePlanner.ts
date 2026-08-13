import type { HeightSampler } from '../player/PlayerController'
import type { FamilyDef } from './families'
import type {
  VillageBoundary,
  VillageBuildingPlan,
  VillageBuildingRole,
  VillageCenter,
  VillageEntrance,
  VillageIdentity,
  VillageLandmarkKind,
  VillageLandmarkPlan,
  VillageLayoutPattern,
  VillagePathPlan,
  VillagePlot,
  VillagePlotRole,
  VillageZone,
  VillageZoneKind,
} from './villagePlan'
import { projectOntoSegment } from '../math/segment'
import { RESOURCE_ROLE, SIGNIFICANT_RICHNESS } from '../terrain/naturalResources'
import { createSeededRandom } from '../world/parseSeed'
import { villageSizeConfig } from './families'
import {
  gardenPlazaMinCenterDist,
  gardenPlotRadius,
  type GardenScale,
  gardenUnitsFromHouses,
  packGardenScales,
} from './gardenScale'
import { pathIsDry, SETTLEMENT_WATER_MARGIN } from './pathDryness'
import { plazaCoreRadius } from './villageClearing'

/** Matches `worldConfig.settlement.clearing.coreRadius` — used to size
 *  plaza-relative infrastructure (campfire on packed dirt; gardens off it). */
const DEFAULT_PLAZA_CORE_RADIUS = 9

/** Shared plot-placement weights (plan 047 §8) — one table for every role. */
export const PLOT_SCORE_WEIGHTS = {
  slope: 2.2,
  heightSpread: 1.6,
  distToZone: 0.06,
  /** Houses prefer a ring away from the plaza; infrastructure prefers near it. */
  distToCenterHouse: 0.04,
  distToCenterInfra: 0.12,
  pathDryBonus: 4.5,
  spacingPenalty: 10,
  outsideBoundaryPenalty: 25,
  preferredRingPenalty: 0.15,
  resourcePull: 2.5,
} as const

const LOCAL_SLOPE_STEP = 2.2
const PLOT_CANDIDATE_ATTEMPTS = 10
const HOUSE_PLOT_RADIUS = 4.5
const INFRA_PLOT_RADIUS = 2.4
const WORK_PLOT_RADIUS = 5.5
const FOOD_PLOT_RADIUS = 6
const LIVESTOCK_PLOT_RADIUS = 5

export type VillageLayoutDraft = {
  boundary: VillageBoundary
  center: VillageCenter
  pattern: VillageLayoutPattern
  zones: readonly VillageZone[]
  plots: readonly VillagePlot[]
  buildings: readonly VillageBuildingPlan[]
  landmarks: readonly VillageLandmarkPlan[]
  paths: readonly VillagePathPlan[]
  entrances: readonly VillageEntrance[]
}

/** Local path half-widths (plan 047 §9) — numeric corridor hints, not the
 *  global `RoadNetwork` road width table. */
const LOCAL_PATH_HALF_WIDTH = 1.5
const LOCAL_ROAD_HALF_WIDTH = 2.4
const ENTRANCE_CANDIDATE_JITTERS = 7
const PATH_POLYLINE_SAMPLES = 3
/**
 * Lateral clearance from a future center→house dirt path. Paths are planned
 * after plots (`planLocalPathsAndEntrances`), so house scoring anticipates
 * those spokes — otherwise a cottage on the plaza rim can sit on the path
 * to a neighbour further out.
 */
const HOUSE_SPOKE_CLEARANCE = LOCAL_PATH_HALF_WIDTH + HOUSE_PLOT_RADIUS * 0.55

/**
 * Deterministic base layout pattern from identity + seed (plan 047 §7).
 * Chooses axes/region strategy only — plot positions still go through the
 * shared scorer.
 */
export function chooseLayoutPattern(
  identity: Pick<VillageIdentity, 'terrain' | 'foodSourceType' | 'size' | 'isHome'>,
  seedForCell: number,
): VillageLayoutPattern {
  if (identity.size === 'OUTPOST') return 'clustered'
  if (identity.foodSourceType === 'fishing' || identity.terrain === 'ocean') return 'waterfront'
  if (identity.terrain === 'mountain') return 'clustered'
  if (identity.size === 'XL' || identity.size === 'LG') {
    const random = createSeededRandom(seedForCell ^ 0x7a70a7)
    return random() < 0.45 ? 'roadside' : 'central'
  }
  if (identity.terrain === 'desert' || identity.terrain === 'swamp') return 'linear'
  if (identity.isHome) return 'central'
  const random = createSeededRandom(seedForCell ^ 0x7a70a7)
  const roll = random()
  if (roll < 0.55) return 'central'
  if (roll < 0.8) return 'clustered'
  return 'linear'
}

function primaryAxisAngle(seedForCell: number): number {
  const random = createSeededRandom(seedForCell ^ 0xa51)
  return random() * Math.PI * 2
}

/** Lowest-height direction within the footprint — proxy for water / downhill. */
function downhillAngle(
  cx: number,
  cz: number,
  radius: number,
  sampleHeight: HeightSampler,
): number {
  let bestAngle = 0
  let bestH = Infinity
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    const h = sampleHeight(cx + Math.cos(angle) * radius * 0.85, cz + Math.sin(angle) * radius * 0.85)
    if (h < bestH) {
      bestH = h
      bestAngle = angle
    }
  }
  return bestAngle
}

function zoneKindsFor(identity: VillageIdentity): VillageZoneKind[] {
  const budget = villageSizeConfig(identity.size).zoneBudget
  const kinds: VillageZoneKind[] = ['public', 'residential']
  if (budget.utility > 0) kinds.push('utility')
  if (budget.food > 0) kinds.push('food')
  if (budget.livestock > 0) kinds.push('livestock')
  const wantsProduction =
    budget.production > 0 &&
    identity.dominantResource !== null &&
    identity.dominantResource.richness >= SIGNIFICANT_RICHNESS &&
    RESOURCE_ROLE[identity.dominantResource.type] !== undefined
  if (wantsProduction) kinds.push('production')
  return kinds
}

function zoneRadiusFor(kind: VillageZoneKind, footprintRadius: number): number {
  switch (kind) {
    case 'food':
      return Math.max(8, footprintRadius * 0.28)
    case 'livestock':
      return Math.max(7, footprintRadius * 0.22)
    case 'production':
      return Math.max(7, footprintRadius * 0.24)
    case 'public':
      return Math.max(8, footprintRadius * 0.18)
    case 'residential':
      return Math.max(12, footprintRadius * 0.42)
    case 'utility':
      return Math.max(6, footprintRadius * 0.2)
  }
}

function zoneOffset(
  kind: VillageZoneKind,
  pattern: VillageLayoutPattern,
  footprintRadius: number,
  axis: number,
  waterAngle: number,
  random: () => number,
): { dx: number, dz: number } {
  const jitter = () => (random() - 0.5) * footprintRadius * 0.08
  const at = (angle: number, dist: number) => ({
    dx: Math.cos(angle) * dist + jitter(),
    dz: Math.sin(angle) * dist + jitter(),
  })

  if (kind === 'public') return { dx: jitter() * 0.3, dz: jitter() * 0.3 }

  switch (pattern) {
    case 'central': {
      const slot: Record<Exclude<VillageZoneKind, 'public'>, number> = {
        residential: axis,
        food: axis + 2.1,
        production: axis + 4.0,
        livestock: axis + 5.2,
        utility: axis + 1.0,
      }
      const dist =
        kind === 'residential' ? footprintRadius * 0.12 : footprintRadius * (0.38 + random() * 0.08)
      return at(slot[kind], dist)
    }
    case 'clustered': {
      const slot: Record<Exclude<VillageZoneKind, 'public'>, number> = {
        residential: axis + 0.4,
        food: axis + 2.0,
        production: axis + 3.6,
        livestock: axis + 4.8,
        utility: axis + 1.2,
      }
      return at(slot[kind], footprintRadius * (0.18 + random() * 0.1))
    }
    case 'linear': {
      const along: Record<Exclude<VillageZoneKind, 'public'>, number> = {
        residential: footprintRadius * 0.15,
        food: footprintRadius * 0.45,
        production: -footprintRadius * 0.4,
        livestock: footprintRadius * 0.3,
        utility: -footprintRadius * 0.15,
      }
      const dist = along[kind]
      return {
        dx: Math.cos(axis) * dist + jitter(),
        dz: Math.sin(axis) * dist + jitter(),
      }
    }
    case 'roadside': {
      // Road axis = `axis`; residential on +perp, work/food on −perp.
      const perp = axis + Math.PI * 0.5
      if (kind === 'residential') return at(perp, footprintRadius * 0.28)
      if (kind === 'production' || kind === 'food') return at(perp + Math.PI, footprintRadius * 0.32)
      if (kind === 'livestock') return at(perp, footprintRadius * 0.4)
      return at(axis + Math.PI, footprintRadius * 0.2)
    }
    case 'waterfront': {
      if (kind === 'food') return at(waterAngle, footprintRadius * 0.4)
      if (kind === 'residential') return at(waterAngle + Math.PI, footprintRadius * 0.28)
      if (kind === 'production') return at(waterAngle + 1.2, footprintRadius * 0.35)
      if (kind === 'livestock') return at(waterAngle + Math.PI + 0.6, footprintRadius * 0.3)
      return at(waterAngle + Math.PI, footprintRadius * 0.15)
    }
  }
}

function generateZones(
  identity: VillageIdentity,
  center: VillageCenter,
  boundary: VillageBoundary,
  pattern: VillageLayoutPattern,
  seedForCell: number,
  sampleHeight: HeightSampler,
): VillageZone[] {
  const random = createSeededRandom(seedForCell ^ 0x20e1)
  const axis = primaryAxisAngle(seedForCell)
  const waterAngle = downhillAngle(center.x, center.z, boundary.radius, sampleHeight)
  const kinds = zoneKindsFor(identity)
  return kinds.map((kind) => {
    const { dx, dz } = zoneOffset(kind, pattern, boundary.radius, axis, waterAngle, random)
    return {
      id: `zone-${kind}`,
      kind,
      x: center.x + dx,
      z: center.z + dz,
      radius: zoneRadiusFor(kind, boundary.radius),
    }
  })
}

function tieBreakNoise(seedForCell: number, plotId: string): number {
  let h = (seedForCell ^ 0x71eb4ea) >>> 0
  for (let i = 0; i < plotId.length; i++) {
    h = Math.imul(h ^ plotId.charCodeAt(i), 0x9e3779b1) >>> 0
  }
  return (h >>> 0) / 4294967295 * 1e-4
}

function localSlope(x: number, z: number, y: number, sampleHeight: HeightSampler): number {
  const step = LOCAL_SLOPE_STEP
  const samples = [
    sampleHeight(x + step, z),
    sampleHeight(x - step, z),
    sampleHeight(x, z + step),
    sampleHeight(x, z - step),
  ]
  return Math.max(...samples.map((h) => Math.abs(h - y)))
}

function heightSpread(x: number, z: number, radius: number, sampleHeight: HeightSampler): number {
  const pts: readonly [number, number][] = [
    [0, 0],
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
  ]
  let min = Infinity
  let max = -Infinity
  for (const [dx, dz] of pts) {
    const h = sampleHeight(x + dx, z + dz)
    if (h < min) min = h
    if (h > max) max = h
  }
  return max - min
}

function minDistToPlots(x: number, z: number, plots: readonly VillagePlot[]): number {
  let min = Infinity
  for (const p of plots) {
    const d = Math.hypot(x - p.x, z - p.z) - p.radius
    if (d < min) min = d
  }
  return min
}

/**
 * True when `(x,z)` would sit on (or block) a plaza→house spoke for any
 * already-placed house — mid-segment only; near the house pad itself is
 * handled by ordinary plot spacing.
 */
function blocksHouseSpoke(
  x: number,
  z: number,
  center: VillageCenter,
  existingHouses: readonly VillagePlot[],
  clearance: number,
): boolean {
  const clearanceSq = clearance * clearance
  for (const house of existingHouses) {
    // Candidate on the path to an existing house?
    const toExisting = projectOntoSegment(x, z, center.x, center.z, house.x, house.z)
    if (toExisting.t > 0.1 && toExisting.t < 0.9 && toExisting.distSq < clearanceSq) {
      return true
    }
    // Existing house on the path to this candidate (closer cottage on the same ray)?
    const toCandidate = projectOntoSegment(house.x, house.z, center.x, center.z, x, z)
    if (toCandidate.t > 0.1 && toCandidate.t < 0.9 && toCandidate.distSq < clearanceSq) {
      return true
    }
  }
  return false
}

type PlotPlacementRequest = {
  id: string
  role: VillagePlotRole
  zone: VillageZone | null
  radius: number
  familyIndex: number | null
  familyId: string | null
  /** Preferred distance from village center (houses). */
  preferredRing?: number
  /** Hard reject when closer than this to plaza center (gardens stay off the square). */
  minCenterDist?: number
  /** Hard reject when farther than this (campfire stays on plaza dirt). */
  maxCenterDist?: number
  /** Prefer proximity to this point (resource / related plot). */
  attractor?: { x: number, z: number } | null
  /** Force exact position (well at plaza) — still records a plot. */
  forced?: { x: number, z: number } | null
}

function scorePlotCandidate(
  x: number,
  z: number,
  y: number,
  req: PlotPlacementRequest,
  center: VillageCenter,
  boundary: VillageBoundary,
  existing: readonly VillagePlot[],
  seedForCell: number,
  sampleHeight: HeightSampler,
  waterLevel: number,
  minSpacing: number,
): number | null {
  if (y <= waterLevel + SETTLEMENT_WATER_MARGIN) return null

  const slope = localSlope(x, z, y, sampleHeight)
  if (slope > 3.2) return null

  const spread = heightSpread(x, z, req.radius * 0.7, sampleHeight)
  if (spread > 4.5) return null

  if (!pathIsDry(center.x, center.z, x, z, waterLevel, sampleHeight)) return null

  const clearance = minDistToPlots(x, z, existing)
  if (Number.isFinite(clearance) && clearance < minSpacing) return null

  if (req.role === 'house') {
    const houses = existing.filter((p) => p.role === 'house')
    if (houses.length > 0 && blocksHouseSpoke(x, z, center, houses, HOUSE_SPOKE_CLEARANCE)) {
      return null
    }
  }

  const w = PLOT_SCORE_WEIGHTS
  const distCenter = Math.hypot(x - center.x, z - center.z)
  if (req.minCenterDist != null && distCenter < req.minCenterDist) return null
  if (req.maxCenterDist != null && distCenter > req.maxCenterDist) return null

  const outside = distCenter + req.radius - boundary.radius

  let score =
    10 -
    slope * w.slope -
    spread * w.heightSpread +
    w.pathDryBonus +
    tieBreakNoise(seedForCell, req.id)

  if (outside > 0) score -= outside * w.outsideBoundaryPenalty

  if (req.zone) {
    score -= Math.hypot(x - req.zone.x, z - req.zone.z) * w.distToZone
  }

  if (req.role === 'house' || req.role === 'livestock') {
    score -= Math.abs(distCenter - (req.preferredRing ?? distCenter)) * w.preferredRingPenalty
    score -= distCenter * w.distToCenterHouse * 0.25
  } else if (req.preferredRing != null) {
    // Campfire / market: stay near the requested plaza ring rather than
    // collapsing onto the well or drifting onto grass outside the square.
    score -= Math.abs(distCenter - req.preferredRing) * w.preferredRingPenalty
  } else {
    score -= distCenter * w.distToCenterInfra
  }

  if (req.attractor) {
    score -= Math.hypot(x - req.attractor.x, z - req.attractor.z) * 0.05
    // Mild pull toward resource without overriding terrain gates.
    score += (1 / (1 + Math.hypot(x - req.attractor.x, z - req.attractor.z) * 0.02)) * w.resourcePull
  }

  if (Number.isFinite(clearance) && clearance < minSpacing * 2) {
    score -= (minSpacing * 2 - clearance) * w.spacingPenalty * 0.15
  }

  return score
}

function pickPlot(
  req: PlotPlacementRequest,
  center: VillageCenter,
  boundary: VillageBoundary,
  existing: readonly VillagePlot[],
  seedForCell: number,
  sampleHeight: HeightSampler,
  waterLevel: number,
  houseSpacing: number,
): VillagePlot {
  if (req.forced) {
    const y = sampleHeight(req.forced.x, req.forced.z)
    return {
      id: req.id,
      role: req.role,
      x: req.forced.x,
      z: req.forced.z,
      y,
      radius: req.radius,
      rotation: tieBreakNoise(seedForCell, req.id) * 100,
      zoneId: req.zone?.id ?? null,
      familyIndex: req.familyIndex,
      familyId: req.familyId,
    }
  }

  const random = createSeededRandom(seedForCell ^ hashPlotId(req.id))
  const minSpacing = req.role === 'house' ? houseSpacing * 0.55 : req.radius * 1.4
  const zone = req.zone
  const baseAngle = zone
    ? Math.atan2(zone.z - center.z, zone.x - center.x)
    : primaryAxisAngle(seedForCell ^ hashPlotId(req.id))
  const preferredRing =
    req.preferredRing ??
    (zone ? Math.hypot(zone.x - center.x, zone.z - center.z) : boundary.radius * 0.35)

  let best: VillagePlot | null = null
  let bestScore = -Infinity

  const attempts = req.role === 'house' ? PLOT_CANDIDATE_ATTEMPTS * 2 : PLOT_CANDIDATE_ATTEMPTS
  for (let attempt = 0; attempt < attempts; attempt++) {
    const angle = baseAngle + (random() - 0.5) * 1.4 + attempt * 0.37
    let dist =
      req.role === 'house' || req.role === 'livestock' || req.maxCenterDist != null
        ? preferredRing * (0.75 + random() * 0.5)
        : preferredRing * (0.35 + random() * 0.7)
    if (req.minCenterDist != null) dist = Math.max(dist, req.minCenterDist)
    if (req.maxCenterDist != null) dist = Math.min(dist, req.maxCenterDist)
    const x = center.x + Math.cos(angle) * dist
    const z = center.z + Math.sin(angle) * dist
    const y = sampleHeight(x, z)
    const score = scorePlotCandidate(
      x,
      z,
      y,
      { ...req, preferredRing },
      center,
      boundary,
      existing,
      seedForCell,
      sampleHeight,
      waterLevel,
      minSpacing,
    )
    if (score === null) continue
    if (score > bestScore) {
      bestScore = score
      best = {
        id: req.id,
        role: req.role,
        x,
        z,
        y,
        radius: req.radius,
        rotation: angle,
        zoneId: zone?.id ?? null,
        familyIndex: req.familyIndex,
        familyId: req.familyId,
      }
    }
  }

  if (best) return best

  // Deterministic fallback: prefer the requested ring (keeps campfire / market
  // off the well when public-zone center ≈ plaza — plan 076). Houses still hug
  // residential zone when no preferredRing was set — but skip plaza spokes
  // already claimed by earlier cottages.
  let fallbackRing = Math.max(
    preferredRing ??
      (req.role === 'house' ? HOUSE_PLOT_RADIUS * 1.2 : boundary.radius * 0.22),
    req.minCenterDist ?? 0,
  )
  if (req.maxCenterDist != null) fallbackRing = Math.min(fallbackRing, req.maxCenterDist)

  if (req.role === 'house') {
    const base =
      zone != null
        ? Math.atan2(zone.z - center.z, zone.x - center.x)
        : baseAngle
    for (let i = 0; i < 12; i++) {
      const angle = base + (i / 12) * Math.PI * 2
      const fx = center.x + Math.cos(angle) * fallbackRing
      const fz = center.z + Math.sin(angle) * fallbackRing
      const score = scorePlotCandidate(
        fx,
        fz,
        sampleHeight(fx, fz),
        { ...req, preferredRing: fallbackRing },
        center,
        boundary,
        existing,
        seedForCell,
        sampleHeight,
        waterLevel,
        minSpacing,
      )
      if (score === null) continue
      return {
        id: req.id,
        role: req.role,
        x: fx,
        z: fz,
        y: sampleHeight(fx, fz),
        radius: req.radius,
        rotation: angle,
        zoneId: zone?.id ?? null,
        familyIndex: req.familyIndex,
        familyId: req.familyId,
      }
    }
  }

  const fx =
    req.role === 'house' && zone
      ? zone.x
      : center.x + Math.cos(baseAngle) * fallbackRing
  const fz =
    req.role === 'house' && zone
      ? zone.z
      : center.z + Math.sin(baseAngle) * fallbackRing
  return {
    id: req.id,
    role: req.role,
    x: fx,
    z: fz,
    y: sampleHeight(fx, fz),
    radius: req.radius,
    rotation: baseAngle,
    zoneId: zone?.id ?? null,
    familyIndex: req.familyIndex,
    familyId: req.familyId,
  }
}

function hashPlotId(plotId: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < plotId.length; i++) {
    h = Math.imul(h ^ plotId.charCodeAt(i), 0x01000193) >>> 0
  }
  return h >>> 0
}

function zoneByKind(zones: readonly VillageZone[], kind: VillageZoneKind): VillageZone | null {
  return zones.find((z) => z.kind === kind) ?? null
}

/**
 * Boundary + center + pattern + zones + plots for one settlement (plan 047
 * steps 5–7). Buildings/landmarks/paths remain for later steps.
 */
export function planVillageLayout(
  identity: VillageIdentity,
  site: { x: number, z: number, y: number },
  families: readonly FamilyDef[],
  seedForCell: number,
  sampleHeight: HeightSampler,
  waterLevel: number,
): VillageLayoutDraft {
  const sizeCfg = villageSizeConfig(identity.size)
  const pattern = chooseLayoutPattern(identity, seedForCell)
  const boundary: VillageBoundary = {
    kind: 'circle',
    x: site.x,
    z: site.z,
    radius: sizeCfg.footprintRadius,
  }
  const center: VillageCenter = { x: site.x, z: site.z, y: site.y }
  const zones = generateZones(identity, center, boundary, pattern, seedForCell, sampleHeight)

  const plots: VillagePlot[] = []
  const residential = zoneByKind(zones, 'residential')
  const publicZone = zoneByKind(zones, 'public')
  const utility = zoneByKind(zones, 'utility')
  const foodZone = zoneByKind(zones, 'food')
  const production = zoneByKind(zones, 'production')
  const livestockZone = zoneByKind(zones, 'livestock')

  // Well — locked to plaza center (existing props convention).
  plots.push(
    pickPlot(
      {
        id: 'plot-infra-well',
        role: 'infrastructure',
        zone: publicZone,
        radius: INFRA_PLOT_RADIUS,
        familyIndex: null,
        familyId: null,
        forced: { x: center.x, z: center.z },
      },
      center,
      boundary,
      plots,
      seedForCell,
      sampleHeight,
      waterLevel,
      sizeCfg.houseSpacing,
    ),
  )

  const houseRing = sizeCfg.houseRingMax * 0.85
  // Keep cottage pads off the plaza well — house radius + well infra radius +
  // gap so walls do not sit on the square rim (playtest 2026-08-12).
  const houseMinCenterDist = HOUSE_PLOT_RADIUS + INFRA_PLOT_RADIUS + 2.5
  families.forEach((family, familyIndex) => {
    plots.push(
      pickPlot(
        {
          id: `plot-house-${familyIndex}`,
          role: 'house',
          zone: residential,
          radius: HOUSE_PLOT_RADIUS,
          familyIndex,
          familyId: family.id,
          preferredRing: houseRing,
          minCenterDist: houseMinCenterDist,
        },
        center,
        boundary,
        plots,
        seedForCell,
        sampleHeight,
        waterLevel,
        sizeCfg.houseSpacing,
      ),
    )
  })

  const infra = sizeCfg.infrastructure
  const stockpileAttractor =
    identity.dominantResource && identity.dominantResource.richness >= SIGNIFICANT_RICHNESS
      ? { x: identity.dominantResource.x, z: identity.dominantResource.z }
      : null

  for (let i = 0; i < infra.stockpiles; i++) {
    plots.push(
      pickPlot(
        {
          id: `plot-infra-stockpile-${i}`,
          role: 'infrastructure',
          zone: utility ?? publicZone,
          radius: INFRA_PLOT_RADIUS,
          familyIndex: null,
          familyId: null,
          preferredRing: sizeCfg.footprintRadius * 0.12,
          attractor: stockpileAttractor,
        },
        center,
        boundary,
        plots,
        seedForCell,
        sampleHeight,
        waterLevel,
        sizeCfg.houseSpacing,
      ),
    )
  }

  const plazaR = plazaCoreRadius(identity.size, DEFAULT_PLAZA_CORE_RADIUS)
  // Plan 077: garden clusters from house count (~1 unit / 3 houses → S/M/L).
  // Plan 095: keep centers outside the plaza disk (not a footprint fraction).
  const houseCount = families.length
  const gardenScales = packGardenScales(gardenUnitsFromHouses(houseCount))
  for (let i = 0; i < gardenScales.length; i++) {
    const scale = gardenScales[i]!
    const minCenterDist = gardenPlazaMinCenterDist(plazaR, scale)
    plots.push(
      pickPlot(
        {
          id: `plot-infra-garden-${i}-${scale}`,
          role: 'infrastructure',
          zone: foodZone ?? publicZone,
          radius: gardenPlotRadius(scale),
          familyIndex: null,
          familyId: null,
          preferredRing: Math.max(
            sizeCfg.footprintRadius * (0.34 + i * 0.04),
            minCenterDist + 2,
          ),
          minCenterDist,
        },
        center,
        boundary,
        plots,
        seedForCell,
        sampleHeight,
        waterLevel,
        sizeCfg.houseSpacing,
      ),
    )
  }
  for (let i = 0; i < infra.campfires; i++) {
    plots.push(
      pickPlot(
        {
          id: `plot-infra-campfire-${i}`,
          role: 'infrastructure',
          zone: publicZone,
          radius: INFRA_PLOT_RADIUS * 0.85,
          familyIndex: null,
          familyId: null,
          // On packed-dirt plaza: mid-ring, hard-capped inside core clearing
          // (0.22×footprint sat on the grass rim after props jitter / well push).
          preferredRing: plazaR * 0.55,
          maxCenterDist: Math.max(plazaR * 0.55, plazaR - 1.5),
        },
        center,
        boundary,
        plots,
        seedForCell,
        sampleHeight,
        waterLevel,
        sizeCfg.houseSpacing,
      ),
    )
  }

  for (let i = 0; i < infra.markets; i++) {
    plots.push(
      pickPlot(
        {
          id: `plot-infra-market-${i}`,
          role: 'infrastructure',
          zone: publicZone,
          radius: INFRA_PLOT_RADIUS * 1.2,
          familyIndex: null,
          familyId: null,
          preferredRing: sizeCfg.footprintRadius * 0.1,
        },
        center,
        boundary,
        plots,
        seedForCell,
        sampleHeight,
        waterLevel,
        sizeCfg.houseSpacing,
      ),
    )
  }

  if (foodZone) {
    plots.push(
      pickPlot(
        {
          id: 'plot-food-0',
          role: 'food',
          zone: foodZone,
          radius: FOOD_PLOT_RADIUS,
          familyIndex: null,
          familyId: null,
          preferredRing: Math.hypot(foodZone.x - center.x, foodZone.z - center.z),
        },
        center,
        boundary,
        plots,
        seedForCell,
        sampleHeight,
        waterLevel,
        sizeCfg.houseSpacing,
      ),
    )
  }

  if (production && identity.dominantResource) {
    plots.push(
      pickPlot(
        {
          id: 'plot-work-0',
          role: 'work',
          zone: production,
          radius: WORK_PLOT_RADIUS,
          familyIndex: null,
          familyId: null,
          preferredRing: Math.hypot(production.x - center.x, production.z - center.z),
          attractor: { x: identity.dominantResource.x, z: identity.dominantResource.z },
        },
        center,
        boundary,
        plots,
        seedForCell,
        sampleHeight,
        waterLevel,
        sizeCfg.houseSpacing,
      ),
    )
  }

  if (livestockZone) {
    plots.push(
      pickPlot(
        {
          id: 'plot-livestock-0',
          role: 'livestock',
          zone: livestockZone,
          radius: LIVESTOCK_PLOT_RADIUS,
          familyIndex: null,
          familyId: null,
          preferredRing: Math.hypot(livestockZone.x - center.x, livestockZone.z - center.z),
        },
        center,
        boundary,
        plots,
        seedForCell,
        sampleHeight,
        waterLevel,
        sizeCfg.houseSpacing,
      ),
    )
  }

  const { buildings, landmarks } = buildingsAndLandmarksFromPlots(plots, identity)
  const { paths, entrances } = planLocalPathsAndEntrances({
    identity,
    center,
    boundary,
    pattern,
    zones,
    plots,
    landmarks,
    seedForCell,
    sampleHeight,
    waterLevel,
  })
  return { boundary, center, pattern, zones, plots, buildings, landmarks, paths, entrances }
}

/**
 * Plain-data buildings + landmarks from scored plots (plan 047 §9.8).
 * Positions come only from plots — no second placement pass. Dock is deferred
 * to the minor-locations adapter (step 13) so we do not invent a dock without
 * a validated waterfront site.
 */
export function buildingsAndLandmarksFromPlots(
  plots: readonly VillagePlot[],
  identity: VillageIdentity,
): { buildings: VillageBuildingPlan[], landmarks: VillageLandmarkPlan[] } {
  const buildings: VillageBuildingPlan[] = []
  const landmarks: VillageLandmarkPlan[] = []
  const kindIndex = new Map<VillageLandmarkKind, number>()

  const nextIndex = (kind: VillageLandmarkKind): number => {
    const i = kindIndex.get(kind) ?? 0
    kindIndex.set(kind, i + 1)
    return i
  }

  const pushLandmark = (
    kind: VillageLandmarkKind,
    plot: VillagePlot,
    idSuffix?: string,
    gardenScale?: GardenScale,
  ) => {
    const index = nextIndex(kind)
    landmarks.push({
      id: `landmark-${kind}-${idSuffix ?? String(index)}`,
      kind,
      x: plot.x,
      z: plot.z,
      y: plot.y,
      rotation: plot.rotation,
      plotId: plot.id,
      index,
      ...(gardenScale ? { gardenScale } : {}),
    })
  }

  const pushBuilding = (role: VillageBuildingRole, plot: VillagePlot, id: string) => {
    buildings.push({
      id,
      role,
      x: plot.x,
      z: plot.z,
      y: plot.y,
      footprint: plot.radius,
      rotation: plot.rotation,
      plotId: plot.id,
      zoneId: plot.zoneId,
      familyIndex: plot.familyIndex,
      familyId: plot.familyId,
    })
  }

  for (const plot of plots) {
    if (plot.role === 'house') {
      pushBuilding('residential', plot, `building-house-${plot.familyIndex ?? 0}`)
      pushLandmark('home', plot, String(plot.familyIndex ?? 0))
      continue
    }

    if (plot.role === 'work') {
      pushBuilding('production', plot, 'building-work-0')
      continue
    }

    if (plot.role === 'food') {
      pushBuilding('food', plot, 'building-food-0')
      if (identity.foodSourceType === 'field') pushLandmark('field', plot, '0')
      continue
    }

    if (plot.role === 'livestock') {
      pushBuilding('livestock', plot, 'building-livestock-0')
      continue
    }

    // infrastructure — kind from stable plot id
    if (plot.id === 'plot-infra-well') {
      pushBuilding('public', plot, 'building-well')
      pushLandmark('well', plot, '0')
      continue
    }
    const stockpileMatch = /^plot-infra-stockpile-(\d+)$/.exec(plot.id)
    if (stockpileMatch) {
      pushBuilding('utility', plot, `building-stockpile-${stockpileMatch[1]}`)
      pushLandmark('stockpile', plot, stockpileMatch[1])
      continue
    }
    const gardenMatch = /^plot-infra-garden-(\d+)-(S|M|L)$/.exec(plot.id)
    if (gardenMatch) {
      const scale = gardenMatch[2] as GardenScale
      pushBuilding('utility', plot, `building-garden-${gardenMatch[1]}-${scale}`)
      pushLandmark('garden', plot, `${gardenMatch[1]}-${scale}`, scale)
      continue
    }
    const campfireMatch = /^plot-infra-campfire-(\d+)$/.exec(plot.id)
    if (campfireMatch) {
      pushBuilding('public', plot, `building-campfire-${campfireMatch[1]}`)
      pushLandmark('campfire', plot, campfireMatch[1])
      continue
    }
    const marketMatch = /^plot-infra-market-(\d+)$/.exec(plot.id)
    if (marketMatch) {
      pushBuilding('public', plot, `building-market-${marketMatch[1]}`)
      pushLandmark('market', plot, marketMatch[1])
      continue
    }

    // Unknown infrastructure plot — still emit a utility building so the plot
    // is not silently dropped from the plan's building list.
    pushBuilding('utility', plot, `building-${plot.id}`)
  }

  return { buildings, landmarks }
}

type PathEndpoint = { x: number, z: number }

function polylinePoints(
  a: PathEndpoint,
  b: PathEndpoint,
): { x: number, z: number }[] {
  const points: { x: number, z: number }[] = []
  for (let i = 0; i < PATH_POLYLINE_SAMPLES; i++) {
    const t = i / (PATH_POLYLINE_SAMPLES - 1)
    const x = a.x + (b.x - a.x) * t
    const z = a.z + (b.z - a.z) * t
    points.push({ x, z })
  }
  return points
}

function makePath(
  id: string,
  a: PathEndpoint,
  b: PathEndpoint,
  kind: 'path' | 'road',
): VillagePathPlan {
  return {
    id,
    points: polylinePoints(a, b),
    halfWidth: kind === 'road' ? LOCAL_ROAD_HALF_WIDTH : LOCAL_PATH_HALF_WIDTH,
    kind,
  }
}

function entranceCountFor(identity: VillageIdentity): number {
  if (identity.size === 'OUTPOST') return 1
  const density = villageSizeConfig(identity.size).pathDensity
  if (identity.size === 'SM') return 1
  if (identity.size === 'MD') return density >= 0.55 ? 2 : 1
  return Math.min(3, Math.max(2, Math.round(1 + density * 1.5)))
}

function preferredEntranceAngles(
  pattern: VillageLayoutPattern,
  seedForCell: number,
  count: number,
  waterAngle: number,
): number[] {
  const axis = primaryAxisAngle(seedForCell)
  if (pattern === 'roadside' || pattern === 'linear') {
    return count === 1 ? [axis] : [axis, axis + Math.PI]
  }
  if (pattern === 'waterfront') {
    const inland = waterAngle + Math.PI
    if (count === 1) return [inland]
    const angles = [inland]
    for (let i = 1; i < count; i++) angles.push(inland + (i % 2 === 1 ? 0.7 : -0.7) * i)
    return angles
  }
  const base = primaryAxisAngle(seedForCell ^ 0xe47)
  return Array.from({ length: count }, (_, i) => base + (i / count) * Math.PI * 2)
}

/**
 * Pick a dry entrance on/near the boundary toward `preferredAngle`. Tries
 * angular jitters, then walks inward — never uses `Math.random()` (plan 047 §15).
 */
function pickEntranceAtAngle(
  preferredAngle: number,
  index: number,
  kind: 'road' | 'path',
  center: VillageCenter,
  boundary: VillageBoundary,
  seedForCell: number,
  sampleHeight: HeightSampler,
  waterLevel: number,
): VillageEntrance {
  const random = createSeededRandom(seedForCell ^ Math.imul(index + 1, 0x9e3779b1) ^ 0xe771)
  const tryAngle = (angle: number, radius: number): VillageEntrance | null => {
    const x = center.x + Math.cos(angle) * radius
    const z = center.z + Math.sin(angle) * radius
    const y = sampleHeight(x, z)
    if (y <= waterLevel + SETTLEMENT_WATER_MARGIN) return null
    if (!pathIsDry(x, z, center.x, center.z, waterLevel, sampleHeight)) return null
    return { id: `entrance-${index}`, x, z, y, angle, kind }
  }

  for (let j = 0; j < ENTRANCE_CANDIDATE_JITTERS; j++) {
    const angle = preferredAngle + (random() - 0.5) * 0.9
    const hit = tryAngle(angle, boundary.radius * 0.92)
    if (hit) return hit
  }

  for (let t = 0.9; t >= 0.25; t -= 0.08) {
    const hit = tryAngle(preferredAngle, boundary.radius * t)
    if (hit) return hit
  }

  const x = center.x + Math.cos(preferredAngle) * boundary.radius * 0.5
  const z = center.z + Math.sin(preferredAngle) * boundary.radius * 0.5
  return {
    id: `entrance-${index}`,
    x,
    z,
    y: sampleHeight(x, z),
    angle: preferredAngle,
    kind,
  }
}

function pushDryPath(
  paths: VillagePathPlan[],
  id: string,
  a: PathEndpoint,
  b: PathEndpoint,
  kind: 'path' | 'road',
  sampleHeight: HeightSampler,
  waterLevel: number,
): boolean {
  if (!pathIsDry(a.x, a.z, b.x, b.z, waterLevel, sampleHeight)) return false
  if (Math.hypot(a.x - b.x, a.z - b.z) < 1.5) return false
  paths.push(makePath(id, a, b, kind))
  return true
}

/**
 * Local paths + semantic entrances (plan 047 §9.9). Global inter-settlement
 * roads stay in `RoadNetwork` and will consume `entrances` later.
 *
 * Worker-safe corridor numerics live on each `VillagePathPlan` (`points` +
 * `halfWidth`); convert with `pathPlansToCorridorData` when terrain needs
 * corridor segments.
 */
export function planLocalPathsAndEntrances(args: {
  identity: VillageIdentity
  center: VillageCenter
  boundary: VillageBoundary
  pattern: VillageLayoutPattern
  zones: readonly VillageZone[]
  plots: readonly VillagePlot[]
  landmarks: readonly VillageLandmarkPlan[]
  seedForCell: number
  sampleHeight: HeightSampler
  waterLevel: number
}): { paths: VillagePathPlan[], entrances: VillageEntrance[] } {
  const {
    identity,
    center,
    boundary,
    pattern,
    zones,
    plots,
    seedForCell,
    sampleHeight,
    waterLevel,
  } = args
  const sizeCfg = villageSizeConfig(identity.size)
  const paths: VillagePathPlan[] = []
  const waterAngle = downhillAngle(center.x, center.z, boundary.radius, sampleHeight)
  const count = entranceCountFor(identity)
  const angles = preferredEntranceAngles(pattern, seedForCell, count, waterAngle)

  const entrances = angles.map((angle, index) => {
    const kind: 'road' | 'path' =
      identity.size === 'OUTPOST'
        ? 'path'
        : index === 0 || identity.size === 'LG' || identity.size === 'XL'
          ? 'road'
          : 'path'
    return pickEntranceAtAngle(
      angle,
      index,
      kind,
      center,
      boundary,
      seedForCell,
      sampleHeight,
      waterLevel,
    )
  })

  for (const entrance of entrances) {
    pushDryPath(
      paths,
      `path-entrance-${entrance.id}`,
      entrance,
      center,
      entrance.kind,
      sampleHeight,
      waterLevel,
    )
  }

  for (const zone of zones) {
    if (zone.kind === 'public') continue
    pushDryPath(paths, `path-zone-${zone.kind}`, center, zone, 'path', sampleHeight, waterLevel)
  }

  for (const plot of plots) {
    if (plot.role === 'house') continue
    if (plot.id === 'plot-infra-well') continue
    const important =
      plot.role === 'work' ||
      plot.role === 'food' ||
      plot.role === 'livestock' ||
      plot.id.startsWith('plot-infra-stockpile') ||
      plot.id.startsWith('plot-infra-garden')
    if (!important) continue
    const nearZonePath = zones.some(
      (z) => z.kind !== 'public' && Math.hypot(z.x - plot.x, z.z - plot.z) < z.radius * 0.65,
    )
    if (nearZonePath && (plot.role === 'food' || plot.role === 'work' || plot.role === 'livestock')) {
      continue
    }
    pushDryPath(paths, `path-plot-${plot.id}`, center, plot, 'path', sampleHeight, waterLevel)
  }

  const houses = plots.filter((p) => p.role === 'house')
  const houseStride =
    sizeCfg.pathDensity >= 0.45 ? 1 : Math.max(1, Math.ceil(houses.length / 2))
  houses.forEach((house, i) => {
    if (i % houseStride !== 0) return
    pushDryPath(
      paths,
      `path-house-${house.familyIndex ?? i}`,
      center,
      house,
      'path',
      sampleHeight,
      waterLevel,
    )
  })

  if (houses.length > 0 && !paths.some((p) => p.id.startsWith('path-house-'))) {
    const house = houses[0]!
    const mid = {
      x: center.x + (house.x - center.x) * 0.55,
      z: center.z + (house.z - center.z) * 0.55,
    }
    if (pathIsDry(center.x, center.z, mid.x, mid.z, waterLevel, sampleHeight)) {
      paths.push(makePath('path-house-fallback-0', center, mid, 'path'))
    }
  }

  return { paths, entrances }
}

/**
 * Flatten local path polylines into worker-safe corridor numerics (plain
 * ax/az/ah/bx/bz/bh/halfWidth + kind). Does not invent a second pathfinder.
 */
export function pathPlansToCorridorData(
  paths: readonly VillagePathPlan[],
  sampleHeight: HeightSampler,
): Array<{
  ax: number
  az: number
  ah: number
  bx: number
  bz: number
  bh: number
  halfWidth: number
  kind: 'path' | 'road'
}> {
  const out: Array<{
    ax: number
    az: number
    ah: number
    bx: number
    bz: number
    bh: number
    halfWidth: number
    kind: 'path' | 'road'
  }> = []
  for (const path of paths) {
    for (let i = 0; i < path.points.length - 1; i++) {
      const a = path.points[i]!
      const b = path.points[i + 1]!
      out.push({
        ax: a.x,
        az: a.z,
        ah: sampleHeight(a.x, a.z),
        bx: b.x,
        bz: b.z,
        bh: sampleHeight(b.x, b.z),
        halfWidth: path.halfWidth,
        kind: path.kind,
      })
    }
  }
  return out
}
