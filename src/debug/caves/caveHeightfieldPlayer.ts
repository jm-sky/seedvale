/** Experimental cave heightfield spike — lightweight Walk-mode controller.
 *  Owns only test pose (position / vertical state / camera). Does not boot
 *  `PlayerController` or WorldBundle gameplay systems.
 *
 *  Everything that decides *where the ground is* lives in `CaveWalkWorld`
 *  and is production Cave V2 semantics; this file only drives it.
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
import type { CaveWalkWorld } from './caveHeightfieldWalkWorld'
import { loadGltfAnimated, prepareProp } from '../../assets/loadGltf'
import {
  CAMERA_DISTANCE_DEFAULT,
  CAMERA_DISTANCE_MIN,
  type LookState,
} from '../../input/MouseLook'
import { resolveCameraBoom, withCaveFloorFallback } from '../../player/cameraBoom'
import { applySlopeMovementConstraint } from '../../terrain/slopeConstraint'
import {
  HEIGHTFIELD_PLAYER_HEIGHT,
  integrateDebugVertical,
} from './caveHeightfieldTraversal'

/** Mirrors `PlayerController`'s `MOVE_SPEED` / `SPRINT_MULTIPLIER` — see the
 *  duplication note on `HEIGHTFIELD_PLAYER_RADIUS`. */
const MOVE_SPEED = 8
const SPRINT_MULTIPLIER = 1.8
const LOOK_AT_OFFSET_FAR = 0.9
const LOOK_AT_OFFSET_NEAR = 1.6
const PLAYER_MODEL_URL = '/models/characters/Adventurer.glb'

export type CaveHeightfieldWalker = {
  root: Object3D
  position: Vector3
  spawn: (x: number, y: number, z: number, yaw: number) => void
  update: (dt: number, keys: KeyState, look: LookState, camera: Camera, world: CaveWalkWorld) => void
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

  return {
    root: model,
    position: model.position,
    spawn: (x, y, z, yaw) => {
      model.position.set(x, y, z)
      model.rotation.y = yaw
      verticalVelocity = 0
      grounded = true
    },
    update: (dt, keys, look, camera, world) => {
      const step = Math.min(dt, 0.05)

      // One cave-aware ground resolution per frame, at the entity's own
      // position — the hysteresis in `CaveWalkWorld` is per-entity state.
      let ground = world.resolveGround(model.position.x, model.position.y, model.position.z)

      // Slope probes reach `SLOPE_SAMPLE_STEP` (1.2 m) sideways — wider than
      // a 2.6 m tunnel — so a raw surface sampler reads the hillside metres
      // overhead and reports a cliff in every direction. Production's
      // `withCaveFloorFallback` reports the entity's own cave floor for any
      // probe that misses the cave footprint; outdoors it is the identity.
      const slopeHeight = withCaveFloorFallback(
        world.walkSurfaceAt,
        world.caveFloorAt,
        ground.caveFloorY,
      )

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
          slopeHeight,
        )
        wish.x = slope.x
        wish.z = slope.z
        const resolved = world.resolveHorizontal(
          model.position.x + wish.x,
          model.position.z + wish.z,
          model.position.y,
        )
        model.position.x = resolved.x
        model.position.z = resolved.z
        if (wish.lengthSq() > 0) model.rotation.y = Math.atan2(wish.x, wish.z)
        ground = world.resolveGround(model.position.x, model.position.y, model.position.z)
      }

      const next = integrateDebugVertical(
        ground,
        { y: model.position.y, verticalVelocity, grounded },
        step,
        keys.jump,
      )
      model.position.y = next.y
      verticalVelocity = next.verticalVelocity
      grounded = next.grounded

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
        // Raw outdoor surface, exactly as `PlayerController.syncCamera` does:
        // `occupancyAt` + `isInteriorFollowVoid` are what keep an interior
        // boom off the hillside above the cave, and a cave-floor-substituted
        // sampler would defeat that test.
        sampleHeight: world.walkSurfaceAt,
        colliders: world.boomCollidersAt(model.position.y),
        occupancyAt: world.occupancyAt,
      })
      camera.position.set(boom.x, boom.y, boom.z)
      camera.lookAt(originX, targetY, originZ)
    },
    dispose: () => {
      mixer?.stopAllAction()
    },
  }
}
