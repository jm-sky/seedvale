import { markRaw, type Raw, reactive } from 'vue'
import type { NpcAgent } from '../ai/NpcAgent'
import type { WorldConfig } from '../config/worldConfig'
import type { ItemKind } from '../items/items'
import type { QuestDialogOverride, QuestListEntry, QuestManager } from '../quests/QuestManager'
import type { Settlement } from '../settlement/createSettlement'
import type { FoodSourceType } from '../settlement/settlementGenerator'
import type { RestOutcome, RestVariant } from '../ui/createQuickActions'
import type { DayNightState } from '../world/dayNight'

export type VillagerEntry = { npc: Raw<NpcAgent>; settlementName: string; foodSourceType: FoodSourceType }
type VillagerRefreshEntry = { npc: NpcAgent; settlementName: string; foodSourceType: FoodSourceType }
export const VILLAGERS_PAGE_SIZE = 10

type NpcDialogueMenuState = { open: boolean; npc: NpcAgent | null; settlement: Settlement | null; timeOfDay: number; helpResult: QuestDialogOverride | null }
type InventoryState = {
  open: boolean
  counts: Partial<Record<ItemKind, number>>
  totalWeight: number
  maxWeight: number
  heldTool: ItemKind | null
  onDrop: ((kind: ItemKind) => void) | null
  onEquip: ((kind: ItemKind) => void) | null
  onUnequip: (() => void) | null
}
type PauseMenuState = {
  open: boolean; seed: number; playerName: string
  onPause: (() => void) | null; onResume: (() => void) | null; onToggleGui: (() => void) | null
  onNameChange: ((name: string) => void) | null; onNameCommit: ((name: string) => void) | null
  onSave: (() => void) | null; onRefresh: (() => void) | null
  onBuildSimpleFire: (() => boolean) | null; onBuildFirePit: (() => boolean) | null; onLightTorch: (() => boolean) | null
  onNewGame: (() => void) | null; onQuestLog: (() => void) | null; onVillagers: (() => void) | null; onInventory: (() => void) | null
  saveStatus: string; simpleFireStatus: string; firePitStatus: string; torchStatus: string
}
type QuestLogState = { open: boolean; entries: readonly QuestListEntry[]; exp: number; relation: (name: string) => number }
type FlavorDialogState = { open: boolean; prompt: string | null; name: string; line: string }
type QuickActionsState = {
  open: boolean
  hasShovel: boolean
  onBuildSimpleFire: (() => boolean) | null
  onBuildFirePit: (() => boolean) | null
  onLightTorch: (() => boolean) | null
  onWait: ((hours: number) => void) | null
  onRest: ((variant: RestVariant) => RestOutcome) | null
  onDig: (() => void) | null
  onLevel: (() => void) | null
  onOpen: (() => void) | null
  onClose: (() => void) | null
}
type TimeSkipState = { visible: boolean; label: string; fadeVisible: boolean }
type BusyState = { visible: boolean; label: string }
/** `config`/`dayNight` are the *same* mutable objects `createApp.ts` already
 *  holds (see plan 005 — "Nie duplikować stanu"), assigned once via
 *  `configureWorldConfigScreen`, not copied per-open. Vue's `reactive()`
 *  deep-wraps them lazily on first read, so `v-model` writes go straight
 *  through the proxy onto the same target every other system reads from. */
type WorldConfigScreenState = {
  open: boolean
  config: WorldConfig | null
  dayNight: DayNightState | null
  /** Rebuilds the world — costly (regenerates every chunk). Fired by the
   *  seed field's explicit "Zastosuj" button (not per-keystroke) and
   *  immediately on the flat-shading toggle — same handler + timing as
   *  debug GUI's `onTerrainChange`. */
  onTerrainChange: (() => void) | null
  /** Cheap, fired live on every day/night field change — mirrors debug
   *  GUI's `onDayNightChange`. */
  onDayNightChange: (() => void) | null
}
type NotesState = { open: boolean }

type PauseHandlers = Partial<Omit<PauseMenuState, 'open' | 'seed' | 'playerName' | 'saveStatus' | 'simpleFireStatus' | 'firePitStatus' | 'torchStatus'>>

