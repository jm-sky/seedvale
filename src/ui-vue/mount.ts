import * as store from './store'
import type { App } from 'vue'

type StoreModule = typeof import('./store')

const FORWARDED_FNS = [
  'openNpcDialogueMenu', 'closeNpcDialogueMenu', 'acceptNpcDialogueOffer', 'isNpcDialogueMenuOpen', 'configureNpcDialogueMenu',
  'openVillagers', 'closeVillagers', 'toggleVillagers', 'refreshVillagers', 'isVillagersOpen',
  'openInventory', 'refreshInventory', 'isInventoryOpen', 'closeInventory',
  'configureMerchant', 'openMerchant', 'openMerchantFromDialogue', 'refreshMerchant', 'closeMerchant', 'isMerchantOpen',
  'configureContainerScreen', 'openContainerScreen', 'refreshContainerScreen', 'closeContainerScreen', 'isContainerScreenOpen',
  'configurePauseMenu', 'setPauseSeed', 'setPauseActiveSaveName', 'openPauseMenu', 'closePauseMenu', 'togglePause', 'isPauseMenuOpen',
  'openQuestLog', 'refreshQuestLog', 'closeQuestLog', 'isQuestLogOpen',
  'openFlavorDialog', 'setFlavorPrompt', 'closeFlavorDialog', 'isFlavorDialogOpen',
  'configureQuickActions', 'setQuickActionsHasDiggingTool', 'setQuickActionsHasTent', 'setQuickActionsHasCarriedContainer', 'setQuickActionsNearTown', 'setQuickActionsLodgingConfirm', 'setQuickActionsTraps', 'setQuickActionsFireAvailability', 'setQuickActionsHasTreeSeed', 'setQuickActionsCropSeeds', 'toggleQuickActions', 'closeQuickActions', 'isQuickActionsOpen',
  'configureAbortRest', 'abortRest',
  'configureAbortBusy', 'abortBusy',
  'configureAbortTerrainPreparation', 'abortTerrainPreparation',
  'configureTerrainPreparationControls',
  'showTimeSkip', 'hideTimeSkip', 'updateTimeSkipRestUi',
  'showBusy', 'hideBusy',
  'showTerrainPreparationPreview', 'hideTerrainPreparationPreview',
  'configureWorldConfigScreen', 'openWorldConfigScreen', 'closeWorldConfigScreen', 'isWorldConfigScreenOpen',
  'openNotes', 'closeNotes', 'isNotesOpen',
  'openWorldMap', 'closeWorldMap', 'isWorldMapOpen', 'toggleWorldMap',
  'setHudFps', 'setHudTime', 'setHudExp', 'setHudInventoryWeight', 'setHudHeldTool', 'setHudPlayerNeeds', 'setHudAiming',
  'setHudPrimaryWeapons', 'configurePrimaryWeaponShortcuts',
  'setCharacterStats', 'openCharacterScreen', 'closeCharacterScreen', 'isCharacterScreenOpen', 'toggleCharacterScreen',
  'configureSkillsScreen', 'setSkillsState', 'openSkillsScreen', 'closeSkillsScreen', 'isSkillsScreenOpen', 'toggleSkillsScreen',
  'toggleMinimap', 'setMinimapCollapsed', 'isMinimapCollapsed',
  'showToast', 'clearToasts',
  'configureTouchChrome', 'setTouchInputEnabled', 'setCycleTargetAvailable', 'clearTouchChrome',
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

  // `store` is imported statically above (~20 other modules already import
  // it eagerly, so a dynamic import here bought zero code-splitting — was
  // just a dead-intention warning, review 005 AS3). `vue`/`App.vue`/the
  // Tailwind stylesheet stay dynamic — those are the actually-deferrable part.
  void Promise.all([import('vue'), import('./App.vue'), import('./tailwind.css')]).then(([{ createApp }, { default: RootUi }]) => {
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
