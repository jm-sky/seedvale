import type { NameCulture } from '../ai/nameCultures'
import type { SettlementTerrain } from '../shared/SettlementName'
import type { NaturalResource } from '../terrain/naturalResources'
import type { VillageSize } from './families'

/** How a settlement's population mainly feeds itself (plan 032 §8) — v1 is
 *  data/flavor; props still share a garden unless `field` adds `farm.glb`.
 *  Owned here so `VillageIdentity` stays free of a circular import with
 *  `settlementGenerator.ts` (which re-exports the type for existing callers). */
export type FoodSourceType = 'field' | 'fishing' | 'foraging' | 'garden'

/** Stable generation context for one settlement — why this cell is this
 *  village. Plain data only; no Three.js / runtime agents (plan 047). */
export type VillageIdentity = {
  id: string
  cell: { gx: number, gz: number }
  isHome: boolean
  size: VillageSize
  terrain: SettlementTerrain
  dominantResource: NaturalResource | null
  foodSourceType: FoodSourceType
  name: string
  nameCulture: NameCulture
}

/** Circular footprint for v1 — radius comes from centralized size config. */
export type VillageBoundary = {
  kind: 'circle'
  x: number
  z: number
  radius: number
}

/** Semantic public/core point (well / plaza) — paths and zones radiate from here. */
export type VillageCenter = {
  x: number
  z: number
  y: number
}

/**
 * Planned public plaza disk (plan settlements-011). Paving, central-prop
 * spacing and woodcutter tree-work protection read this — not `clearings.core`,
 * which remains a terrain-adaptation radius and may be larger than the plaza.
 */
export type VillagePlaza = {
  x: number
  z: number
  radius: number
}

/** Matches `worldConfig.settlement.clearing.coreRadius`. */
export const DEFAULT_PLAZA_RADIUS = 9

/** Single plaza-radius table (plan settlements-011). Planner, terrain
 *  clearing and paving all consume this instead of duplicating size knobs. */
export function plazaRadiusForSize(size: VillageSize, baseRadius = DEFAULT_PLAZA_RADIUS): number {
  switch (size) {
    case 'LG':
      return Math.max(baseRadius, 12)
    case 'MD':
      return Math.max(baseRadius, 10)
    case 'XL':
      return Math.max(baseRadius, 14)
    default:
      return baseRadius
  }
}

export function villagePlazaAt(
  center: Pick<VillageCenter, 'x' | 'z'>,
  size: VillageSize,
  baseRadius = DEFAULT_PLAZA_RADIUS,
): VillagePlaza {
  return { x: center.x, z: center.z, radius: plazaRadiusForSize(size, baseRadius) }
}

/** Stone-ring campfire plot radius (`INFRA_PLOT_RADIUS * 0.85`). */
export const PLAZA_CAMPFIRE_FOOTPRINT = 2.04
/** Masonry hearth plot radius for LG/XL settlements that already have a fire landmark. */
export const PLAZA_MASONRY_FIREPIT_FOOTPRINT = 3.2

export function plazaUsesMasonryFirepit(size: VillageSize): boolean {
  return size === 'LG' || size === 'XL'
}

export function plannedCampfireFootprint(size: VillageSize): number {
  return plazaUsesMasonryFirepit(size) ? PLAZA_MASONRY_FIREPIT_FOOTPRINT : PLAZA_CAMPFIRE_FOOTPRINT
}

export function plannedCampfireBodyKind(size: VillageSize): 'pit' | 'masonry' {
  return plazaUsesMasonryFirepit(size) ? 'masonry' : 'pit'
}

/** Extra radius beyond the plaza disk that still blocks woodcutter work.
 *  Covers the ornamental plaza-band trees without reaching the woodlot. */
export const PLAZA_TREE_WORK_MARGIN = 4

export function isTreeWorkEligible(
  x: number,
  z: number,
  plaza: VillagePlaza | null | undefined,
  margin = PLAZA_TREE_WORK_MARGIN,
): boolean {
  if (!plaza) return true
  return Math.hypot(x - plaza.x, z - plaza.z) > plaza.radius + margin
}

export type VillageZoneKind =
  | 'residential'
  | 'public'
  | 'production'
  | 'food'
  | 'livestock'
  | 'utility'

export type VillageZone = {
  id: string
  kind: VillageZoneKind
  x: number
  z: number
  radius: number
}

export type VillagePlotRole = 'house' | 'work' | 'food' | 'livestock' | 'infrastructure' | 'sale'

export type VillagePlot = {
  id: string
  role: VillagePlotRole
  x: number
  z: number
  y: number
  radius: number
  rotation: number
  zoneId: string | null
  /** Stable 1:1 link for house plots — same order as `FamilyDef` list. */
  familyIndex: number | null
  familyId: string | null
  /** Coin price (plan 129) — only set for `role === 'sale'`. Deterministic,
   *  part of the static plan; ownership is separate persistent world state
   *  (`settlement/landOwnership.ts`), never stored here. */
  price?: number
}

/** Domain building role — not a GLB/asset id. */
export type VillageBuildingRole =
  | 'residential'
  | 'production'
  | 'food'
  | 'livestock'
  | 'utility'
  | 'public'

export type VillageBuildingPlan = {
  id: string
  role: VillageBuildingRole
  x: number
  z: number
  y: number
  /** Approximate footprint radius for spacing / terrain. */
  footprint: number
  rotation: number
  plotId: string | null
  zoneId: string | null
  familyIndex: number | null
  familyId: string | null
}

/** Stable `VillageBuildingPlan.id` for a settlement's residential house at
 *  `familyIndex` (plan settlements-007) — the single owner of this id shape,
 *  used both when `villagePlanner.ts` materializes `buildings` and wherever
 *  runtime code (`props.ts`'s house landmarks, structure condition/repair)
 *  must resolve the same stable identity from a family index instead of
 *  re-deriving the string by hand. */
