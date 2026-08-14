import { Group, type Object3D } from 'three'
import type { AssetIndexEntry } from '../../../assets/assetIndex'
import type { ItemKind } from '../../../items/items'
import type { AssetSlot } from './createAssetSlot'
import { disposeObject3D } from '../../../assets/loadGltf'
import { isToolKind, type ToolKind } from '../../../items/HeldTool'
import {
  BRANCH_HELD_ATTACH,
  findRightHandSocket,
  type HeldAttach,
  mountAttachOnSocket,
  mountHeldToolOnSocket,
} from '../../../items/heldToolVisual'
import { BROWSER_PROVISIONAL_ATTACH } from '../gripEdit'

export const HELD_SIDE_OFFSET = 1.2

export type HeldPreviewMode = 'off' | 'in-hand' | 'side-by-side'

export type HeldPreviewState = {
  mode: HeldPreviewMode
  reason: string | null
}

let heldMountRoot: Object3D | null = null

export { BROWSER_PROVISIONAL_ATTACH }

/** Map `held:*` index ids to game attach kinds. */
export function heldPreviewKind(entry: AssetIndexEntry | null): ToolKind | 'branch' | null {
  if (!entry?.id.startsWith('held:')) return null
  const suffix = entry.id.slice('held:'.length) as ItemKind
  if (suffix === 'branch') return 'branch'
  return isToolKind(suffix) ? suffix : null
}

export function provisionalHeldAttach(entry: AssetIndexEntry | null): HeldAttach | null {
  if (!entry) return null
  return BROWSER_PROVISIONAL_ATTACH[entry.id] ?? null
}

export function computeHeldPreviewState(
  reference: AssetSlot,
  target: AssetSlot,
): HeldPreviewState {
  if (!reference.model || !target.model || !target.entry) {
    return { mode: 'off', reason: null }
  }
  if (!reference.entry?.skinned) {
    return { mode: 'off', reason: null }
  }
  if (!target.entry.id.startsWith('held:')) {
    return { mode: 'off', reason: null }
  }
  const kind = heldPreviewKind(target.entry)
  if (kind) return { mode: 'in-hand', reason: null }
  if (provisionalHeldAttach(target.entry)) {
    return {
      mode: 'in-hand',
      reason: 'Provisional browser attach — not in game HELD_ATTACH yet',
    }
  }
  return {
    mode: 'side-by-side',
    reason: 'No game HELD_ATTACH yet — shown beside character',
  }
}

function applyHeldModelPrep(tool: Object3D, entry: AssetIndexEntry): void {
  if (entry.id === 'held:wooden_torch') tool.rotation.x = Math.PI / 2
}

function restoreToolInSlot(target: AssetSlot): void {
  const tool = target.model
  if (!tool || !target.entry) return
  resetToolLocal(tool)
  applyHeldModelPrep(tool, target.entry)
  if (tool.parent !== target.group) target.group.add(tool)
}

/** Detach any in-hand mount and return the tool mesh to the target slot group. */
export function clearHeldPreviewMount(target: AssetSlot): void {
  const tool = target.model
  if (!heldMountRoot) {
    if (tool && tool.parent !== target.group) {
      tool.removeFromParent()
      restoreToolInSlot(target)
    }
    return
  }

  heldMountRoot.removeFromParent()
  if (tool && heldMountRoot !== tool && heldMountRoot.children.includes(tool)) {
    tool.removeFromParent()
    disposeObject3D(heldMountRoot)
    restoreToolInSlot(target)
  } else if (tool) {
    if (tool.parent !== target.group) tool.removeFromParent()
    restoreToolInSlot(target)
    if (heldMountRoot !== tool) disposeObject3D(heldMountRoot)
  } else {
    disposeObject3D(heldMountRoot)
  }
  heldMountRoot = null
}

function resetToolLocal(tool: Object3D): void {
  tool.position.set(0, 0, 0)
  tool.rotation.set(0, 0, 0)
  // Do NOT reset scale — `preparePropFitMax` / height prep live on the model root.
  // Wiping it to 1 made held remounts (grip editor) look like giant unscaled GLBs.
}

/**
 * When reference is a skinned character and target is a held tool with game
 * attach data, parent the tool on `hand.right` via `mountHeldToolOnSocket`.
 *
 * Optional `attachOverride` replaces game / provisional numbers (browser grip editor).
 */
export function applyHeldPreview(
  reference: AssetSlot,
  target: AssetSlot,
  attachOverride: HeldAttach | null = null,
): HeldPreviewState {
  clearHeldPreviewMount(target)

  const state = computeHeldPreviewState(reference, target)
  if (state.mode !== 'in-hand') {
    if (state.mode === 'side-by-side') {
      target.group.position.set(HELD_SIDE_OFFSET, 0, 0)
    } else {
      // Kit / pair compare: overlap at origin so authored meters match.
      target.group.position.set(0, 0, 0)
    }
    return state
  }

  target.group.position.set(0, 0, 0)

  const socket = findRightHandSocket(reference.model!)
  if (!socket) {
    target.group.position.set(HELD_SIDE_OFFSET, 0, 0)
    return {
      mode: 'side-by-side',
      reason: 'Right hand socket not found on character',
    }
  }

  const entry = target.entry!
  const kind = heldPreviewKind(entry)
  const provisional = provisionalHeldAttach(entry)
  const tool = target.model!
  applyHeldModelPrep(tool, entry)
  target.group.remove(tool)

  const override = attachOverride

  if (override) {
    heldMountRoot = mountWithAttach(tool, socket, override)
  } else if (kind === 'branch') {
    heldMountRoot = mountWithAttach(tool, socket, BRANCH_HELD_ATTACH)
  } else if (kind) {
    heldMountRoot = mountHeldToolOnSocket(tool, socket, kind, {
      characterRoot: reference.model!,
      characterAssetId: reference.entry?.id ?? 'character:player',
      characterHeight: reference.entry?.prepare.mode === 'height'
        ? reference.entry.prepare.value
        : undefined,
    })
  } else if (provisional) {
    heldMountRoot = mountWithAttach(tool, socket, provisional)
  } else {
    target.group.add(tool)
    target.group.position.set(HELD_SIDE_OFFSET, 0, 0)
    return {
      mode: 'side-by-side',
      reason: 'No game HELD_ATTACH yet — shown beside character',
    }
  }

  return state
}

function mountWithAttach(tool: Object3D, socket: Object3D, attach: HeldAttach): Object3D {
  const wrap = new Group()
  const grip = attach.gripLocalOffset
  if (grip) tool.position.set(grip[0], grip[1], grip[2])
  else tool.position.set(0, 0, 0)
  wrap.add(tool)
  mountAttachOnSocket(wrap, socket, attach)
  return wrap
}
