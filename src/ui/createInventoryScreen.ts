import { enableTouchScroll } from '../input/enableTouchScroll'
import { isTouchDevice } from '../input/isTouchDevice'
import { ITEM_DEFS, type ItemCategory, type ItemKind } from '../items/items'

export type InventoryScreenHandlers = {
  /** Drops the entire carried stack of `kind` back into the world — see
   *  `app/createApp.ts`'s `dropItemStack`. */
  onDrop?: (kind: ItemKind) => void
  onClose?: () => void
}

export type InventoryScreen = {
  isOpen: () => boolean
  open: () => void
  close: () => void
  toggle: () => void
  /** Static snapshot, re-rendered on open/refresh — same convention as
   *  `createVillagersScreen.ts`. Called again by `createApp.ts` right after a
   *  `Wyrzuć` click so the open screen reflects the drop immediately. */
  refresh: (counts: Partial<Record<ItemKind, number>>, totalWeight: number, maxWeight: number) => void
  dispose: () => void
}

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  resource: 'Surowiec',
  tool: 'Narzędzie',
  utility: 'Użytkowe',
}

function formatWeight(kg: number): string {
  return `${kg.toFixed(1)} kg`
}

/**
 * Dedicated ekwipunek screen (plan `2026-08-08--043`) — replaces the old HUD
 * item counters. Same full-screen modal pattern as `createVillagersScreen.ts`:
 * a static snapshot re-rendered on open/`refresh()`, not a live subscription.
 * `Użyj`/`Połącz` from the plan's action list are deliberately not wired up
 * here — v1 has no "active tool"/crafting concept for them to act on yet (see
 * plan §12); only `Wyrzuć` has a concrete effect today.
 */
export function createInventoryScreen(
  parent: HTMLElement,
  handlers: InventoryScreenHandlers = {},
): InventoryScreen {
  let openState = false
  let lastCounts: Partial<Record<ItemKind, number>> = {}
  let lastTotalWeight = 0
  let lastMaxWeight = 0

  const root = document.createElement('div')
  root.className = 'seedvale-inventory'
  root.hidden = true
  root.innerHTML = `
    <div class="seedvale-inventory__panel">
      <h1>Ekwipunek</h1>
      <div class="seedvale-inventory__weight" data-weight></div>
      <div class="seedvale-inventory__list" data-list></div>
      <div class="seedvale-inventory__hint">${
        isTouchDevice() ? 'Dotknij poza oknem — zamknij' : 'Esc — zamknij'
      }</div>
    </div>
  `
  parent.appendChild(root)

  const panel = root.querySelector<HTMLElement>('.seedvale-inventory__panel')!
  const disposeTouchScroll = isTouchDevice() ? enableTouchScroll(panel) : null

  const weightEl = root.querySelector<HTMLElement>('[data-weight]')!
  const listEl = root.querySelector<HTMLElement>('[data-list]')!

  const render = () => {
    weightEl.textContent = `Waga: ${formatWeight(lastTotalWeight)} / ${formatWeight(lastMaxWeight)}`
    const kinds = (Object.keys(ITEM_DEFS) as ItemKind[]).filter((kind) => (lastCounts[kind] ?? 0) > 0)
    if (kinds.length === 0) {
      listEl.innerHTML = '<div class="seedvale-inventory__empty">Ekwipunek jest pusty.</div>'
      return
    }
    listEl.innerHTML = ''
    for (const kind of kinds) {
      const def = ITEM_DEFS[kind]
      const count = lastCounts[kind] ?? 0
      const row = document.createElement('div')
      row.className = 'seedvale-inventory__row'
      row.innerHTML = `
        <div class="seedvale-inventory__row-main">
          <span class="seedvale-inventory__row-name">${count} × ${def.label}</span>
          <span class="seedvale-inventory__row-category">${CATEGORY_LABEL[def.category]}</span>
        </div>
        <div class="seedvale-inventory__row-weight">${formatWeight(def.weight)} szt. · ${formatWeight(def.weight * count)} razem</div>
        <button type="button" class="seedvale-inventory__drop" data-drop="${kind}">Wyrzuć</button>
      `
      listEl.appendChild(row)
    }
    listEl.querySelectorAll<HTMLButtonElement>('[data-drop]').forEach((button) => {
      button.addEventListener('click', () => {
        handlers.onDrop?.(button.dataset.drop as ItemKind)
      })
    })
  }

  const close = () => {
    if (!openState) return
    openState = false
    root.hidden = true
    handlers.onClose?.()
  }

  const onRootClick = (event: MouseEvent) => {
    if (event.target === root) close()
  }

  // Same registration-order trick as createNpcDialog/createQuestLog/
  // createVillagersScreen: create this before pauseMenu so its Escape handler
  // runs first and can swallow the key.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code !== 'Escape' || !openState) return
    event.stopImmediatePropagation()
    close()
  }

  root.addEventListener('click', onRootClick)
  window.addEventListener('keydown', onKeyDown)

  return {
    isOpen: () => openState,
    open() {
      openState = true
      root.hidden = false
      render()
    },
    close,
    toggle() {
      if (openState) close()
      else {
        openState = true
        root.hidden = false
        render()
      }
    },
    refresh(counts, totalWeight, maxWeight) {
      lastCounts = counts
      lastTotalWeight = totalWeight
      lastMaxWeight = maxWeight
      if (openState) render()
    },
    dispose() {
      root.removeEventListener('click', onRootClick)
      window.removeEventListener('keydown', onKeyDown)
      disposeTouchScroll?.()
      root.remove()
    },
  }
}
