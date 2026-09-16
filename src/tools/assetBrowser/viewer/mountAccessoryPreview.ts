import { Group, type Object3D } from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import type { AssetIndexEntry } from '../../../assets/assetIndex'
import type { AssetSlot } from './createAssetSlot'
import {
  applyAccessoryTint,
  cloneAccessoryMaterials,
  disposeAccessoryMaterialClones,
} from '../../../assets/ubcOutfitMaterials'
import {
  type PlayerEquipmentVisual,
  resolvePlayerEquipmentVisualByUrl,
  resolvePlayerEquipmentVisualTintUrl,
} from '../../../player/playerEquipmentVisual'
import {
  bindAccessoryToPlayerSkeleton,
  collectBoneNames,
} from '../../../player/ubcAccessoryBind'
import { HELD_SIDE_OFFSET } from './mountHeldPreview'

export type AccessoryPreviewMode = 'off' | 'overlay' | 'side-by-side'

export type AccessoryPreviewState = {
  mode: AccessoryPreviewMode
  reason: string | null
  visual: PlayerEquipmentVisual | null
}

export type AccessoryAlignmentOverride = {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: number
}

/** Enough of {@link AssetSlot} for overlay eligibility checks. */
export type AccessoryPreviewSlot = {
  model: Object3D | null
  entry: AssetIndexEntry | null
}

let overlayRoot: Group | null = null
let overlayToken = 0
let hiddenTarget: Object3D | null = null

export function equipmentVisualForEntry(entry: AssetIndexEntry | null): PlayerEquipmentVisual | null {
  return resolvePlayerEquipmentVisualByUrl(entry?.url ?? null)
}

/**
 * Candidate overlay: skinned reference with bones + target in the equipment
 * visual registry. Bind success is decided later (fail closed).
 *
 * @domain items-player
 */
export function computeAccessoryPreviewState(
  reference: AccessoryPreviewSlot,
  target: AccessoryPreviewSlot,
): AccessoryPreviewState {
  if (!reference.model || !target.model || !target.entry) {
    return { mode: 'off', reason: null, visual: null }
  }
  if (!reference.entry?.skinned) {
    return { mode: 'off', reason: null, visual: null }
  }
  if (target.entry.id.startsWith('held:')) {
    return { mode: 'off', reason: null, visual: null }
  }
  const visual = equipmentVisualForEntry(target.entry)
  if (!visual) {
    return { mode: 'off', reason: null, visual: null }
  }
  if (collectBoneNames(reference.model).size === 0) {
    return {
      mode: 'off',
      reason: 'Reference has no skeleton — accessory overlay skipped',
      visual,
    }
  }
  return { mode: 'overlay', reason: null, visual }
}

export function applyAccessoryAlignment(
  root: Object3D,
  visual: PlayerEquipmentVisual,
  override: AccessoryAlignmentOverride | null,
): void {
  if (override) {
    root.position.set(...override.position)
    root.rotation.set(...override.rotation)
    root.scale.setScalar(override.scale)
    return
  }
  const alignment = visual.alignment
  if (!alignment) {
    root.position.set(0, 0, 0)
    root.rotation.set(0, 0, 0)
    root.scale.setScalar(1)
    return
  }
  if (alignment.position) root.position.set(...alignment.position)
  else root.position.set(0, 0, 0)
  if (alignment.rotation) root.rotation.set(...alignment.rotation)
  else root.rotation.set(0, 0, 0)
  if (alignment.scale != null) root.scale.setScalar(alignment.scale)
  else root.scale.setScalar(1)
}

export function clearAccessoryPreview(target: AssetSlot): void {
  overlayToken += 1
  if (overlayRoot) {
    overlayRoot.removeFromParent()
    disposeAccessoryMaterialClones(overlayRoot)
    overlayRoot = null
  }
  if (hiddenTarget) {
    hiddenTarget.visible = true
    hiddenTarget = null
  } else if (target.model) {
    target.model.visible = true
  }
}

function restoreTargetBeside(target: AssetSlot, reason: string, visual: PlayerEquipmentVisual | null): AccessoryPreviewState {
  if (target.model) target.model.visible = true
  target.group.position.set(HELD_SIDE_OFFSET, 0, 0)
  return { mode: 'side-by-side', reason, visual }
}

/**
 * Bind a clone of the target accessory onto the reference UBC skeleton.
 * The slot model stays unbound and is hidden while overlay is active.
 */
export async function applyAccessoryPreview(
  reference: AssetSlot,
  target: AssetSlot,
  alignmentOverride: AccessoryAlignmentOverride | null = null,
): Promise<AccessoryPreviewState> {
  clearAccessoryPreview(target)

  const state = computeAccessoryPreviewState(reference, target)
  if (state.mode !== 'overlay' || !state.visual) {
    if (state.mode === 'off' && state.reason) {
      return restoreTargetBeside(target, state.reason, state.visual)
    }
    return state
  }

  const token = overlayToken
  const visual = state.visual
  const cloned = cloneSkinned(target.model!) as Object3D
  cloneAccessoryMaterials(cloned)
  const bound = bindAccessoryToPlayerSkeleton(cloned, reference.model!)
  if (token !== overlayToken) {
    disposeAccessoryMaterialClones(cloned)
    if (bound) disposeAccessoryMaterialClones(bound)
    return { mode: 'off', reason: null, visual }
  }
  if (!bound) {
    disposeAccessoryMaterialClones(cloned)
    return restoreTargetBeside(
      target,
      'Accessory skeleton joints do not match the UBC rig',
      visual,
    )
  }

  applyAccessoryAlignment(bound, visual, alignmentOverride)
  const tintUrl = resolvePlayerEquipmentVisualTintUrl(visual)
  if (tintUrl) await applyAccessoryTint(bound, tintUrl)
  if (token !== overlayToken) {
    disposeAccessoryMaterialClones(bound)
    return { mode: 'off', reason: null, visual }
  }

  target.group.position.set(0, 0, 0)
  target.model!.visible = false
  hiddenTarget = target.model
  reference.model!.add(bound)
  overlayRoot = bound
  return {
    mode: 'overlay',
    reason: 'Accessory overlay (live UBC skeleton)',
    visual,
  }
}

export function accessoryOverlayActive(): boolean {
  return overlayRoot != null
}
