import type { VillageSize } from '../settlement/families'
import { createSeededRandom } from '../world/parseSeed'
import { anchorsForAsset } from './assetAnchorData'
import { parkedIdFromUrl } from './assetIndex'

/**
 * Data-only house contract consumed by `src/settlement/houseBuilder.ts`.
 * Describes which Construction Catalog parts go where — no Three.js, loaders
 * or runtime state. `TEST_HOUSE_01` is the modular 4×2 unit-test house;
 * village homes are the cottage / house definitions below.
 */

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

const WALL_STRAIGHT = pk('wall_plaster_straight')
const WALL_DOOR = pk('wall_plaster_door_flat')
const WALL_WINDOW = pk('wall_plaster_window_wide_flat')
const WALL_WOODGRID = pk('wall_plaster_woodgrid')
const WALL_BRICK = pk('wall_brick_straight')
const DOOR_FRAME = pk('doorframe_flat_wooddark')
const DOOR_LEAF = pk('door_1_flat')
const WINDOW_FILL = pk('window_wide_flat1')
const FLOOR = pk('floor_wooddark')
const CORNER = pk('corner_exterior_wood')
const CORNER_BRICK = pk('corner_exterior_brick')
const CHIMNEY = pk('chimney')
const SLOPE = pk('roof_wooden_2x1')
const RIDGE = pk('roof_wooden_2x1_middle')
const ROOF_CAP_4X4 = pk('roof_roundtiles_4x4')
const ROOF_CAP_4X6 = pk('roof_roundtiles_4x6')
const ROOF_CAP_6X6 = pk('roof_roundtiles_6x6')
const GABLE_4 = pk('roof_front_brick4')
const GABLE_6 = pk('roof_front_brick6')
const GABLE_8 = pk('roof_front_brick8')

/**
 * Plan 169 interior furniture — measured `src/assets/furnitureAudit.generated.json`
 * (Quaternius Furniture Pack, `FBX2glTF` → `gltfpack -cc`,
 * `public/models/settlement/furniture/`). `bed`/`table` resolve through
 * `ConstructionCatalog` like any other house part (`fk()`, same convention as
 * MegaKit's `pk()`). `chest`/`lamp` have no catalog GLB — `settlement/props.ts`
 * places them directly (procedural chest visual, existing house-lighting
 * pipeline for the lamp) — these two sentinel ids are documentation only.
 */
const FURNITURE_BED = fk('bed')
const FURNITURE_TABLE = fk('table')
const FURNITURE_CHEST_SENTINEL = 'procedural:chest'
const FURNITURE_LAMP_SENTINEL = 'procedural:lamp'

/**
 * Lamp position derived from the table's `mount` anchor (`assetAnchorData.ts`
 * `'lamp_mount'` on `FURNITURE_TABLE`) rather than an independent coordinate —
 * "mounted relative to the table," per plan 169. Anchor `position` is
 * `assetLocal` (table-local metres); rotated by the table's own `rotationY`
 * and translated by its `position`, same 2D-rotation convention
 * `houseBuilder.ts` uses everywhere else (e.g. `wallLocalTransform`).
 */
function lampOnTable(table: { position: HouseVec3, rotationY: number }): HouseVec3 {
  const anchor = anchorsForAsset(FURNITURE_TABLE).find((a) => a.name === 'lamp_mount')
  const [lx, ly, lz] = anchor?.position ?? [0, 0.618, 0]
  const cos = Math.cos(table.rotationY)
  const sin = Math.sin(table.rotationY)
  return {
    x: table.position.x + lx * cos - lz * sin,
    y: table.position.y + ly,
    z: table.position.z + lx * sin + lz * cos,
  }
}

/**
 * Mirrors a furniture layout across the house's own Z axis (negates local X
 * everywhere: furniture position, furniture-local interaction-point position
 * and `facing` delta). Whole-layout reflection, not a per-mesh mirror — valid
 * because every plan 169 asset is X-symmetric (`furnitureAudit.generated.json`
 * for bed/table/lamp; the procedural chest, `world/containerProp.ts`, is
 * X-symmetric by construction). Used for house variants whose door sits on
 * the opposite half of the same wall (e.g. `COTTAGE_4X4_B` vs `_A`) so the
 * layout still clears the door swing without a second hand-authored set of
 * numbers — still an explicit, checked transform per variant, not a general
 * furniture solver.
 */
