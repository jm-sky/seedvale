import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { KeyState } from '../input/Keyboard'
import type { ToolKind } from '../items/HeldTool'
import { disposeObject3D, loadGltfAnimated, prepareProp } from '../assets/loadGltf'
import {
  CAMERA_DISTANCE_DEFAULT,
  CAMERA_DISTANCE_MIN,
  type LookState,
} from '../input/MouseLook'
import {
  createHeldToolObject,
  findRightHandSocket,
  mountHeldToolOnSocket,
} from '../items/heldToolVisual'
import { createHealthState, type HealthState } from '../shared/HealthState'
import { type Collider, resolvePosition } from '../world/collision'

const MOVE_SPEED = 8
/** Matches the capsule fallback's `CapsuleGeometry` radius (plan 097 §2.2) —
 *  the GLB model has no measured collision shape, so this stands in for both. */
const PLAYER_COLLISION_RADIUS = 0.35
const SPRINT_MULTIPLIER = 1.8
/** Look-at height eases from chest-level (far/default zoom) up toward eye-level as the camera zooms in. */
const LOOK_AT_OFFSET_FAR = 0.9
const LOOK_AT_OFFSET_NEAR = 1.6
export const PLAYER_HEIGHT = 1.8
const PLAYER_LABEL = 'Ja'
const PLAYER_MAX_HP = 100
/** How far below the surface the player can sink while swimming — caps out in deep
 *  water so the head still breaks the surface instead of vanishing into the seabed. */
const MAX_SWIM_DEPTH = 1.2
/** Rotation (radians) applied to the model root to lie it flat on the ground
 *  for `lieDown()` — the Quaternius rig has no dedicated sleep/rest clip, so
 *  this tips the whole model onto its back instead, the same trick
 *  `fauna/AnimalAgent.ts`'s `collapse()` uses for corpses. */
const LIE_DOWN_ROTATION_X = -Math.PI / 2
/** Small upward nudge so the now-horizontal body doesn't clip into the
 *  ground (the model's local origin/feet stay at the wrapper's y=0). */
const LIE_DOWN_Y_OFFSET = 0.25
/** Procedural squat for camp-rest setup/teardown — no crouch clip on the
 *  Quaternius Adventurer rig, so we tip + sink the model root only (wrapper
 *  / label stay upright). */
const CROUCH_ROTATION_X = 0.45
const CROUCH_Y_OFFSET = -0.35

type PlayerPose = 'stand' | 'crouch' | 'lie'

/** Quaternius Ultimate Modular Men — distinct from the NPC roster. */
export const PLAYER_MODEL_URL = '/models/characters/Adventurer.glb'

export type HeightSampler = (x: number, z: number) => number
/** `ChunkManager.collidersNear` (plan 097 §2.2) — kept as its own alias
 *  instead of importing `ChunkManager` here, same reasoning as `HeightSampler`. */
export type ColliderSource = (x: number, z: number) => readonly Collider[]

export class PlayerController {
  /** Wrapper group; feet sit at local y=0, world y is set in snapToGround. */
  readonly mesh: THREE.Object3D
  /** Shared survival HP — domain state only in v1 (no death UI / respawn). */
  readonly health: HealthState
  private readonly camera: THREE.PerspectiveCamera
  private readonly keys: KeyState
  private readonly look: LookState
  private sampleHeight: HeightSampler
  private sampleFloor: HeightSampler
  private waterLevel: number
  private collidersNear: ColliderSource
  private readonly isCapsule: boolean
  /** The GLB scene root (or capsule mesh) — rotated independently of `mesh`
   *  (the wrapper, which also carries the label at a fixed height) for
   *  `lieDown()` / `crouch()`, so the nameplate stays floating above the
   *  character instead of tipping over with the body. */
  private readonly modelRoot: THREE.Object3D
  private pose: PlayerPose = 'stand'
  private readonly mixer: THREE.AnimationMixer | null
  private readonly idleAction: THREE.AnimationAction | null
  private readonly walkAction: THREE.AnimationAction | null
  private readonly runAction: THREE.AnimationAction | null
  private currentAction: THREE.AnimationAction | null = null
  private moving = false
  private sprinting = false
  private readonly forward = new THREE.Vector3()
  private readonly right = new THREE.Vector3()
  private readonly wish = new THREE.Vector3()
  private readonly camOffset = new THREE.Vector3()
  private readonly label: CSS2DObject
  private readonly labelEl: HTMLDivElement
  private readonly labelNameEl: HTMLDivElement
  private readonly hpFillEl: HTMLDivElement
  private lastHpRatio = -1
  /** Quaternius `WristR` (or null on capsule fallback / missing bone). */
  private readonly rightWrist: THREE.Object3D | null
  private heldToolObject: THREE.Object3D | null = null
  private heldToolKind: ToolKind | null = null
  /** Bumps on each `setHeldTool` so stale async GLB loads are ignored. */
  private heldToolLoadToken = 0

