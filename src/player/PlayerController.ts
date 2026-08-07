import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { KeyState } from '../input/Keyboard'
import {
  CAMERA_DISTANCE_DEFAULT,
  CAMERA_DISTANCE_MIN,
  type LookState,
} from '../input/MouseLook'
import { disposeObject3D, loadGltfAnimated, prepareProp } from '../assets/loadGltf'

const MOVE_SPEED = 8
const SPRINT_MULTIPLIER = 1.8
/** Look-at height eases from chest-level (far/default zoom) up toward eye-level as the camera zooms in. */
const LOOK_AT_OFFSET_FAR = 0.9
const LOOK_AT_OFFSET_NEAR = 1.6
const PLAYER_HEIGHT = 1.8
const PLAYER_LABEL = 'Ja'
/** How far below the surface the player can sink while swimming — caps out in deep
 *  water so the head still breaks the surface instead of vanishing into the seabed. */
const MAX_SWIM_DEPTH = 1.2

/** Quaternius Ultimate Modular Men — distinct from the NPC roster. */
export const PLAYER_MODEL_URL = '/models/characters/Adventurer.glb'

export type HeightSampler = (x: number, z: number) => number

export class PlayerController {
  /** Wrapper group; feet sit at local y=0, world y is set in snapToGround. */
  readonly mesh: THREE.Object3D
  private readonly camera: THREE.PerspectiveCamera
  private readonly keys: KeyState
  private readonly look: LookState
  private sampleHeight: HeightSampler
  private sampleFloor: HeightSampler
  private waterLevel: number
  private halfExtent: number
  private readonly isCapsule: boolean
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
    halfExtent: number,
  ) {
    this.camera = camera
    this.keys = keys
    this.look = look
    this.sampleHeight = sampleHeight
    this.sampleFloor = sampleFloor
    this.waterLevel = waterLevel
    this.halfExtent = halfExtent - 1
    this.isCapsule = isCapsule

    this.mesh = new THREE.Group()
    this.mesh.add(root)
    this.mesh.position.set(0, 0, 0)

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
    this.labelEl.textContent = PLAYER_LABEL
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
    halfExtent: number,
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
        halfExtent,
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
        halfExtent,
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
    halfExtent: number,
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
      halfExtent,
    )
  }

  /** Call after terrain rebuild. */
  setGround(
    sampleHeight: HeightSampler,
    sampleFloor: HeightSampler,
    waterLevel: number,
    halfExtent: number,
  ): void {
    this.sampleHeight = sampleHeight
    this.sampleFloor = sampleFloor
    this.waterLevel = waterLevel
    this.halfExtent = halfExtent - 1
    this.snapToGround()
  }

  setName(name: string): void {
    this.labelEl.textContent = name.trim() || PLAYER_LABEL
  }

  setPosition(x: number, z: number): void {
    this.mesh.position.x = x
    this.mesh.position.z = z
    this.snapToGround()
    this.syncCamera()
  }

  update(dt: number): void {
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
      this.mesh.position.x += this.wish.x
      this.mesh.position.z += this.wish.z
      this.mesh.rotation.y = Math.atan2(this.wish.x, this.wish.z)
    }

    const limit = this.halfExtent
    this.mesh.position.x = THREE.MathUtils.clamp(
      this.mesh.position.x,
      -limit,
      limit,
    )
    this.mesh.position.z = THREE.MathUtils.clamp(
      this.mesh.position.z,
      -limit,
      limit,
    )

    this.snapToGround()
    this.syncCamera()
    this.syncAnimation()
    this.mixer?.update(dt)
  }

  dispose(): void {
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
