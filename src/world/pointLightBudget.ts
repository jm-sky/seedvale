import * as THREE from 'three'

/**
 * Plan 157 — production `NUM_POINT_LIGHTS` stabilization.
 *
 * Three.js keys part of its `WebGLProgram` cache on the number of currently
 * visible `PointLight`s (`WebGLLights.setup`'s `pointLength`). As settlements
 * stream in/out that count changes, forcing every `MeshStandardMaterial` to
 * be first-used again at each new count — the dominant axis behind the
 * first-use shader/program hitch investigated in plan 149 (see
 * `docs/reviews/2026-08-18--023--plan-149-pointlight-variant-axis.md` and
 * `...024--plan-149-pointlight-budget-curve.md`).
 *
 * This module replaces that investigation's diagnostic pad
 * (`src/perf/pointLightBudget.ts`, deleted — see plan 157 §8 for what was
 * kept/discarded). Unlike that pad, this one:
 *  - never patches `Object3D.prototype.add`/`remove` — every real `PointLight`
 *    is created at one of a small number of already-owned lifecycle sites
 *    (`createSettlement`'s build/`dispose()`, `PlacedFires`'s
 *    `spawn`/`despawn`, `PlayerTorch`'s `light`/`clearMount`), so those sites
 *    call `registerSubtree`/`unregisterSubtree`/`register`/`unregister`
 *    directly instead of being discovered by a global patch;
 *  - never walks the whole scene, not even once per frame — `sync()` only
 *    ever iterates this module's own registry (bounded to real lights that
 *    actually exist right now, typically dozens) plus each light's own
 *    ancestor chain (bounded depth);
 *  - protects lights near the camera from overflow-cull (plan 157 §3.4) —
 *    review 024 found unconditional dimmest/furthest culling could darken a
 *    settlement the player is standing in.
 */

export const POINT_LIGHT_PAD_USERDATA = 'seedvalePointLightPad'
export const POINT_LIGHT_PAD_NAME = '__seedvalePointLightPad'
export const POINT_LIGHT_CULL_USERDATA = 'seedvalePointLightBudgetCull'

/** Near-camera radius (world units) overflow-cull never touches — plan 157
 *  §3.4. Order-of-magnitude from `VILLAGE_SIZE_CONFIG`'s `houseSpacing`
 *  (`src/settlement/families.ts`, 10–16 depending on size): large enough to
 *  cover "the settlement the player is currently standing in", small enough
 *  to still let a genuinely distant settlement be culled. Provisional —
 *  confirm visually per plan 157 §10 open question 4. */
export const POINT_LIGHT_PROTECT_RADIUS = 30

export type PointLightBudgetSnapshot = {
  /** `null` when pad/cull is disabled (`?pointLightBudget=off`) — the
   *  registry still tracks real lights but no dummy pad or overflow-cull
   *  runs. Production default is 16. */
  budget: number | null
  realCount: number
  padVisible: number
  totalVisible: number
  overflow: boolean
  /** Highest `realCount` seen across every `sync()` call so far. */
  overflowMax: number
  /** Real lights hidden this sync so the visible count stays at `budget`. */
  culled: number
  /** Real lights that would have been cull candidates but sit inside
   *  {@link POINT_LIGHT_PROTECT_RADIUS} of the camera and were kept lit
   *  instead (plan 157 §3.4). */
  protectedFromCull: number
  /** `true` when overflow could not be fully resolved without culling a
   *  protected light — the budget is too low for this scene right now.
   *  Logged (dev-only), never forced through. */
  budgetTooLowForScene: boolean
  /** Last `sync()` wall time in ms — registry walk + ancestor-visibility
   *  checks + dummy/cull flips. No scene traversal. */
  syncMs: number
  registrySize: number
}

export type PointLightBudget = {
  budget: number | null
  /** One-time bounded walk of `root`'s own subtree (a settlement's group, a
   *  placed fire's group, ...) — never `scene` itself, never per frame. Adds
   *  every real (non-pad) `PointLight` found to the registry. Call once right
   *  after the subtree is built, before or after it's attached to `scene`. */
  registerSubtree: (root: THREE.Object3D) => void
  /** Matching one-time walk at teardown — call before the subtree leaves the
   *  scene (or any time after; unregistering doesn't require it still be
   *  attached). */
  unregisterSubtree: (root: THREE.Object3D) => void
  /** Direct register/unregister for a single light created outside a subtree
   *  walk (`PlayerTorch`'s own hand light). */
  register: (light: THREE.PointLight) => void
  unregister: (light: THREE.PointLight) => void
  /** Recount visible registered lights and, if `budget` is set, pad/cull to
   *  it. Call once per frame, before any render pass. Pass the beauty camera
   *  so overflow-cull can protect near-camera lights (plan 157 §3.4) — omit
   *  it (tests) to disable that protection. Production default budget is 16. */
  sync: (camera?: THREE.Camera) => PointLightBudgetSnapshot
  snapshot: () => PointLightBudgetSnapshot
  dispose: () => void
}

