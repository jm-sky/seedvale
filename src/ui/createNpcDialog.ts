export type NpcDialogHandlers = {
  onClose?: () => void
}

export type NpcDialog = {
  /** Pass null to hide. Ignored while a dialog is open. */
  setPrompt: (name: string | null) => void
  open: (name: string, line: string) => void
  close: () => void
  isOpen: () => boolean
  dispose: () => void
}

export function createNpcDialog(
  parent: HTMLElement,
  handlers: NpcDialogHandlers = {},
): NpcDialog {
  let openState = false

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
      <div class="seedvale-npc-dialog__hint">Esc / E — zamknij</div>
    </div>
  `
  parent.appendChild(root)

  const nameEl = root.querySelector<HTMLElement>('[data-name]')!
  const lineEl = root.querySelector<HTMLElement>('[data-line]')!

  const close = () => {
    if (!openState) return
    openState = false
    root.hidden = true
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
    setPrompt(name) {
      if (openState) return
      if (name === null) {
        prompt.hidden = true
        return
      }
      prompt.hidden = false
      prompt.textContent = `[E] Rozmawiaj z ${name}`
    },
    open(name, line) {
      openState = true
      prompt.hidden = true
      nameEl.textContent = name
      lineEl.textContent = line
      root.hidden = false
    },
    close,
    isOpen: () => openState,
    dispose() {
      root.removeEventListener('click', onRootClick)
      window.removeEventListener('keydown', onKeyDown)
      prompt.remove()
      root.remove()
    },
  }
}
