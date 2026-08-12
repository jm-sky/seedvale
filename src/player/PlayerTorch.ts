import { Group, type Object3D, PointLight, Vector3 } from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import type { HeldAttach } from '../items/heldToolVisual'
import { disposeObject3D, loadGltf, preparePropFitMax } from '../assets/loadGltf'
import { createItemMesh } from '../items/items'
import { createCampfireFlame } from '../settlement/props'

/** Seconds a lit branch burns — portable stopgap (plan 050 / 085). */
export const TORCH_FUEL_BRANCH = 90
/** Wooden torch burns longer than a bare branch (plan 085). */
export const TORCH_FUEL_WOODEN = 240

const BRANCH_URL = '/models/items/branch.glb'
const FIRE_URL = '/models/fx/fire.glb'
const BRANCH_HELD_MAX = 0.55
const FIRE_HELD_MAX = 0.22

/** Grip for ephemeral lit branch (not a ToolKind). Quaternius WristR: +Y fingertips. */
const BRANCH_ATTACH: HeldAttach = {
  position: [0.02, 0.12, -0.02],
  rotation: [0, 0, -Math.PI / 2.4],
  scale: 1,
  gripLocalOffset: [0, -0.12, 0],
}

/** Fire tip offset when wooden_torch is already on the wrist via HeldTool. */
const WOODEN_FIRE_ATTACH: HeldAttach = {
  position: [0.02, 0.14, -0.02],
  rotation: [Math.PI / 2, Math.PI / 2, 0],
  scale: 1,
}

const LIGHT_BRANCH = { color: 0xff8a3c, intensity: 1.35, distance: 6.5 }
const LIGHT_WOODEN = { color: 0xff9a4a, intensity: 2.4, distance: 11 }

export type TorchSource = 'branch' | 'wooden_torch'

export type PlayerTorch = {
  isLit: () => boolean
  source: () => TorchSource | null
  /** Ignites — caller checks inventory / held tool first. */
  light: (source: TorchSource) => Promise<void>
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

const _socketWorldScale = new Vector3()

async function ensureTemplates(): Promise<void> {
  if (branchTemplate && fireTemplate) return
  if (!templatesPromise) {
    templatesPromise = (async () => {
      try {
        const model = await loadGltf(BRANCH_URL)
        preparePropFitMax(model, BRANCH_HELD_MAX)
        branchTemplate = model
      } catch (err) {
        console.warn('[torch] failed to load branch.glb', err)
      }
      try {
        const model = await loadGltf(FIRE_URL)
        preparePropFitMax(model, FIRE_HELD_MAX)
        fireTemplate = model
      } catch (err) {
        console.warn('[torch] failed to load fire.glb', err)
      }
    })()
  }
  await templatesPromise
}

function cloneBranchMesh(): Object3D {
  if (branchTemplate) return cloneSkinned(branchTemplate)
  return createItemMesh('branch')
}

function makeFlameVisual(scale: number): FlameVisual {
  if (fireTemplate) {
    const fire = cloneSkinned(fireTemplate)
    const base = scale
    fire.scale.setScalar(base)
    fire.visible = true
    return {
      object: fire,
      update: () => { /* static GLB tip */ },
      setSize(f: number) {
        fire.scale.setScalar(Math.max(0.15, f) * base)
      },
    }
  }
  return createCampfireFlame(0.45 * scale)
}

function mountOnSocket(mount: Object3D, socket: Object3D, attach: HeldAttach): void {
  socket.updateWorldMatrix(true, false)
  socket.getWorldScale(_socketWorldScale)
  const sx = Math.max(_socketWorldScale.x, 1e-6)
  const sy = Math.max(_socketWorldScale.y, 1e-6)
  const sz = Math.max(_socketWorldScale.z, 1e-6)
  mount.position.set(attach.position[0] / sx, attach.position[1] / sy, attach.position[2] / sz)
  mount.rotation.set(attach.rotation[0], attach.rotation[1], attach.rotation[2])
  mount.scale.setScalar(attach.scale)
  mount.scale.x /= sx
  mount.scale.y /= sy
  mount.scale.z /= sz
  socket.add(mount)
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
    async light(source) {
      const token = ++loadToken
      await ensureTemplates()
      if (token !== loadToken) return

      clearMount()
      lit = true
      current = source
      fuelMax = source === 'wooden_torch' ? TORCH_FUEL_WOODEN : TORCH_FUEL_BRANCH
      fuelRemaining = fuelMax

      const socket = hand.handSocket()
      const group = new Group()
      const flame = makeFlameVisual(source === 'wooden_torch' ? 1.15 : 1)
      flame.object.visible = true
      flameUpdate = flame.update
      flameSetSize = flame.setSize
      flame.setSize(1)

      const params = source === 'wooden_torch' ? LIGHT_WOODEN : LIGHT_BRANCH
      pointLight = new PointLight(params.color, params.intensity, params.distance, 2)

      if (source === 'branch') {
        const branch = cloneBranchMesh()
        const wrap = new Group()
        const grip = BRANCH_ATTACH.gripLocalOffset
        if (grip) branch.position.set(grip[0], grip[1], grip[2])
        flame.object.position.set(0, 0.3, 0)
        pointLight.position.set(0, 0.32, 0)
        wrap.add(branch)
        wrap.add(flame.object)
        wrap.add(pointLight)
        group.add(wrap)
        mountOnSocket(group, socket, BRANCH_ATTACH)
      } else {
        // Fire tip only — wooden_torch mesh comes from HeldTool / setHeldTool.
        flame.object.position.set(0, 0.32, 0)
        pointLight.position.set(0, 0.34, 0)
        group.add(flame.object)
        group.add(pointLight)
        mountOnSocket(group, socket, WOODEN_FIRE_ATTACH)
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
          const base = current === 'wooden_torch' ? LIGHT_WOODEN.intensity : LIGHT_BRANCH.intensity
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