const EMPTY_SNAPSHOT: PointLightBudgetSnapshot = {
  budget: null,
  realCount: 0,
  padVisible: 0,
  totalVisible: 0,
  overflow: false,
  overflowMax: 0,
  culled: 0,
  protectedFromCull: 0,
  budgetTooLowForScene: false,
  syncMs: 0,
  registrySize: 0,
}

function isPadLight(obj: { userData?: Record<string, unknown> }): boolean {
  return obj.userData?.[POINT_LIGHT_PAD_USERDATA] === true
}

function isPointLight(obj: THREE.Object3D): obj is THREE.PointLight {
  return (obj as THREE.PointLight).isPointLight === true
}

/** Bounded walk of one already-known root (a settlement group, a placed
 *  fire's visual, ...) — never `scene`. Registration/unregistration only, not
 *  called from `sync()`. */
function walkPointLights(root: THREE.Object3D, visit: (light: THREE.PointLight) => void): void {
  if (isPointLight(root) && !isPadLight(root)) visit(root)
  const children = root.children
  for (let i = 0; i < children.length; i++) {
    walkPointLights(children[i]!, visit)
  }
}

/** True when every ancestor including `scene` is visible — same skip rule as
 *  Three's `projectObject`. Objects not parented under `scene` are excluded.
 *  Bounded by ancestor depth (a handful of levels), not scene size. */
function isWorldVisibleUnderScene(obj: THREE.Object3D, scene: THREE.Scene): boolean {
  let o: THREE.Object3D | null = obj
  while (o) {
    if (!o.visible) return false
    if (o === scene) return true
    o = o.parent
  }
  return false
}

/** Oracle for tests only — full-scene walk matching Three's `projectObject`.
 *  Production `sync()` must never call this. */
export function countVisibleRealPointLights(scene: THREE.Scene): number {
  let n = 0
  scene.traverseVisible((obj) => {
    if (isPointLight(obj) && !isPadLight(obj)) n++
  })
  return n
}

function distanceSqToCamera(light: THREE.PointLight, camera: THREE.Camera): number {
  light.updateWorldMatrix(true, false)
  const x = light.matrixWorld.elements[12]! - camera.position.x
  const y = light.matrixWorld.elements[13]! - camera.position.y
  const z = light.matrixWorld.elements[14]! - camera.position.z
  return x * x + y * y + z * z
}

