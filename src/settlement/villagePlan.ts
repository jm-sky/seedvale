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

export type VillageLandmarkKind =
  | 'well'
  | 'stockpile'
  | 'garden'
  | 'market'
  | 'campfire'
  | 'home'
  | 'dock'
  | 'field'

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
  pattern: VillageLayoutPattern
  zones: readonly VillageZone[]
  plots: readonly VillagePlot[]
  buildings: readonly VillageBuildingPlan[]
  landmarks: readonly VillageLandmarkPlan[]
  paths: readonly VillagePathPlan[]
  entrances: readonly VillageEntrance[]
}
