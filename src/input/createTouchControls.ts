import type { KeyState } from './Keyboard'
import { getMountedVueUi } from '../ui-vue/mount'
import { clampDistance, clampPitch, type LookState } from './MouseLook'

export type TouchControlsHandlers = {
  onPauseToggle: () => void
  onQuickActions?: () => void
}

/** Knob travel radius in CSS px — matches `--seedvale-joystick-radius` in index.html. */
const JOYSTICK_RADIUS = 44
/** Below this fraction of the radius, all directions are released (avoids jitter near center). */
const JOYSTICK_DEADZONE = 0.2
/** A component (nx/ny) must clear this before its direction flag latches — gives
 *  clean 4-way holds near the axes and diagonals near the corners, mirroring WASD. */
const JOYSTICK_DIRECTION_THRESHOLD = 0.35
/** Pushing the knob past this fraction of the radius auto-sprints (push-to-run),
 *  same idea as a twin-stick mobile game — no separate button tap needed. */
const JOYSTICK_SPRINT_THRESHOLD = 0.85

const LOOK_SENSITIVITY = 0.0055
const PINCH_ZOOM_SPEED = 0.02

type Point = { x: number, y: number }

function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function findTouch(list: TouchList, id: number | null): Touch | undefined {
  if (id === null) return undefined
  for (let i = 0; i < list.length; i++) {
    if (list[i].identifier === id) return list[i]
  }
  return undefined
}

/** On-screen joystick (move) + full-screen drag/pinch zone (look/zoom). Action
 *  buttons and pause live in Vue (`TouchChrome.vue`) with Lucide icons; this
 *  module only owns pointer-driven input that writes into KeyState/LookState. */
export type TouchControls = {
  dispose: () => void
  /** Disables (or re-enables) the joystick/look zone and Vue chrome —
   *  used while a full-screen modal is open. Also releases any in-progress
   *  joystick/look touch so movement doesn't get stuck "on". */
  setInputEnabled: (enabled: boolean) => void
}

