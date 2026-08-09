import { enableTouchScroll } from '../input/enableTouchScroll'
import { isTouchDevice } from '../input/isTouchDevice'

export type PauseMenuHandlers = {
  onPause: () => void
  onResume: () => void
  onToggleGui?: () => void
  /** Fired on every keystroke — cheap in-memory update (e.g. live 3D label). */
  onNameChange?: (name: string) => void
  /** Fired on blur/Enter with the trimmed, non-empty name — persist here. */
  onNameCommit?: (name: string) => void
  onSave?: () => void
  onRefresh?: () => void
  /** Attempts to build a freeform campfire at the player's current position —
   *  returns false (and consumes nothing) if the player doesn't have enough
   *  branches/stones. */
  onBuildCampfire?: () => boolean
  onNewGame?: () => void
  onQuestLog?: () => void
  onVillagers?: () => void
  onInventory?: () => void
}

export type PauseMenu = {
  isPaused: () => boolean
  togglePause: () => void
  setSeed: (seed: number) => void
  dispose: () => void
}

export function createPauseMenu(
  parent: HTMLElement,
  seed: number,
  playerName: string,
  handlers: PauseMenuHandlers,
  /** True while a higher-priority modal not gated by the usual creation-order
   *  `stopImmediatePropagation` trick is open (the Vue NPC dialogue menu,
   *  `ui-vue/`) — that overlay mounts asynchronously (dynamic import), so it
   *  can't rely on registering its own Escape listener before this one the
   *  way every vanilla modal in `src/ui/` does (see e.g. `createQuestLog.ts`'s
   *  `onKeyDown`). Checked instead of relying on listener order. */
  isSuppressed: () => boolean = () => false,
): PauseMenu {
  let paused = false

  const root = document.createElement('div')
  root.className = 'seedvale-pause'
  root.hidden = true
  root.innerHTML = `
    <div class="seedvale-pause__panel">
      <h1>Seedvale</h1>
      <div class="seedvale-pause__section">
        <h2 class="seedvale-pause__subtitle">Character</h2>
        <label class="seedvale-pause__label" for="seedvale-character-name">Name</label>
        <input
          id="seedvale-character-name"
          type="text"
          maxlength="24"
          data-name
          class="seedvale-pause__input"
          autocomplete="off"
        />
      </div>
      <div class="seedvale-pause__row"><span>Seed</span><span data-seed></span></div>
      <button type="button" data-resume class="seedvale-pause__button">Resume</button>
      <button type="button" data-quest-log class="seedvale-pause__button seedvale-pause__button--ghost">Zadania [L]</button>
      <button type="button" data-villagers class="seedvale-pause__button seedvale-pause__button--ghost">Mieszkańcy</button>
      <button type="button" data-inventory class="seedvale-pause__button seedvale-pause__button--ghost">Ekwipunek [I]</button>
      <button type="button" data-save class="seedvale-pause__button seedvale-pause__button--ghost">Save<span data-save-status class="seedvale-pause__save-status"></span></button>
      <button type="button" data-gui class="seedvale-pause__button seedvale-pause__button--ghost">Toggle debug panel</button>
      <button type="button" data-build-campfire class="seedvale-pause__button seedvale-pause__button--ghost">Zbuduj ognisko (2x gałąź, 2x kamień)<span data-build-campfire-status class="seedvale-pause__save-status"></span></button>
      <button type="button" data-refresh class="seedvale-pause__button seedvale-pause__button--ghost">Odśwież stronę</button>
      <button type="button" data-new-game class="seedvale-pause__button seedvale-pause__button--danger">New Game</button>
      <div class="seedvale-pause__hint">${
        isTouchDevice()
          ? 'Joystick — ruch · przeciągnij ekran — rozglądanie · dotknij poza oknem — zamknij'
          : 'WASD — ruch · mysz (klik) — rozglądanie · Esc — pauza'
      }</div>
      <div class="seedvale-pause__footer">v${__APP_VERSION__}<br>${__BUILD_DATE__}<br>${__GIT_COMMIT__}</div>
    </div>
  `
  parent.appendChild(root)

  const panel = root.querySelector<HTMLElement>('.seedvale-pause__panel')!
  const disposeTouchScroll = isTouchDevice() ? enableTouchScroll(panel) : null

  const seedEl = root.querySelector<HTMLElement>('[data-seed]')!
  const resumeButton = root.querySelector<HTMLButtonElement>('[data-resume]')!
  const questLogButton = root.querySelector<HTMLButtonElement>('[data-quest-log]')!
  const villagersButton = root.querySelector<HTMLButtonElement>('[data-villagers]')!
  const inventoryButton = root.querySelector<HTMLButtonElement>('[data-inventory]')!
  const guiButton = root.querySelector<HTMLButtonElement>('[data-gui]')!
  const refreshButton = root.querySelector<HTMLButtonElement>('[data-refresh]')!
  const buildCampfireButton = root.querySelector<HTMLButtonElement>('[data-build-campfire]')!
  const buildCampfireStatusEl = root.querySelector<HTMLElement>('[data-build-campfire-status]')!
  const saveButton = root.querySelector<HTMLButtonElement>('[data-save]')!
  const saveStatusEl = root.querySelector<HTMLElement>('[data-save-status]')!
  const newGameButton = root.querySelector<HTMLButtonElement>('[data-new-game]')!
  const nameInput = root.querySelector<HTMLInputElement>('[data-name]')!
  seedEl.textContent = String(seed)
  nameInput.value = playerName

  let saveStatusTimeout = 0
  saveButton.addEventListener('click', () => {
    handlers.onSave?.()
    saveStatusEl.textContent = 'Saved'
    window.clearTimeout(saveStatusTimeout)
    saveStatusTimeout = window.setTimeout(() => {
      saveStatusEl.textContent = ''
    }, 1500)
  })
  newGameButton.addEventListener('click', () => handlers.onNewGame?.())

  let buildCampfireStatusTimeout = 0
  buildCampfireButton.addEventListener('click', () => {
    const built = handlers.onBuildCampfire?.() ?? false
    buildCampfireStatusEl.textContent = built ? 'Zbudowano!' : 'Brakuje surowców'
    window.clearTimeout(buildCampfireStatusTimeout)
    buildCampfireStatusTimeout = window.setTimeout(() => {
      buildCampfireStatusEl.textContent = ''
    }, 1500)
  })

  const commitName = () => {
    const name = nameInput.value.trim()
    if (name) handlers.onNameCommit?.(name)
  }
  nameInput.addEventListener('input', () => handlers.onNameChange?.(nameInput.value))
  nameInput.addEventListener('change', commitName)
  nameInput.addEventListener('keydown', (event) => {
    if (event.code === 'Enter') nameInput.blur()
  })

  const setPaused = (value: boolean) => {
    if (value === paused) return
    paused = value
    root.hidden = !value
    if (value) {
      handlers.onPause()
    } else {
      handlers.onResume()
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code !== 'Escape' || isSuppressed()) return
    setPaused(!paused)
  }

  // Tapping the backdrop closes the menu — same convention as the other
  // touch-friendly panels (NPC dialog, quest log, villagers). Without this,
  // touch users had no way back once open: the ☰ button that opens the menu
  // sits underneath the full-screen overlay once it's up.
  const onRootClick = (event: MouseEvent) => {
    if (event.target === root) setPaused(false)
  }

  resumeButton.addEventListener('click', () => setPaused(false))
  questLogButton.addEventListener('click', () => {
    setPaused(false)
    handlers.onQuestLog?.()
  })
  villagersButton.addEventListener('click', () => {
    setPaused(false)
    handlers.onVillagers?.()
  })
  inventoryButton.addEventListener('click', () => {
    setPaused(false)
    handlers.onInventory?.()
  })
  guiButton.addEventListener('click', () => handlers.onToggleGui?.())
  refreshButton.addEventListener('click', () => handlers.onRefresh?.())
  window.addEventListener('keydown', onKeyDown)
  root.addEventListener('click', onRootClick)

  return {
    isPaused: () => paused,
    togglePause: () => setPaused(!paused),
    setSeed(nextSeed) {
      seedEl.textContent = String(nextSeed)
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown)
      root.removeEventListener('click', onRootClick)
      window.clearTimeout(saveStatusTimeout)
      window.clearTimeout(buildCampfireStatusTimeout)
      disposeTouchScroll?.()
      root.remove()
    },
  }
}
