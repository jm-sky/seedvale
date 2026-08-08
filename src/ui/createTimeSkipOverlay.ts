export type TimeSkipOverlay = {
  /** `fade` toggles a full black screen (used for "rest" — sleeping through
   *  the skip) vs. just the floating label alone (used for "wait" — the
   *  player watches the sky/clock visibly race ahead). */
  show: (label: string, fade: boolean) => void
  hide: () => void
  dispose: () => void
}

/**
 * Visual layer for `world/timeSkip.ts` — a label ("Czekasz... (3h)") shown
 * for the duration of a time skip, optionally behind a black fade for the
 * "rest" variants. Stylistically similar to `createLoadingScreen.ts`'s
 * fade/`transitionend` pattern, but a separate component: different
 * lifetime (repeatedly shown/hidden during play, not a one-time boot
 * screen) and the fade is optional per-call rather than always-on.
 */
export function createTimeSkipOverlay(parent: HTMLElement): TimeSkipOverlay {
  const root = document.createElement('div')
  root.className = 'seedvale-time-skip'
  root.hidden = true
  root.innerHTML = `
    <div class="seedvale-time-skip__fade" data-fade></div>
    <div class="seedvale-time-skip__label" data-label></div>
  `
  parent.appendChild(root)

  const fadeEl = root.querySelector<HTMLElement>('[data-fade]')!
  const labelEl = root.querySelector<HTMLElement>('[data-label]')!

  return {
    show(label, fade) {
      root.hidden = false
      labelEl.textContent = label
      if (fade) fadeEl.classList.add('seedvale-time-skip__fade--visible')
    },
    hide() {
      if (root.hidden) return
      if (!fadeEl.classList.contains('seedvale-time-skip__fade--visible')) {
        root.hidden = true
        return
      }
      fadeEl.classList.remove('seedvale-time-skip__fade--visible')
      fadeEl.addEventListener('transitionend', () => { root.hidden = true }, { once: true })
    },
    dispose() {
      root.remove()
    },
  }
}
