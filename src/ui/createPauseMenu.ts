export type PauseMenuHandlers = {
  onPause: () => void
  onResume: () => void
  onToggleGui?: () => void
  /** Fired on every keystroke — cheap in-memory update (e.g. live 3D label). */
  onNameChange?: (name: string) => void
  /** Fired on blur/Enter with the trimmed, non-empty name — persist here. */
  onNameCommit?: (name: string) => void
  onSave?: () => void
  onNewGame?: () => void
  onQuestLog?: () => void
  onVillagers?: () => void
}

export type PauseMenu = {
  isPaused: () => boolean
  setSeed: (seed: number) => void
  dispose: () => void
}

export function createPauseMenu(
  parent: HTMLElement,
  seed: number,
  playerName: string,
  handlers: PauseMenuHandlers,
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
      <button type="button" data-save class="seedvale-pause__button seedvale-pause__button--ghost">Save<span data-save-status class="seedvale-pause__save-status"></span></button>
      <button type="button" data-gui class="seedvale-pause__button seedvale-pause__button--ghost">Toggle debug panel</button>
      <button type="button" data-new-game class="seedvale-pause__button seedvale-pause__button--danger">New Game</button>
      <div class="seedvale-pause__hint">WASD — ruch · mysz (klik) — rozglądanie · Esc — pauza</div>
    </div>
  `
  parent.appendChild(root)

  const seedEl = root.querySelector<HTMLElement>('[data-seed]')!
  const resumeButton = root.querySelector<HTMLButtonElement>('[data-resume]')!
  const questLogButton = root.querySelector<HTMLButtonElement>('[data-quest-log]')!
  const villagersButton = root.querySelector<HTMLButtonElement>('[data-villagers]')!
  const guiButton = root.querySelector<HTMLButtonElement>('[data-gui]')!
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
    if (event.code !== 'Escape') return
    setPaused(!paused)
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
  guiButton.addEventListener('click', () => handlers.onToggleGui?.())
  window.addEventListener('keydown', onKeyDown)

  return {
    isPaused: () => paused,
    setSeed(nextSeed) {
      seedEl.textContent = String(nextSeed)
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown)
      window.clearTimeout(saveStatusTimeout)
      root.remove()
    },
  }
}