function mirrorFurnitureX(furniture: readonly HouseFurniturePlacement[]): HouseFurniturePlacement[] {
  return furniture.map((f) => ({
    ...f,
    position: { ...f.position, x: -f.position.x },
    rotationY: -f.rotationY,
    interactionPoints: f.interactionPoints?.map((p) => ({
      ...p,
      position: { ...p.position, x: -p.position.x },
      ...(p.facing != null ? { facing: -p.facing } : {}),
    })),
  }))
}

/**
 * First furnished house (plan 169 "pierwszy zakres") — `COTTAGE_4X4_A`.
 * Reused as-is by `COTTAGE_4X4_C` (same door module, only window placement
 * differs — windows are wall fixtures, not floor obstacles) and mirrored
 * (`mirrorFurnitureX`) for `COTTAGE_4X4_B`, whose door sits on the opposite
 * half of the front wall. Placement checked against each definition's own
 * footprint/openings math (`wallLocalTransform`) for wall/door-swing
 * clearance; final visual fit (bed/lamp orientation in particular — the
 * source asset's own forward axis was not independently confirmed) still
 * needs a browser look per plan 169's alignment-browser rule and
 * `CLAUDE.md`'s "do not mark visual work verified without browser
 * confirmation" — browser-checked 2026-08-24 for `COTTAGE_4X4_A` (looked
 * correct); `_B`/`_C` and the 6×6 houses below not yet individually checked.
 */
function cottage4x4Furniture(): HouseFurniturePlacement[] {
  const bed: HouseFurniturePlacement = {
    assetId: FURNITURE_BED,
    position: { x: -0.5, y: 0, z: 1.4 },
    rotationY: 0,
    role: 'bed',
    interactionPoints: [
      {
        kind: 'sleep',
        // ~0.4 m out from the bed's room-facing long side, into the open floor.
        position: { x: 0, y: 0, z: -0.845 },
        // Face into the room, away from the back wall the bed is pushed against.
        facing: 0,
      },
    ],
  }
  const table: HouseFurniturePlacement = {
    assetId: FURNITURE_TABLE,
    position: { x: 0.7, y: 0, z: -0.4 },
    rotationY: 0,
    role: 'table',
  }
  const chest: HouseFurniturePlacement = {
    assetId: FURNITURE_CHEST_SENTINEL,
    position: { x: -1.65, y: 0, z: 0.6 },
    rotationY: Math.PI / 2,
    role: 'chest',
    interactionPoints: [
      { kind: 'storage', position: { x: 0, y: 0, z: 0.5 } },
    ],
  }
  const lamp: HouseFurniturePlacement = {
    assetId: FURNITURE_LAMP_SENTINEL,
    position: lampOnTable(table),
    rotationY: 0,
    role: 'lamp',
  }
  return [bed, table, chest, lamp]
}

/**
 * 6×6 m house furniture — `HOUSE_6X6_A`/`HOUSE_6X6_B`. More floor than the
 * 4×4 cottage, so the layout is roomier rather than a scaled copy. Reused
 * as-is by both variants: `_A`'s door is centred (module1) and `_B`'s is at
 * the far left (module0), but neither's door-swing zone (front wall, near
 * the hinge) nor either's window/chimney placement overlaps this layout —
 * checked against both definitions' `wallLocalTransform`/`chimneyAt` output,
 * not assumed. Not yet browser-verified (see `cottage4x4Furniture`'s note).
 */
function house6x6Furniture(): HouseFurniturePlacement[] {
  const bed: HouseFurniturePlacement = {
    assetId: FURNITURE_BED,
    position: { x: -1.3, y: 0, z: 2.255 },
    rotationY: 0,
    role: 'bed',
    interactionPoints: [
      { kind: 'sleep', position: { x: 0, y: 0, z: -0.845 }, facing: 0 },
    ],
  }
  const table: HouseFurniturePlacement = {
    assetId: FURNITURE_TABLE,
    position: { x: 1.3, y: 0, z: -0.3 },
    rotationY: 0,
    role: 'table',
  }
  const chest: HouseFurniturePlacement = {
    assetId: FURNITURE_CHEST_SENTINEL,
    position: { x: -2.35, y: 0, z: 0.6 },
    rotationY: Math.PI / 2,
    role: 'chest',
    interactionPoints: [
      { kind: 'storage', position: { x: 0, y: 0, z: 0.5 } },
    ],
  }
  const lamp: HouseFurniturePlacement = {
    assetId: FURNITURE_LAMP_SENTINEL,
    position: lampOnTable(table),
    rotationY: 0,
    role: 'lamp',
  }
  return [bed, table, chest, lamp]
}

