import type { AssetAnchorDef } from './assetAnchors'
import { HOUSE_FLOOR_LAMP_Y } from '../settlement/houseCatalog'

/** Quaternius Modular / Adventurer use `WristR` (no dot); the Universal Base
 *  Characters rig (plan 172 player character) uses UE-mannequin-style
 *  `hand_r`. Keep dotted/Mixamo aliases for older exports. Lives here (not
 *  `items/heldToolVisual.ts`) so this data module has no dependency on that
 *  consumer — `heldToolVisual.ts` already imports
 *  `anchorsForAsset`/`heldToolHasGripAnchor` from here, and the reverse
 *  import created a circular dependency between the two files. */
export const RIGHT_HAND_BONE_NAMES = [
  'WristR',
  'HandR',
  'Wrist.R',
  'Hand.R',
  'mixamorigRightHand',
  'hand_r',
] as const

export const CHARACTER_ANCHORS: readonly AssetAnchorDef[] = [
  {
    name: 'hand.right',
    type: 'attachment',
    node: RIGHT_HAND_BONE_NAMES,
    // Bone frame is not the Seedvale anchor convention (+Y ≈ fingertips,
    // −Z ≈ body centre); rotation brings it into +Z-forward / +Y-up.
    rotation: [0, 0, 0],
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
