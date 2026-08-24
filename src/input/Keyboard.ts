export type KeyState = {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  sprint: boolean
  /** Edge-triggered: set true on KeyE keydown, cleared by consumeInteract(). */
  interact: boolean
  /** Set true on KeyE keyup, cleared by consumeInteractRelease() — the release
   *  edge of the shared primary attack/use action (mirrored by LMB and the
   *  mobile `E` button, both writing into this same field). */
  interactReleased: boolean
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
  /** Edge-triggered: set true on KeyM keydown, cleared by consumeMinimap(). */
  minimap: boolean
  /** Edge-triggered: set true on KeyU keydown, cleared by consumeSkills(). */
  skills: boolean
  /** Edge-triggered: set true on KeyC keydown, cleared by consumeCharacter(). */
  character: boolean
  /** Edge-triggered: set true on Space keydown, cleared by consumeJump(). */
  jump: boolean
  /** Edge-triggered: set true on Tab keydown, cleared by consumeCycleTarget()
   *  — cycles among multiple interaction candidates (plan 153). */
  cycleTarget: boolean
  /** Edge-triggered: set true on `+`/NumpadAdd keydown, cleared by
   *  consumePlus() — meaningless outside the terrain-preparation preview
   *  (plan `world-terrain-002`), which is the only consumer. */
  plus: boolean
  /** Edge-triggered: set true on `-`/NumpadSubtract keydown, cleared by
   *  consumeMinus() — same single consumer as `plus` above. */
  minus: boolean
  /** Edge-triggered: set true on `,` keydown, cleared by consumeComma() —
   *  same single consumer as `plus` above. */
  comma: boolean
  /** Edge-triggered: set true on `.` keydown, cleared by consumePeriod() —
   *  same single consumer as `plus` above. */
  period: boolean
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
  KeyM: 'minimap',
  KeyU: 'skills',
  KeyC: 'character',
  Space: 'jump',
  Tab: 'cycleTarget',
  Equal: 'plus',
  NumpadAdd: 'plus',
  Minus: 'minus',
  NumpadSubtract: 'minus',
  Comma: 'comma',
  Period: 'period',
}

/** Actions that latch true on keydown and are cleared by the consumer, not by keyup —
 *  so a tap registers exactly once regardless of how long the key stays down. */
const EDGE_TRIGGERED = new Set<keyof KeyState>(['altInteract', 'character', 'comma', 'cycleTarget', 'drop', 'interact', 'inventory', 'jump', 'minimap', 'minus', 'period', 'plus', 'questLog', 'quickActions', 'skills'])

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
  /** Reads and clears the pending interact release (`E` keyup). */
  consumeInteractRelease: () => boolean
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
  /** Reads and clears the pending world-map toggle press (`M`). */
  consumeMinimap: () => boolean
  /** Reads and clears the pending skills-screen toggle press (`U`). */
  consumeSkills: () => boolean
  /** Reads and clears the pending character-screen toggle press (`C`). */
  consumeCharacter: () => boolean
  /** Reads and clears the pending jump press (`Space`). */
  consumeJump: () => boolean
  /** Reads and clears the pending interaction-cycle press (`Tab`, plan 153). */
  consumeCycleTarget: () => boolean
  /** Reads and clears the pending `+` press — terrain-preparation preview size up. */
  consumePlus: () => boolean
  /** Reads and clears the pending `-` press — terrain-preparation preview size down. */
  consumeMinus: () => boolean
  /** Reads and clears the pending `,` press — terrain-preparation preview target height down. */
  consumeComma: () => boolean
  /** Reads and clears the pending `.` press — terrain-preparation preview target height up. */
  consumePeriod: () => boolean
  dispose: () => void
} {
  const state: KeyState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    interact: false,
    interactReleased: false,
    altInteract: false,
    questLog: false,
    drop: false,
    inventory: false,
    quickActions: false,
    minimap: false,
    skills: false,
    character: false,
    jump: false,
    cycleTarget: false,
    plus: false,
    minus: false,
    comma: false,
    period: false,
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
    if (action === 'interact') state.interactReleased = true
    event.preventDefault()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  const consume = (key: 'interact' | 'interactReleased' | 'altInteract' | 'questLog' | 'drop' | 'inventory' | 'quickActions' | 'minimap' | 'skills' | 'character' | 'jump' | 'cycleTarget' | 'plus' | 'minus' | 'comma' | 'period'): boolean => {
    if (!state[key]) return false
    state[key] = false
    return true
  }

  return {
    state,
    consumeInteract: () => consume('interact'),
    consumeInteractRelease: () => consume('interactReleased'),
    consumeAltInteract: () => consume('altInteract'),
    consumeQuestLog: () => consume('questLog'),
    consumeDrop: () => consume('drop'),
    consumeInventory: () => consume('inventory'),
    consumeQuickActions: () => consume('quickActions'),
    consumeMinimap: () => consume('minimap'),
    consumeSkills: () => consume('skills'),
    consumeCharacter: () => consume('character'),
    consumeJump: () => consume('jump'),
    consumeCycleTarget: () => consume('cycleTarget'),
    consumePlus: () => consume('plus'),
    consumeMinus: () => consume('minus'),
    consumeComma: () => consume('comma'),
    consumePeriod: () => consume('period'),
    dispose: () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}
