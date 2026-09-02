import { parkedIdFromUrl } from './assetIndex'

export const HOUSE_MODULE_M = 2

export type HouseWallSide = 'front' | 'back' | 'left' | 'right'
export type HouseCornerSide = 'frontLeft' | 'frontRight' | 'backLeft' | 'backRight'
export type HouseInteractionKind = 'door' | 'entrance' | 'work' | 'storage' | 'sleep'

export type HouseVec3 = { x: number, y: number, z: number }

export type HousePartTransform = {
  position?: HouseVec3
  rotationY?: number
}

export type HouseWallPlacement = {
  /** Construction catalog assetId, e.g. `parked:settlement/megakit/wall_plaster_straight`. */
  assetId: string
  /** Which footprint side this wall segment sits on. */
  side: HouseWallSide
  /** Module index along that side, 0-based, in units of the wall's module size (2 m). */
  moduleIndex: number
  /** Optional extra local transform on top of the side/module grid pose. */
  transform?: HousePartTransform
}

export type HouseOpening = {
  type: 'door' | 'window'
  /** The `wall` part (already has the opening pre-cut) this opening belongs to. */
  wallAssetId: string
  /** Disambiguate when the same wall asset is used more than once. */
  side?: HouseWallSide
  moduleIndex?: number
  /** `opening` part (doorframe) filling the cut, when the kit has one for this opening type. */
  frameAssetId?: string
  /** `door` (leaf) or `window` (insert) part. */
  fillAssetId: string
  /**
   * Extra local offset for the fill relative to the wall origin. Frame stays
   * at identity. Omit to use the builder's known-offset table (`door_1_flat`
   * → x ≈ -0.51 m from review 011).
   */
  fillOffset?: Partial<HouseVec3>
}

export type HouseRoofPart = {
  assetId: string
  position: HouseVec3
  rotationY?: number
}

export type HouseRoof = {
  /**
   * Shorthand: one slope asset repeated `segmentCount` times along the ridge,
   * plus a mirrored opposite slope. Ignored when `parts` is present.
   */
  assetId?: string
  segmentCount?: number
  /** Explicit per-part transforms — required for `gridReliable: false` roof pieces. */
  parts?: readonly HouseRoofPart[]
}

export type HouseDecoration = {
  assetId: string
  position: HouseVec3
  rotationY?: number
}

export type HouseInteractionPoint = {
  kind: HouseInteractionKind
  position: HouseVec3
  /** House-local yaw (radians) the player should face at this point. Only
   *  meaningful for `'sleep'` today (plan 168's `LodgingOption.facing`);
   *  omitted elsewhere. */
  facing?: number
}

export type HouseLampMount = { x: number, y: number, z: number }

export type HouseFurnitureRole = 'bed' | 'table' | 'chest' | 'lamp'

/**
 * Static interior furniture (plan 169). `bed`/`table` resolve through
 * `ConstructionCatalog` like every other house part (real GLBs under
 * `public/models/settlement/furniture/`). `chest` has no GLB (reuses the
 * existing procedural chest visual, `world/containerProp.ts`) and `lamp` is
 * a light source (existing `houseLighting.ts` mount/fallback pipeline) — both
 * are placed directly by `settlement/props.ts`, not through the catalog/static
 * batch path; their `assetId` here is a documentation-only sentinel, not a
 * resolvable catalog id.
 */
export type HouseFurniturePlacement = {
  assetId: string
  position: HouseVec3
  rotationY: number
  role: HouseFurnitureRole
  /**
   * Local to this furniture item (relative to its own `position`, before its
   * own `rotationY` is applied — same convention `houseBuilder.ts` uses
   * everywhere else). `facing`, if set, is a yaw *delta* added to this
   * furniture's `rotationY` to produce the final absolute house-local facing.
   */
  interactionPoints?: readonly HouseInteractionPoint[]
}

export type HouseDefinition = {
  id: string
  /** Meters, must be a multiple of the wall/floor module (2 m). */
  footprint: { width: number, depth: number }
  /** Optional extra yaw/offset of the whole house in its own local frame. */
  transform?: HousePartTransform
  floor: { assetId: string, tileCount: number }
  walls: readonly HouseWallPlacement[]
  corners: readonly { assetId: string, side: HouseCornerSide }[]
  openings: readonly HouseOpening[]
  roof: HouseRoof
  decorations?: readonly HouseDecoration[]
  /** Local interaction points (door / entrance / …). Builder also derives door/entrance when omitted. */
  interactionPoints?: readonly HouseInteractionPoint[]
  /** Interior furniture (plan 169) — bed/table/chest/lamp. Additive: does not
   *  replace `interactionPoints`' door/entrance derivation. */
  furniture?: readonly HouseFurniturePlacement[]
  /** Settlement examine / lamp metadata — not used by the builder itself. */
  label?: string
  examine?: string
  hasWalls?: boolean
  groundYOffset?: number
  footprintRadius?: number
  lamp?: { style: 'wall' | 'floorCenter', mount: HouseLampMount }
  /** Village role: small cottage vs medium family house / farmstead. */
  sizeClass?: 'cottage' | 'house'
}

const pk = (name: string): string => parkedIdFromUrl(`/models/settlement/megakit/${name}.glb`)
const fk = (name: string): string => parkedIdFromUrl(`/models/settlement/furniture/${name}.glb`)

/** Measured plaster-wall height (review 009 / catalog) — roof origin sits at wall-top, not y=0. */
export const PLASTER_WALL_TOP_Y = 3.12

export const WALL_STRAIGHT = pk('wall_plaster_straight')
export const WALL_DOOR = pk('wall_plaster_door_flat')
export const WALL_WINDOW = pk('wall_plaster_window_wide_flat')
export const WALL_WOODGRID = pk('wall_plaster_woodgrid')
export const WALL_BRICK = pk('wall_brick_straight')
export const DOOR_FRAME = pk('doorframe_flat_wooddark')
export const DOOR_LEAF = pk('door_1_flat')
export const WINDOW_FILL = pk('window_wide_flat1')
export const FLOOR = pk('floor_wooddark')
export const CORNER = pk('corner_exterior_wood')
export const CORNER_BRICK = pk('corner_exterior_brick')
export const CHIMNEY = pk('chimney')
export const SLOPE = pk('roof_wooden_2x1')
export const RIDGE = pk('roof_wooden_2x1_middle')
export const ROOF_CAP_4X4 = pk('roof_roundtiles_4x4')
export const ROOF_CAP_4X6 = pk('roof_roundtiles_4x6')
export const ROOF_CAP_6X6 = pk('roof_roundtiles_6x6')
export const GABLE_4 = pk('roof_front_brick4')
export const GABLE_6 = pk('roof_front_brick6')
export const GABLE_8 = pk('roof_front_brick8')

/**
 * Plan 169 interior furniture — measured `src/assets/furnitureAudit.generated.json`
 * (Quaternius Furniture Pack, `FBX2glTF` → `gltfpack -cc`,
 * `public/models/settlement/furniture/`). `bed`/`table` resolve through
 * `ConstructionCatalog` like any other house part (`fk()`, same convention as
 * MegaKit's `pk()`). `chest`/`lamp` have no catalog GLB — `settlement/props.ts`
 * places them directly (procedural chest visual, existing house-lighting
 * pipeline for the lamp) — these two sentinel ids are documentation only.
 */
export const FURNITURE_BED = fk('bed')
export const FURNITURE_TABLE = fk('table')
export const FURNITURE_CHEST_SENTINEL = 'procedural:chest'
export const FURNITURE_LAMP_SENTINEL = 'procedural:lamp'
