import { Group, type Object3D, Vector3 } from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import type { ToolKind } from './HeldTool'
import { findAnchorNode } from '../assets/anchorResolve'
import { anchorsForAsset, heldToolHasGripAnchor, RIGHT_HAND_BONE_NAMES } from '../assets/assetAnchorData'
import { loadGltf, preparePropFitMax } from '../assets/loadGltf'
import { mountByAnchorPair } from '../assets/mountByAnchorPair'
import { createItemMesh } from './items'

export type HeldAttach = {
  /**
   * Offset along **bone-local** axes, in approximate world meters
   * (`mountHeldToolOnSocket` divides by armature world scale ~100).
   * On Quaternius `WristR` (idle): **+Y ≈ fingertips**, **−Z ≈ body center**.
   */
  position: readonly [number, number, number]
  rotation: readonly [number, number, number]
  /** Extra uniform scale on top of the prepared held mesh. */
  scale: number
  /**
   * Slide the mesh in **tool-local** space (meters, after rotation) so the hand
   * holds a different point — e.g. shovel handle end vs mid-shaft / blade.
   */
  gripLocalOffset?: readonly [number, number, number]
}

/**
 * Grip TRS — positions are bone-local meters.
 * Quaternius `WristR` (idle): **+Y ≈ toward fingertips**, **−Z ≈ toward body center**.
 * Armature scale ~100 is compensated on mount.
 */
export const HELD_ATTACH: Record<ToolKind, HeldAttach> = {
  axe: {
    // Verified in-hand after user manual adjustment (2026-08-12)
    // Was along forearm (handle → bone −Y); +90° yaw puts shaft across the grip.
    position: [0.02, 0.13, -0.02],
    rotation: [Math.PI / 2, Math.PI / 2, 0],
    scale: 1.25,
    // Authored handle along local ±Z (blade/head near one tip). Shift so the palm
    // sits on the butt of the handle, not the head.
    gripLocalOffset: [0, 0, -0.3],
  },
  firestarter: {
    position: [0.02, 0.08, -0.02],
    rotation: [0.4, 0.2, 0.3],
    scale: 1,
  },
    // Verified in-hand after user manual adjustment (2026-08-12)
  knife: {
    position: [0, 0.12, -0.01],
    rotation: [Math.PI, 0, Math.PI / 2],
    scale: 1.25,
  },
  shovel: {
    // Verified in-hand after user manual adjustment (2026-08-12)
    position: [0.02, 0.11, -0.025],
    rotation: [0, 0, -Math.PI / 2.6],
    scale: 1,
    // Authored long axis = local Y (blade near y=0, handle end near +Y). Shift so
    // the palm sits nearer the handle end instead of mid-shaft.
    gripLocalOffset: [0, -0.24, 0],
  },
  wooden_torch: {
    // Verified in-hand after user manual adjustment (2026-08-12)
    // ~~Verified in-hand (2026-08-12): tip up/out of palm, grip on shaft.~~
    // Mesh long axis treated as +Z (preload applies rotation.x = π/2).
    position: [-0.25, 0.1, -0.02],
    rotation: [Math.PI / 2, -Math.PI / 2, 0],
    scale: 1.1,
    gripLocalOffset: [0, 0, -0.2],
  },
  // Verified in-hand after user manual adjustment (2026-08-12)
  long_sword: {
    position: [-0.3, 0.12, -0.02],
    rotation: [0, 0, Math.PI / 2],
    scale: 1,
    gripLocalOffset: [0, -0.25, 0],
  },
  pickaxe: {
    // Same family as axe until grip is verified in the alignment browser.
    position: [0.02, 0.13, -0.02],
    rotation: [Math.PI / 2, Math.PI / 2, 0],
    scale: 1.2,
    gripLocalOffset: [0, 0, -0.28],
  },
  pitchfork: {
    position: [-0.8, 0.13, -0.02],
    rotation: [Math.PI / 2, -Math.PI / 2, 0],
    scale: 1,
    gripLocalOffset: [0, 0, -0.35],
  },
  // Quaternius Spear — pitchfork family (long polearm shaft).
  spear: {
    position: [-0.6, 0.13, -0.02],
    rotation: [Math.PI / 2, -Math.PI / 2, 0],
    scale: 1,
    gripLocalOffset: [0, 0, -0.3],
  },
  // Plan 159 — procedural mesh only (no GLB); same long-shaft family as
  // spear/pitchfork until a real grip is authored in the alignment browser.
  fishing_rod: {
    position: [-0.5, 0.13, -0.02],
    rotation: [Math.PI / 2, -Math.PI / 2, 0],
    scale: 1,
    gripLocalOffset: [0, 0, -0.3],
  },
  // Quaternius Sword — short_sword family.
  short_sword: {
    position: [-0.22, 0.12, -0.02],
    rotation: [0, 0, Math.PI / 2],
    scale: 0.85,
    gripLocalOffset: [0, -0.18, 0],
  },
  sickle: {
    position: [0, 0.12, -0.01],
    rotation: [Math.PI, 0, Math.PI / 2],
    scale: 1.15,
  },
  // Quaternius Dagger_2 — knife family.
  damascus_knife: {
    position: [0, 0.12, -0.01],
    rotation: [Math.PI, 0, Math.PI / 2],
    scale: 1.25,
  },
  // Quaternius Sword_2 (falchion) — short_sword family.
  damascus_short_sword: {
    position: [-0.22, 0.12, -0.02],
    rotation: [0, 0, Math.PI / 2],
    scale: 0.85,
    gripLocalOffset: [0, -0.18, 0],
  },
  // Quaternius Sword_Big — long_sword family.
  damascus_long_sword: {
    position: [-0.3, 0.12, -0.02],
    rotation: [0, 0, Math.PI / 2],
    scale: 1,
    gripLocalOffset: [0, -0.25, 0],
  },
  // Quaternius Claymore reminted to volcanic glass — long_sword family.
  obsidian_sword: {
    position: [-0.3, 0.12, -0.02],
    rotation: [0, 0, Math.PI / 2],
    scale: 1,
    gripLocalOffset: [0, -0.25, 0],
  },
  // Quaternius Axe Double — axe family, slightly larger.
  battle_axe: {
    position: [0.02, 0.13, -0.02],
    rotation: [Math.PI / 2, Math.PI / 2, 0],
    scale: 1.3,
    gripLocalOffset: [0, 0, -0.32],
  },
  // Quaternius Sword_Golden — long_sword family.
  masterwork_sword: {
    position: [-0.3, 0.12, -0.02],
    rotation: [0, 0, Math.PI / 2],
    scale: 1,
    gripLocalOffset: [0, -0.25, 0],
  },
}

