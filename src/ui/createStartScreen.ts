import {
  formatSaveDay,
  MAX_SAVES,
  nextDefaultSaveName,
  SAVE_NAME_MAX_LENGTH,
  saveErrorMessage,
  type SaveSlotInfo,
  validateSaveName,
} from '../persistence/saveSlots'

export type StartScreenChoice =
  | { type: 'continue' }
  | { type: 'load', id: string }
  | { type: 'new', name: string }
  | { type: 'delete', id: string }

export type StartScreen = {
  /** Resolves once the player picks Continue, a slot, New Game, or Delete. */
  choose: () => Promise<StartScreenChoice>
  dispose: () => void
}

function formatSavedAt(savedAt: number): string {
  return new Date(savedAt).toLocaleString()
}

/** Shown only when a save exists — reuses the pause menu's overlay styling
 *  (`.seedvale-pause*`) rather than introducing new CSS beyond the save list. */
export function createStartScreen(
  parent: HTMLElement,
  slots: readonly SaveSlotInfo[],
  activeId: string | null,
): StartScreen {
  const root = document.createElement('div')
  root.className = 'seedvale-pause'
  const panel = document.createElement('div')
  panel.className = 'seedvale-pause__panel'
  root.appendChild(panel)
  parent.appendChild(root)

  const title = document.createElement('h1')
  title.textContent = 'Seedvale'
  panel.appendChild(title)

  let settled = false
  let resolveChoice: ((choice: StartScreenChoice) => void) | null = null
  const choose = (): Promise<StartScreenChoice> =>
    new Promise((resolve) => {
      resolveChoice = resolve
    })

  const settle = (choice: StartScreenChoice): void => {
    if (settled) return
    settled = true
    resolveChoice?.(choice)
  }

  const list = document.createElement('div')
  list.className = 'seedvale-pause__saves'
  panel.appendChild(list)

  for (const slot of slots) {
    const row = document.createElement('div')
    row.className = slot.id === activeId ? 'seedvale-pause__save is-active' : 'seedvale-pause__save'

    const load = document.createElement('button')
    load.type = 'button'
    load.className = 'seedvale-pause__save-main'
    const name = document.createElement('span')
    name.className = 'seedvale-pause__save-title'
    name.textContent = slot.name
    const meta = document.createElement('span')
    meta.className = 'seedvale-pause__save-meta'
    meta.textContent = `${formatSaveDay(slot.elapsedDays)} · ${formatSavedAt(slot.savedAt)} · seed ${slot.seed}`
    load.append(name, meta)
    load.addEventListener('click', () => settle({ type: 'load', id: slot.id }))

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'seedvale-pause__save-delete'
    remove.textContent = 'Usuń'
    remove.addEventListener('click', () => {
      if (!window.confirm(`Usunąć zapis „${slot.name}”?`)) return
      settle({ type: 'delete', id: slot.id })
    })

    row.append(load, remove)
    list.appendChild(row)
  }

  const continueButton = document.createElement('button')
  continueButton.type = 'button'
  continueButton.className = 'seedvale-pause__button'
  continueButton.textContent = 'Kontynuuj'
  continueButton.disabled = slots.length === 0
  continueButton.addEventListener('click', () => settle({ type: 'continue' }))
  panel.appendChild(continueButton)

  const newGameToggle = document.createElement('button')
  newGameToggle.type = 'button'
  newGameToggle.className = 'seedvale-pause__button seedvale-pause__button--ghost'
  newGameToggle.textContent = 'Nowa gra'
  panel.appendChild(newGameToggle)

  const newGameForm = document.createElement('div')
  newGameForm.hidden = true
  const label = document.createElement('label')
  label.className = 'seedvale-pause__label'
  label.htmlFor = 'seedvale-new-save-name'
  label.textContent = 'Nazwa zapisu'
  const input = document.createElement('input')
  input.id = 'seedvale-new-save-name'
  input.className = 'seedvale-pause__input'
  input.type = 'text'
  input.autocomplete = 'off'
  input.maxLength = SAVE_NAME_MAX_LENGTH
  input.value = nextDefaultSaveName(slots.map((slot) => slot.name))
  const error = document.createElement('p')
  error.className = 'seedvale-pause__error'
  const startButton = document.createElement('button')
  startButton.type = 'button'
  startButton.className = 'seedvale-pause__button'
  startButton.textContent = 'Rozpocznij'
  newGameForm.append(label, input, error, startButton)
  panel.appendChild(newGameForm)

  const atLimit = slots.length >= MAX_SAVES
  if (atLimit) {
    newGameToggle.disabled = true
    newGameToggle.textContent = 'Nowa gra (limit 8)'
  }

  newGameToggle.addEventListener('click', () => {
    newGameForm.hidden = false
    newGameToggle.hidden = true
    input.focus()
    input.select()
  })

  const submitNew = (): void => {
    const check = validateSaveName(input.value, slots.map((slot) => slot.name))
    if (!check.ok) {
      error.textContent = saveErrorMessage(check.error)
      return
    }
    if (atLimit) {
      error.textContent = saveErrorMessage('limit')
      return
    }
    settle({ type: 'new', name: check.name })
  }
  startButton.addEventListener('click', submitNew)
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submitNew()
  })

  const footer = document.createElement('div')
  footer.className = 'seedvale-pause__footer'
  footer.textContent = `v${__APP_VERSION__} | ${__GIT_COMMIT__} | ${__BUILD_DATE__}`
  panel.appendChild(footer)

  return {
    choose,
    dispose() {
      root.remove()
    },
  }
}
