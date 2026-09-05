import type { SaveManagementEntry } from '../persistence/saveSlots'
import type { SeedChoice, SeedRecord } from '../world/seedLibrary'
import type { App } from 'vue'

export type StartScreenChoice =
  | { type: 'continue' }
  | { type: 'load', id: string }
  | { type: 'new', name: string, seedChoice: SeedChoice }
  | { type: 'delete', id: string }

export type StartScreen = {
  /** Resolves once the player picks Continue, a slot, New Game, or Delete. */
  choose: () => Promise<StartScreenChoice>
  dispose: () => void
}

/** Boot save picker. Vue is mounted here as a short-lived app — the in-game
 *  overlay (`mountVueUi` / `App.vue`) is not up yet. `entries` includes
 *  unhealthy rows (plan persistence-004 §5) so a corrupted save is visible/
 *  deletable at boot instead of silently missing from the list. `seeds` is
 *  the Seed Library listing (plan world-015 §4), loaded by `main.ts` before
 *  this screen mounts — rendering it here never itself reads IndexedDB. */
export function createStartScreen(
  parent: HTMLElement,
  entries: readonly SaveManagementEntry[],
  activeId: string | null,
  seeds: readonly SeedRecord[],
): StartScreen {
  const root = document.createElement('div')
  parent.appendChild(root)

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

  let app: App | null = null
  let disposed = false

  void Promise.all([
    import('vue'),
    import('../ui-vue/screens/StartScreen.vue'),
    import('../ui-vue/tailwind.css'),
  ]).then(([{ createApp }, { default: StartScreen }]) => {
    if (disposed) return
    app = createApp(StartScreen, {
      entries,
      activeId,
      seeds,
      onChoose: settle,
    })
    app.mount(root)
  })

  return {
    choose,
    dispose() {
      disposed = true
      app?.unmount()
      root.remove()
    },
  }
}
