import { isTouchDevice } from './isTouchDevice'

export type LookState = {
  yaw: number
  pitch: number
  distance: number
}

const SENSITIVITY = 0.0022
const PITCH_MIN = -0.9

/** Pitch ceiling grows with zoom distance: close-in feels head-level, zoomed-out allows a top-down view. */
const PITCH_MAX_NEAR = 0.5
const PITCH_MAX_FAR = 1.15

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

export function createMouseLook(target: HTMLElement): {
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

  // Touch devices drive yaw/pitch/distance from createTouchControls instead —
  // pointer lock needs real `mousemove` events, which touch drags never fire.
  const touch = isTouchDevice()
  if (!touch) {
    target.addEventListener('click', onClick)
    document.addEventListener('mousemove', onMouseMove)
  }
  target.addEventListener('wheel', onWheel, { passive: false })

  return {
    state,
    dispose: () => {
      if (!touch) {
        target.removeEventListener('click', onClick)
        document.removeEventListener('mousemove', onMouseMove)
      }
      target.removeEventListener('wheel', onWheel)
      if (document.pointerLockElement === target) {
        document.exitPointerLock()
      }
    },
  }
}
