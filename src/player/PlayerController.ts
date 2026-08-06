import * as THREE from 'three'
import type { KeyState } from '../input/Keyboard'
import type { LookState } from '../input/MouseLook'

const MOVE_SPEED = 8
const CAMERA_DISTANCE = 12
/** CapsuleGeometry(0.35, 0.9) ≈ 1.6 total height; center offset from feet. */
const HALF_HEIGHT = 0.8
const LOOK_AT_OFFSET = 0.9

export type HeightSampler = (x: number, z: number) => number

export class PlayerController {
  readonly mesh: THREE.Mesh
  private readonly camera: THREE.PerspectiveCamera
  private readonly keys: KeyState
  private readonly look: LookState
  private sampleHeight: HeightSampler
  private halfExtent: number
  private readonly forward = new THREE.Vector3()
  private readonly right = new THREE.Vector3()
  private readonly wish = new THREE.Vector3()
  private readonly camOffset = new THREE.Vector3()

  constructor(
    camera: THREE.PerspectiveCamera,
    keys: KeyState,
    look: LookState,
    sampleHeight: HeightSampler,
    halfExtent: number,
  ) {
    this.camera = camera
    this.keys = keys
    this.look = look
    this.sampleHeight = sampleHeight
    this.halfExtent = halfExtent - 1

    const geometry = new THREE.CapsuleGeometry(0.35, 0.9, 4, 8)
    const material = new THREE.MeshStandardMaterial({
      color: 0xc45c26,
      flatShading: true,
    })
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.castShadow = true
    this.mesh.position.set(0, 0, 0)
    this.snapToGround()
    this.syncCamera()
  }

  /** Call after terrain rebuild. */
  setGround(sampleHeight: HeightSampler, halfExtent: number): void {
    this.sampleHeight = sampleHeight
    this.halfExtent = halfExtent - 1
    this.snapToGround()
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
    this.right.set(this.forward.z, 0, this.forward.x)

    this.wish.set(0, 0, 0)
    if (this.keys.forward) this.wish.add(this.forward)
    if (this.keys.backward) this.wish.sub(this.forward)
    if (this.keys.left) this.wish.sub(this.right)
    if (this.keys.right) this.wish.add(this.right)

    if (this.wish.lengthSq() > 0) {
      this.wish.normalize().multiplyScalar(MOVE_SPEED * dt)
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
  }

  private snapToGround(): void {
    const groundY = this.sampleHeight(
      this.mesh.position.x,
      this.mesh.position.z,
    )
    this.mesh.position.y = groundY + HALF_HEIGHT
  }

  private syncCamera(): void {
    const { yaw, pitch } = this.look
    const cosPitch = Math.cos(pitch)
    this.camOffset.set(
      Math.sin(yaw) * cosPitch,
      Math.sin(pitch),
      Math.cos(yaw) * cosPitch,
    )
    this.camOffset.multiplyScalar(CAMERA_DISTANCE)

    const targetY = this.mesh.position.y + LOOK_AT_OFFSET
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