/**
 * Lit branch grip — Branch B is already Z-long (no Y→Z remap). Yaw +π vs
 * wooden_torch so the tip points forward/out of the palm. Shared with
 * `PlayerTorch` and the asset browser in-hand preview.
 */
export const BRANCH_HELD_ATTACH: HeldAttach = {
  // Verified in-hand after user manual adjustment (2026-08-12)
  position: [-0.05, 0.14, -0.05],
  rotation: [Math.PI / 2, Math.PI / 2, 0],
  scale: 1,
  gripLocalOffset: [0, 0, -0.08],
}

/** Longest-axis size while held (meters). Separate from ground-drop sizing. */
export const HELD_GLB: Partial<Record<ToolKind, { url: string, maxSize: number }>> = {
  axe: { url: '/models/items/axe.glb', maxSize: 0.55 },
  knife: { url: '/models/items/knife.glb', maxSize: 0.28 },
  shovel: { url: '/models/items/shovel.glb', maxSize: 0.77 },
  wooden_torch: { url: '/models/items/wooden_torch.glb', maxSize: 0.55 },
  pickaxe: { url: '/models/items/pickaxe.glb', maxSize: 0.55 },
  long_sword: { url: '/models/items/long_sword.glb', maxSize: 0.95 },
  spear: { url: '/models/items/spear.glb', maxSize: 1.05 },
  short_sword: { url: '/models/items/short_sword.glb', maxSize: 0.7 },
  pitchfork: { url: '/models/items/pitchfork.glb', maxSize: 0.81 },
  sickle: { url: '/models/items/sickle.glb', maxSize: 0.36 },
  damascus_knife: { url: '/models/items/damascus_knife.glb', maxSize: 0.28 },
  damascus_short_sword: { url: '/models/items/damascus_short_sword.glb', maxSize: 0.75 },
  damascus_long_sword: { url: '/models/items/damascus_long_sword.glb', maxSize: 0.98 },
  obsidian_sword: { url: '/models/items/obsidian_sword.glb', maxSize: 1.05 },
  battle_axe: { url: '/models/items/battle_axe.glb', maxSize: 0.65 },
  masterwork_sword: { url: '/models/items/masterwork_sword.glb', maxSize: 0.95 },
}

const HELD_ASSET_ID: Partial<Record<ToolKind, string>> = {
  axe: 'held:axe',
  knife: 'held:knife',
  shovel: 'held:shovel',
  wooden_torch: 'held:wooden_torch',
  pickaxe: 'held:pickaxe',
  long_sword: 'held:long_sword',
  spear: 'held:spear',
  short_sword: 'held:short_sword',
  pitchfork: 'held:pitchfork',
  sickle: 'held:sickle',
  damascus_knife: 'held:damascus_knife',
  damascus_short_sword: 'held:damascus_short_sword',
  damascus_long_sword: 'held:damascus_long_sword',
  obsidian_sword: 'held:obsidian_sword',
  battle_axe: 'held:battle_axe',
  masterwork_sword: 'held:masterwork_sword',
}