/**
 * Two opposite `wooden_2x1` slope runs along X plus ridge `_middle` plates.
 * Positions are explicit (review 011): do not infer them from AABB face midpoints.
 */
export function wooden2x1RoofParts(
  width: number,
  wallTopY: number,
  slopeAssetId: string,
  ridgeAssetId: string,
  module = HOUSE_MODULE_M,
): HouseRoofPart[] {
  const segments = Math.round(width / module)
  const parts: HouseRoofPart[] = []
  for (let i = 0; i < segments; i++) {
    const x = -width / 2 + (i + 0.5) * module
    const at = { x, y: wallTopY, z: 0 }
    parts.push({ assetId: slopeAssetId, position: at, rotationY: 0 })
    parts.push({ assetId: slopeAssetId, position: { ...at }, rotationY: Math.PI })
    parts.push({ assetId: ridgeAssetId, position: { ...at }, rotationY: 0 })
  }
  return parts
}

/** One complete MegaKit cap, centered on the footprint, origin at wall-top. */
export function capRoof(assetId: string, wallTopY = PLASTER_WALL_TOP_Y, rotationY = 0): HouseRoof {
  return { parts: [{ assetId, position: { x: 0, y: wallTopY, z: 0 }, rotationY }] }
}

export type HouseGableEnds = 'frontBack' | 'leftRight'

/**
 * Triangular gable infill (`roof_front_brick*`) on the two non-slope sides of a
 * gabled cap. Ridge along Z → gables on front/back; ridge along X → left/right.
 */
export function gableParts(
  footprint: { width: number, depth: number },
  assetId: string,
  ends: HouseGableEnds,
  wallTopY = PLASTER_WALL_TOP_Y,
): HouseRoofPart[] {
  if (ends === 'frontBack') {
    const z = footprint.depth / 2
    return [
      { assetId, position: { x: 0, y: wallTopY, z: -z }, rotationY: 0 },
      { assetId, position: { x: 0, y: wallTopY, z }, rotationY: Math.PI },
    ]
  }
  const x = footprint.width / 2
  return [
    { assetId, position: { x: -x, y: wallTopY, z: 0 }, rotationY: -Math.PI / 2 },
    { assetId, position: { x, y: wallTopY, z: 0 }, rotationY: Math.PI / 2 },
  ]
}

export function capRoofWithGables(
  capAssetId: string,
  gableAssetId: string,
  footprint: { width: number, depth: number },
  ends: HouseGableEnds,
  capRotationY = 0,
  wallTopY = PLASTER_WALL_TOP_Y,
): HouseRoof {
  return {
    parts: [
      ...(capRoof(capAssetId, wallTopY, capRotationY).parts ?? []),
      ...gableParts(footprint, gableAssetId, ends, wallTopY),
    ],
  }
}

type OpeningSpec = {
  type: 'door' | 'window'
  side: HouseWallSide
  moduleIndex: number
}

function modulesOnSide(footprint: { width: number, depth: number }, side: HouseWallSide): number {
  return side === 'front' || side === 'back'
    ? Math.round(footprint.width / HOUSE_MODULE_M)
    : Math.round(footprint.depth / HOUSE_MODULE_M)
}

type HouseKit = {
  straight: string
  door: string
  window: string
  corner: string
}

const KIT_PLASTER: HouseKit = {
  straight: WALL_STRAIGHT,
  door: WALL_DOOR,
  window: WALL_WINDOW,
  corner: CORNER,
}

const KIT_WOODGRID: HouseKit = {
  ...KIT_PLASTER,
  straight: WALL_WOODGRID,
}

const KIT_BRICK: HouseKit = {
  straight: WALL_BRICK,
  door: WALL_DOOR,
  window: WALL_WINDOW,
  corner: CORNER_BRICK,
}

function plasterWalls(
  footprint: { width: number, depth: number },
  openings: readonly OpeningSpec[],
  kit: HouseKit,
): HouseWallPlacement[] {
  const walls: HouseWallPlacement[] = []
  const sides: HouseWallSide[] = ['front', 'back', 'left', 'right']
  for (const side of sides) {
    const count = modulesOnSide(footprint, side)
    for (let i = 0; i < count; i++) {
      const opening = openings.find((o) => o.side === side && o.moduleIndex === i)
      const assetId = opening?.type === 'door'
        ? kit.door
        : opening?.type === 'window'
          ? kit.window
          : kit.straight
      walls.push({ assetId, side, moduleIndex: i })
    }
  }
  return walls
}

