import { formatClock, phaseName } from '../world/dayNight'

export type Hud = {
  root: HTMLDivElement
  setSeed: (seed: number) => void
  setTime: (timeOfDay: number) => void
  setExp: (exp: number) => void
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
    </div>
    <div class="seedvale-hud__hint">WASD · klik = mysz · Esc = kursor · L = zadania</div>
  `
  parent.appendChild(root)

  const timeEl = root.querySelector('[data-time]')!
  const phaseEl = root.querySelector('[data-phase]')!
  const seedEl = root.querySelector('[data-seed]')!
  const expEl = root.querySelector('[data-exp]')!

  return {
    root,
    setSeed(seed) {
      seedEl.textContent = `seed ${seed}`
    },
    setTime(timeOfDay) {
      timeEl.textContent = formatClock(timeOfDay)
      phaseEl.textContent = phaseName(timeOfDay)
    },
    setExp(exp) {
      expEl.textContent = `exp ${exp}`
    },
    dispose() {
      root.remove()
    },
  }
}
