/** Experimental cave heightfield spike — lightweight Walk-mode controller.
 *  Owns only test pose (position / yaw / camera). Does not boot
 *  `PlayerController` or WorldBundle gameplay systems.
 *
 * @domain world-terrain
 */

import {
  AnimationMixer,
  type Camera,
  type Object3D,
  PointLight,
  Vector3,
} from 'three'
import type { KeyState } from '../../input/Keyboard'
import type { CaveHeightfieldRepresentation } from './caveHeightfieldRepresentation'
import { loadGltfAnimated, prepareProp } from '../../assets/loadGltf'
import {
  CAMERA_DISTANCE_DEFAULT,
  CAMERA_DISTANCE_MIN,
  type LookState,
} from '../../input/MouseLook'
import { resolveCameraBoom } from '../../player/cameraBoom'
import { integrateVerticalMotion } from '../../player/verticalMotion'
import { applySlopeMovementConstraint } from '../../terrain/slopeConstraint'
import {
  type CaveSdfColumnIndex,
  occupancyIntervalAt,
  queryColumnIndex,
} from '../../world/caves/caveSdfQuery'
import { type Collider, colliderActiveAtY, resolvePosition } from '../../world/collision'
import {
  HEIGHTFIELD_PLAYER_HEIGHT,
  HEIGHTFIELD_PLAYER_RADIUS,
  heightfieldOccupancyAt,
  integrateHeightfieldVertical,
  queryHeightfieldGround,
  resolveHeightfieldHorizontal,
} from './caveHeightfieldTraversal'

const MOVE_SPEED = 8
const SPRINT_MULTIPLIER = 1.8
const LOOK_AT_OFFSET_FAR = 0.9
const LOOK_AT_OFFSET_NEAR = 1.6
const PLAYER_MODEL_URL = '/models/characters/Adventurer.glb'

export type HeightfieldWalkCollision =
  | {
    kind: 'heightfield'
    representation: CaveHeightfieldRepresentation
    surfaceAt: (x: number, z: number) => number
  }
  | {
    kind: 'sdf'
    index: CaveSdfColumnIndex
    colliders: readonly Collider[]
    surfaceAt: (x: number, z: number) => number
  }

export type CaveHeightfieldWalker = {
  root: Object3D
  position: Vector3
  spawn: (x: number, y: number, z: number, yaw: number) => void
  update: (dt: number, keys: KeyState, look: LookState, camera: Camera, collision: HeightfieldWalkCollision) => void
  dispose: () => void
}

/**
 * Loads the production Adventurer model at player scale and returns a
 * debug-only walk controller for the heightfield spike harness.
 *
 * @domain world-terrain
 */