export function createTouchControls(
  parent: HTMLElement,
  keys: KeyState,
  look: LookState,
  handlers: TouchControlsHandlers,
): TouchControls {
  const root = document.createElement('div')
  root.className = 'seedvale-touch'
  root.innerHTML = `
    <div class="seedvale-touch__look" data-look></div>
    <div class="seedvale-touch__joystick" data-joystick-base>
      <div class="seedvale-touch__joystick-knob" data-joystick-knob></div>
    </div>
  `
  parent.appendChild(root)

  const lookZone = root.querySelector<HTMLElement>('[data-look]')!
  const joystickBase = root.querySelector<HTMLElement>('[data-joystick-base]')!
  const joystickKnob = root.querySelector<HTMLElement>('[data-joystick-knob]')!

  // --- Joystick (single touch, tracked by identifier) ---
  let joystickTouchId: number | null = null
  let joystickCenter: Point = { x: 0, y: 0 }

  const updateJoystick = (clientX: number, clientY: number) => {
    const dx = clientX - joystickCenter.x
    const dy = clientY - joystickCenter.y
    const dist = Math.hypot(dx, dy)
    const clamped = Math.min(dist, JOYSTICK_RADIUS)
    const angle = Math.atan2(dy, dx)
    const kx = Math.cos(angle) * clamped
    const ky = Math.sin(angle) * clamped
    joystickKnob.style.transform = `translate(${kx}px, ${ky}px)`

    const mag = clamped / JOYSTICK_RADIUS
    keys.sprint = mag > JOYSTICK_SPRINT_THRESHOLD
    if (mag < JOYSTICK_DEADZONE) {
      keys.forward = false
      keys.backward = false
      keys.left = false
      keys.right = false
      return
    }
    const nx = kx / JOYSTICK_RADIUS
    const ny = ky / JOYSTICK_RADIUS
    keys.forward = ny < -JOYSTICK_DIRECTION_THRESHOLD
    keys.backward = ny > JOYSTICK_DIRECTION_THRESHOLD
    keys.left = nx < -JOYSTICK_DIRECTION_THRESHOLD
    keys.right = nx > JOYSTICK_DIRECTION_THRESHOLD
  }

  const resetJoystick = () => {
    joystickKnob.style.transform = 'translate(0, 0)'
    keys.forward = false
    keys.backward = false
    keys.left = false
    keys.right = false
    keys.sprint = false
  }

  const onJoystickTouchStart = (event: TouchEvent) => {
    if (joystickTouchId !== null) return
    const rect = joystickBase.getBoundingClientRect()
    joystickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    const touch = event.changedTouches[0]
    joystickTouchId = touch.identifier
    updateJoystick(touch.clientX, touch.clientY)
    event.preventDefault()
  }
  const onJoystickTouchMove = (event: TouchEvent) => {
    const touch = findTouch(event.changedTouches, joystickTouchId)
    if (!touch) return
    updateJoystick(touch.clientX, touch.clientY)
    event.preventDefault()
  }
  const onJoystickTouchEnd = (event: TouchEvent) => {
    const touch = findTouch(event.changedTouches, joystickTouchId)
    if (!touch) return
    joystickTouchId = null
    resetJoystick()
    event.preventDefault()
  }

  joystickBase.addEventListener('touchstart', onJoystickTouchStart, { passive: false })
  joystickBase.addEventListener('touchmove', onJoystickTouchMove, { passive: false })
  joystickBase.addEventListener('touchend', onJoystickTouchEnd, { passive: false })
  joystickBase.addEventListener('touchcancel', onJoystickTouchEnd, { passive: false })

  // --- Look / pinch (full-screen zone) ---
  const lookTouches = new Map<number, Point>()
  let pinchLastDist = 0

  const onLookTouchStart = (event: TouchEvent) => {
    for (const touch of Array.from(event.changedTouches)) {
      lookTouches.set(touch.identifier, { x: touch.clientX, y: touch.clientY })
    }
    if (lookTouches.size === 2) {
      const [a, b] = [...lookTouches.values()]
      pinchLastDist = distanceBetween(a, b)
    }
    event.preventDefault()
  }

  const onLookTouchMove = (event: TouchEvent) => {
    for (const touch of Array.from(event.changedTouches)) {
      const prev = lookTouches.get(touch.identifier)
      if (!prev) continue
      const next = { x: touch.clientX, y: touch.clientY }
      if (lookTouches.size === 1) {
        look.yaw -= (next.x - prev.x) * LOOK_SENSITIVITY
        look.pitch = clampPitch(look.pitch - (next.y - prev.y) * LOOK_SENSITIVITY, look.distance)
      }
      lookTouches.set(touch.identifier, next)
    }
    if (lookTouches.size === 2) {
      const [a, b] = [...lookTouches.values()]
      const dist = distanceBetween(a, b)
      look.distance = clampDistance(look.distance - (dist - pinchLastDist) * PINCH_ZOOM_SPEED)
      look.pitch = clampPitch(look.pitch, look.distance)
      pinchLastDist = dist
    }
    event.preventDefault()
  }

  const onLookTouchEnd = (event: TouchEvent) => {
    for (const touch of Array.from(event.changedTouches)) {
      lookTouches.delete(touch.identifier)
    }
    if (lookTouches.size === 2) {
      const [a, b] = [...lookTouches.values()]
      pinchLastDist = distanceBetween(a, b)
    }
    event.preventDefault()
  }

  lookZone.addEventListener('touchstart', onLookTouchStart, { passive: false })
  lookZone.addEventListener('touchmove', onLookTouchMove, { passive: false })
  lookZone.addEventListener('touchend', onLookTouchEnd, { passive: false })
  lookZone.addEventListener('touchcancel', onLookTouchEnd, { passive: false })

  const getUi = () => getMountedVueUi()
  getUi()?.configureTouchChrome({
    onPause: () => handlers.onPauseToggle(),
    onQuickActions: () => handlers.onQuickActions?.(),
    onInteract: () => { keys.interact = true },
  })

  let inputEnabled = true
  function setInputEnabled(enabled: boolean): void {
    if (enabled === inputEnabled) return
    inputEnabled = enabled
    root.classList.toggle('seedvale-touch--disabled', !enabled)
    getUi()?.setTouchInputEnabled(enabled)
    if (enabled) return
    joystickTouchId = null
    resetJoystick()
    lookTouches.clear()
  }

  return {
    setInputEnabled,
    dispose: () => {
      joystickBase.removeEventListener('touchstart', onJoystickTouchStart)
      joystickBase.removeEventListener('touchmove', onJoystickTouchMove)
      joystickBase.removeEventListener('touchend', onJoystickTouchEnd)
      joystickBase.removeEventListener('touchcancel', onJoystickTouchEnd)
      lookZone.removeEventListener('touchstart', onLookTouchStart)
      lookZone.removeEventListener('touchmove', onLookTouchMove)
      lookZone.removeEventListener('touchend', onLookTouchEnd)
      lookZone.removeEventListener('touchcancel', onLookTouchEnd)
      getUi()?.clearTouchChrome()
      root.remove()
    },
  }
}
