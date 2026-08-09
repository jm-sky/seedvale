import type { NpcAgent } from '../ai/NpcAgent'
import type { QuestManager } from '../quests/QuestManager'
import type { Settlement } from '../settlement/createSettlement'
import type { ItemKind } from '../items/items'
import type { App } from 'vue'

export type VueUi = {
  openNpcDialogueMenu: (
    npc: NpcAgent,
    settlement: Settlement,
    questManager: QuestManager,
    timeOfDay: number,
  ) => void
  isNpcDialogueMenuOpen: () => boolean
  openInventory: (
    counts: Partial<Record<ItemKind, number>>,
    totalWeight: number,
    maxWeight: number,
    onDrop: (kind: ItemKind) => void,
  ) => void
  refreshInventory: (
    counts: Partial<Record<ItemKind, number>>,
    totalWeight: number,
    maxWeight: number,
  ) => void
  isInventoryOpen: () => boolean
  closeInventory: () => void
  dispose: () => void
}

type StoreImpl = {
  openNpc: VueUi['openNpcDialogueMenu']
  isNpcOpen: VueUi['isNpcDialogueMenuOpen']
  openInventory: VueUi['openInventory']
  refreshInventory: VueUi['refreshInventory']
  isInventoryOpen: VueUi['isInventoryOpen']
  closeInventory: VueUi['closeInventory']
}

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
    impl = {
      openNpc: store.openNpcDialogueMenu,
      isNpcOpen: store.isNpcDialogueMenuOpen,
      openInventory: store.openInventory,
      refreshInventory: store.refreshInventory,
      isInventoryOpen: store.isInventoryOpen,
      closeInventory: store.closeInventory,
    }
  })

  return {
    openNpcDialogueMenu(npc, settlement, questManager, timeOfDay) {
      impl?.openNpc(npc, settlement, questManager, timeOfDay)
    },
    isNpcDialogueMenuOpen() {
      return impl?.isNpcOpen() ?? false
    },
    openInventory(counts, totalWeight, maxWeight, onDrop) {
      impl?.openInventory(counts, totalWeight, maxWeight, onDrop)
    },
    refreshInventory(counts, totalWeight, maxWeight) {
      impl?.refreshInventory(counts, totalWeight, maxWeight)
    },
    isInventoryOpen() {
      return impl?.isInventoryOpen() ?? false
    },
    closeInventory() {
      impl?.closeInventory()
    },
    dispose() {
      disposed = true
      app?.unmount()
      root.remove()
    },
  }
}
