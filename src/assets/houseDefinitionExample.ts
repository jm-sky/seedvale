import type { VillageSize } from '../settlement/families'
import {
  CHIMNEY,
  CORNER,
  CORNER_BRICK,
  DOOR_FRAME,
  DOOR_LEAF,
  FLOOR,
  FURNITURE_BED,
  FURNITURE_CHEST_SENTINEL,
  FURNITURE_LAMP_SENTINEL,
  FURNITURE_TABLE,
  GABLE_4,
  GABLE_6,
  GABLE_8,
  HOUSE_MODULE_M,
  type HouseDecoration,
  type HouseDefinition,
  type HouseFurniturePlacement,
  type HouseLampMount,
  type HouseOpening,
  type HouseRoof,
  type HouseRoofPart,
  type HouseVec3,
  type HouseWallPlacement,
  type HouseWallSide,
  PLASTER_WALL_TOP_Y,
  RIDGE,
  ROOF_CAP_4X4,
  ROOF_CAP_4X6,
  ROOF_CAP_6X6,
  SLOPE,
  WALL_BRICK,
  WALL_DOOR,
  WALL_STRAIGHT,
  WALL_WINDOW,
  WALL_WOODGRID,
  WINDOW_FILL,
} from '../assets/houseDefinitionExampleConfig'
import { createSeededRandom } from '../world/parseSeed'
import { anchorsForAsset } from './assetAnchorData'

/**
 * Data-only house contract consumed by `src/settlement/houseBuilder.ts`.
 * Describes which Construction Catalog parts go where — no Three.js, loaders
 * or runtime state. `TEST_HOUSE_01` is the modular 4×2 unit-test house;
 * village homes are the cottage / house definitions below.
 */

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
 * 6×4 m cottage furniture — `COTTAGE_6X4_A/B/C`. All three variants' doors
 * sit on the front wall (z = -depth/2) and every door-swing arc stays within
 * roughly 1 m of that wall; every furniture item here has its nearest edge
 * at least that far from the front wall (bed/table/chest all at local
 * z ≥ -0.85 vs. the front wall at z = -2), so door module position doesn't
 * matter and all three variants reuse this layout unmodified — checked
 * against each definition's actual openings/chimney, not assumed.
 */
function cottage6x4Furniture(): HouseFurniturePlacement[] {
  const bed: HouseFurniturePlacement = {
    assetId: FURNITURE_BED,
    position: { x: -1.5, y: 0, z: 1.255 },
    rotationY: 0,
    role: 'bed',
    interactionPoints: [
      { kind: 'sleep', position: { x: 0, y: 0, z: -0.845 }, facing: 0 },
    ],
  }
  const table: HouseFurniturePlacement = {
    assetId: FURNITURE_TABLE,
    position: { x: 1.3, y: 0, z: -0.2 },
    rotationY: 0,
    role: 'table',
  }
  const chest: HouseFurniturePlacement = {
    assetId: FURNITURE_CHEST_SENTINEL,
    position: { x: 2.4, y: 0, z: -0.2 },
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
 * 8×6 m farmstead furniture — `HOUSE_8X6_A/B/C`. Same "stay clear of the
 * front-wall door-swing band" reasoning as `cottage6x4Furniture`, scaled up
 * for the larger footprint; all three variants' doors/chimney checked
 * against this layout, not assumed.
 */
function house8x6Furniture(): HouseFurniturePlacement[] {
  const bed: HouseFurniturePlacement = {
    assetId: FURNITURE_BED,
    position: { x: -2, y: 0, z: 2.205 },
    rotationY: 0,
    role: 'bed',
    interactionPoints: [
      { kind: 'sleep', position: { x: 0, y: 0, z: -0.845 }, facing: 0 },
    ],
  }
  const table: HouseFurniturePlacement = {
    assetId: FURNITURE_TABLE,
    position: { x: 1, y: 0, z: -0.5 },
    rotationY: 0,
    role: 'table',
  }
  const chest: HouseFurniturePlacement = {
    assetId: FURNITURE_CHEST_SENTINEL,
    position: { x: 3.3, y: 0, z: 0.5 },
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
  roofOffsetY = 0,
): HouseRoof {
  return {
    parts: [
      ...(capRoof(capAssetId, wallTopY+roofOffsetY, capRotationY).parts ?? []),
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
export const COTTAGE_6X4_A: HouseDefinition = {
  ...plasterHouse({
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
  }),
  furniture: cottage6x4Furniture(),
}

export const COTTAGE_6X4_B: HouseDefinition = {
  ...plasterHouse({
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
  }),
  furniture: cottage6x4Furniture(),
}

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
export const HOUSE_8X6_A: HouseDefinition = {
  ...plasterHouse({
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
    roof: capRoofWithGables(ROOF_CAP_6X6, GABLE_8, { width: 8, depth: 6 }, 'frontBack', 0, PLASTER_WALL_TOP_Y, 0.75),
    label: 'Gospodarstwo',
    examine: 'Szerszy dom wiejski — izby przy drodze i oknami na podwórze.',
    sizeClass: 'house',
  }),
  furniture: house8x6Furniture(),
}

export const HOUSE_8X6_B: HouseDefinition = {
  ...plasterHouse({
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
    roof: capRoofWithGables(ROOF_CAP_6X6, GABLE_8, { width: 8, depth: 6 }, 'frontBack', 0, PLASTER_WALL_TOP_Y, 0.75),
    label: 'Gospodarstwo',
    examine: 'Gospodarstwo z wejściem bliżej środka elewacji i oknami na obie strony podwórza.',
    sizeClass: 'house',
  }),
  furniture: house8x6Furniture(),
}

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

export const COTTAGE_6X4_C: HouseDefinition = {
  ...plasterHouse({
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
  }),
  // Corner chimney at (2.3, 1.3) — clear of this layout's chest (z ≤ 0.25).
  furniture: cottage6x4Furniture(),
}

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

export const HOUSE_8X6_C: HouseDefinition = {
  ...plasterHouse({
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
    roof: capRoofWithGables(ROOF_CAP_6X6, GABLE_8, { width: 8, depth: 6 }, 'frontBack', 0, PLASTER_WALL_TOP_Y, 0.75),
    label: 'Gospodarstwo',
    examine: 'Ceglane gospodarstwo z kominem i wejściem z lewej strony drogi.',
    sizeClass: 'house',
    kit: KIT_BRICK,
    decorations: [chimneyAt({ width: 8, depth: 6 })],
  }),
  // Corner chimney at (3.3, 2.3) — clear of this layout's chest (z ≤ 0.95).
  furniture: house8x6Furniture(),
}

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
