import { enableTouchScroll } from '../input/enableTouchScroll'
import { isTouchDevice } from '../input/isTouchDevice'

export type QuickActionsHandlers = {
  /** Same handlers passed to `createPauseMenu` — these are a second UI entry
   *  point onto identical logic, not a duplicate. Each returns false
   *  (consumes nothing) if the player lacks the resources.
   *  `docs/plans/2026-08-09--050`. */
  onBuildSimpleFire?: () => boolean
  onBuildFirePit?: () => boolean
  onLightTorch?: () => boolean
  /** Starts a "wait" time skip (1/3/6h, visible fast-forward) — see
   *  `world/timeSkip.ts`. */
  onWait?: (hours: number) => void
  /** Starts an 8h "rest" time skip (fades to black). Both variants require a
   *  blanket in the inventory — returns `'no-blanket'` (consumes nothing) if
   *  missing; `'town'` additionally requires the player to be near a
   *  settlement — returns `'too-far'` (consumes nothing) if not. */
  onRest?: (variant: 'camp' | 'town') => 'ok' | 'too-far' | 'no-blanket'
}

export type QuickActions = {
  isOpen: () => boolean
  toggle: () => void
  close: () => void
  dispose: () => void
}

/**
 * A small anchored popover (not a full-screen modal like `createNpcDialog`/
 * `createQuestLog`/`createVillagersScreen`/`createPauseMenu`) listing fast
 * in-gameplay actions — fire/torch building (plan 2026-08-09--050) plus
 * wait/rest. Opened via a trigger button: on touch, that button lives inside
 * `input/createTouchControls.ts`'s
 * own action-button column next to E (this module doesn't render it there);
 * on desktop, where no such column exists, this module renders its own small
 * fixed corner button. Still participates in the same modal-gating
 * conventions as the other four (`isOpen()`, Escape-to-close registered
 * before the pause menu) so `app/createApp.ts` can suppress movement/interact
 * while it's open.
 */
