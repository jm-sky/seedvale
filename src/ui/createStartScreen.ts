export type StartScreenChoice = 'continue' | 'new'

export type StartScreen = {
  /** Resolves once the player picks Continue or New Game. */
  choose: () => Promise<StartScreenChoice>
  dispose: () => void
}

/** Shown only when a save exists — reuses the pause menu's overlay styling
 *  (`.seedvale-pause*`) rather than introducing new CSS. */
export function createStartScreen(parent: HTMLElement, savedAt: number): StartScreen {
  const root = document.createElement('div')
  root.className = 'seedvale-pause'
  const savedLabel = new Date(savedAt).toLocaleString()
  root.innerHTML = `
    <div class="seedvale-pause__panel">
      <h1>Seedvale</h1>
      <div class="seedvale-pause__row"><span>Zapisano</span><span>${savedLabel}</span></div>
      <button type="button" data-continue class="seedvale-pause__button">Kontynuuj</button>
      <button type="button" data-new-game class="seedvale-pause__button seedvale-pause__button--ghost">Nowa gra</button>
      <div class="seedvale-pause__footer">v${__APP_VERSION__} | ${__GIT_COMMIT__} | ${__BUILD_DATE__}</div>
    </div>
  `
  parent.appendChild(root)

  const continueButton = root.querySelector<HTMLButtonElement>('[data-continue]')!
  const newGameButton = root.querySelector<HTMLButtonElement>('[data-new-game]')!

  const choose = (): Promise<StartScreenChoice> =>
    new Promise((resolve) => {
      continueButton.addEventListener('click', () => resolve('continue'), { once: true })
      newGameButton.addEventListener('click', () => resolve('new'), { once: true })
    })

  return {
    choose,
    dispose() {
      root.remove()
    },
  }
}
