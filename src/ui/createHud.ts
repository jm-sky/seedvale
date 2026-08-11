import { isTouchDevice } from '../input/isTouchDevice'
import { formatClock, phaseName } from '../world/dayNight'

export type Hud = {
  root: HTMLDivElement
  setSeed: (seed: number) => void
  setTime: (timeOfDay: number) => void
  setExp: (exp: number) => void
  /** Total carried weight vs. `Inventory.maxWeight` — replaces the old
   *  per-item text counters (plan `2026-08-08--043` §10); the full breakdown
   *  now lives in `createInventoryScreen.ts` (`[I]`). */
  setInventoryWeight: (current: number, max: number) => void
  /** Label for the held tool slot — empty string hides it. */
  setHeldTool: (label: string) => void
  dispose: () => void
}

export function createHud(parent: HTMLElement): Hud {
  const root = document.createElement('div')
  root.className = 'seedvale-hud'
  root.innerHTML = `
    <div class="seedvale-hud__time" data-time>--</div>
    <div class="seedvale-hud__meta">
      <span data-phase></span>
      <span data-seed></span>
      <span data-exp></span>
      <span data-weight></span>
      <span data-held></span>
    </div>
    <div class="seedvale-hud__hint">${
      isTouchDevice()
        ? 'Joystick = ruch · przeciągnij = kamera · E = interakcja · R = alt'
        : 'WASD · klik = mysz · Esc = kursor · E = interakcja · R = alt · L = zadania · I = ekwipunek · G = upuść'
    }</div>
  `
  parent.appendChild(root)

  const timeEl = root.querySelector('[data-time]')!
  const phaseEl = root.querySelector('[data-phase]')!
  const seedEl = root.querySelector('[data-seed]')!
  const expEl = root.querySelector('[data-exp]')!
  const weightEl = root.querySelector('[data-weight]')!
  const heldEl = root.querySelector('[data-held]')! as HTMLElement

  // `formatClock`/`phaseName` are called every frame (`timeOfDay` advances
  // continuously), but the rendered string only actually changes a few times
  // a minute — skip the `textContent` write (invalidates layout) otherwise.
  let lastTime = ''
  let lastPhase = ''
  let lastExp = ''
  let lastWeight = ''
  let lastHeld = ''

  return {
    root,
    setSeed(seed) {
      seedEl.textContent = `seed ${seed}`
    },
    setTime(timeOfDay) {
      const time = formatClock(timeOfDay)
      if (time !== lastTime) {
        lastTime = time
        timeEl.textContent = time
      }
      const phase = phaseName(timeOfDay)
      if (phase !== lastPhase) {
        lastPhase = phase
        phaseEl.textContent = phase
      }
    },
    setExp(exp) {
      const text = `exp ${exp}`
      if (text === lastExp) return
      lastExp = text
      expEl.textContent = text
    },
    setInventoryWeight(current, max) {
      const text = `${current.toFixed(1)}/${max.toFixed(1)} kg`
      if (text === lastWeight) return
      lastWeight = text
      weightEl.textContent = text
    },
    setHeldTool(label) {
      const text = label ? `w ręce: ${label}` : ''
      if (text === lastHeld) return
      lastHeld = text
      heldEl.textContent = text
    },
    dispose() {
      root.remove()
    },
  }
}
