export type ToastVariant = 'info' | 'pickup' | 'error'

export type Toast = {
  /** Adds a toast that fades out and removes itself after a few seconds.
   *  Never blocks input — doesn't participate in `app/createApp.ts`'s modal
   *  gating (no `isOpen()`/Escape handling), unlike `createNpcDialog.ts`. */
  show: (text: string, variant?: ToastVariant) => void
  dispose: () => void
}

/** How long a toast stays fully visible before fading. */
const TOAST_VISIBLE_MS = 2200
/** Fade-out duration — matches the CSS transition in index.html. */
const TOAST_FADE_MS = 300

/**
 * Non-blocking notification stack (top-center) for short status feedback that
 * doesn't need a player response — e.g. "Ognisko zapłonęło." or "+1 Gałąź"
 * (issue 012). Complements `createNpcDialog.ts`, which stays reserved for
 * actual conversation/choices (`offer`/accept-decline) and longer flavor
 * text. Multiple toasts stack vertically, each with its own independent timer.
 */
export function createToast(parent: HTMLElement): Toast {
  const root = document.createElement('div')
  root.className = 'seedvale-toast'
  parent.appendChild(root)

  const timeouts = new Set<number>()

  return {
    show(text, variant = 'info') {
      const el = document.createElement('div')
      el.className = `seedvale-toast__item seedvale-toast__item--${variant}`
      el.textContent = text
      root.appendChild(el)

      const fadeTimeout = window.setTimeout(() => {
        el.classList.add('seedvale-toast__item--fading')
        const removeTimeout = window.setTimeout(() => {
          el.remove()
          timeouts.delete(removeTimeout)
        }, TOAST_FADE_MS)
        timeouts.add(removeTimeout)
        timeouts.delete(fadeTimeout)
      }, TOAST_VISIBLE_MS)
      timeouts.add(fadeTimeout)
    },
    dispose() {
      for (const t of timeouts) window.clearTimeout(t)
      timeouts.clear()
      root.remove()
    },
  }
}
