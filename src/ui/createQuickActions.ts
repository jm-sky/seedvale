import { enableTouchScroll } from '../input/enableTouchScroll'
import { isTouchDevice } from '../input/isTouchDevice'

export type QuickActionsHandlers = {
  /** Same handler passed to `createPauseMenu`'s `onBuildCampfire` — this is a
   *  second UI entry point onto identical logic, not a duplicate. Returns
   *  false (consumes nothing) if the player lacks the resources. */
  onBuildCampfire?: () => boolean
  /** Starts a "wait" time skip (1/3/6h, visible fast-forward) — see
   *  `world/timeSkip.ts`. */
  onWait?: (hours: number) => void
  /** Starts an 8h "rest" time skip (fades to black). `'town'` requires the
   *  player to be near a settlement — returns `'too-far'` (consumes nothing)
   *  if not; `'camp'` always succeeds. */
  onRest?: (variant: 'camp' | 'town') => 'ok' | 'too-far'
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
 * in-gameplay actions — currently just "Zbuduj ognisko". Opened via a trigger
 * button: on touch, that button lives inside `input/createTouchControls.ts`'s
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
    <button type="button" data-build-campfire class="seedvale-quick-actions__button">
      Zbuduj ognisko (2x gałąź, 2x kamień)
      <span data-build-campfire-status class="seedvale-quick-actions__status"></span>
    </button>
    <div class="seedvale-quick-actions__heading">Czekaj</div>
    <div class="seedvale-quick-actions__row">
      <button type="button" data-wait="1" class="seedvale-quick-actions__button seedvale-quick-actions__button--small">1h</button>
      <button type="button" data-wait="3" class="seedvale-quick-actions__button seedvale-quick-actions__button--small">3h</button>
      <button type="button" data-wait="6" class="seedvale-quick-actions__button seedvale-quick-actions__button--small">6h</button>
    </div>
    <div class="seedvale-quick-actions__heading">Odpoczynek</div>
    <button type="button" data-rest="camp" class="seedvale-quick-actions__button">Rozbij obóz (8h)</button>
    <button type="button" data-rest="town" class="seedvale-quick-actions__button">
      Odpocznij w mieście (8h)
      <span data-rest-town-status class="seedvale-quick-actions__status"></span>
    </button>
  `
  parent.appendChild(root)
  const disposeTouchScroll = isTouchDevice() ? enableTouchScroll(root) : null

  const buildCampfireButton = root.querySelector<HTMLButtonElement>('[data-build-campfire]')!
  const buildCampfireStatusEl = root.querySelector<HTMLElement>('[data-build-campfire-status]')!

  let buildCampfireStatusTimeout = 0
  buildCampfireButton.addEventListener('click', () => {
    const built = handlers.onBuildCampfire?.() ?? false
    buildCampfireStatusEl.textContent = built ? 'Zbudowano!' : 'Brakuje surowców'
    window.clearTimeout(buildCampfireStatusTimeout)
    buildCampfireStatusTimeout = window.setTimeout(() => {
      buildCampfireStatusEl.textContent = ''
    }, 1500)
  })

  root.querySelectorAll<HTMLButtonElement>('[data-wait]').forEach((button) => {
    const hours = Number(button.dataset.wait)
    button.addEventListener('click', () => {
      close()
      handlers.onWait?.(hours)
    })
  })

  const campButton = root.querySelector<HTMLButtonElement>('[data-rest="camp"]')!
  campButton.addEventListener('click', () => {
    close()
    handlers.onRest?.('camp')
  })

  const townButton = root.querySelector<HTMLButtonElement>('[data-rest="town"]')!
  const townStatusEl = root.querySelector<HTMLElement>('[data-rest-town-status]')!
  let townStatusTimeout = 0
  townButton.addEventListener('click', () => {
    const result = handlers.onRest?.('town') ?? 'too-far'
    if (result === 'too-far') {
      townStatusEl.textContent = 'Musisz być bliżej wioski'
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
      window.clearTimeout(buildCampfireStatusTimeout)
      window.clearTimeout(townStatusTimeout)
      disposeTouchScroll?.()
      triggerButton?.remove()
      root.remove()
    },
  }
}