function plasterOpenings(openings: readonly OpeningSpec[], kit: HouseKit): HouseOpening[] {
  return openings.map((opening) => (
    opening.type === 'door'
      ? {
          type: 'door' as const,
          wallAssetId: kit.door,
          side: opening.side,
          moduleIndex: opening.moduleIndex,
          frameAssetId: DOOR_FRAME,
          fillAssetId: DOOR_LEAF,
        }
      : {
          type: 'window' as const,
          wallAssetId: kit.window,
          side: opening.side,
          moduleIndex: opening.moduleIndex,
          fillAssetId: WINDOW_FILL,
        }
  ))
}

function lampFor(
  footprint: { width: number, depth: number },
  openings: readonly OpeningSpec[],
): { style: 'wall', mount: HouseLampMount } {
  const widthMods = Math.round(footprint.width / HOUSE_MODULE_M)
  const door = openings.find((o) => o.type === 'door' && o.side === 'front')
  let module = Math.floor(widthMods / 2)
  if (door) {
    module = door.moduleIndex + 1 < widthMods ? door.moduleIndex + 1 : Math.max(0, door.moduleIndex - 1)
  }
  return {
    style: 'wall',
    mount: {
      x: -footprint.width / 2 + (module + 0.5) * HOUSE_MODULE_M,
      y: 1.85,
      z: -footprint.depth / 2 - 0.12,
    },
  }
}

function chimneyAt(footprint: { width: number, depth: number }): HouseDecoration {
  return {
    assetId: CHIMNEY,
    position: {
      x: footprint.width / 2 - 0.7,
      y: 0,
      z: footprint.depth / 2 - 0.7,
    },
  }
}

function plasterHouse(opts: {
  id: string
  width: number
  depth: number
  openings: readonly OpeningSpec[]
  roof: HouseRoof
  label: string
  examine: string
  sizeClass: 'cottage' | 'house'
  kit?: HouseKit
  decorations?: readonly HouseDecoration[]
}): HouseDefinition {
  const footprint = { width: opts.width, depth: opts.depth }
  const tileCount = Math.round(opts.width / HOUSE_MODULE_M) * Math.round(opts.depth / HOUSE_MODULE_M)
  const kit = opts.kit ?? KIT_PLASTER
  return {
    id: opts.id,
    footprint,
    floor: { assetId: FLOOR, tileCount },
    walls: plasterWalls(footprint, opts.openings, kit),
    corners: [
      { assetId: kit.corner, side: 'frontLeft' },
      { assetId: kit.corner, side: 'frontRight' },
      { assetId: kit.corner, side: 'backLeft' },
      { assetId: kit.corner, side: 'backRight' },
    ],
    openings: plasterOpenings(opts.openings, kit),
    roof: opts.roof,
    decorations: opts.decorations,
    label: opts.label,
    examine: opts.examine,
    hasWalls: true,
    groundYOffset: 0,
    lamp: lampFor(footprint, opts.openings),
    sizeClass: opts.sizeClass,
  }
}

const ROOF_4X2 = wooden2x1RoofParts(4, PLASTER_WALL_TOP_Y, SLOPE, RIDGE)

/**
 * 4 m × 2 m modular-roof unit test house (plan 111 first variant). Too small for
 * village homes — kept so layout/door/roof tests stay on the wooden_2x1 path.
 */
export const TEST_HOUSE_01: HouseDefinition = plasterHouse({
  id: 'test-house-01',
  width: 4,
  depth: 2,
  openings: [{ type: 'door', side: 'front', moduleIndex: 0 }],
  roof: { assetId: SLOPE, segmentCount: 2, parts: ROOF_4X2 },
  label: 'Chata',
  examine: 'Tynkowana chata z drewnianym dachem — złożona z modularnych ścian, podłogi i dachu MegaKit.',
  sizeClass: 'cottage',
})