  private constructor(
    root: THREE.Object3D,
    animations: THREE.AnimationClip[],
    isCapsule: boolean,
    camera: THREE.PerspectiveCamera,
    keys: KeyState,
    look: LookState,
    sampleHeight: HeightSampler,
    sampleFloor: HeightSampler,
    waterLevel: number,
    collidersNear: ColliderSource,
  ) {
    this.camera = camera
    this.keys = keys
    this.look = look
    this.sampleHeight = sampleHeight
    this.sampleFloor = sampleFloor
    this.waterLevel = waterLevel
    this.collidersNear = collidersNear
    this.isCapsule = isCapsule
    this.health = createHealthState(PLAYER_MAX_HP)

    this.mesh = new THREE.Group()
    this.mesh.add(root)
    this.mesh.position.set(0, 0, 0)
    this.modelRoot = root
    this.rightWrist = isCapsule ? null : findRightHandSocket(root)
    if (!isCapsule && !this.rightWrist) {
      console.warn('[player] right-hand bone not found; held tools parent to model root (feet)')
    }

    if (animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(root)
      this.idleAction = this.findAction(animations, ['Idle', 'Idle_Neutral'])
      this.walkAction = this.findAction(animations, ['Walk', 'Run'])
      this.runAction = this.findAction(animations, ['Run'])
      this.playAction(this.idleAction)
    } else {
      this.mixer = null
      this.idleAction = null
      this.walkAction = null
      this.runAction = null
    }

    this.labelEl = document.createElement('div')
    this.labelEl.className = 'npc-label'

    this.labelNameEl = document.createElement('div')
    this.labelNameEl.className = 'npc-label__name'
    this.labelNameEl.textContent = PLAYER_LABEL

    const labelBarsEl = document.createElement('div')
    labelBarsEl.className = 'npc-label__bars'
    const hpBar = document.createElement('div')
    hpBar.className = 'npc-label__bar npc-label__bar--hp'
    this.hpFillEl = document.createElement('div')
    this.hpFillEl.className = 'npc-label__bar-fill'
    this.hpFillEl.style.width = '100%'
    hpBar.appendChild(this.hpFillEl)
    labelBarsEl.appendChild(hpBar)

    this.labelEl.append(this.labelNameEl, labelBarsEl)
    this.label = new CSS2DObject(this.labelEl)
    this.label.position.set(0, PLAYER_HEIGHT + 0.55, 0)
    this.mesh.add(this.label)

    this.snapToGround()
    this.syncCamera()
  }

  static async create(
    camera: THREE.PerspectiveCamera,
    keys: KeyState,
    look: LookState,
    sampleHeight: HeightSampler,
    sampleFloor: HeightSampler,
    waterLevel: number,
    collidersNear: ColliderSource,
    modelUrl = PLAYER_MODEL_URL,
  ): Promise<PlayerController> {
    try {
      const { scene, animations } = await loadGltfAnimated(modelUrl)
      prepareProp(scene, PLAYER_HEIGHT)
      return new PlayerController(
        scene,
        animations,
        false,
        camera,
        keys,
        look,
        sampleHeight,
        sampleFloor,
        waterLevel,
        collidersNear,
      )
    } catch (err) {
      console.warn(`[player] failed to load ${modelUrl}, using capsule`, err)
      return PlayerController.createCapsuleFallback(
        camera,
        keys,
        look,
        sampleHeight,
        sampleFloor,
        waterLevel,
        collidersNear,
      )
    }
  }

