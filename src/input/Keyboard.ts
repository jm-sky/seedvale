export type KeyState = {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  sprint: boolean
  /** Edge-triggered: set true on KeyE keydown, cleared by consumeInteract(). */
  interact: boolean
  /** Edge-triggered: set true on KeyR keydown, cleared by consumeAltInteract(). */
  altInteract: boolean
  /** Edge-triggered: set true on KeyL keydown, cleared by consumeQuestLog(). */
  questLog: boolean
  /** Edge-triggered: set true on KeyG keydown, cleared by consumeDrop(). */
  drop: boolean
  /** Edge-triggered: set true on KeyI keydown, cleared by consumeInventory(). */
  inventory: boolean
  /** Edge-triggered: set true on KeyQ keydown, cleared by consumeQuickActions(). */
  quickActions: boolean
}

const KEY_MAP: Record<string, keyof KeyState> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  KeyE: 'interact',
  KeyR: 'altInteract',
  KeyL: 'questLog',
  KeyG: 'drop',
  KeyI: 'inventory',
  KeyQ: 'quickActions',
}

/** Actions that latch true on keydown and are cleared by the consumer, not by keyup —
 *  so a tap registers exactly once regardless of how long the key stays down. */
const EDGE_TRIGGERED = new Set<keyof KeyState>(['altInteract', 'drop', 'interact', 'inventory', 'questLog', 'quickActions'])

/** True while the event is headed for a text field — the pause menu's Character
 *  name input is the live case. Without this, `KEY_MAP` letters (w/a/s/d/e/l/g)
 *  would both steer the player and get `preventDefault()`d out of the field, so
 *  the name simply couldn't contain them. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  )
}

export function createKeyboard(): {
  state: KeyState
  /** Reads and clears the pending interact press. Returns true at most once per keydown. */
  consumeInteract: () => boolean
  /** Reads and clears the pending alt-interact press (`R`). */
  consumeAltInteract: () => boolean
  /** Reads and clears the pending quest-log press. Returns true at most once per keydown. */
  consumeQuestLog: () => boolean
  /** Reads and clears the pending drop press. Returns true at most once per keydown. */
  consumeDrop: () => boolean
  /** Reads and clears the pending inventory press. Returns true at most once per keydown. */
  consumeInventory: () => boolean
  /** Reads and clears the pending quick actions press. Returns true at most once per keydown. */
  consumeQuickActions: () => boolean
  dispose: () => void
} {
  const state: KeyState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    interact: false,
    altInteract: false,
    questLog: false,
    drop: false,
    inventory: false,
    quickActions: false,
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) return
    const action = KEY_MAP[event.code]
    if (!action) return
    if (EDGE_TRIGGERED.has(action)) {
      if (!event.repeat) state[action] = true
    } else {
      state[action] = true
    }
    event.preventDefault()
  }

  const onKeyUp = (event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) return
    const action = KEY_MAP[event.code]
    if (!action) return
    if (!EDGE_TRIGGERED.has(action)) state[action] = false
    event.preventDefault()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  const consume = (key: 'interact' | 'altInteract' | 'questLog' | 'drop' | 'inventory' | 'quickActions'): boolean => {
    if (!state[key]) return false
    state[key] = false
    return true
  }

  return {
    state,
    consumeInteract: () => consume('interact'),
    consumeAltInteract: () => consume('altInteract'),
    consumeQuestLog: () => consume('questLog'),
    consumeDrop: () => consume('drop'),
    consumeInventory: () => consume('inventory'),
    consumeQuickActions: () => consume('quickActions'),
    dispose: () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}