export const TEST_HOUSE_02: HouseDefinition = plasterHouse({
  id: 'test-house-02',
  width: 4,
  depth: 2,
  openings: [
    { type: 'door', side: 'front', moduleIndex: 0 },
    { type: 'window', side: 'front', moduleIndex: 1 },
  ],
  roof: { assetId: SLOPE, segmentCount: 2, parts: ROOF_4X2 },
  label: 'Chata',
  examine: 'Tynkowana chata z oknem i drewnianym dachem — złożona z modularnych części MegaKit.',
  sizeClass: 'cottage',
})

/**
 * 4×4 m — small one-room cottage (~16 m²). `roof_roundtiles_4x4` cap. Plan 169's
 * first furnished house — see `cottage4x4Furniture()`.
 */
export const COTTAGE_4X4_A: HouseDefinition = {
  ...plasterHouse({
    id: 'cottage-4x4-a',
    width: 4,
    depth: 4,
    openings: [
      { type: 'door', side: 'front', moduleIndex: 0 },
      { type: 'window', side: 'front', moduleIndex: 1 },
      { type: 'window', side: 'right', moduleIndex: 0 },
    ],
    roof: capRoofWithGables(ROOF_CAP_4X4, GABLE_4, { width: 4, depth: 4 }, 'frontBack'),
    label: 'Chatka',
    examine: 'Niewielka tynkowana chatka pod dachówką — jedna izba, drzwi i okno od drogi.',
    sizeClass: 'cottage',
  }),
  furniture: cottage4x4Furniture(),
}

export const COTTAGE_4X4_B: HouseDefinition = {
  ...plasterHouse({
    id: 'cottage-4x4-b',
    width: 4,
    depth: 4,
    openings: [
      { type: 'door', side: 'front', moduleIndex: 1 },
      { type: 'window', side: 'left', moduleIndex: 0 },
      { type: 'window', side: 'back', moduleIndex: 0 },
    ],
    roof: capRoofWithGables(ROOF_CAP_4X4, GABLE_4, { width: 4, depth: 4 }, 'frontBack'),
    label: 'Chatka',
    examine: 'Mała chatka z oknem od ogrodu i wejściem z boku frontu.',
    sizeClass: 'cottage',
  }),
  // Door on the opposite half of the front wall vs `COTTAGE_4X4_A` (module 1,
  // not 0) — mirrored layout so it still clears the door swing.
  furniture: mirrorFurnitureX(cottage4x4Furniture()),
}

/** 6×4 m — typical village cottage (~24 m²). Cap rotated so the long axis covers the 6 m front. */
export const COTTAGE_6X4_A: HouseDefinition = plasterHouse({
  id: 'cottage-6x4-a',
  width: 6,
  depth: 4,
  openings: [
    { type: 'door', side: 'front', moduleIndex: 1 },
    { type: 'window', side: 'front', moduleIndex: 0 },
    { type: 'window', side: 'front', moduleIndex: 2 },
    { type: 'window', side: 'right', moduleIndex: 0 },
  ],
  roof: capRoofWithGables(ROOF_CAP_4X6, GABLE_4, { width: 6, depth: 4 }, 'leftRight', Math.PI / 2),
  label: 'Chata',
  examine: 'Wiejska chata z dwojgiem okien przy drzwiach — dość miejsca na jedną rodzinę.',
  sizeClass: 'cottage',
})

export const COTTAGE_6X4_B: HouseDefinition = plasterHouse({
  id: 'cottage-6x4-b',
  width: 6,
  depth: 4,
  openings: [
    { type: 'door', side: 'front', moduleIndex: 0 },
    { type: 'window', side: 'front', moduleIndex: 2 },
    { type: 'window', side: 'left', moduleIndex: 1 },
    { type: 'window', side: 'back', moduleIndex: 1 },
  ],
  roof: capRoofWithGables(ROOF_CAP_4X6, GABLE_4, { width: 6, depth: 4 }, 'leftRight', Math.PI / 2),
  label: 'Chata',
  examine: 'Chata z oknem na ogród i wejściem z boku elewacji.',
  sizeClass: 'cottage',
})

/** 6×6 m — medium square house (~36 m²). */
export const HOUSE_6X6_A: HouseDefinition = {
  ...plasterHouse({
    id: 'house-6x6-a',
    width: 6,
    depth: 6,
    openings: [
      { type: 'door', side: 'front', moduleIndex: 1 },
      { type: 'window', side: 'front', moduleIndex: 0 },
      { type: 'window', side: 'front', moduleIndex: 2 },
      { type: 'window', side: 'right', moduleIndex: 1 },
      { type: 'window', side: 'left', moduleIndex: 1 },
      { type: 'window', side: 'back', moduleIndex: 1 },
    ],
    roof: capRoofWithGables(ROOF_CAP_6X6, GABLE_6, { width: 6, depth: 6 }, 'frontBack'),
    label: 'Dom',
    examine: 'Średni tynkowany dom pod szeroką dachówką — gospodarstwo jednej rodziny.',
    sizeClass: 'house',
  }),
  furniture: house6x6Furniture(),
}