export const ui = reactive({
  npcDialogueMenu: { open: false, npc: null, settlement: null, timeOfDay: 0, helpResult: null } as NpcDialogueMenuState,
  villagers: { open: false, entries: [] as VillagerEntry[], page: 0 },
  inventory: { open: false, counts: {}, totalWeight: 0, maxWeight: 0, heldTool: null, onDrop: null, onEquip: null, onUnequip: null } as InventoryState,
  pauseMenu: {
    open: false, seed: 0, playerName: '', onPause: null, onResume: null, onToggleGui: null,
    onNameChange: null, onNameCommit: null, onSave: null, onRefresh: null,
    onBuildSimpleFire: null, onBuildFirePit: null, onLightTorch: null,
    onNewGame: null, onQuestLog: null, onVillagers: null, onInventory: null,
    saveStatus: '', simpleFireStatus: '', firePitStatus: '', torchStatus: '',
  } as PauseMenuState,
  questLog: { open: false, entries: [], exp: 0, relation: () => 0 } as QuestLogState,
  flavorDialog: { open: false, prompt: null, name: '', line: '' } as FlavorDialogState,
  quickActions: {
    open: false, hasShovel: false,
    onBuildSimpleFire: null, onBuildFirePit: null, onLightTorch: null,
    onWait: null, onRest: null, onDig: null, onLevel: null, onOpen: null, onClose: null,
  } as QuickActionsState,
  timeSkip: { visible: false, label: '', fadeVisible: false } as TimeSkipState,
  busy: { visible: false, label: '' } as BusyState,
  worldConfigScreen: { open: false, config: null, dayNight: null, onTerrainChange: null, onDayNightChange: null } as WorldConfigScreenState,
  notes: { open: false } as NotesState,
  openStack: [] as string[],
})

const overlayCloseHandlers = new Map<string, () => void>()
export function registerOverlay(id: string, close: () => void): void { overlayCloseHandlers.set(id, close) }
export function unregisterOverlay(id: string): void { overlayCloseHandlers.delete(id); syncOverlayStack(id, false) }
export function syncOverlayStack(id: string, open: boolean): void { const idx = ui.openStack.indexOf(id); if (open) { if (idx === -1) ui.openStack.push(id) } else if (idx !== -1) ui.openStack.splice(idx, 1) }
export function closeTopOverlay(): void { const top = ui.openStack.at(-1); if (top) overlayCloseHandlers.get(top)?.() }

export function togglePause(): void { if (ui.pauseMenu.open) closePauseMenu(); else openPauseMenu() }
export function openPauseMenu(): void { if (ui.pauseMenu.open) return; ui.pauseMenu.open = true; ui.pauseMenu.onPause?.() }
export function closePauseMenu(): void { if (!ui.pauseMenu.open) return; ui.pauseMenu.open = false; ui.pauseMenu.onResume?.() }
export function isPauseMenuOpen(): boolean { return ui.pauseMenu.open }
export function configurePauseMenu(seed: number, playerName: string, handlers: PauseHandlers): void { ui.pauseMenu.seed = seed; ui.pauseMenu.playerName = playerName; Object.assign(ui.pauseMenu, handlers) }
export function setPauseSeed(seed: number): void { ui.pauseMenu.seed = seed }
export function setPausePlayerName(name: string): void { ui.pauseMenu.playerName = name }
export function setPauseSaveStatus(status: string): void { ui.pauseMenu.saveStatus = status }
export function setPauseSimpleFireStatus(status: string): void { ui.pauseMenu.simpleFireStatus = status }
export function setPauseFirePitStatus(status: string): void { ui.pauseMenu.firePitStatus = status }
export function setPauseTorchStatus(status: string): void { ui.pauseMenu.torchStatus = status }

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

export function openNpcDialogueMenu(npc: NpcAgent, settlement: Settlement, questManager: QuestManager, timeOfDay: number): void { const state = ui.npcDialogueMenu; const override = questManager.onInteract(npc.name); state.npc = markRaw(npc); state.settlement = settlement; state.timeOfDay = timeOfDay; state.helpResult = override ?? { line: npc.getDialogueLine() }; state.open = true }
function resetNpcDialogueMenu(): void { const state = ui.npcDialogueMenu; state.open = false; state.npc = null; state.settlement = null; state.helpResult = null }
export function closeNpcDialogueMenu(): void { const state = ui.npcDialogueMenu; if (!state.open) return; state.helpResult?.offer?.onDecline(); resetNpcDialogueMenu() }
export function acceptNpcDialogueOffer(): void { const state = ui.npcDialogueMenu; if (!state.open || !state.helpResult?.offer) return; state.helpResult.offer.onAccept(); resetNpcDialogueMenu() }
export function isNpcDialogueMenuOpen(): boolean { return ui.npcDialogueMenu.open }

