import { markRaw, type Raw, reactive } from 'vue'
import type { NpcAgent } from '../ai/NpcAgent'
import type { ItemKind } from '../items/items'
import type { QuestDialogOverride, QuestManager, QuestListEntry } from '../quests/QuestManager'
import type { Settlement } from '../settlement/createSettlement'
import type { FoodSourceType } from '../settlement/settlementGenerator'

export type VillagerEntry = { npc: Raw<NpcAgent>; settlementName: string; foodSourceType: FoodSourceType }
type VillagerRefreshEntry = { npc: NpcAgent; settlementName: string; foodSourceType: FoodSourceType }
export const VILLAGERS_PAGE_SIZE = 10

type NpcDialogueMenuState = { open: boolean; npc: NpcAgent | null; settlement: Settlement | null; timeOfDay: number; helpResult: QuestDialogOverride | null }
type InventoryState = { open: boolean; counts: Partial<Record<ItemKind, number>>; totalWeight: number; maxWeight: number; onDrop: ((kind: ItemKind) => void) | null }
type PauseMenuState = {
  open: boolean; seed: number; playerName: string
  onPause: (() => void) | null; onResume: (() => void) | null; onToggleGui: (() => void) | null
  onNameChange: ((name: string) => void) | null; onNameCommit: ((name: string) => void) | null
  onSave: (() => void) | null; onRefresh: (() => void) | null; onBuildCampfire: (() => boolean) | null
  onNewGame: (() => void) | null; onQuestLog: (() => void) | null; onVillagers: (() => void) | null; onInventory: (() => void) | null
  saveStatus: string; buildCampfireStatus: string
}
type QuestLogState = { open: boolean; entries: readonly QuestListEntry[]; exp: number; relation: (name: string) => number }
type FlavorDialogState = { open: boolean; prompt: string | null; name: string; line: string }

export const ui = reactive({
  npcDialogueMenu: { open: false, npc: null, settlement: null, timeOfDay: 0, helpResult: null } as NpcDialogueMenuState,
  villagers: { open: false, entries: [] as VillagerEntry[], page: 0 },
  inventory: { open: false, counts: {}, totalWeight: 0, maxWeight: 0, onDrop: null } as InventoryState,
  pauseMenu: {
    open: false, seed: 0, playerName: '', onPause: null, onResume: null, onToggleGui: null,
    onNameChange: null, onNameCommit: null, onSave: null, onRefresh: null, onBuildCampfire: null,
    onNewGame: null, onQuestLog: null, onVillagers: null, onInventory: null, saveStatus: '', buildCampfireStatus: '',
  } as PauseMenuState,
  questLog: { open: false, entries: [], exp: 0, relation: () => 0 } as QuestLogState,
  flavorDialog: { open: false, prompt: null, name: '', line: '' } as FlavorDialogState,
  openStack: [] as string[],
})

const overlayCloseHandlers = new Map<string, () => void>()
export function registerOverlay(id: string, close: () => void): void { overlayCloseHandlers.set(id, close) }
export function unregisterOverlay(id: string): void { overlayCloseHandlers.delete(id); syncOverlayStack(id, false) }
export function syncOverlayStack(id: string, open: boolean): void {
  const idx = ui.openStack.indexOf(id)
  if (open) { if (idx === -1) ui.openStack.push(id) } else if (idx !== -1) ui.openStack.splice(idx, 1)
}
export function closeTopOverlay(): void { const top = ui.openStack.at(-1); if (top) overlayCloseHandlers.get(top)?.() }

export function togglePause(): void { if (ui.pauseMenu.open) closePauseMenu(); else openPauseMenu() }
export function openPauseMenu(): void { if (ui.pauseMenu.open) return; ui.pauseMenu.open = true; ui.pauseMenu.onPause?.() }
export function closePauseMenu(): void { if (!ui.pauseMenu.open) return; ui.pauseMenu.open = false; ui.pauseMenu.onResume?.() }
export function isPauseMenuOpen(): boolean { return ui.pauseMenu.open }
export function configurePauseMenu(seed: number, playerName: string, handlers: Omit<PauseMenuState, 'open' | 'seed' | 'playerName' | 'saveStatus' | 'buildCampfireStatus'>): void { ui.pauseMenu.seed = seed; ui.pauseMenu.playerName = playerName; Object.assign(ui.pauseMenu, handlers) }
export function setPauseSeed(seed: number): void { ui.pauseMenu.seed = seed }
export function setPausePlayerName(name: string): void { ui.pauseMenu.playerName = name }
export function setPauseSaveStatus(status: string): void { ui.pauseMenu.saveStatus = status }
export function setPauseBuildCampfireStatus(status: string): void { ui.pauseMenu.buildCampfireStatus = status }