/** 8×6 m — medium farmstead (~48 m²). */
export const HOUSE_8X6_A: HouseDefinition = plasterHouse({
  id: 'house-8x6-a',
  width: 8,
  depth: 6,
  openings: [
    { type: 'door', side: 'front', moduleIndex: 1 },
    { type: 'window', side: 'front', moduleIndex: 3 },
    { type: 'window', side: 'right', moduleIndex: 0 },
    { type: 'window', side: 'right', moduleIndex: 2 },
    { type: 'window', side: 'left', moduleIndex: 1 },
    { type: 'window', side: 'back', moduleIndex: 1 },
    { type: 'window', side: 'back', moduleIndex: 3 },
  ],
  roof: capRoofWithGables(ROOF_CAP_6X6, GABLE_8, { width: 8, depth: 6 }, 'frontBack'),
  label: 'Gospodarstwo',
  examine: 'Szerszy dom wiejski — izby przy drodze i oknami na podwórze.',
  sizeClass: 'house',
})

export const HOUSE_8X6_B: HouseDefinition = plasterHouse({
  id: 'house-8x6-b',
  width: 8,
  depth: 6,
  openings: [
    { type: 'door', side: 'front', moduleIndex: 2 },
    { type: 'window', side: 'front', moduleIndex: 0 },
    { type: 'window', side: 'left', moduleIndex: 0 },
    { type: 'window', side: 'left', moduleIndex: 2 },
    { type: 'window', side: 'right', moduleIndex: 1 },
    { type: 'window', side: 'back', moduleIndex: 0 },
    { type: 'window', side: 'back', moduleIndex: 2 },
  ],
  roof: capRoofWithGables(ROOF_CAP_6X6, GABLE_8, { width: 8, depth: 6 }, 'frontBack'),
  label: 'Gospodarstwo',
  examine: 'Gospodarstwo z wejściem bliżej środka elewacji i oknami na obie strony podwórza.',
  sizeClass: 'house',
})

export const COTTAGE_4X4_C: HouseDefinition = {
  ...plasterHouse({
    id: 'cottage-4x4-c',
    width: 4,
    depth: 4,
    openings: [
      { type: 'door', side: 'front', moduleIndex: 0 },
      { type: 'window', side: 'left', moduleIndex: 1 },
      { type: 'window', side: 'right', moduleIndex: 1 },
      { type: 'window', side: 'back', moduleIndex: 1 },
    ],
    roof: capRoofWithGables(ROOF_CAP_4X4, GABLE_4, { width: 4, depth: 4 }, 'frontBack'),
    label: 'Chatka',
    examine: 'Drewniana kratownica na tynku i komin w narożniku — mała chatka z oknami na trzy strony.',
    sizeClass: 'cottage',
    kit: KIT_WOODGRID,
    decorations: [chimneyAt({ width: 4, depth: 4 })],
  }),
  // Same door module as `COTTAGE_4X4_A` (0) — corner chimney at (1.3, 1.3)
  // doesn't overlap this layout's bed/table/chest footprints.
  furniture: cottage4x4Furniture(),
}

export const COTTAGE_6X4_C: HouseDefinition = plasterHouse({
  id: 'cottage-6x4-c',
  width: 6,
  depth: 4,
  openings: [
    { type: 'door', side: 'front', moduleIndex: 2 },
    { type: 'window', side: 'front', moduleIndex: 0 },
    { type: 'window', side: 'left', moduleIndex: 0 },
    { type: 'window', side: 'back', moduleIndex: 0 },
    { type: 'window', side: 'back', moduleIndex: 2 },
  ],
  roof: capRoofWithGables(ROOF_CAP_4X6, GABLE_4, { width: 6, depth: 4 }, 'leftRight', Math.PI / 2),
  label: 'Chata',
  examine: 'Chata z kratownicą, kominem i wejściem z prawej strony elewacji.',
  sizeClass: 'cottage',
  kit: KIT_WOODGRID,
  decorations: [chimneyAt({ width: 6, depth: 4 })],
})

