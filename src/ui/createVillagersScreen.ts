import type { Role, Trait } from '../ai/characters'
import type { NpcAgent } from '../ai/NpcAgent'
import { nearestArchetype, type Personality } from '../ai/dialogue'
import { needLabel } from '../ai/Needs'
import { isTouchDevice } from '../input/isTouchDevice'

export type VillagersScreenHandlers = {
  onClose?: () => void
}

export type VillagerEntry = {
  npc: NpcAgent
  settlementName: string
}

export type VillagersScreen = {
  isOpen: () => boolean
  open: () => void
  close: () => void
  toggle: () => void
  /** Static snapshot, re-rendered on open — not a live subscription (v1, see plan). */
  refresh: (entries: readonly VillagerEntry[]) => void
  dispose: () => void
}

const ROLE_LABEL: Record<Role, string> = {
  woodcutter: 'Drwal',
  farmer: 'Rolnik',
  guard: 'Strażnik',
  trader: 'Kupiec',
}

const PERSONALITY_LABEL: Record<Personality, string> = {
  cheerful: 'Wesoły',
  calm: 'Spokojny',
  grumpy: 'Zrzędliwy',
  curious: 'Ciekawski',
}

const TRAIT_LABEL: Record<Trait, string> = {
  fast_worker: 'Szybki w pracy',
  energetic: 'Energiczny',
  night_owl: 'Nocny Marek',
  sociable: 'Towarzyski',
}

const GENDER_LABEL: Record<NpcAgent['gender'], string> = {
  male: '♂',
  female: '♀',
}

export function createVillagersScreen(
  parent: HTMLElement,
  handlers: VillagersScreenHandlers = {},
): VillagersScreen {
  let openState = false
  let lastEntries: readonly VillagerEntry[] = []

  const root = document.createElement('div')
  root.className = 'seedvale-villagers'
  root.hidden = true
  root.innerHTML = `
    <div class="seedvale-villagers__panel">
      <h1>Mieszkańcy</h1>
      <div class="seedvale-villagers__list" data-list></div>
      <div class="seedvale-villagers__hint">${
        isTouchDevice() ? 'Dotknij poza oknem — zamknij' : 'Esc — zamknij'
      }</div>
    </div>
  `
  parent.appendChild(root)

  const listEl = root.querySelector<HTMLElement>('[data-list]')!

  const render = () => {
    listEl.innerHTML = lastEntries.length
      ? ''
      : '<div class="seedvale-villagers__empty">Brak mieszkańców.</div>'
    // Only show which village a villager belongs to once there's more than
    // one loaded — with a single settlement it's always the same, so the
    // badge would just be visual noise.
    const showSettlement = new Set(lastEntries.map((e) => e.settlementName)).size > 1
    for (const { npc, settlementName } of lastEntries) {
      const hpPct = Math.round((npc.health.currentHp / npc.health.maxHp) * 100)
      const traitTags = npc.traits.length
        ? npc.traits.map((t) => `<span class="seedvale-villagers__tag">${TRAIT_LABEL[t]}</span>`).join('')
        : '<span class="seedvale-villagers__tag seedvale-villagers__tag--muted">brak cech</span>'
      const settlementBadge = showSettlement
        ? `<span class="seedvale-villagers__row-settlement">${settlementName}</span>`
        : ''
      const row = document.createElement('div')
      row.className = 'seedvale-villagers__row'
      row.innerHTML = `
        <div class="seedvale-villagers__row-header">
          <span class="seedvale-villagers__row-name">${npc.name} ${GENDER_LABEL[npc.gender]}</span>
          <span class="seedvale-villagers__row-role">${ROLE_LABEL[npc.role]}</span>
        </div>
        <div class="seedvale-villagers__row-meta">
          ${PERSONALITY_LABEL[nearestArchetype(npc.personality)]} · ${needLabel(npc.getActiveNeed())}${settlementBadge}
        </div>
        <div class="seedvale-villagers__hp" title="${npc.health.currentHp}/${npc.health.maxHp} HP">
          <div class="seedvale-villagers__hp-fill" style="width:${hpPct}%"></div>
        </div>
        <div class="seedvale-villagers__tags">${traitTags}</div>
      `
      listEl.appendChild(row)
    }
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

  // Same registration-order trick as createNpcDialog/createQuestLog: create this
  // before pauseMenu so its Escape handler runs first and can swallow the key.
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
    refresh(entries) {
      lastEntries = entries
      if (openState) render()
    },
    dispose() {
      root.removeEventListener('click', onRootClick)
      window.removeEventListener('keydown', onKeyDown)
      root.remove()
    },
  }
}