export async function createCaveHeightfieldWalker(): Promise<CaveHeightfieldWalker> {
  const { scene: model, animations } = await loadGltfAnimated(PLAYER_MODEL_URL)
  prepareProp(model, HEIGHTFIELD_PLAYER_HEIGHT)
  model.traverse((obj) => { obj.castShadow = true })

  const torch = new PointLight(0xffcc88, 3.4, 16, 1.6)
  torch.position.set(0.2, 1.45, 0.15)
  model.add(torch)

  const mixer = animations.length > 0 ? new AnimationMixer(model) : null
  const idleClip = animations.find((clip) => /idle/i.test(clip.name))
  const walkClip = animations.find((clip) => /walk/i.test(clip.name))
  const runClip = animations.find((clip) => /run/i.test(clip.name))
  const idleAction = idleClip && mixer ? mixer.clipAction(idleClip) : null
  const walkAction = walkClip && mixer ? mixer.clipAction(walkClip) : null
  const runAction = runClip && mixer ? mixer.clipAction(runClip) : null
  idleAction?.play()
  let currentAction = idleAction

  const play = (action: typeof idleAction): void => {
    if (!action || action === currentAction) return
    currentAction?.fadeOut(0.15)
    action.reset().setEffectiveWeight(1).fadeIn(0.15).play()
    currentAction = action
  }

  const wish = new Vector3()
  const forward = new Vector3()
  const right = new Vector3()
  const camOffset = new Vector3()
  let verticalVelocity = 0
  let grounded = true

  const sampleWalkHeight = (collision: HeightfieldWalkCollision, x: number, z: number): number => {
    if (collision.kind === 'heightfield') {
      return queryHeightfieldGround(
        collision.representation,
        collision.surfaceAt,
        x,
        model.position.y,
        z,
      ).floorY
    }
    const hit = queryColumnIndex(collision.index, x, model.position.y, z)
    return hit?.floorY ?? collision.surfaceAt(x, z)
  }

  const occupancyAt = (collision: HeightfieldWalkCollision) => (
    x: number,
    y: number,
    z: number,
  ): { floorY: number, ceilingY: number, openSky?: boolean } | null => {
    if (collision.kind === 'heightfield') {
      return heightfieldOccupancyAt(collision.representation, x, y, z)
    }
    return occupancyIntervalAt(collision.index, x, y, z)
  }

  return {
    root: model,
    position: model.position,
    spawn: (x, y, z, yaw) => {
      model.position.set(x, y, z)
      model.rotation.y = yaw
      verticalVelocity = 0
      grounded = true
    },
    update: (dt, keys, look, camera, collision) => {
      const step = Math.min(dt, 0.05)
      forward.set(-Math.sin(look.yaw), 0, -Math.cos(look.yaw))
      right.set(-forward.z, 0, forward.x)
      wish.set(0, 0, 0)
      if (keys.forward) wish.add(forward)
      if (keys.backward) wish.sub(forward)
      if (keys.left) wish.sub(right)
      if (keys.right) wish.add(right)
      const moving = wish.lengthSq() > 0
      const sprinting = moving && keys.sprint
      if (moving) {
        const speed = (sprinting ? MOVE_SPEED * SPRINT_MULTIPLIER : MOVE_SPEED) * step
        wish.normalize().multiplyScalar(speed)
        const slope = applySlopeMovementConstraint(
          wish.x,
          wish.z,
          model.position.x,
          model.position.z,
          (x, z) => sampleWalkHeight(collision, x, z),
        )
        wish.x = slope.x
        wish.z = slope.z
        let nextX = model.position.x + wish.x
        let nextZ = model.position.z + wish.z
        if (collision.kind === 'heightfield') {
          const resolved = resolveHeightfieldHorizontal(
            collision.representation,
            nextX,
            nextZ,
            HEIGHTFIELD_PLAYER_RADIUS,
          )
          nextX = resolved.x
          nextZ = resolved.z
        } else {
          const colliders = collision.colliders.filter((c) => colliderActiveAtY(c, model.position.y))
          const resolved = resolvePosition(nextX, nextZ, HEIGHTFIELD_PLAYER_RADIUS, colliders)
          nextX = resolved.x
          nextZ = resolved.z
        }
        model.position.x = nextX
        model.position.z = nextZ
        if (wish.lengthSq() > 0) model.rotation.y = Math.atan2(wish.x, wish.z)
      }

      if (collision.kind === 'heightfield') {
        const next = integrateHeightfieldVertical(
          collision.representation,
          collision.surfaceAt,
          model.position.x,
          model.position.z,
          { y: model.position.y, verticalVelocity, grounded },
          step,
          keys.jump,
        )
        model.position.y = next.y
        verticalVelocity = next.verticalVelocity
        grounded = next.grounded
      } else {
        const hit = queryColumnIndex(
          collision.index,
          model.position.x,
          model.position.y,
          model.position.z,
        )
        const floorY = hit?.floorY ?? collision.surfaceAt(model.position.x, model.position.z)
        const ceilingY = hit && !hit.openSky ? hit.ceilingY : null
        const motion = integrateVerticalMotion({
          y: model.position.y,
          verticalVelocity,
          grounded,
          groundY: floorY,
          dt: step,
          jumpRequested: keys.jump,
          maxY: ceilingY != null ? ceilingY - HEIGHTFIELD_PLAYER_HEIGHT : undefined,
        })
        model.position.y = motion.y
        verticalVelocity = motion.verticalVelocity
        grounded = motion.grounded
      }

      play(moving ? (sprinting ? (runAction ?? walkAction) : walkAction) ?? idleAction : idleAction)
      mixer?.update(step)

      const { yaw, pitch, distance } = look
      const cosPitch = Math.cos(pitch)
      camOffset.set(
        Math.sin(yaw) * cosPitch,
        Math.sin(pitch),
        Math.cos(yaw) * cosPitch,
      )
      camOffset.multiplyScalar(distance)
      const zoomT = Math.max(0, Math.min(1, (distance - CAMERA_DISTANCE_MIN) / (CAMERA_DISTANCE_DEFAULT - CAMERA_DISTANCE_MIN)))
      const lookAtOffset = LOOK_AT_OFFSET_NEAR + (LOOK_AT_OFFSET_FAR - LOOK_AT_OFFSET_NEAR) * zoomT
      const originX = model.position.x
      const originZ = model.position.z
      const targetY = model.position.y + lookAtOffset
      const boom = resolveCameraBoom({
        originX,
        originY: targetY,
        originZ,
        camX: originX + camOffset.x,
        camY: targetY + camOffset.y,
        camZ: originZ + camOffset.z,
        sampleHeight: (x, z) => collision.surfaceAt(x, z),
        colliders: collision.kind === 'sdf'
          ? collision.colliders.filter((c) => colliderActiveAtY(c, model.position.y))
          : [],
        occupancyAt: occupancyAt(collision),
      })
      camera.position.set(boom.x, boom.y, boom.z)
      camera.lookAt(originX, targetY, originZ)
    },
    dispose: () => {
      mixer?.stopAllAction()
    },
  }
}