export function residentialStructureId(familyIndex: number): string {
  return `building-house-${familyIndex}`
}

/** Stable infrastructure plot id for a household well at `familyIndex`
 *  (plan settlements-npcs-035). Distinct from the plaza `plot-infra-well`. */
export function householdWellPlotId(familyIndex: number): string {
  return `plot-household-well-${familyIndex}`
}

/** Inverse of {@link householdWellPlotId}; `null` when `plotId` is not a
 *  household-well plot. */
export function parseHouseholdWellFamilyIndex(plotId: string): number | null {
  const match = /^plot-household-well-(\d+)$/.exec(plotId)
  if (!match) return null
  return Number(match[1])
}

/** Stable landmark id for a household well, matching
 *  `buildingsAndLandmarksFromPlots`' `landmark-well-${idSuffix}` shape. */
export function householdWellLandmarkId(familyIndex: number): string {
  return `landmark-well-household-${familyIndex}`
}

export type VillageLandmarkKind =
  | 'well'
  | 'stockpile'
  | 'garden'
  | 'market'
  | 'campfire'
  | 'noticeBoard'
  | 'home'
  | 'dock'
  | 'field'

/** Stable infrastructure plot id for the plaza notice board (plan settlements-011). */
export function noticeBoardPlotId(): string {
  return 'plot-infra-notice-board'
}

export type VillageLandmarkPlan = {
  id: string
  kind: VillageLandmarkKind
  x: number
  z: number
  y: number
  rotation: number
  plotId: string | null
  /** Index into homes / stockpiles of the same kind when multiple exist. */
  index: number
  /** Garden cluster size (plan 077) — only set for `kind === 'garden'`. */
  gardenScale?: 'S' | 'M' | 'L'
}

export type VillagePathPlan = {
  id: string
  /** Polyline in world XZ — local connections only (not inter-settlement roads). */
  points: readonly { x: number, z: number }[]
  /** Half-width hint for terrain corridor consumers. */
  halfWidth: number
  kind: 'path' | 'road'
}

/** Stable id for the settlement-owned satellite pasture (plan settlements-009). */
export const PASTURE_ID = 'pasture'

/** Pasture well landmark id — distinct from plaza `landmark-well-0` and
 *  household `landmark-well-household-*` (plan settlements-009). */
export function pastureWellLandmarkId(): string {
  return 'landmark-well-pasture'
}

/** Local path id from the existing village network onto the pasture gap. */
export function pasturePathId(): string {
  return 'path-pasture'
}

/**
 * One planned pasture fence run (plan settlements-009). Endpoints are world
 * XZ; the renderer samples terrain at materialization. Visual marker only —
 * no collider / containment in V1.
 * @domain settlements
 */
export type VillagePastureFenceSegment = {
  id: string
  ax: number
  az: number
  bx: number
  bz: number
}

/** Planned well / trough / path-gap anchor on a pasture. */
export type VillagePastureAnchor = {
  x: number
  z: number
  y: number
}

/**
 * Settlement-owned outskirts pasture (plan settlements-009). Satellite area
 * outside `VillageBoundary` / the core building ring — not a `VillagePlot`
 * and not the core `zone-livestock` / `plot-livestock-0`. Optional: SM and
 * OUTPOST omit it; MD/LG/XL plan one when a dry, unobstructed candidate
 * exists. Runtime reads this from `VillagePlan` rather than reconstructing
 * a second pasture authority.
 * @domain settlements
 */
export type VillagePasturePlan = {
  id: string
  /** Semantic satellite flag — pasture is owned by the settlement but sits
   *  outside the core built footprint / entrance palisade wings. */
  outsideCore: true
  x: number
  z: number
  y: number
  radius: number
  well: VillagePastureAnchor
  trough: VillagePastureAnchor
  fenceSegments: readonly VillagePastureFenceSegment[]
  /** Village-facing gap / path connection onto the pasture. */
  connection: VillagePastureAnchor
}

export type VillageEntrance = {
  id: string
  x: number
  z: number
  y: number
  /** Outward angle in radians (world XZ). */
  angle: number
  kind: 'road' | 'path'
}

/** Base layout strategy — chooses axes/regions; shared placement still scores
 *  final positions (plan 047 §7). Not a second generator. */
export type VillageLayoutPattern =
  | 'central'
  | 'linear'
  | 'clustered'
  | 'roadside'
  | 'waterfront'

/**
 * Authoritative plain-data local layout for one settlement (plan 047).
 * No Three.js, agents, or scene nodes. Global roads stay in `RoadNetwork`
 * and consume `entrances` only.
 *
 * Early migration: identity + site + boundary + center are filled first;
 * zones/plots/buildings/landmarks/paths/entrances grow in later steps while
 * `SettlementDef` remains a compatibility projection.
 */
export type VillagePlan = {
  identity: VillageIdentity
  site: { x: number, z: number, y: number, radius: number }
  boundary: VillageBoundary
  center: VillageCenter
  /** Authoritative plaza footprint (plan settlements-011) — not a synonym of `clearings.core`. */
  plaza: VillagePlaza
  pattern: VillageLayoutPattern
  zones: readonly VillageZone[]
  plots: readonly VillagePlot[]
  buildings: readonly VillageBuildingPlan[]
  landmarks: readonly VillageLandmarkPlan[]
  paths: readonly VillagePathPlan[]
  entrances: readonly VillageEntrance[]
  /** Satellite livestock pasture (plan settlements-009). Absent on SM/OUTPOST
   *  and when every candidate failed river/spacing/terrain gates. */
  pasture?: VillagePasturePlan
}
