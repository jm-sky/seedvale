import { parkedIdFromUrl } from './assetIndex'

/**
 * Illustrative data shape for a future `HouseBuilder` — not implemented yet (plan 109).
 * Shows that `ConstructionCatalog` carries what a builder would need: which asset, which
 * grid cell, which side. `TEST_HOUSE_01` below is validated against the real catalog by
 * `constructionCatalog.test.ts` (every assetId must resolve to a real, correctly-kinded part).
 */

export type HouseWallPlacement = {
  /** Construction catalog assetId, e.g. `parked:settlement/megakit/wall_plaster_straight`. */
  assetId: string
  /** Which footprint side this wall segment sits on. */
  side: 'front' | 'back' | 'left' | 'right'
  /** Module index along that side, 0-based, in units of the wall's module size (2 m). */
  moduleIndex: number
}

export type HouseOpening = {
  type: 'door' | 'window'
  /** The `wall` part (already has the opening pre-cut) this opening belongs to. */
  wallAssetId: string
  /** `opening` part (doorframe) filling the cut, when the kit has one for this opening type. */
  frameAssetId?: string
  /** `door` (leaf) or `window` (insert) part. */
  fillAssetId: string
}

export type HouseDefinition = {
  id: string
  /** Meters, must be a multiple of the wall/floor module (2 m). */
  footprint: { width: number, depth: number }
  floor: { assetId: string, tileCount: number }
  walls: readonly HouseWallPlacement[]
  corners: readonly { assetId: string, side: 'frontLeft' | 'frontRight' | 'backLeft' | 'backRight' }[]
  openings: readonly HouseOpening[]
  roof: { assetId: string, segmentCount: number }
}

const pk = (name: string): string => parkedIdFromUrl(`/models/settlement/megakit/${name}.glb`)

/**
 * 4 m × 2 m one-room plaster hut: front wall = door segment + blind segment, back wall =
 * two blind segments, left/right = one blind segment each (depth is exactly one module),
 * four corner posts, one door opening, a two-tile floor, and a two-segment 2×1 wooden roof
 * run along the ridge (gable end caps are a `HouseBuilder` concern, not modeled here).
 */
export const TEST_HOUSE_01: HouseDefinition = {
  id: 'test-house-01',
  footprint: { width: 4, depth: 2 },
  floor: { assetId: pk('floor_wooddark'), tileCount: 2 },
  walls: [
    { assetId: pk('wall_plaster_door_flat'), side: 'front', moduleIndex: 0 },
    { assetId: pk('wall_plaster_straight'), side: 'front', moduleIndex: 1 },
    { assetId: pk('wall_plaster_straight'), side: 'back', moduleIndex: 0 },
    { assetId: pk('wall_plaster_straight'), side: 'back', moduleIndex: 1 },
    { assetId: pk('wall_plaster_straight'), side: 'left', moduleIndex: 0 },
    { assetId: pk('wall_plaster_straight'), side: 'right', moduleIndex: 0 },
  ],
  corners: [
    { assetId: pk('corner_exterior_wood'), side: 'frontLeft' },
    { assetId: pk('corner_exterior_wood'), side: 'frontRight' },
    { assetId: pk('corner_exterior_wood'), side: 'backLeft' },
    { assetId: pk('corner_exterior_wood'), side: 'backRight' },
  ],
  openings: [
    {
      type: 'door',
      wallAssetId: pk('wall_plaster_door_flat'),
      frameAssetId: pk('doorframe_flat_wooddark'),
      fillAssetId: pk('door_1_flat'),
    },
  ],
  roof: { assetId: pk('roof_wooden_2x1'), segmentCount: 2 },
}
