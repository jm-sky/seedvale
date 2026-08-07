export type KeyState = {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  sprint: boolean
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
}

export function createKeyboard(): {
  state: KeyState
  dispose: () => void
} {
  const state: KeyState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const action = KEY_MAP[event.code]
    if (action) {
      state[action] = true
      event.preventDefault()
    }
  }

  const onKeyUp = (event: KeyboardEvent) => {
    const action = KEY_MAP[event.code]
    if (action) {
      state[action] = false
      event.preventDefault()
    }
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  return {
    state,
    dispose: () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}