export function createPointLightBudget(scene: THREE.Scene, budget: number | null): PointLightBudget {
  const registry = new Set<THREE.PointLight>()

  let group: THREE.Group | null = null
  const dummies: THREE.PointLight[] = []
  if (budget !== null && budget > 0) {
    group = new THREE.Group()
    group.name = POINT_LIGHT_PAD_NAME
    group.matrixAutoUpdate = false
    for (let i = 0; i < budget; i++) {
      // `distance = 1` (not 0): Three treats 0 as infinite range. Combined
      // with intensity 0 the loop still runs but lighting is black either
      // way; a finite cutoff plus a far-below-world position is
      // belt-and-suspenders against any shader path that ignored intensity.
      const light = new THREE.PointLight(0x000000, 0, 1, 2)
      light.name = `${POINT_LIGHT_PAD_NAME}_${i}`
      light.userData[POINT_LIGHT_PAD_USERDATA] = true
      light.castShadow = false
      light.position.set(0, -100_000, 0)
      light.matrixAutoUpdate = false
      light.updateMatrix()
      group.add(light)
      dummies.push(light)
    }
    scene.add(group)
  }

  let overflowMax = 0
  const culledLights: { light: THREE.PointLight, intensityWhenCulled: number }[] = []
  let last: PointLightBudgetSnapshot = { ...EMPTY_SNAPSHOT, budget }

  function dropCulled(light: THREE.PointLight): void {
    const idx = culledLights.findIndex((entry) => entry.light === light)
    if (idx >= 0) culledLights.splice(idx, 1)
  }

  /** Undo overflow-cull hiding without fighting the light's owner.
   *  `setNightIntensity(0)` / `setLit(false)` set `visible = false` and
   *  `intensity = 0` while the light may already be hidden by the budget;
   *  blindly flipping `visible` back on would relight an off lamp. A light
   *  that was already at intensity 0 when culled (dim-but-still-on) is
   *  restored, because the owner never turned it off. */
  function restoreCulled(): void {
    for (const { light, intensityWhenCulled } of culledLights) {
      if (light.userData[POINT_LIGHT_CULL_USERDATA] !== true) continue
      delete light.userData[POINT_LIGHT_CULL_USERDATA]
      const ownerTurnedOff = intensityWhenCulled > 0 && light.intensity <= 0
      if (!ownerTurnedOff) light.visible = true
    }
    culledLights.length = 0
  }

  function sync(camera?: THREE.Camera): PointLightBudgetSnapshot {
    const t0 = performance.now()
    restoreCulled()

    const visible: THREE.PointLight[] = []
    for (const light of registry) {
      if (isWorldVisibleUnderScene(light, scene)) visible.push(light)
    }
    const realCount = visible.length
    if (realCount > overflowMax) overflowMax = realCount

    let culled = 0
    let protectedFromCull = 0
    let budgetTooLowForScene = false
    const overflow = budget !== null && realCount > budget

    if (overflow && budget !== null) {
      const protectRadiusSq = POINT_LIGHT_PROTECT_RADIUS * POINT_LIGHT_PROTECT_RADIUS
      const eligible: THREE.PointLight[] = []
      for (const light of visible) {
        if (camera && distanceSqToCamera(light, camera) <= protectRadiusSq) protectedFromCull++
        else eligible.push(light)
      }
      eligible.sort((a, b) => {
        const intensityDelta = a.intensity - b.intensity
        if (intensityDelta !== 0) return intensityDelta
        if (!camera) return 0
        return distanceSqToCamera(b, camera) - distanceSqToCamera(a, camera)
      })
      const wanted = realCount - budget
      const hideCount = Math.min(wanted, eligible.length)
      budgetTooLowForScene = hideCount < wanted
      for (let i = 0; i < hideCount; i++) {
        const light = eligible[i]!
        light.userData[POINT_LIGHT_CULL_USERDATA] = true
        light.visible = false
        culledLights.push({ light, intensityWhenCulled: light.intensity })
      }
      culled = hideCount
      if (budgetTooLowForScene && import.meta.env.DEV) {
        console.warn(
          `[pointLightBudget] budget ${budget} exceeded by ${wanted} real lights, but only ${eligible.length} `
          + `are outside the ${POINT_LIGHT_PROTECT_RADIUS}-unit near-camera protection radius — `
          + 'keeping all near-camera lights lit instead of culling into them.',
        )
      }
    }

    if (budget !== null) {
      const kept = realCount - culled
      const padVisible = Math.max(0, budget - kept)
      for (let i = 0; i < dummies.length; i++) {
        dummies[i]!.visible = i < padVisible
      }
      last = {
        budget,
        realCount,
        padVisible,
        totalVisible: kept + padVisible,
        overflow,
        overflowMax,
        culled,
        protectedFromCull,
        budgetTooLowForScene,
        syncMs: performance.now() - t0,
        registrySize: registry.size,
      }
    } else {
      last = {
        budget: null,
        realCount,
        padVisible: 0,
        totalVisible: realCount,
        overflow: false,
        overflowMax,
        culled: 0,
        protectedFromCull: 0,
        budgetTooLowForScene: false,
        syncMs: performance.now() - t0,
        registrySize: registry.size,
      }
    }
    return last
  }

  let disposed = false
  return {
    budget,
    registerSubtree(root) {
      walkPointLights(root, (light) => registry.add(light))
    },
    unregisterSubtree(root) {
      walkPointLights(root, (light) => {
        registry.delete(light)
        dropCulled(light)
      })
    },
    register(light) {
      registry.add(light)
    },
    unregister(light) {
      registry.delete(light)
      dropCulled(light)
    },
    sync,
    snapshot: () => last,
    dispose() {
      if (disposed) return
      disposed = true
      restoreCulled()
      group?.removeFromParent()
      for (const light of dummies) light.dispose()
      dummies.length = 0
      registry.clear()
    },
  }
}

/** No-op implementation for callers that don't wire a real budget (currently
 *  none in production — kept as the default parameter value so adding the
 *  budget to `createSettlement`/`PlacedFires`/`PlayerTorch` doesn't force
 *  every call site, including future ones, to thread it explicitly). */
export function createNullPointLightBudget(): PointLightBudget {
  return {
    budget: null,
    registerSubtree: () => {},
    unregisterSubtree: () => {},
    register: () => {},
    unregister: () => {},
    sync: () => EMPTY_SNAPSHOT,
    snapshot: () => EMPTY_SNAPSHOT,
    dispose: () => {},
  }
}

declare global {
  interface Window {
    __seedvalePointLightBudget?: PointLightBudget
  }
}
