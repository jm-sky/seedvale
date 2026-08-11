import type { App } from 'vue'

type StoreModule = typeof import('./store')

const FORWARDED_FNS = [
  'openNpcDialogueMenu', 'closeNpcDialogueMenu', 'acceptNpcDialogueOffer', 'isNpcDialogueMenuOpen',
  'openVillagers', 'closeVillagers', 'toggleVillagers', 'refreshVillagers', 'isVillagersOpen',
  'openInventory', 'refreshInventory', 'isInventoryOpen', 'closeInventory',
  'configurePauseMenu', 'setPauseSeed', 'openPauseMenu', 'closePauseMenu', 'togglePause', 'isPauseMenuOpen',
  'openQuestLog', 'refreshQuestLog', 'closeQuestLog', 'isQuestLogOpen',
  'openFlavorDialog', 'setFlavorPrompt', 'closeFlavorDialog', 'isFlavorDialogOpen',
  'configureQuickActions', 'setQuickActionsHasShovel', 'toggleQuickActions', 'closeQuickActions', 'isQuickActionsOpen',
  'showTimeSkip', 'hideTimeSkip',
  'showBusy', 'hideBusy',
  'configureWorldConfigScreen', 'openWorldConfigScreen', 'closeWorldConfigScreen', 'isWorldConfigScreenOpen',
  'openNotes', 'closeNotes', 'isNotesOpen',
] as const

export type VueUi = Pick<StoreModule, typeof FORWARDED_FNS[number]> & { dispose: () => void }

let mountedVueUi: VueUi | null = null
export function getMountedVueUi(): VueUi | null { return mountedVueUi }

export function mountVueUi(container: HTMLElement): VueUi {
  const root = document.createElement('div')
  root.id = 'vue-ui'
  container.appendChild(root)
  let app: App | null = null
  let disposed = false
  let impl: StoreModule | null = null
  const queue: Array<() => void> = []

  void Promise.all([import('vue'), import('./App.vue'), import('./store'), import('./tailwind.css')]).then(([{ createApp }, { default: RootUi }, store]) => {
    if (disposed) return
    impl = store
    app = createApp(RootUi)
    app.mount(root)
    for (const fn of queue) fn()
    queue.length = 0
  })

  const forwarded = Object.fromEntries(FORWARDED_FNS.map((name) => [name, (...args: unknown[]) => {
    if (impl) return (impl[name] as (...a: unknown[]) => unknown)(...args)
    queue.push(() => (impl![name] as (...a: unknown[]) => unknown)(...args))
    return undefined
  }])) as Pick<StoreModule, typeof FORWARDED_FNS[number]>

  const api: VueUi = { ...forwarded, dispose() { disposed = true; app?.unmount(); if (mountedVueUi === api) mountedVueUi = null; root.remove() } }
  mountedVueUi = api
  return api
}
