/**
 * Shared constants for the World Locations / discovery / navigation system
 * (plan world-012). Kept separate from `world/map/mapConfig.ts`, which only
 * covers map-cell/canvas rendering.
 */

/** Presentational world-unit → km conversion (plan world-012 §14/notes §14).
 *  Chosen so the plan's far range (200 km) lands just inside
 *  `world/map/mapConfig.ts`'s `MAP_EXTENT_HALF` (4096 world units), keeping
 *  every discoverable location within the world map's meaningful extent. */
export const WORLD_UNITS_PER_KM = 20

/** "1 day of travel = 20 km" (plan §4) — a gameplay/UI unit, not an NPC/
 *  player movement speed. */
export const KM_PER_DAY = 20

export function worldUnitsToKm(worldUnits: number): number {
  return worldUnits / WORLD_UNITS_PER_KM
}

export function kmToWorldUnits(km: number): number {
  return km * WORLD_UNITS_PER_KM
}

export function kmToDays(km: number): number {
  return km / KM_PER_DAY
}

/** Range thresholds (plan §4), in km. */
export const NEAR_RANGE_KM = 20
export const MEDIUM_RANGE_KM = 60
export const FAR_RANGE_KM = 200

/** Fixed grid step (world units) used to scan for lake/mountain-peak
 *  candidates — independent of any particular search's distance bound, so a
 *  location's derived id never depends on how far the query that found it
 *  reached (notes §21 "stable id"). Coarser than `MAP_CELL_SIZE` since this
 *  drives a bounded, one-off world scan, not per-frame rendering. */
export const LOCATION_SCAN_STEP = 48

/** Radius (in `ChunkManager.findLandmarkNear` "chunk ring" units) searched
 *  around one settlement for its village-fringe cemetery. Comfortably covers
 *  `chunkEnvironment.ts`'s `CEMETERY_OUTER_FRAC` ring for every village size
 *  without overlapping the next settlement cell. */
export const CEMETERY_SEARCH_CHUNK_RADIUS = 3

/** Caps how many nearby settlements a landmark search checks for a cemetery
 *  — cemetery search is real chunk-generation work (notes §4/§22), so a
 *  "far" query (200 km, potentially dozens of settlement cells) stays
 *  bounded rather than scanning every settlement in range. Closest
 *  settlements first, so this only ever drops the least-relevant (farthest)
 *  candidates. */
export const MAX_CEMETERY_SETTLEMENTS_SEARCHED = 12

/** Minimum coarse-grid cell run to call a flood-filled water cluster a
 *  "lake" worth naming, rather than a puddle-sized noise artifact. */
export const MIN_LAKE_CELLS = 3

/** Coarse terrain cache tile edge, in `LOCATION_SCAN_STEP` cells (plan
 *  world-013 §4) — one tile is a small `Uint8Array`/`Float32Array` pair,
 *  materialized lazily per cell, shared across every Near/Guard/Far query
 *  that touches it instead of one result cache per exact `(x, z, maxKm)`. */
export const LOCATION_TILE_CELLS = 16

/** Peak neighbourhood/near-duplicate-merge halo, in `LOCATION_SCAN_STEP`
 *  cells (plan world-013 §9) — a range-aware query's candidate window
 *  extends this far past `minKm`/`maxKm` so a peak sitting right at the
 *  query boundary is still evaluated with its full 8-neighbourhood and
 *  merge radius, the same as if the scan had reached further. */
export const PEAK_NEIGHBOR_MARGIN_CELLS = 1
export const PEAK_MERGE_RADIUS_CELLS = 2
export const PEAK_SCAN_HALO_CELLS = PEAK_NEIGHBOR_MARGIN_CELLS + PEAK_MERGE_RADIUS_CELLS

/** Defensive cap on one lake flood-fill component (plan world-013 §4 "expand
 *  only toward closing the component") — real procedurally-generated inland
 *  water bodies never approach this size; this only guards a pathological
 *  terrain-config edge case from turning boundary-closing flood-fill into an
 *  unbounded scan. */
export const LAKE_FLOOD_FILL_SAFETY_CAP = 20000

/** Guard's "Opowiedz mi coś o okolicy" — near+medium landmark pool (plan §6),
 *  top-N by `discoveryWeight` before the 1-3 reveal roll. */
export const GUARD_LANDMARK_POOL_SIZE = 5
export const GUARD_REVEAL_MIN = 1
export const GUARD_REVEAL_MAX = 3

/** Merchant Near/Far maps (plan §9) — top-N landmarks per map. */
export const MERCHANT_MAP_LANDMARK_POOL_SIZE = 10
