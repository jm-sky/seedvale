import type { KeyState } from './Keyboard'
import { isTouchDevice } from './isTouchDevice'

export type LookState = {
  yaw: number
  pitch: number
  distance: number
}

const SENSITIVITY = 0.0022
const PITCH_MIN = -0.9

/** Max look-down pitch. Used to scale with zoom (near ≪ far) so close third-person
 *  stayed nearly head-level — that blocked top-down aiming until you zoomed out.
 *  Near is now almost as steep as far; a tiny gap still keeps ultra-close slightly
 *  less extreme so the camera doesn't sit inside the head as easily. */
const PITCH_MAX_NEAR = 1.05
const PITCH_MAX_FAR = 1.2

export const CAMERA_DISTANCE_MIN = 1.6
export const CAMERA_DISTANCE_MAX = 22
export const CAMERA_DISTANCE_DEFAULT = 12

const ZOOM_SPEED = 0.0015

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function pitchMaxFor(distance: number): number {
  const t = clamp(
    (distance - CAMERA_DISTANCE_MIN) /
      (CAMERA_DISTANCE_MAX - CAMERA_DISTANCE_MIN),
    0,
    1,
  )
  return PITCH_MAX_NEAR + (PITCH_MAX_FAR - PITCH_MAX_NEAR) * t
}

/** Shared with touch-drag look / pinch-zoom so every input source clamps identically. */
export function clampDistance(distance: number): number {
  return clamp(distance, CAMERA_DISTANCE_MIN, CAMERA_DISTANCE_MAX)
}

export function clampPitch(pitch: number, distance: number): number {
  return clamp(pitch, PITCH_MIN, pitchMaxFor(distance))
}

/** Release pointer lock when opening clickable UI (pause, inventory, quick actions, NPC menu).
 *  Returns whether the target held the lock (so callers can restore it later). */
export function exitGamePointerLock(target: HTMLElement): boolean {
  if (document.pointerLockElement !== target) return false
  document.exitPointerLock()
  return true
}

/** Re-acquire pointer lock after closing UI that temporarily released it. */
export function requestGamePointerLock(target: HTMLElement): void {
  if (document.pointerLockElement === target) return
  void target.requestPointerLock()
}

export function createMouseLook(target: HTMLElement, keys: KeyState): {
  state: LookState
  dispose: () => void
} {
  const state: LookState = {
    yaw: 0,
    pitch: 0.35,
    distance: CAMERA_DISTANCE_DEFAULT,
  }

  const onClick = () => {
    if (document.pointerLockElement !== target) {
      void target.requestPointerLock()
    }
  }

  const onMouseMove = (event: MouseEvent) => {
    if (document.pointerLockElement !== target) return
    state.yaw -= event.movementX * SENSITIVITY
    state.pitch -= event.movementY * SENSITIVITY
    state.pitch = clamp(state.pitch, PITCH_MIN, pitchMaxFor(state.distance))
  }

  const onWheel = (event: WheelEvent) => {
    state.distance = clamp(
      state.distance + event.deltaY * ZOOM_SPEED * state.distance,
      CAMERA_DISTANCE_MIN,
      CAMERA_DISTANCE_MAX,
    )
    state.pitch = Math.min(state.pitch, pitchMaxFor(state.distance))
    event.preventDefault()
  }

  // LMB is the mouse producer for the shared primary attack/use action
  // (keyboard `E` and the mobile `E` button write into the same `KeyState`
  // fields — see `Keyboard.ts`/`createTouchControls.ts`). No pointer-lock
  // gating here: a stray press without a gaze target is already a no-op
  // downstream, same as a stray `E` tap.
  const onMouseDown = (event: MouseEvent) => {
    if (event.button === 0) keys.interact = true
  }
  const onMouseUp = (event: MouseEvent) => {
    if (event.button === 0) keys.interactReleased = true
  }

  // Touch devices drive yaw/pitch/distance from createTouchControls instead —
  // pointer lock needs real `mousemove` events, which touch drags never fire.
  const touch = isTouchDevice()
  if (!touch) {
    target.addEventListener('click', onClick)
    document.addEventListener('mousemove', onMouseMove)
    target.addEventListener('mousedown', onMouseDown)
    // `mouseup` on `window`, not `target`: a press can start on the canvas
    // and be released after the (invisible, pointer-locked) cursor has
    // conceptually moved off it — same asymmetry as `mousemove` above.
    window.addEventListener('mouseup', onMouseUp)
  }
  target.addEventListener('wheel', onWheel, { passive: false })

  return {
    state,
    dispose: () => {
      if (!touch) {
        target.removeEventListener('click', onClick)
        document.removeEventListener('mousemove', onMouseMove)
        target.removeEventListener('mousedown', onMouseDown)
        window.removeEventListener('mouseup', onMouseUp)
      }
      target.removeEventListener('wheel', onWheel)
      exitGamePointerLock(target)
    },
  }
}