export function createQuickActions(
  parent: HTMLElement,
  handlers: QuickActionsHandlers = {},
): QuickActions {
  let openState = false

  const root = document.createElement('div')
  root.className = 'seedvale-quick-actions'
  root.hidden = true
  root.innerHTML = `
    <div class="seedvale-quick-actions__heading">Ogień</div>
    <button type="button" data-build-simple-fire class="seedvale-quick-actions__button">
      Rozpal ognisko (2x gałąź)
      <span data-build-simple-fire-status class="seedvale-quick-actions__status"></span>
    </button>
    <button type="button" data-build-fire-pit class="seedvale-quick-actions__button">
      Zbuduj palenisko (4x kamień)
      <span data-build-fire-pit-status class="seedvale-quick-actions__status"></span>
    </button>
    <button type="button" data-light-torch class="seedvale-quick-actions__button">
      Zapal pochodnię (1x gałąź)
      <span data-light-torch-status class="seedvale-quick-actions__status"></span>
    </button>
    <div class="seedvale-quick-actions__heading">Czekaj</div>
    <div class="seedvale-quick-actions__row">
      <button type="button" data-wait="1" class="seedvale-quick-actions__button seedvale-quick-actions__button--small">1h</button>
      <button type="button" data-wait="3" class="seedvale-quick-actions__button seedvale-quick-actions__button--small">3h</button>
      <button type="button" data-wait="6" class="seedvale-quick-actions__button seedvale-quick-actions__button--small">6h</button>
    </div>
    <div class="seedvale-quick-actions__heading">Odpoczynek</div>
    <button type="button" data-rest="camp" class="seedvale-quick-actions__button">
      Rozbij obóz (8h)
      <span data-rest-camp-status class="seedvale-quick-actions__status"></span>
    </button>
    <button type="button" data-rest="town" class="seedvale-quick-actions__button">
      Odpocznij w mieście (8h)
      <span data-rest-town-status class="seedvale-quick-actions__status"></span>
    </button>
  `
  parent.appendChild(root)
  const disposeTouchScroll = isTouchDevice() ? enableTouchScroll(root) : null

  /** Wires a button+status pair to a handler that returns success/failure,
   *  showing a transient status message either way — shared shape for the
   *  three fire/torch actions below. Returns a cleanup that clears the
   *  pending status timeout, for `dispose()`. */
  const wireResultButton = (selector: string, statusSelector: string, handler: (() => boolean) | undefined, successText: string, failureText: string): (() => void) => {
    const button = root.querySelector<HTMLButtonElement>(selector)!
    const statusEl = root.querySelector<HTMLElement>(statusSelector)!
    let statusTimeout = 0
    button.addEventListener('click', () => {
      const ok = handler?.() ?? false
      statusEl.textContent = ok ? successText : failureText
      window.clearTimeout(statusTimeout)
      statusTimeout = window.setTimeout(() => {
        statusEl.textContent = ''
      }, 1500)
    })
    return () => window.clearTimeout(statusTimeout)
  }

  const clearSimpleFireStatus = wireResultButton('[data-build-simple-fire]', '[data-build-simple-fire-status]', handlers.onBuildSimpleFire, 'Zapłonęło!', 'Brakuje gałęzi/krzesiwa')
  const clearFirePitStatus = wireResultButton('[data-build-fire-pit]', '[data-build-fire-pit-status]', handlers.onBuildFirePit, 'Zbudowano!', 'Brakuje kamieni')
  const clearTorchStatus = wireResultButton('[data-light-torch]', '[data-light-torch-status]', handlers.onLightTorch, 'Zapalono!', 'Brakuje gałęzi/krzesiwa lub już płonie')

  root.querySelectorAll<HTMLButtonElement>('[data-wait]').forEach((button) => {
    const hours = Number(button.dataset.wait)
    button.addEventListener('click', () => {
      close()
      handlers.onWait?.(hours)
    })
  })

  const restStatusText: Record<'too-far' | 'no-blanket', string> = {
    'too-far': 'Musisz być bliżej wioski',
    'no-blanket': 'Potrzebujesz koca',
  }

  const campButton = root.querySelector<HTMLButtonElement>('[data-rest="camp"]')!
  const campStatusEl = root.querySelector<HTMLElement>('[data-rest-camp-status]')!
  let campStatusTimeout = 0
  campButton.addEventListener('click', () => {
    const result = handlers.onRest?.('camp') ?? 'no-blanket'
    if (result !== 'ok') {
      campStatusEl.textContent = restStatusText[result]
      window.clearTimeout(campStatusTimeout)
      campStatusTimeout = window.setTimeout(() => {
        campStatusEl.textContent = ''
      }, 1500)
      return
    }
    close()
  })

  const townButton = root.querySelector<HTMLButtonElement>('[data-rest="town"]')!
  const townStatusEl = root.querySelector<HTMLElement>('[data-rest-town-status]')!
  let townStatusTimeout = 0
  townButton.addEventListener('click', () => {
    const result = handlers.onRest?.('town') ?? 'too-far'
    if (result !== 'ok') {
      townStatusEl.textContent = restStatusText[result]
      window.clearTimeout(townStatusTimeout)
      townStatusTimeout = window.setTimeout(() => {
        townStatusEl.textContent = ''
      }, 1500)
      return
    }
    close()
  })

  // Touch already has its own trigger button (next to E, see
  // createTouchControls.ts) — only build one here for desktop, which has no
  // equivalent action-button column to join.
  const triggerButton = isTouchDevice() ? null : document.createElement('button')
  if (triggerButton) {
    triggerButton.type = 'button'
    triggerButton.className = 'seedvale-quick-actions__trigger'
    triggerButton.textContent = '⚡'
    triggerButton.addEventListener('click', () => toggle())
    parent.appendChild(triggerButton)
  }

  // Attached only while open, and only on the *next* tick — so the click that
  // opened the popup (whichever trigger fired it) doesn't immediately bubble
  // into this listener and close it again. Any click landing outside `root`
  // afterwards closes it, which naturally covers both trigger buttons too
  // (re-clicking one is handled by `toggle()` directly; this is just the
  // "tapped/clicked elsewhere" fallback).
  const onDocumentClick = (event: MouseEvent) => {
    if (root.contains(event.target as Node)) return
    close()
  }

  const open = () => {
    if (openState) return
    openState = true
    root.hidden = false
    window.setTimeout(() => document.addEventListener('click', onDocumentClick), 0)
  }

  const close = () => {
    if (!openState) return
    openState = false
    root.hidden = true
    document.removeEventListener('click', onDocumentClick)
  }

  const toggle = () => {
    if (openState) close()
    else open()
  }

  // Registered before the pause menu's own Escape listener (creation order in
  // createApp) so we can stopImmediatePropagation and swallow Escape here
  // instead of it also toggling the pause overlay — same convention as the
  // other four popups.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code !== 'Escape' || !openState) return
    event.stopImmediatePropagation()
    close()
  }
  window.addEventListener('keydown', onKeyDown)

  return {
    isOpen: () => openState,
    toggle,
    close,
    dispose() {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('click', onDocumentClick)
      clearSimpleFireStatus()
      clearFirePitStatus()
      clearTorchStatus()
      window.clearTimeout(campStatusTimeout)
      window.clearTimeout(townStatusTimeout)
      disposeTouchScroll?.()
      triggerButton?.remove()
      root.remove()
    },
  }
}
