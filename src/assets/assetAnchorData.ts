import type { AssetAnchorDef } from './assetAnchors'
import { RIGHT_HAND_BONE_NAMES } from '../items/heldToolVisual'

export const CHARACTER_ANCHORS: readonly AssetAnchorDef[] = [
  {
    name: 'hand.right',
    type: 'attachment',
    node: RIGHT_HAND_BONE_NAMES,
    // Bone frame is not the Seedvale anchor convention (+Y ≈ fingertips,
    // −Z ≈ body centre); rotation brings it into +Z-forward / +Y-up.
    // Authored with the alignment browser in Phase 3.
    rotation: [0, 0, 0],
  },
]

export const ASSET_ANCHORS: Record<string, readonly AssetAnchorDef[]> = {
  'character:player': CHARACTER_ANCHORS,
  'npc:Farmer': CHARACTER_ANCHORS,
  'npc:Worker': CHARACTER_ANCHORS,
  'npc:Casual_Hoodie': CHARACTER_ANCHORS,
  'npc:Casual_2': CHARACTER_ANCHORS,
  'npc:Female_Worker': CHARACTER_ANCHORS,
  'npc:Female_Casual': CHARACTER_ANCHORS,
  'npc:Female_Medieval': CHARACTER_ANCHORS,
  'npc:Female_Formal': CHARACTER_ANCHORS,
}

export function anchorsForAsset(id: string): readonly AssetAnchorDef[] {
  return ASSET_ANCHORS[id] ?? []
}