export function openQuestLog(entries: readonly QuestListEntry[], exp: number, relation: (name: string) => number): void { ui.questLog.entries = entries; ui.questLog.exp = exp; ui.questLog.relation = relation; ui.questLog.open = true }
export function refreshQuestLog(entries: readonly QuestListEntry[], exp: number, relation: (name: string) => number): void { ui.questLog.entries = entries; ui.questLog.exp = exp; ui.questLog.relation = relation }
export function closeQuestLog(): void { ui.questLog.open = false }
export function isQuestLogOpen(): boolean { return ui.questLog.open }

export function openFlavorDialog(name: string, line: string): void { ui.flavorDialog.prompt = null; ui.flavorDialog.name = name; ui.flavorDialog.line = line; ui.flavorDialog.open = true }
export function setFlavorPrompt(text: string | null): void { if (!ui.flavorDialog.open) ui.flavorDialog.prompt = text }
export function closeFlavorDialog(): void { ui.flavorDialog.open = false }
export function isFlavorDialogOpen(): boolean { return ui.flavorDialog.open }

export function openVillagers(): void { ui.villagers.open = true; ui.villagers.page = 0 }
export function closeVillagers(): void { ui.villagers.open = false }
export function toggleVillagers(): void { if (ui.villagers.open) closeVillagers(); else openVillagers() }
export function refreshVillagers(entries: readonly VillagerRefreshEntry[]): void { ui.villagers.entries = entries.map((e) => ({ ...e, npc: markRaw(e.npc) })) }
export function isVillagersOpen(): boolean { return ui.villagers.open }
export function setVillagersPage(page: number): void { ui.villagers.page = page }

export function openNpcDialogueMenu(npc: NpcAgent, settlement: Settlement, questManager: QuestManager, timeOfDay: number): void {
  const state = ui.npcDialogueMenu; const override = questManager.onInteract(npc.name)
  state.npc = npc; state.settlement = settlement; state.timeOfDay = timeOfDay; state.helpResult = override ?? { line: npc.getDialogueLine() }; state.open = true
}
function resetNpcDialogueMenu(): void { const state = ui.npcDialogueMenu; state.open = false; state.npc = null; state.settlement = null; state.helpResult = null }
export function closeNpcDialogueMenu(): void { const state = ui.npcDialogueMenu; if (!state.open) return; state.helpResult?.offer?.onDecline(); resetNpcDialogueMenu() }
export function acceptNpcDialogueOffer(): void { const state = ui.npcDialogueMenu; if (!state.open || !state.helpResult?.offer) return; state.helpResult.offer.onAccept(); resetNpcDialogueMenu() }
export function isNpcDialogueMenuOpen(): boolean { return ui.npcDialogueMenu.open }

export function openInventory(counts: Partial<Record<ItemKind, number>>, totalWeight: number, maxWeight: number, onDrop: (kind: ItemKind) => void): void { ui.inventory.counts = { ...counts }; ui.inventory.totalWeight = totalWeight; ui.inventory.maxWeight = maxWeight; ui.inventory.onDrop = onDrop; ui.inventory.open = true }
export function refreshInventory(counts: Partial<Record<ItemKind, number>>, totalWeight: number, maxWeight: number): void { ui.inventory.counts = { ...counts }; ui.inventory.totalWeight = totalWeight; ui.inventory.maxWeight = maxWeight }
export function closeInventory(): void { ui.inventory.open = false; ui.inventory.onDrop = null }
export function isInventoryOpen(): boolean { return ui.inventory.open }
