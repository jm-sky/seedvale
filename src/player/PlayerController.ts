import * as THREE from 'three'
import type { KeyState } from '../input/Keyboard'

const MOVE_SPEED = 8
const CAMERA_DISTANCE = 10
const CAMERA_HEIGHT = 5
const PLAYER_HEIGHT = 1.6

export class PlayerController {
  readonly mesh: THREE.Mesh
  private readonly camera: THREE.PerspectiveCamera
  private readonly keys: KeyState
  /** Radians; 0 = looking toward -Z. Mouse look can update this later. */
  private yaw = 0
  private readonly forward = new THREE.Vector3()
  private readonly right = new THREE.Vector3()
  private readonly wish = new THREE.Vector3()

  constructor(camera: THREE.PerspectiveCamera, keys: KeyState) {
    this.camera = camera
    this.keys = keys

    const geometry = new THREE.CapsuleGeometry(0.35, 0.9, 4, 8)
    const material = new THREE.MeshStandardMaterial({
      color: 0xc45c26,
      flatShading: true,
    })
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.castShadow = true
    this.mesh.position.set(0, PLAYER_HEIGHT / 2, 0)
    this.syncCamera()
  }

  update(dt: number): void {
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    this.right.set(this.forward.z, 0, -this.forward.x)

    this.wish.set(0, 0, 0)
    if (this.keys.forward) this.wish.add(this.forward)
    if (this.keys.backward) this.wish.sub(this.forward)
    if (this.keys.left) this.wish.sub(this.right)
    if (this.keys.right) this.wish.add(this.right)

    if (this.wish.lengthSq() > 0) {
      this.wish.normalize().multiplyScalar(MOVE_SPEED * dt)
      this.mesh.position.add(this.wish)
      this.mesh.rotation.y = Math.atan2(this.wish.x, this.wish.z)
    }

    // Flat ground for spike 1–2; height sampling comes in spike 4.
    this.mesh.position.y = PLAYER_HEIGHT / 2
    this.syncCamera()
  }

  private syncCamera(): void {
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    this.camera.position.set(
      this.mesh.position.x - this.forward.x * CAMERA_DISTANCE,
      this.mesh.position.y + CAMERA_HEIGHT,
      this.mesh.position.z - this.forward.z * CAMERA_DISTANCE,
    )
    this.camera.lookAt(
      this.mesh.position.x,
      this.mesh.position.y + 0.8,
      this.mesh.position.z,
    )
  }
}