export type HeldMountContext = {
  characterRoot: Object3D
  /** Asset index id for character anchors (default `character:player`). */
  characterAssetId?: string
  characterHeight?: number
}

const heldTemplates = new Map<ToolKind, Group>()
const _socketWorldScale = new Vector3()

export function findRightHandSocket(root: Object3D): Object3D | null {
  return findAnchorNode(root, RIGHT_HAND_BONE_NAMES).node
}

export async function preloadHeldToolModels(): Promise<void> {
  await Promise.all((Object.keys(HELD_GLB) as ToolKind[]).map(async (kind) => {
    if (heldTemplates.has(kind)) return
    const spec = HELD_GLB[kind]
    if (!spec) return
    try {
      const model = await loadGltf(spec.url)
      // No ground-lay rotation — grip orientation comes from HELD_ATTACH.
      preparePropFitMax(model, spec.maxSize)
      // Wooden torch stick is Y-up like the branch; map to +Z for axe-style attach.
      if (kind === 'wooden_torch') model.rotation.x = Math.PI / 2
      heldTemplates.set(kind, model)
    } catch (err) {
      console.warn(`[held] failed to load ${spec.url}`, err)
    }
  }))
}

/** Build a mesh for the hand socket (GLB when available, else procedural). */
export async function createHeldToolObject(kind: ToolKind): Promise<Object3D> {
  const template = heldTemplates.get(kind)
  if (template) return cloneSkinned(template)

  if (HELD_GLB[kind]) {
    try {
      const spec = HELD_GLB[kind]!
      const model = await loadGltf(spec.url)
      preparePropFitMax(model, spec.maxSize)
      if (kind === 'wooden_torch') model.rotation.x = Math.PI / 2
      heldTemplates.set(kind, model)
      return cloneSkinned(model)
    } catch {
      /* fall through */
    }
  }

  const mesh = createItemMesh(kind)
  mesh.scale.setScalar(kind === 'knife' || kind === 'damascus_knife' ? 0.95 : 0.85)
  return mesh
}

/**
 * Parent `tool` under `socket` with meter-sized attach, compensating Quaternius
 * armature scale (~100 on `CharacterArmature`) so the mesh stays ~hand-sized.
 * Returns the object actually parented (may be a wrapper Group when grip offset
 * is used) — callers should keep that for dispose/remove.
 */
export function mountHeldToolOnSocket(
  tool: Object3D,
  socket: Object3D,
  kind: ToolKind,
  ctx?: HeldMountContext,
): Object3D {
  const assetId = HELD_ASSET_ID[kind]
  if (ctx?.characterRoot && assetId && heldToolHasGripAnchor(assetId)) {
    const spec = HELD_GLB[kind]
    const charId = ctx.characterAssetId ?? 'character:player'
    const mounted = mountByAnchorPair({
      characterRoot: ctx.characterRoot,
      tool,
      socket,
      referenceAnchorName: 'hand.right',
      targetAnchorName: 'grip',
      characterAnchorDefs: anchorsForAsset(charId),
      toolAnchorDefs: anchorsForAsset(assetId),
      characterPrepare: ctx.characterHeight
        ? { mode: 'height', value: ctx.characterHeight }
        : undefined,
      toolPrepare: spec ? { mode: 'fitMax', value: spec.maxSize } : undefined,
      extraScale: HELD_ATTACH[kind].scale,
    })
    if (mounted) return mounted
  }

  const a = HELD_ATTACH[kind]
  const grip = a.gripLocalOffset
  let mount: Object3D = tool
  if (grip) {
    const wrap = new Group()
    tool.position.set(grip[0], grip[1], grip[2])
    wrap.add(tool)
    mount = wrap
  }

  mountAttachOnSocket(mount, socket, a)
  return mount
}

/** Parent `mount` under `socket` with meter-sized attach and armature scale compensation. */
export function mountAttachOnSocket(
  mount: Object3D,
  socket: Object3D,
  attach: HeldAttach,
): void {
  socket.updateWorldMatrix(true, false)
  socket.getWorldScale(_socketWorldScale)
  const sx = Math.max(_socketWorldScale.x, 1e-6)
  const sy = Math.max(_socketWorldScale.y, 1e-6)
  const sz = Math.max(_socketWorldScale.z, 1e-6)

  mount.position.set(
    attach.position[0] / sx,
    attach.position[1] / sy,
    attach.position[2] / sz,
  )
  mount.rotation.set(attach.rotation[0], attach.rotation[1], attach.rotation[2])
  mount.scale.multiplyScalar(attach.scale)
  mount.scale.x /= sx
  mount.scale.y /= sy
  mount.scale.z /= sz
  socket.add(mount)
}
