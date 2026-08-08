import { enableTouchScroll } from '../input/enableTouchScroll'
import { isTouchDevice } from '../input/isTouchDevice'

export type NpcDialogHandlers = {
  onClose?: () => void
}

export type NpcDialogOffer = {
  onAccept: () => void
  onDecline: () => void
}

const DEFAULT_HINT = isTouchDevice() ? 'Dotknij poza oknem — zamknij' : 'Esc / E — zamknij'
const OFFER_HINT = isTouchDevice()
  ? '[E] Przyjmij  ·  dotknij poza oknem — odmów'
  : '[E] Przyjmij  ·  [Esc] Odmów'

export type NpcDialog = {
  /** `text` is the full action description (e.g. "Rozmawiaj z Anna", "Zaczerpnij
   *  wody") — the caller formats it per interactable kind. Pass null to hide.
   *  Ignored while a dialog is open. */
  setPrompt: (text: string | null) => void
  /** `offer` swaps the "close" hint for accept/decline; call `accept()` to accept. */
  open: (name: string, line: string, offer?: NpcDialogOffer) => void
  /** True while an accept/decline offer is showing (Esc/close = decline). */
  isOffer: () => boolean
  /** Accepts the current offer. No-op outside offer mode. */
  accept: () => void
  close: () => void
  isOpen: () => boolean
  dispose: () => void
}

export function createNpcDialog(
  parent: HTMLElement,
  handlers: NpcDialogHandlers = {},
): NpcDialog {
  let openState = false
  let currentOffer: NpcDialogOffer | null = null

  const prompt = document.createElement('div')
  prompt.className = 'seedvale-interact-prompt'
  prompt.hidden = true
  parent.appendChild(prompt)

  const root = document.createElement('div')
  root.className = 'seedvale-npc-dialog'
  root.hidden = true
  root.innerHTML = `
    <div class="seedvale-npc-dialog__panel">
      <h2 class="seedvale-npc-dialog__name" data-name></h2>
      <p class="seedvale-npc-dialog__line" data-line></p>
      <div class="seedvale-npc-dialog__hint" data-hint>${DEFAULT_HINT}</div>
    </div>
  `
  parent.appendChild(root)

  const panel = root.querySelector<HTMLElement>('.seedvale-npc-dialog__panel')!
  const disposeTouchScroll = isTouchDevice() ? enableTouchScroll(panel) : null

  const nameEl = root.querySelector<HTMLElement>('[data-name]')!
  const lineEl = root.querySelector<HTMLElement>('[data-line]')!
  const hintEl = root.querySelector<HTMLElement>('[data-hint]')!

  const close = () => {
    if (!openState) return
    openState = false
    root.hidden = true
    const offer = currentOffer
    currentOffer = null
    offer?.onDecline()
    handlers.onClose?.()
  }

  const accept = () => {
    if (!openState || !currentOffer) return
    const offer = currentOffer
    currentOffer = null
    openState = false
    root.hidden = true
    offer.onAccept()
    handlers.onClose?.()
  }

  const onRootClick = (event: MouseEvent) => {
    if (event.target === root) close()
  }

  // Registered before the pause menu's own Escape listener (creation order in
  // createApp) so we can stopImmediatePropagation and swallow Escape here instead
  // of it also toggling the pause overlay.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code !== 'Escape' || !openState) return
    event.stopImmediatePropagation()
    close()
  }

  root.addEventListener('click', onRootClick)
  window.addEventListener('keydown', onKeyDown)

  return {
    setPrompt(text) {
      if (openState) return
      if (text === null) {
        prompt.hidden = true
        return
      }
      prompt.hidden = false
      prompt.textContent = `[E] ${text}`
    },
    open(name, line, offer) {
      openState = true
      currentOffer = offer ?? null
      prompt.hidden = true
      nameEl.textContent = name
      lineEl.textContent = line
      hintEl.textContent = offer ? OFFER_HINT : DEFAULT_HINT
      root.hidden = false
    },
    isOffer: () => openState && currentOffer !== null,
    accept,
    close,
    isOpen: () => openState,
    dispose() {
      root.removeEventListener('click', onRootClick)
      window.removeEventListener('keydown', onKeyDown)
      disposeTouchScroll?.()
      prompt.remove()
      root.remove()
    },
  }
}
