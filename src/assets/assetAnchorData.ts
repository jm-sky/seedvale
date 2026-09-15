import type { AssetAnchorDef } from './assetAnchors'
import { HOUSE_FLOOR_LAMP_Y } from '../settlement/houseCatalog'

/** Quaternius Modular / Adventurer use `WristR` (no dot). Keep dotted/Mixamo
 *  aliases for older exports. Lives here (not `items/heldToolVisual.ts`) so
 *  this data module has no dependency on that consumer — `heldToolVisual.ts`
 *  already imports `anchorsForAsset`/`heldToolHasGripAnchor` from here, and
 *  the reverse import created a circular dependency between the two files. */
export const RIGHT_HAND_BONE_NAMES = [
  'WristR',
  'HandR',
  'Wrist.R',
  'Hand.R',
  'hand_r',
  'mixamorigRightHand',
] as const

/** Identity — Quaternius Adventurer `WristR` already matches `HELD_ATTACH`. */
export const ADVENTURER_HAND_SPACE: readonly [number, number, number] = [0, 0, 0]

/**
 * Maps Adventurer `WristR` (+Y ≈ fingertips) onto Unreal/UBC `hand_r` (+X along
 * the bone). Applied in `mountAttachOnSocket` so every held item keeps the same
 * `HELD_ATTACH` numbers. `Rz(-π/2)` sends WristR +Y (fingertips) onto UBC +X
 * so the blade follows the hand like Adventurer, not a second per-item table.
 */
export const UBC_HAND_FROM_WRIST_R: readonly [number, number, number] = [0, 0, -Math.PI / 2]

const UBC_HAND_BONE_NAMES = new Set(['hand_r', 'hand_l'])
const ADVENTURER_HAND_BONE_NAMES = new Set([
  'WristR',
  'HandR',
  'Wrist.R',
  'Hand.R',
  'mixamorigRightHand',
])

type NamedParentNode = {
  name: string
  parent: NamedParentNode | null
}

/**
 * WristR-space Euler for `HELD_ATTACH`, or the UBC remap when `hand_r` is an
 * ancestor of `socket` (held tools parent a nameless pivot under the bone).
 * Unknown names stay Adventurer/identity so Modular NPCs do not shift.
 */
export function handAttachSpaceFromSocket(socket: NamedParentNode): readonly [number, number, number] {
  let node: NamedParentNode | null = socket
  while (node) {
    if (UBC_HAND_BONE_NAMES.has(node.name)) return UBC_HAND_FROM_WRIST_R
    if (ADVENTURER_HAND_BONE_NAMES.has(node.name)) return ADVENTURER_HAND_SPACE
    node = node.parent
  }
  return ADVENTURER_HAND_SPACE
}

export const CHARACTER_ANCHORS: readonly AssetAnchorDef[] = [
  {
    name: 'hand.right',
    type: 'attachment',
    node: RIGHT_HAND_BONE_NAMES,
    // Adventurer `WristR` already matches `HELD_ATTACH` (+Y ≈ fingertips,
    // −Z ≈ body centre).
    rotation: ADVENTURER_HAND_SPACE,
  },
]

export const CHARACTER_ANCHORS_UBC: readonly AssetAnchorDef[] = [
  {
    name: 'hand.right',
    type: 'attachment',
    node: RIGHT_HAND_BONE_NAMES,
    rotation: UBC_HAND_FROM_WRIST_R,
  },
]

/** South rim of the well after `prepareProp` (GLB `well.glb` / procedural
 *  `createWell`) — queue line runs along anchor +Z (plan 088 Phase 6 / 101). */
const WELL_INTERACTION: AssetAnchorDef = {
  name: 'interaction',
  type: 'interaction',
  space: 'assetLocal',
  position: [0, 0.72, 0.85],
}

function floorCenterLampMount(height: number): AssetAnchorDef {
  return {
    name: 'lamp_mount',
    type: 'mount',
    space: 'assetLocal',
    position: [0, HOUSE_FLOOR_LAMP_Y, 0],
    rotation: [0, 0, 0],
    authoredFor: { mode: 'height', value: height },
  }
}

const HUT_D_LAMP_MOUNT: AssetAnchorDef = {
  name: 'lamp_mount',
  type: 'mount',
  space: 'assetLocal',
  position: [0.07, 0.25, 0.17],
  rotation: [0, 0, 0],
  authoredFor: { mode: 'height', value: 8.2 },
}

/** Plan 169 — furniture table (`public/models/settlement/furniture/table.glb`,
 *  measured `src/assets/furnitureAudit.generated.json`: footprint 1.106 × 1.016 m,
 *  top surface y ≈ 0.618). Back-right corner of the tabletop, in from the edge
 *  far enough that the lamp's own footprint doesn't overhang. Native MegaKit-style
 *  construction parts have no `prepareProp` fit (plan 111), hence `mode: 'none'`. */
const FURNITURE_TABLE_LAMP_MOUNT: AssetAnchorDef = {
  name: 'lamp_mount',
  type: 'mount',
  space: 'assetLocal',
  position: [0.3, 0.618, -0.3],
  rotation: [0, 0, 0],
  authoredFor: { mode: 'none' },
}

/**
 * Tool `grip` anchors (Phase 6). Add one tool at a time after browser verification.
 * When present, `mountHeldToolOnSocket` uses `mountByAnchorPair` instead of `HELD_ATTACH`.
 */
export const HELD_TOOL_GRIP_ANCHORS: Partial<Record<string, readonly AssetAnchorDef[]>> = {
  // Example (disabled until browser-verified):
  // 'held:axe': [{ name: 'grip', type: 'grip', space: 'assetLocal', position: [...], rotation: [...] }],
}

export const ASSET_ANCHORS: Record<string, readonly AssetAnchorDef[]> = {
  'settlement:well': [WELL_INTERACTION],
  'character:player': CHARACTER_ANCHORS,
  'character:ubc-peasant': CHARACTER_ANCHORS_UBC,
  'character:ubc-ranger': CHARACTER_ANCHORS_UBC,
  'npc:Farmer': CHARACTER_ANCHORS,
  'npc:Worker': CHARACTER_ANCHORS,
  'npc:Casual_Hoodie': CHARACTER_ANCHORS,
  'npc:Casual_2': CHARACTER_ANCHORS,
  'npc:Female_Worker': CHARACTER_ANCHORS,
  'npc:Female_Casual': CHARACTER_ANCHORS,
  'npc:Female_Medieval': CHARACTER_ANCHORS,
  'npc:Female_Formal': CHARACTER_ANCHORS,
  'house:hut_a': [floorCenterLampMount(8.5)],
  'house:hut_b': [floorCenterLampMount(8.0)],
  'house:hut_c': [floorCenterLampMount(6.5)],
  'house:hut_d': [HUT_D_LAMP_MOUNT],
  'parked:settlement/furniture/table': [FURNITURE_TABLE_LAMP_MOUNT],
}

export function anchorsForAsset(id: string): readonly AssetAnchorDef[] {
  return [
    ...(ASSET_ANCHORS[id] ?? []),
    ...(HELD_TOOL_GRIP_ANCHORS[id] ?? []),
  ]
}

export function heldToolHasGripAnchor(assetId: string): boolean {
  return (HELD_TOOL_GRIP_ANCHORS[assetId] ?? []).some((a) => a.name === 'grip')
}
