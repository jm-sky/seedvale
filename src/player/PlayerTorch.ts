import { Group, Matrix4, type Object3D, PointLight, Vector3 } from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { disposeObject3D, loadGltf, preparePropFitMax } from '../assets/loadGltf'
import { BRANCH_HELD_ATTACH, HELD_ATTACH, mountAttachOnSocket } from '../items/heldToolVisual'
import { createItemMesh } from '../items/items'
import { createFireVisual } from '../shared/getFireParticles'
import { TORCH_DEFAULT_FIRE_VISUAL } from '../shared/torchConfig'
import { createNullPointLightBudget, type PointLightBudget } from '../world/pointLightBudget'
import {
  BRANCH_HELD_MAX,
  BRANCH_URL,
  resolveTorchLight,
  TORCH_FLAME_OFFSET_WOODEN,
  TORCH_LIGHT_BRANCH,
  TORCH_LIGHT_DECAY,
  TORCH_LIGHT_WOODEN,
  TORCH_TIP_OFFSET_BRANCH,
  TORCH_TIP_OFFSET_WOODEN,
} from './torchLightPresets'

/** Seconds a lit branch burns — portable stopgap (plan 050 / 085). */
export const TORCH_FUEL_BRANCH = 90
/** Wooden torch burns longer than a bare branch (plan 085). */
export const TORCH_FUEL_WOODEN = 240

export type TorchSource = 'branch' | 'wooden_torch'

export type PlayerTorch = {
  isLit: () => boolean
  source: () => TorchSource | null
  fuelRemaining: () => number
  /** Ignites — caller checks inventory / held tool first.
   *  Optional `fuelRemaining` restores a mid-burn torch from save.
   *  `silent` skips ignite SFX (save restore). */
  light: (source: TorchSource, opts?: { fuelRemaining?: number, silent?: boolean }) => Promise<void>
  extinguish: () => void
  update: (dt: number) => void
  dispose: () => void
}

type HandAccess = {
  /** Right wrist (or model root fallback). */
  handSocket: () => Object3D
  /** Currently-equipped held-tool mesh (`PlayerController.getHeldToolObject`).
   *  Not the same object as this module's own `mount` (sparks/light
   *  overlay); the visible tool mesh lives in `heldToolVisual.ts`/
   *  `PlayerController`. Not read by this module yet — wired through for a
   *  future feature that needs to reach the equipped mesh from here. */
  heldToolObject?: () => Object3D | null
  /** Fired when lit state / source changes (HUD sync). */
  onChange?: () => void
  onIgnite?: () => void
  onExtinguish?: () => void
  /** True while the player is currently inside a cave (world-terrain-008
   *  Milestone A test-environment patch) — brightens/extends only this
   *  torch's own `PointLight`; defaults to `false` for callers that don't
   *  wire cave awareness through. */
  isInCave?: () => boolean
}

type FlameVisual = {
  object: Object3D
  update: (dt: number) => void
  setSize: (factor: number) => void
}

let branchTemplate: Group | null = null
let templatesPromise: Promise<void> | null = null

const _invParent = new Matrix4()
const _localUp = new Vector3()
const _fromY = new Vector3(0, 1, 0)

/** Fire-visual sim uses local +Y as rise — counter the wrist/tool rotation so +Y is world up. */
function alignLocalYToWorldUp(obj: Object3D): void {
  const parent = obj.parent
  if (!parent) return
  parent.updateWorldMatrix(true, false)
  _invParent.copy(parent.matrixWorld).invert()
  _localUp.set(0, 1, 0).transformDirection(_invParent)
  if (_localUp.lengthSq() < 1e-8) return
  obj.quaternion.setFromUnitVectors(_fromY, _localUp.normalize())
}

async function ensureTemplates(): Promise<void> {
  if (branchTemplate) return
  templatesPromise ??= (async () => {
    try {
      const model = await loadGltf(BRANCH_URL)
      preparePropFitMax(model, BRANCH_HELD_MAX)
      branchTemplate = model
    } catch (err) {
      console.warn('[torch] failed to load branch.glb', err)
    }
  })()
  await templatesPromise
}

function cloneBranchMesh(): Object3D {
  // Branch B is already Z-long in the GLB — keep authored orientation.
  return branchTemplate ? cloneSkinned(branchTemplate) : createItemMesh('branch')
}

/**
 * Handheld flame — the shared particle VFX (`shared/getFireParticles.ts`).
 * Own PointLight is added by the caller. Local +Y = flame up.
 */
function makeFlameVisual(scale: number): FlameVisual {
  const fireVisual = createFireVisual({ ...TORCH_DEFAULT_FIRE_VISUAL, size: 0.5 * scale })
  fireVisual.object.visible = true
  return { object: fireVisual.object, update: fireVisual.update, setSize: fireVisual.setSize }
}

/**
 * Portable hand light — lit branch (consumes branch) or wooden torch item.
 * Mounts on the right wrist; replaces the old body-offset procedural flame.
 */
