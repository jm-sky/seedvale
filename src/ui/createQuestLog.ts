import type { QuestListEntry } from '../quests/QuestManager'
import type { QuestState } from '../quests/quests'

export type QuestLogHandlers = {
  onClose?: () => void
}

export type QuestLog = {
  isOpen: () => boolean
  open: () => void
  close: () => void
  toggle: () => void
  /** Re-renders from current quest/relation/exp state — call whenever it changes while open. */
  refresh: (entries: readonly QuestListEntry[], exp: number, relation: (name: string) => number) => void
  dispose: () => void
}

type Filter = 'all' | 'active' | 'complete'

const STATE_LABEL: Record<QuestState, string> = {
  not_offered: 'niedostępny',
  offered: 'zaoferowany',
  active: 'aktywny',
  ready_to_report: 'do zgłoszenia',
  complete: 'zakończony',
}

function matchesFilter(state: QuestState, filter: Filter): boolean {
  if (filter === 'all') return true
  if (filter === 'complete') return state === 'complete'
  return state !== 'not_offered' && state !== 'complete'
}

export function createQuestLog(parent: HTMLElement, handlers: QuestLogHandlers = {}): QuestLog {
  let openState = false
  let filter: Filter = 'all'
  let lastEntries: readonly QuestListEntry[] = []
  let lastExp = 0
  let lastRelation: (name: string) => number = () => 0

  const root = document.createElement('div')
  root.className = 'seedvale-quest-log'
  root.hidden = true
  root.innerHTML = `
    <div class="seedvale-quest-log__panel">
      <h1>Zadania</h1>
      <div class="seedvale-quest-log__exp">Exp: <span data-exp>0</span></div>
      <div class="seedvale-quest-log__filters" data-filters>
        <button type="button" data-filter="all" class="seedvale-quest-log__filter">Wszystkie</button>
        <button type="button" data-filter="active" class="seedvale-quest-log__filter">W trakcie</button>
        <button type="button" data-filter="complete" class="seedvale-quest-log__filter">Zakończone</button>
      </div>
      <div class="seedvale-quest-log__list" data-list></div>
      <div class="seedvale-quest-log__hint">L / Esc — zamknij</div>
    </div>
  `
  parent.appendChild(root)

  const expEl = root.querySelector<HTMLElement>('[data-exp]')!
  const listEl = root.querySelector<HTMLElement>('[data-list]')!
  const filterButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-filter]'),
  )

  const render = () => {
    expEl.textContent = String(lastExp)
    for (const button of filterButtons) {
      button.classList.toggle(
        'seedvale-quest-log__filter--active',
        button.dataset.filter === filter,
      )
    }
    const visible = lastEntries.filter((entry) => matchesFilter(entry.state, filter))
    listEl.innerHTML = visible.length
      ? ''
      : '<div class="seedvale-quest-log__empty">Brak zadań w tej kategorii.</div>'
    for (const entry of visible) {
      const row = document.createElement('div')
      row.className = 'seedvale-quest-log__row'
      row.innerHTML = `
        <div class="seedvale-quest-log__row-title">${entry.giverName} → ${entry.targetName}</div>
        <div class="seedvale-quest-log__row-state">${STATE_LABEL[entry.state]}</div>
        <div class="seedvale-quest-log__row-relation">♥ ${entry.giverName} ${lastRelation(entry.giverName)} · ♥ ${entry.targetName} ${lastRelation(entry.targetName)}</div>
      `
      listEl.appendChild(row)
    }
  }

  for (const button of filterButtons) {
    button.addEventListener('click', () => {
      filter = button.dataset.filter as Filter
      render()
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

  // Same registration-order trick as createNpcDialog: created before pauseMenu
  // so we can swallow Escape here instead of also toggling the pause overlay.
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
    refresh(entries, exp, relation) {
      lastEntries = entries
      lastExp = exp
      lastRelation = relation
      if (openState) render()
    },
    dispose() {
      root.removeEventListener('click', onRootClick)
      window.removeEventListener('keydown', onKeyDown)
      root.remove()
    },
  }
}
