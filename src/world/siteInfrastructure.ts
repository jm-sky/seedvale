import type { CompletedTerrainPreparation } from '../terrain/terrainPreparation'
import type { PlayerGardenRecord } from './playerGarden'
import { isWellWaterAvailable, type PlayerWellRecord } from './playerWell'

/**
 * Caller-provided bounded site for an on-demand infrastructure lookup
 * (plan world-019). Centre + radius matches existing nearby-object queries;
 * the query does not own a spatial index or a fixed colony radius.
 *
 * @domain world
 * @system site-infrastructure
 */
export type SiteBounds = {
  x: number
  z: number
  radius: number
}

/**
 * Read-only facts about Player-built infrastructure inside a site. Returns
 * authoritative records / compact completed-area facts, never readiness
 * booleans such as `hasWell` / `readyForColony`.
 *
 * @domain world
 * @system site-infrastructure
 */
export type SiteInfrastructure = {
  completedTerrainPreparations: readonly CompletedTerrainPreparation[]
  wells: readonly PlayerWellRecord[]
  cultivationAreas: readonly PlayerGardenRecord[]
}

export type SiteInfrastructureStores = {
  completedPreparations: readonly CompletedTerrainPreparation[]
  wells: readonly PlayerWellRecord[]
  gardens: readonly PlayerGardenRecord[]
}

export function pointInSite(x: number, z: number, site: SiteBounds): boolean {
  const dx = x - site.x
  const dz = z - site.z
  return dx * dx + dz * dz <= site.radius * site.radius
}

/**
 * Bounded aggregation over existing stores. On-demand only — do not call
 * per-frame. Qualification policy (plot count, `size >= 6`, mine clearance)
 * belongs to the caller.
 *
 * @domain world
 * @system site-infrastructure
 */
export function querySiteInfrastructure(
  site: SiteBounds,
  stores: SiteInfrastructureStores,
): SiteInfrastructure {
  return {
    completedTerrainPreparations: stores.completedPreparations.filter((p) => (
      pointInSite(p.center.x, p.center.z, site)
    )),
    wells: stores.wells.filter((w) => isWellWaterAvailable(w) && pointInSite(w.x, w.z, site)),
    cultivationAreas: stores.gardens.filter((g) => pointInSite(g.x, g.z, site)),
  }
}