export const HOUSE_6X6_B: HouseDefinition = {
  ...plasterHouse({
    id: 'house-6x6-b',
    width: 6,
    depth: 6,
    openings: [
      { type: 'door', side: 'front', moduleIndex: 0 },
      { type: 'window', side: 'front', moduleIndex: 2 },
      { type: 'window', side: 'right', moduleIndex: 0 },
      { type: 'window', side: 'right', moduleIndex: 2 },
      { type: 'window', side: 'left', moduleIndex: 0 },
      { type: 'window', side: 'back', moduleIndex: 0 },
      { type: 'window', side: 'back', moduleIndex: 2 },
    ],
    roof: capRoofWithGables(ROOF_CAP_6X6, GABLE_6, { width: 6, depth: 6 }, 'frontBack'),
    label: 'Dom',
    examine: 'Ceglany dom z kominem — okna na podwórze i wejście z boku frontu.',
    sizeClass: 'house',
    kit: KIT_BRICK,
    decorations: [chimneyAt({ width: 6, depth: 6 })],
  }),
  // Door at the far-left front module (0) and a back-right chimney (2.3, 2.3)
  // — neither overlaps this layout's furniture footprints (checked against
  // this door's swing zone and the chimney position, not assumed).
  furniture: house6x6Furniture(),
}

export const HOUSE_8X6_C: HouseDefinition = plasterHouse({
  id: 'house-8x6-c',
  width: 8,
  depth: 6,
  openings: [
    { type: 'door', side: 'front', moduleIndex: 0 },
    { type: 'window', side: 'front', moduleIndex: 1 },
    { type: 'window', side: 'front', moduleIndex: 3 },
    { type: 'window', side: 'right', moduleIndex: 1 },
    { type: 'window', side: 'left', moduleIndex: 0 },
    { type: 'window', side: 'left', moduleIndex: 2 },
    { type: 'window', side: 'back', moduleIndex: 1 },
    { type: 'window', side: 'back', moduleIndex: 2 },
  ],
  roof: capRoofWithGables(ROOF_CAP_6X6, GABLE_8, { width: 8, depth: 6 }, 'frontBack'),
  label: 'Gospodarstwo',
  examine: 'Ceglane gospodarstwo z kominem i wejściem z lewej strony drogi.',
  sizeClass: 'house',
  kit: KIT_BRICK,
  decorations: [chimneyAt({ width: 8, depth: 6 })],
})

export const COTTAGE_DEFINITIONS: readonly HouseDefinition[] = [
  COTTAGE_4X4_A,
  COTTAGE_4X4_B,
  COTTAGE_4X4_C,
  COTTAGE_6X4_A,
  COTTAGE_6X4_B,
  COTTAGE_6X4_C,
]

export const HOUSE_DEFINITIONS: readonly HouseDefinition[] = [
  HOUSE_6X6_A,
  HOUSE_6X6_B,
  HOUSE_8X6_A,
  HOUSE_8X6_B,
  HOUSE_8X6_C,
]

/** Village / small-town homes — not the 4×2 test shed. */
export const HOME_HOUSE_DEFINITIONS: readonly HouseDefinition[] = [
  ...COTTAGE_DEFINITIONS,
  ...HOUSE_DEFINITIONS,
]

function poolForSize(size: VillageSize): readonly HouseDefinition[] {
  switch (size) {
    case 'MD':
      return HOME_HOUSE_DEFINITIONS
    case 'OUTPOST':
      return COTTAGE_DEFINITIONS
    case 'SM':
      return [...COTTAGE_DEFINITIONS, HOUSE_6X6_A, HOUSE_6X6_B]
    default:
      return [
        ...COTTAGE_DEFINITIONS.filter((d) => d.footprint.width >= 6),
        ...HOUSE_DEFINITIONS,
        ...HOUSE_DEFINITIONS,
      ]
  }
}

/**
 * Size-aware home pick. Outposts stay on cottages; larger villages mix in
 * medium 6×6 / 8×6 farmsteads so a town is not a row of identical sheds.
 */
export function pickHouseDefinition(size: VillageSize, index: number, seed: number): HouseDefinition {
  const pool = poolForSize(size)
  const random = createSeededRandom(seed ^ Math.imul(index + 1, 0x9e3779b1) ^ 0x484f5553)
  const offset = Math.floor(random() * pool.length)
  return pool[(index + offset) % pool.length]!
}
