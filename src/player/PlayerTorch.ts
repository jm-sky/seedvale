import { Group, type Material, type Mesh, type Object3D, PointLight } from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import type { HeldAttach } from '../items/heldToolVisual'
import { disposeObject3D, loadGltf, preparePropFitMax } from '../assets/loadGltf'
import { BRANCH_HELD_ATTACH, mountAttachOnSocket } from '../items/heldToolVisual'
import { createItemMesh } from '../items/items'
import { createCampfireFlame } from '../settlement/props'
import {
  BRANCH_HELD_MAX,
  BRANCH_URL,
  TORCH_LIGHT_BRANCH,
  TORCH_LIGHT_DECAY,
  TORCH_LIGHT_LOCAL_OFFSET,
  TORCH_LIGHT_WOODEN,
} from './torchLightPresets'

/** Seconds a lit branch burns — portable stopgap (plan 050 / 085). */
export const TORCH_FUEL_BRANCH = 90
/** Wooden torch burns longer than a bare branch (plan 085). */
export const TORCH_FUEL_WOODEN = 240

/**
 * TEMP — grip-tuning: hide sparks / fire.glb tip so only the stick mesh is
 * visible. Flip back to `true` once `BRANCH_ATTACH` / `wooden_torch` HELD_ATTACH
 * look right.
 */
const SHOW_HAND_FLAME_VISUAL = false

const FIRE_URL = '/models/fx/fire.glb'
/** Accent tip only — sparks/cone come from `createCampfireFlame`. */
const FIRE_TIP_MAX = 0.11
const FLAME_OPACITY = 0.75

/** PointLight / future flame tip — same wrist TRS as `HELD_ATTACH.wooden_torch`. */
const WOODEN_FIRE_ATTACH: HeldAttach = {
  position: [-0.25, 0.085, -0.02],
  rotation: [Math.PI / 2, -Math.PI / 2, 0],
  scale: 1,
}

// BRANCH_HELD_ATTACH / WOODEN_FIRE_ATTACH duplicate HELD_ATTACH.wooden_torch — Phase 6 migration candidate.

export type TorchSource = 'branch' | 'wooden_torch'

export type PlayerTorch = {
  isLit: () => boolean
  source: () => TorchSource | null
  fuelRemaining: () => number
  /** Ignites — caller checks inventory / held tool first.
   *  Optional `fuelRemaining` restores a mid-burn torch from save. */
  light: (source: TorchSource, opts?: { fuelRemaining?: number }) => Promise<void>
  extinguish: () => void
  update: (dt: number) => void
  dispose: () => void
}

type HandAccess = {
  /** Right wrist (or model root fallback). */
  handSocket: () => Object3D
  /** Fired when lit state / source changes (HUD sync). */
  onChange?: () => void
}

type FlameVisual = {
  object: Object3D
  update: (dt: number) => void
  setSize: (factor: number) => void
}

let branchTemplate: Group | null = null
let fireTemplate: Group | null = null
let templatesPromise: Promise<void> | null = null

async function ensureTemplates(): Promise<void> {
  if (branchTemplate && (!SHOW_HAND_FLAME_VISUAL || fireTemplate)) return
  if (!templatesPromise) {
    templatesPromise = (async () => {
      try {
        const model = await loadGltf(BRANCH_URL)
        preparePropFitMax(model, BRANCH_HELD_MAX)
        branchTemplate = model
      } catch (err) {
        console.warn('[torch] failed to load branch.glb', err)
      }
      if (SHOW_HAND_FLAME_VISUAL) {
        try {
          const model = await loadGltf(FIRE_URL)
          preparePropFitMax(model, FIRE_TIP_MAX)
          // Stand the authored flat fire so local +Y is "up the tip".
          model.rotation.x = Math.PI / 2
          fireTemplate = model
        } catch (err) {
          console.warn('[torch] failed to load fire.glb', err)
        }
      }
    })()
  }
  await templatesPromise
}

function cloneBranchMesh(): Object3D {
  // Branch B is already Z-long in the GLB — keep authored orientation.
  return branchTemplate ? cloneSkinned(branchTemplate) : createItemMesh('branch')
}

function softenMaterials(root: Object3D, opacity: number): void {
  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of mats) {
      const m = mat as Material & { opacity?: number, transparent?: boolean, depthWrite?: boolean }
      m.transparent = true
      m.opacity = opacity
      m.depthWrite = false
    }
  })
}

function muteInternalLights(root: Object3D): void {
  root.traverse((obj) => {
    if ('isLight' in obj && (obj as { isLight?: boolean }).isLight) {
      ;(obj as PointLight).intensity = 0
    }
  })
}

/**
 * Handheld flame: procedural sparks/cone + optional small fire.glb tip (~75%
 * opacity). Own PointLight is added by the caller. Local +Y = flame up.
 */