export function createPlayerTorch(
  hand: HandAccess,
  /** Plan 157 — registers the real torch light so production
   *  `NUM_POINT_LIGHTS` stabilization (`src/world/pointLightBudget.ts`) knows
   *  it exists while lit. Defaults to a no-op for callers that don't wire one. */
  pointLightBudget: PointLightBudget = createNullPointLightBudget(),
): PlayerTorch {
  let lit = false
  let current: TorchSource | null = null
  let fuelRemaining = 0
  let fuelMax = TORCH_FUEL_BRANCH
  let mount: Object3D | null = null
  let flameUpdate: ((dt: number) => void) | null = null
  let flameSetSize: ((f: number) => void) | null = null
  let pointLight: PointLight | null = null
  let worldUpFire: Object3D | null = null
  let loadToken = 0

  const clearMount = () => {
    if (mount) {
      mount.removeFromParent()
      disposeObject3D(mount)
      mount = null
    }
    if (pointLight) pointLightBudget.unregister(pointLight)
    flameUpdate = null
    flameSetSize = null
    pointLight = null
    worldUpFire = null
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
      const resolvedLight = resolveTorchLight(params, ratio, hand.isInCave?.() ?? false)
      pointLight = new PointLight(
        params.color,
        resolvedLight.intensity,
        resolvedLight.distance,
        TORCH_LIGHT_DECAY,
      )
      const tipOffset = source === 'wooden_torch' ? TORCH_TIP_OFFSET_WOODEN : TORCH_TIP_OFFSET_BRANCH
      pointLight.position.set(tipOffset[0], tipOffset[1], tipOffset[2])
      pointLightBudget.register(pointLight)

      if (source === 'branch') {
        const flame = makeFlameVisual(0.9)
        flame.object.visible = true
        flameUpdate = flame.update
        flameSetSize = flame.setSize
        flame.setSize(ratio)
        // The flame sim's rise is local +Y — realign every frame to world up
        // (below), same as the wooden-torch branch. A one-time static
        // rotation here (aligning +Y to the grip's +Z instead) was fine for
        // the old static cone/GLB tip mesh, but sends a *rising* particle
        // flame drifting along whatever direction the held branch happens to
        // point in world space instead of upward.
        flame.object.position.set(tipOffset[0], tipOffset[1], tipOffset[2])
        worldUpFire = flame.object

        const branch = cloneBranchMesh()
        const wrap = new Group()
        const grip = BRANCH_HELD_ATTACH.gripLocalOffset
        // Long axis is +Z after cloneBranchMesh reorient; grip toward butt.
        if (grip) branch.position.set(grip[0], grip[1], grip[2])
        wrap.add(branch)
        wrap.add(flame.object)
        wrap.add(pointLight)
        group.add(wrap)
        mountAttachOnSocket(group, socket, BRANCH_HELD_ATTACH)
        alignLocalYToWorldUp(flame.object)
      } else {
        // Stick mesh comes from HeldTool. Light + a small flame at the tip —
        // anchored a bit behind the light (see `TORCH_FLAME_OFFSET_WOODEN`)
        // so the (larger, drifting) particle flame doesn't read as floating
        // past the torch head.
        const flame = makeFlameVisual(0.55)
        flame.object.position.set(
          TORCH_FLAME_OFFSET_WOODEN[0],
          TORCH_FLAME_OFFSET_WOODEN[1],
          TORCH_FLAME_OFFSET_WOODEN[2],
        )
        flameUpdate = flame.update
        flameSetSize = flame.setSize
        flame.setSize(ratio)
        worldUpFire = flame.object
        group.add(flame.object)
        group.add(pointLight)
        mountAttachOnSocket(group, socket, HELD_ATTACH.wooden_torch)
        alignLocalYToWorldUp(flame.object)
      }

      mount = group
      notify()
      if (!opts?.silent) hand.onIgnite?.()
    },
    extinguish() {
      const wasLit = lit
      loadToken++
      lit = false
      current = null
      fuelRemaining = 0
      clearMount()
      notify()
      if (wasLit) hand.onExtinguish?.()
    },
    update(dt) {
      if (!lit) return
      if (worldUpFire) alignLocalYToWorldUp(worldUpFire)
      flameUpdate?.(dt)
      fuelRemaining -= dt
      if (fuelRemaining <= 0) {
        lit = false
        current = null
        fuelRemaining = 0
        clearMount()
        notify()
        hand.onExtinguish?.()
      } else {
        const ratio = fuelRemaining / fuelMax
        flameSetSize?.(ratio)
        if (pointLight) {
          const base = current === 'wooden_torch' ? TORCH_LIGHT_WOODEN : TORCH_LIGHT_BRANCH
          const resolvedLight = resolveTorchLight(base, ratio, hand.isInCave?.() ?? false)
          pointLight.intensity = resolvedLight.intensity
          pointLight.distance = resolvedLight.distance
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