export function openInventory(
  counts: Partial<Record<ItemKind, number>>,
  totalWeight: number,
  maxWeight: number,
  heldTool: ItemKind | null,
  onDrop: (kind: ItemKind) => void,
  onEquip: (kind: ItemKind) => void,
  onUnequip: () => void,
): void {
  ui.inventory.counts = { ...counts }
  ui.inventory.totalWeight = totalWeight
  ui.inventory.maxWeight = maxWeight
  ui.inventory.heldTool = heldTool
  ui.inventory.onDrop = onDrop
  ui.inventory.onEquip = onEquip
  ui.inventory.onUnequip = onUnequip
  ui.inventory.open = true
}
export function refreshInventory(
  counts: Partial<Record<ItemKind, number>>,
  totalWeight: number,
  maxWeight: number,
  heldTool: ItemKind | null,
): void {
  ui.inventory.counts = { ...counts }
  ui.inventory.totalWeight = totalWeight
  ui.inventory.maxWeight = maxWeight
  ui.inventory.heldTool = heldTool
}
export function closeInventory(): void {
  ui.inventory.open = false
  ui.inventory.onDrop = null
  ui.inventory.onEquip = null
  ui.inventory.onUnequip = null
}
export function isInventoryOpen(): boolean { return ui.inventory.open }

export function configureQuickActions(handlers: Partial<Omit<QuickActionsState, 'open'>>): void { Object.assign(ui.quickActions, handlers) }
export function setQuickActionsHasShovel(hasShovel: boolean): void { ui.quickActions.hasShovel = hasShovel }
export function openQuickActions(): void {
  if (ui.quickActions.open) return
  ui.quickActions.open = true
  ui.quickActions.onOpen?.()
}
export function closeQuickActions(): void {
  if (!ui.quickActions.open) return
  ui.quickActions.open = false
  ui.quickActions.onClose?.()
}
export function toggleQuickActions(): void { if (ui.quickActions.open) closeQuickActions(); else openQuickActions() }
export function isQuickActionsOpen(): boolean { return ui.quickActions.open }

/** `fade` mirrors the vanilla overlay's black full-screen fade (used for
 *  "rest" — sleeping through the skip) vs. just the floating label alone
 *  (used for "wait" — the player watches the sky/clock race ahead). */
export function showTimeSkip(label: string, fade: boolean): void {
  ui.timeSkip.visible = true
  ui.timeSkip.label = label
  if (fade) ui.timeSkip.fadeVisible = true
}
/** If a fade is currently showing, only *starts* the fade-out — the panel
 *  stays mounted until `TimeSkipOverlay.vue`'s `transitionend` handler calls
 *  `finishTimeSkipHide()`, so the opacity transition is visible instead of
 *  the black screen vanishing instantly. Without an active fade there's
 *  nothing to animate, so hide immediately. */
export function hideTimeSkip(): void {
  if (!ui.timeSkip.visible) return
  if (!ui.timeSkip.fadeVisible) { ui.timeSkip.visible = false; return }
  ui.timeSkip.fadeVisible = false
}
export function finishTimeSkipHide(): void { if (!ui.timeSkip.fadeVisible) ui.timeSkip.visible = false }

export function showBusy(label: string): void {
  ui.busy.visible = true
  ui.busy.label = label
}
export function hideBusy(): void {
  ui.busy.visible = false
  ui.busy.label = ''
}

export function configureWorldConfigScreen(config: WorldConfig, dayNight: DayNightState, handlers: { onTerrainChange: () => void; onDayNightChange: () => void }): void {
  ui.worldConfigScreen.config = config
  ui.worldConfigScreen.dayNight = dayNight
  ui.worldConfigScreen.onTerrainChange = handlers.onTerrainChange
  ui.worldConfigScreen.onDayNightChange = handlers.onDayNightChange
}
export function openWorldConfigScreen(): void { ui.worldConfigScreen.open = true }
export function closeWorldConfigScreen(): void { ui.worldConfigScreen.open = false }
export function isWorldConfigScreenOpen(): boolean { return ui.worldConfigScreen.open }

export function openNotes(): void { ui.notes.open = true }
export function closeNotes(): void { ui.notes.open = false }
export function isNotesOpen(): boolean { return ui.notes.open }
