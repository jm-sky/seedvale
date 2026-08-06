export type LookState = {
  yaw: number
  pitch: number
}

const SENSITIVITY = 0.0022
const PITCH_MIN = -0.9
const PITCH_MAX = 0.55

export function createMouseLook(target: HTMLElement): {
  state: LookState
  dispose: () => void
} {
  const state: LookState = {
    yaw: 0,
    pitch: 0.35,
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
    state.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, state.pitch))
  }

  target.addEventListener('click', onClick)
  document.addEventListener('mousemove', onMouseMove)

  return {
    state,
    dispose: () => {
      target.removeEventListener('click', onClick)
      document.removeEventListener('mousemove', onMouseMove)
      if (document.pointerLockElement === target) {
        document.exitPointerLock()
      }
    },
  }
}
