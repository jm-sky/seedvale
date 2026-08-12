import { Bone, type Group, type Object3D } from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import type { ToolKind } from './HeldTool'
import { loadGltf, preparePropFitMax } from '../assets/loadGltf'
import { createItemMesh } from './items'

export const RIGHT_HAND_BONE_NAMES = ['Wrist.R', 'Hand.R', 'mixamorigRightHand'] as const

export type HeldAttach = {
  position: readonly [number, number, number]
  rotation: readonly [number, number, number]
  /** Extra uniform scale on top of the prepared held mesh. */
  scale: number
}

/** Local TRS relative to Quaternius `Wrist.R` — tune visually in-game. */
export const HELD_ATTACH: Record<ToolKind, HeldAttach> = {
  axe: {
    position: [0.03, -0.02, 0.02],
    rotation: [0, 0, -Math.PI / 2.5],
    scale: 1,
  },
  firestarter: {
    position: [0.03, -0.02, 0.05],
    rotation: [0.4, 0.2, 0.3],
    scale: 1,
  },
  knife: {
    position: [0.02, -0.01, 0.04],
    rotation: [Math.PI / 2, 0, Math.PI / 2],
    scale: 1,
  },
  shovel: {
    position: [0.03, -0.02, 0.02],
    rotation: [0, 0, -Math.PI / 2.6],
    scale: 1,
  },
}

/** Longest-axis size while held (meters). Separate from ground-drop sizing. */
const HELD_GLB: Partial<Record<ToolKind, { url: string, maxSize: number }>> = {
  axe: { url: '/models/items/axe.glb', maxSize: 0.55 },
  knife: { url: '/models/items/knife.glb', maxSize: 0.28 },
  shovel: { url: '/models/items/shovel.glb', maxSize: 0.7 },
}

const heldTemplates = new Map<ToolKind, Group>()

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

export function applyHeldAttach(tool: Object3D, kind: ToolKind): void {
  const a = HELD_ATTACH[kind]
  tool.position.set(a.position[0], a.position[1], a.position[2])
  tool.rotation.set(a.rotation[0], a.rotation[1], a.rotation[2])
  tool.scale.multiplyScalar(a.scale)
}
