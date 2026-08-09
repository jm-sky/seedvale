import type { NpcAgent } from '../ai/NpcAgent'
import type { QuestManager } from '../quests/QuestManager'
import type { Settlement } from '../settlement/createSettlement'
import type { App } from 'vue'

export type VueUi = {
  openNpcDialogueMenu: (
    npc: NpcAgent,
    settlement: Settlement,
    questManager: QuestManager,
    timeOfDay: number,
  ) => void
  isNpcDialogueMenuOpen: () => boolean
  dispose: () => void
}

type StoreImpl = {
  open: VueUi['openNpcDialogueMenu']
  isOpen: VueUi['isNpcDialogueMenuOpen']
}

/** Mounts the Vue + Tailwind UI overlay (plan 046) into a new `#vue-ui` div
 *  appended to `container`. Vue/`App.vue`/`store.ts`/Tailwind are all
 *  dynamically imported here (not at this module's top level, and not by
 *  `createApp.ts` or any other synchronously-loaded vanilla module — see
 *  `store.ts`'s own doc comment) so the extra runtime doesn't delay first
 *  paint of the game itself — fetched as their own chunk in parallel
 *  instead. The returned `VueUi` exposes plain, type-only-Vue-free methods
 *  so callers (`createApp.ts`) never need their own static `vue` import;
 *  each just forwards to `impl` once the dynamic import resolves (a no-op
 *  before that — in practice unreachable, since a player can't interact
 *  with an NPC in the first fraction of a second after page load). */
export function mountVueUi(container: HTMLElement): VueUi {
  const root = document.createElement('div')
  root.id = 'vue-ui'
  container.appendChild(root)

  let app: App | null = null
  let disposed = false
  let impl: StoreImpl | null = null

  void Promise.all([
    import('vue'),
    import('./App.vue'),
    import('./store'),
    import('./tailwind.css'),
  ]).then(([{ createApp }, { default: RootUi }, store]) => {
    if (disposed) return
    app = createApp(RootUi)
    app.mount(root)
    impl = { open: store.openNpcDialogueMenu, isOpen: store.isNpcDialogueMenuOpen }
  })

  return {
    openNpcDialogueMenu(npc, settlement, questManager, timeOfDay) {
      impl?.open(npc, settlement, questManager, timeOfDay)
    },
    isNpcDialogueMenuOpen() {
      return impl?.isOpen() ?? false
    },
    dispose() {
      disposed = true
      app?.unmount()
      root.remove()
    },
  }
}
