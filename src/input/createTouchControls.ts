import type { KeyState } from './Keyboard'
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

/** On-screen joystick (move) + full-screen drag/pinch zone (look/zoom) + a small
 *  action-button cluster, replacing WASD/mouse-look/wheel/E/Shift/L/G/Esc on
 *  touch devices. Writes directly into the same `KeyState`/`LookState` objects
 *  the keyboard and mouse-look inputs use, so `PlayerController` and the
 *  interaction loop in `createApp` need no touch-specific branches. */
export type TouchControls = {
  dispose: () => void
  /** Disables (or re-enables) the whole joystick/look-zone/action-button layer —
   *  used while a full-screen modal (pause menu, quest log, ...) is open, so a
   *  tap meant for the modal can never also land on a button underneath it. Also
   *  releases any in-progress joystick/look touch so movement doesn't get stuck
   *  "on" if disabled mid-drag. */
  setInputEnabled: (enabled: boolean) => void
  /** The ☰ pause button — a reference so `createApp` can relocate it into the
   *  shared top-right cluster alongside the minimap (see
   *  `.seedvale-top-right-cluster` in index.html) instead of leaving it
   *  independently absolutely-positioned. Its click wiring/dispose stay owned
   *  here; only its DOM parent moves. */
  pauseButton: HTMLButtonElement
  /** Shows/hides the G (drop) button — it only does anything while the player
   *  is carrying at least one item, so `createApp` calls this whenever the
   *  inventory changes instead of leaving a permanently-visible button whose
   *  purpose isn't obvious until you have something to drop (reported). */
  setDropAvailable: (available: boolean) => void
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
    <button type="button" class="seedvale-touch__pause" data-pause>☰</button>
  `
  parent.appendChild(root)

  // Not a child of `root` — a child's z-index can never escape its parent's own
  // stacking context, and `.seedvale-touch` is pinned low (z-index 7) so its
  // full-screen look-drag zone never floats above a modal. This cluster needs
  // to clear `.seedvale-npc-dialog` instead (see index.html's CSS comment on
  // `.seedvale-touch__buttons`), so it's its own top-level sibling, same
  // reasoning as `pauseButton` below.
  const buttons = document.createElement('div')
  buttons.className = 'seedvale-touch__buttons'
  buttons.innerHTML = `
    <button type="button" class="seedvale-touch__button" data-quick-actions>⚡</button>
    <button type="button" class="seedvale-touch__button" data-drop hidden>G</button>
    <button type="button" class="seedvale-touch__button seedvale-touch__button--sprint" data-sprint>RUN</button>
    <button type="button" class="seedvale-touch__button seedvale-touch__button--primary" data-interact>E</button>
  `
  parent.appendChild(buttons)

  const lookZone = root.querySelector<HTMLElement>('[data-look]')!
  const joystickBase = root.querySelector<HTMLElement>('[data-joystick-base]')!
  const joystickKnob = root.querySelector<HTMLElement>('[data-joystick-knob]')!
  const quickActionsButton = buttons.querySelector<HTMLButtonElement>('[data-quick-actions]')!
  const dropButton = buttons.querySelector<HTMLButtonElement>('[data-drop]')!
  const sprintButton = buttons.querySelector<HTMLButtonElement>('[data-sprint]')!
  const interactButton = buttons.querySelector<HTMLButtonElement>('[data-interact]')!
  const pauseButton = root.querySelector<HTMLButtonElement>('[data-pause]')!

  // --- Joystick (single touch, tracked by identifier) ---
  let joystickTouchId: number | null = null
  let joystickCenter: Point = { x: 0, y: 0 }
  /** Manual override from the RUN button — kept separate from the joystick-driven
   *  push-to-run so releasing/re-centering the knob doesn't clobber a toggle-on. */
  let sprintButtonActive = false

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
    keys.sprint = sprintButtonActive || mag > JOYSTICK_SPRINT_THRESHOLD
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
    keys.sprint = sprintButtonActive
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

  // --- Look drag (1 finger) + pinch zoom (2 fingers) ---
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
    // Re-baseline so going 2→1 fingers doesn't read as a sudden drag jump.
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

  // --- Buttons: reuse the same edge-triggered latches / continuous flags the
  // keyboard uses, so createApp's tick() needs no touch-specific branching. ---
  const onInteract = () => {
    keys.interact = true
  }
  const onDrop = () => {
    keys.drop = true
  }
  const onSprintToggle = () => {
    sprintButtonActive = !sprintButtonActive
    keys.sprint = sprintButtonActive
    sprintButton.classList.toggle('seedvale-touch__button--active', sprintButtonActive)
  }
  const onPause = () => handlers.onPauseToggle()
  const onQuickActions = () => handlers.onQuickActions?.()

  interactButton.addEventListener('click', onInteract)
  dropButton.addEventListener('click', onDrop)
  sprintButton.addEventListener('click', onSprintToggle)
  pauseButton.addEventListener('click', onPause)
  quickActionsButton.addEventListener('click', onQuickActions)

  // Called every frame from createApp's tick loop — guard against redundant
  // DOM writes so an unchanged state doesn't force a style recalc (the
  // `.seedvale-touch--disabled *` selector is a universal descendant
  // selector) 60x/sec while paused.
  let inputEnabled = true
  function setInputEnabled(enabled: boolean): void {
    if (enabled === inputEnabled) return
    inputEnabled = enabled
    root.classList.toggle('seedvale-touch--disabled', !enabled)
    // Separate subtree from `root` (see the buttons cluster's own comment
    // above) — needs the same class toggled on it directly, the descendant
    // selector on `root` doesn't reach it. `[data-interact]` stays clickable
    // regardless (index.html's `.seedvale-touch__buttons.seedvale-touch
    // --disabled [data-interact]` exemption) — the npc dialog's "[E] Przyjmij"
    // quest-accept prompt needs it even while the dialog counts as a modal.
    buttons.classList.toggle('seedvale-touch--disabled', !enabled)
    if (enabled) return
    joystickTouchId = null
    resetJoystick()
    lookTouches.clear()
  }

  function setDropAvailable(available: boolean): void {
    dropButton.hidden = !available
  }

  return {
    setInputEnabled,
    setDropAvailable,
    pauseButton,
    dispose: () => {
      joystickBase.removeEventListener('touchstart', onJoystickTouchStart)
      joystickBase.removeEventListener('touchmove', onJoystickTouchMove)
      joystickBase.removeEventListener('touchend', onJoystickTouchEnd)
      joystickBase.removeEventListener('touchcancel', onJoystickTouchEnd)
      lookZone.removeEventListener('touchstart', onLookTouchStart)
      lookZone.removeEventListener('touchmove', onLookTouchMove)
      lookZone.removeEventListener('touchend', onLookTouchEnd)
      lookZone.removeEventListener('touchcancel', onLookTouchEnd)
      interactButton.removeEventListener('click', onInteract)
      dropButton.removeEventListener('click', onDrop)
      sprintButton.removeEventListener('click', onSprintToggle)
      pauseButton.removeEventListener('click', onPause)
      quickActionsButton.removeEventListener('click', onQuickActions)
      // Both relocated out of `root` (pauseButton into the shared top-right
      // cluster, see createApp; `buttons` is its own top-level sibling, see
      // above) — root.remove() below won't reach either of them.
      pauseButton.remove()
      buttons.remove()
      root.remove()
    },
  }
}