  private static createCapsuleFallback(
    camera: THREE.PerspectiveCamera,
    keys: KeyState,
    look: LookState,
    sampleHeight: HeightSampler,
    sampleFloor: HeightSampler,
    waterLevel: number,
    collidersNear: ColliderSource,
  ): PlayerController {
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 0.9, 4, 8),
      new THREE.MeshStandardMaterial({
        color: 0xc45c26,
        flatShading: true,
      }),
    )
    body.position.y = 0.8
    body.castShadow = true
    return new PlayerController(
      body,
      [],
      true,
      camera,
      keys,
      look,
      sampleHeight,
      sampleFloor,
      waterLevel,
      collidersNear,
    )
  }

  /** Call after terrain rebuild. */
  setGround(
    sampleHeight: HeightSampler,
    sampleFloor: HeightSampler,
    waterLevel: number,
    collidersNear: ColliderSource,
  ): void {
    this.sampleHeight = sampleHeight
    this.sampleFloor = sampleFloor
    this.waterLevel = waterLevel
    this.collidersNear = collidersNear
    this.snapToGround()
  }

  setName(name: string): void {
    this.labelNameEl.textContent = name.trim() || PLAYER_LABEL
  }

  /**
   * Attach / clear a held tool mesh on the right wrist (inventory still owns
   * the item; this is visual only). Capsule / missing-bone fallback parents
   * to the body root (looks wrong — prefer fixing the socket).
   */
  /** Right-hand bone (or model root fallback) for held tools / lit lights. */
  handSocket(): THREE.Object3D {
    return this.rightWrist ?? this.modelRoot
  }

  setHeldTool(kind: ToolKind | null): void {
    if (kind === this.heldToolKind) return
    this.heldToolKind = kind
    const loadToken = ++this.heldToolLoadToken
    if (this.heldToolObject) {
      this.heldToolObject.removeFromParent()
      disposeObject3D(this.heldToolObject)
      this.heldToolObject = null
    }
    if (!kind) return

    const parent = this.handSocket()
    void createHeldToolObject(kind).then((tool) => {
      if (loadToken !== this.heldToolLoadToken || this.heldToolKind !== kind) {
        disposeObject3D(tool)
        return
      }
      this.heldToolObject = mountHeldToolOnSocket(tool, parent, kind, {
        characterRoot: this.modelRoot,
        characterHeight: PLAYER_HEIGHT,
      })
    })
  }

  setPosition(x: number, z: number): void {
    this.mesh.position.x = x
    this.mesh.position.z = z
    this.snapToGround()
    this.syncCamera()
  }

  /** Procedural squat — camp-rest setup/teardown between stand and lie. */
  crouch(): void {
    if (this.pose === 'crouch') return
    this.clearPoseVisual()
    this.pose = 'crouch'
    this.currentAction?.fadeOut(0.15)
    this.currentAction = null
    this.modelRoot.rotation.x = CROUCH_ROTATION_X
    this.modelRoot.position.y = CROUCH_Y_OFFSET
  }

  /** Tips the model onto its back and freezes animation — used while resting
   *  (`app/createApp.ts`'s "Rozbij obóz"/"Odpocznij w mieście" quick
   *  actions). `update()` skips movement/animation entirely while not
   *  standing; the camera keeps following so the world stays visible around
   *  the sleeping character during the sped-up clock. */
  lieDown(): void {
    if (this.pose === 'lie') return
    this.clearPoseVisual()
    this.pose = 'lie'
    this.currentAction?.fadeOut(0.15)
    this.currentAction = null
    this.modelRoot.rotation.x = LIE_DOWN_ROTATION_X
    this.mesh.position.y += LIE_DOWN_Y_OFFSET
  }

  /** No-op if already standing. Clears crouch or lie visuals. */
  standUp(): void {
    if (this.pose === 'stand') return
    this.clearPoseVisual()
    this.pose = 'stand'
    this.playAction(this.idleAction)
  }

  update(dt: number): void {
    if (this.pose !== 'stand') {
      this.syncCamera()
      this.syncHpBar()
      this.mixer?.update(dt)
      return
    }
    const { yaw } = this.look
    this.forward.set(-Math.sin(yaw), 0, -Math.cos(yaw))
    this.right.set(-this.forward.z, 0, this.forward.x)

    this.wish.set(0, 0, 0)
    if (this.keys.forward) this.wish.add(this.forward)
    if (this.keys.backward) this.wish.sub(this.forward)
    if (this.keys.left) this.wish.sub(this.right)
    if (this.keys.right) this.wish.add(this.right)

    this.moving = this.wish.lengthSq() > 0
    this.sprinting = this.moving && this.keys.sprint
    if (this.moving) {
      const speed = this.sprinting ? MOVE_SPEED * SPRINT_MULTIPLIER : MOVE_SPEED
      this.wish.normalize().multiplyScalar(speed * dt)
      const candidateX = this.mesh.position.x + this.wish.x
      const candidateZ = this.mesh.position.z + this.wish.z
      const resolved = resolvePosition(
        candidateX,
        candidateZ,
        PLAYER_COLLISION_RADIUS,
        this.collidersNear(candidateX, candidateZ),
      )
      this.mesh.position.x = resolved.x
      this.mesh.position.z = resolved.z
      this.mesh.rotation.y = Math.atan2(this.wish.x, this.wish.z)
    }

    this.snapToGround()
    this.syncCamera()
    this.syncAnimation()
    this.syncHpBar()
    this.mixer?.update(dt)
  }

  /** Undo the visual offsets of the current pose before switching. */
  private clearPoseVisual(): void {
    if (this.pose === 'lie') {
      this.mesh.position.y -= LIE_DOWN_Y_OFFSET
    }
    this.modelRoot.rotation.x = 0
    this.modelRoot.position.y = 0
  }

  private syncHpBar(): void {
    const hpRatio = this.health.maxHp > 0 ? this.health.currentHp / this.health.maxHp : 0
    if (hpRatio === this.lastHpRatio) return
    this.lastHpRatio = hpRatio
    this.hpFillEl.style.width = `${Math.round(hpRatio * 100)}%`
  }

  dispose(): void {
    this.setHeldTool(null)
    this.label.removeFromParent()
    this.labelEl.remove()
    this.mixer?.stopAllAction()
    // GLB clones share GPU resources with the loader cache — only free the capsule fallback.
    if (this.isCapsule) disposeObject3D(this.mesh)
  }

  private findAction(
    animations: THREE.AnimationClip[],
    names: string[],
  ): THREE.AnimationAction | null {
    if (!this.mixer) return null
    for (const name of names) {
      const clip = animations.find((c) => c.name === name)
      if (clip) return this.mixer.clipAction(clip)
    }
    return null
  }

  private playAction(action: THREE.AnimationAction | null): void {
    if (!action || action === this.currentAction) return
    this.currentAction?.fadeOut(0.2)
    action.reset().setEffectiveWeight(1).fadeIn(0.2).play()
    this.currentAction = action
  }

  private syncAnimation(): void {
    if (!this.moving) {
      this.playAction(this.idleAction)
      return
    }
    const moveAction = this.sprinting
      ? (this.runAction ?? this.walkAction)
      : this.walkAction
    this.playAction(moveAction ?? this.idleAction)
  }

  private snapToGround(): void {
    const { x, z } = this.mesh.position
    const groundY = this.sampleHeight(x, z)
    if (groundY <= this.waterLevel) {
      // Underwater: sink toward the real seabed instead of the flattened-to-waterLevel
      // mesh, capped so deep water still leaves the head above the surface.
      const floorY = this.sampleFloor(x, z)
      const depth = Math.min(this.waterLevel - floorY, MAX_SWIM_DEPTH)
      this.mesh.position.y = this.waterLevel - depth
    } else {
      this.mesh.position.y = groundY
    }
  }

  private syncCamera(): void {
    const { yaw, pitch, distance } = this.look
    const cosPitch = Math.cos(pitch)
    this.camOffset.set(
      Math.sin(yaw) * cosPitch,
      Math.sin(pitch),
      Math.cos(yaw) * cosPitch,
    )
    this.camOffset.multiplyScalar(distance)

    const zoomT = THREE.MathUtils.clamp(
      (distance - CAMERA_DISTANCE_MIN) /
        (CAMERA_DISTANCE_DEFAULT - CAMERA_DISTANCE_MIN),
      0,
      1,
    )
    const lookAtOffset = THREE.MathUtils.lerp(
      LOOK_AT_OFFSET_NEAR,
      LOOK_AT_OFFSET_FAR,
      zoomT,
    )
    const targetY = this.mesh.position.y + lookAtOffset
    this.camera.position.set(
      this.mesh.position.x + this.camOffset.x,
      targetY + this.camOffset.y,
      this.mesh.position.z + this.camOffset.z,
    )
    this.camera.lookAt(
      this.mesh.position.x,
      targetY,
      this.mesh.position.z,
    )
  }
}
