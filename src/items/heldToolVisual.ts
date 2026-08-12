import { Bone, Group, type Object3D, Vector3 } from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import type { ToolKind } from './HeldTool'
import { loadGltf, preparePropFitMax } from '../assets/loadGltf'
import { createItemMesh } from './items'

/** Quaternius Modular / Adventurer use `WristR` (no dot). Keep dotted/Mixamo
 *  aliases for older exports. */
export const RIGHT_HAND_BONE_NAMES = [
  'WristR',
  'HandR',
  'Wrist.R',
  'Hand.R',
  'mixamorigRightHand',
] as const

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
  knife: {
    position: [0, 0.12, 0.0],
    rotation: [Math.PI, 0, Math.PI / 2],
    scale: 1.25,
  },
  shovel: {
    position: [0.02, 0.11, -0.025],
    rotation: [0, 0, -Math.PI / 2.6],
    scale: 1,
    // Authored long axis = local Y (blade near y=0, handle end near +Y). Shift so
    // the palm sits nearer the handle end instead of mid-shaft.
    gripLocalOffset: [0, -0.24, 0],
  },
  wooden_torch: {
    // Verified in-hand (2026-08-12): tip up/out of palm, grip on shaft.
    // Mesh long axis treated as +Z (preload applies rotation.x = π/2).
    position: [-0.25, 0.085, -0.02],
    rotation: [Math.PI / 2, -Math.PI / 2, 0],
    scale: 1.1,
    gripLocalOffset: [0, 0, -0.2],
  },
}

/** Longest-axis size while held (meters). Separate from ground-drop sizing. */
const HELD_GLB: Partial<Record<ToolKind, { url: string, maxSize: number }>> = {
  axe: { url: '/models/items/axe.glb', maxSize: 0.55 },
  knife: { url: '/models/items/knife.glb', maxSize: 0.28 },
  shovel: { url: '/models/items/shovel.glb', maxSize: 0.77 },
  wooden_torch: { url: '/models/items/wooden_torch.glb', maxSize: 0.55 },
}

const heldTemplates = new Map<ToolKind, Group>()
const _socketWorldScale = new Vector3()

export function findRightHandSocket(root: Object3D): Object3D | null {
  let bone: Object3D | null = null
  let any: Object3D | null = null
  root.traverse((obj) => {
    if (!(RIGHT_HAND_BONE_NAMES as readonly string[]).includes(obj.name)) return
    if (!any) any = obj
    if (obj instanceof Bone && !bone) bone = obj
  })
  return bone ?? any
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
  mesh.scale.setScalar(kind === 'knife' ? 0.95 : 0.85)
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
): Object3D {
  const a = HELD_ATTACH[kind]
  socket.updateWorldMatrix(true, false)
  socket.getWorldScale(_socketWorldScale)
  const sx = Math.max(_socketWorldScale.x, 1e-6)
  const sy = Math.max(_socketWorldScale.y, 1e-6)
  const sz = Math.max(_socketWorldScale.z, 1e-6)

  const grip = a.gripLocalOffset
  let mount: Object3D = tool
  if (grip) {
    const wrap = new Group()
    tool.position.set(grip[0], grip[1], grip[2])
    wrap.add(tool)
    mount = wrap
  }

  mount.position.set(a.position[0] / sx, a.position[1] / sy, a.position[2] / sz)
  mount.rotation.set(a.rotation[0], a.rotation[1], a.rotation[2])
  mount.scale.multiplyScalar(a.scale)
  mount.scale.x /= sx
  mount.scale.y /= sy
  mount.scale.z /= sz
  socket.add(mount)
  return mount
}