function makeFlameVisual(scale: number): FlameVisual {
  const group = new Group()
  const procedural = createCampfireFlame(0.28 * scale)
  procedural.object.visible = true
  muteInternalLights(procedural.object)
  softenMaterials(procedural.object, FLAME_OPACITY)
  group.add(procedural.object)

  let tip: Object3D | null = null
  let tipBase = 1
  if (fireTemplate) {
    tip = cloneSkinned(fireTemplate)
    tipBase = 0.85 * scale
    tip.scale.setScalar(tipBase)
    tip.position.y = 0.08 * scale
    softenMaterials(tip, FLAME_OPACITY)
    group.add(tip)
  }

  return {
    object: group,
    update: procedural.update,
    setSize(f: number) {
      procedural.setSize(f)
      if (tip) tip.scale.setScalar(Math.max(0.2, f) * tipBase)
    },
  }
}

/**
 * Portable hand light — lit branch (consumes branch) or wooden torch item.
 * Mounts on the right wrist; replaces the old body-offset procedural flame.
 */
export function createPlayerTorch(hand: HandAccess): PlayerTorch {
  let lit = false
  let current: TorchSource | null = null
  let fuelRemaining = 0
  let fuelMax = TORCH_FUEL_BRANCH
  let mount: Object3D | null = null
  let flameUpdate: ((dt: number) => void) | null = null
  let flameSetSize: ((f: number) => void) | null = null
  let pointLight: PointLight | null = null
  let loadToken = 0

  const clearMount = () => {
    if (mount) {
      mount.removeFromParent()
      disposeObject3D(mount)
      mount = null
    }
    flameUpdate = null
    flameSetSize = null
    pointLight = null
  }

  const notify = () => hand.onChange?.()

  return {
    isLit: () => lit,
    source: () => current,
    fuelRemaining: () => (lit ? fuelRemaining : 0),
    async light(source, opts) {
      const token = ++loadToken
      await ensureTemplates()
      if (token !== loadToken) return

      clearMount()
      lit = true
      current = source
      fuelMax = source === 'wooden_torch' ? TORCH_FUEL_WOODEN : TORCH_FUEL_BRANCH
      const restored = opts?.fuelRemaining
      fuelRemaining =
        typeof restored === 'number' && Number.isFinite(restored)
          ? Math.max(0.05, Math.min(fuelMax, restored))
          : fuelMax

      const socket = hand.handSocket()
      const group = new Group()
      const ratio = fuelRemaining / fuelMax

      const params = source === 'wooden_torch' ? TORCH_LIGHT_WOODEN : TORCH_LIGHT_BRANCH
      pointLight = new PointLight(
        params.color,
        params.intensity * ratio,
        params.distance,
        TORCH_LIGHT_DECAY,
      )
      pointLight.position.set(
        TORCH_LIGHT_LOCAL_OFFSET[0],
        TORCH_LIGHT_LOCAL_OFFSET[1],
        TORCH_LIGHT_LOCAL_OFFSET[2],
      )

      let flameObject: Object3D | null = null
      if (SHOW_HAND_FLAME_VISUAL) {
        const flame = makeFlameVisual(source === 'wooden_torch' ? 1.05 : 0.9)
        flame.object.visible = true
        flameUpdate = flame.update
        flameSetSize = flame.setSize
        flame.setSize(ratio)
        // Align flame local +Y (sparks/cone up) with tip +Z.
        flame.object.rotation.x = Math.PI / 2
        flame.object.position.set(0, 0, 0.34)
        flameObject = flame.object
      }

      if (source === 'branch') {
        const branch = cloneBranchMesh()
        const wrap = new Group()
        const grip = BRANCH_HELD_ATTACH.gripLocalOffset
        // Long axis is +Z after cloneBranchMesh reorient; grip toward butt.
        if (grip) branch.position.set(grip[0], grip[1], grip[2])
        wrap.add(branch)
        if (flameObject) wrap.add(flameObject)
        wrap.add(pointLight)
        group.add(wrap)
        mountAttachOnSocket(group, socket, BRANCH_HELD_ATTACH)
      } else {
        // Stick mesh comes from HeldTool; this mount is light (+ optional flame).
        if (flameObject) group.add(flameObject)
        group.add(pointLight)
        mountAttachOnSocket(group, socket, WOODEN_FIRE_ATTACH)
      }

      mount = group
      notify()
    },
    extinguish() {
      loadToken++
      lit = false
      current = null
      fuelRemaining = 0
      clearMount()
      notify()
    },
    update(dt) {
      if (!lit) return
      flameUpdate?.(dt)
      fuelRemaining -= dt
      if (fuelRemaining <= 0) {
        lit = false
        current = null
        fuelRemaining = 0
        clearMount()
        notify()
      } else {
        const ratio = fuelRemaining / fuelMax
        flameSetSize?.(ratio)
        if (pointLight) {
          const base = current === 'wooden_torch' ? TORCH_LIGHT_WOODEN.intensity : TORCH_LIGHT_BRANCH.intensity
          pointLight.intensity = base * ratio
        }
      }
    },
    dispose() {
      loadToken++
      lit = false
      current = null
      clearMount()
    },
  }
}
