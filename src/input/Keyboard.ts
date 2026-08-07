export type KeyState = {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  sprint: boolean
  /** Edge-triggered: set true on KeyE keydown, cleared by consumeInteract(). */
  interact: boolean
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
}

/** Actions that latch true on keydown and are cleared by the consumer, not by keyup —
 *  so a tap registers exactly once regardless of how long the key stays down. */
const EDGE_TRIGGERED = new Set<keyof KeyState>(['interact'])

export function createKeyboard(): {
  state: KeyState
  /** Reads and clears the pending interact press. Returns true at most once per keydown. */
  consumeInteract: () => boolean
  dispose: () => void
} {
  const state: KeyState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    interact: false,
  }

  const onKeyDown = (event: KeyboardEvent) => {
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
    const action = KEY_MAP[event.code]
    if (!action) return
    if (!EDGE_TRIGGERED.has(action)) state[action] = false
    event.preventDefault()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  return {
    state,
    consumeInteract: () => {
      if (!state.interact) return false
      state.interact = false
      return true
    },
    dispose: () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}
