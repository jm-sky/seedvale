import { markRaw, type Raw, reactive } from 'vue'
import type { NpcAgent } from '../ai/NpcAgent'
import type { LightActionResult } from '../app/userActions'
import type { PlayAt } from '../audio/createWorldAudio'
import type { QualityPreset } from '../config/qualityProfiles'
import type { WorldConfig } from '../config/worldConfig'
import type { ItemKind } from '../items/items'
import type { TradeResult } from '../items/trade'
import type { QuestDialogOverride, QuestListEntry, QuestManager } from '../quests/QuestManager'
import type { Settlement } from '../settlement/createSettlement'
import type { FoodSourceType } from '../settlement/settlementGenerator'
import type { QuickActionsTraps, RestOutcome, RestVariant } from '../ui/createQuickActions'
import type { ToastVariant } from '../ui/createToast'
import type { TrapKind } from '../world/animalTraps'
import { pickNpcConfirmationSound, pickNpcFarewellSound, pickNpcGreetingSound } from '../ai/NpcAgent'
import { playUiClick, playUiOpen } from '../audio/uiSounds'
import { isTouchDevice } from '../input/isTouchDevice'
import { type DayNightState, formatClock, phaseName } from '../world/dayNight'

export type VillagerEntry = { npc: Raw<NpcAgent>; settlementName: string; foodSourceType: FoodSourceType }
type VillagerRefreshEntry = { npc: NpcAgent; settlementName: string; foodSourceType: FoodSourceType }
export const VILLAGERS_PAGE_SIZE = 10

type NpcDialogueMenuState = {
  open: boolean
  npc: NpcAgent | null
  settlement: Settlement | null
  timeOfDay: number
  helpResult: QuestDialogOverride | null
  onAskSword: (() => string) | null
  onOpenTrade: (() => void) | null
}
type InventoryState = {
  open: boolean
  counts: Partial<Record<ItemKind, number>>
  totalWeight: number
  maxWeight: number
  heldTool: ItemKind | null
  onDrop: ((kind: ItemKind) => void) | null
  onEquip: ((kind: ItemKind) => void) | null
  onUnequip: (() => void) | null
  /** "Zjedz"/"Wypij" (plan 106) — only offered for `ITEM_CATALOG[kind].consumable` items. */
  onConsume: ((kind: ItemKind) => void) | null
}
type PauseMenuState = {
  open: boolean; seed: number; playerName: string
  onPause: (() => void) | null; onResume: (() => void) | null; onToggleGui: (() => void) | null
  onNameChange: ((name: string) => void) | null; onNameCommit: ((name: string) => void) | null
  onSave: (() => void) | null; onRefresh: (() => void) | null
  onBuildSimpleFire: (() => boolean) | null; onBuildFirePit: (() => boolean) | null
  onLightBranch: (() => LightActionResult) | null; onLightWoodenTorch: (() => LightActionResult) | null
  onNewGame: (() => void) | null; onQuestLog: (() => void) | null; onVillagers: (() => void) | null; onInventory: (() => void) | null; onWorldMap: (() => void) | null
  saveStatus: string
}
type QuestLogState = { open: boolean; entries: readonly QuestListEntry[]; exp: number; relation: (name: string) => number }
type FlavorDialogState = { open: boolean; prompt: string | null; name: string; line: string }
/** Whether each fire action's resource/state guard currently passes (review
 *  007 C4) — kept live by `createApp.ts`'s `syncQuickActionAvailability`, not
 *  recomputed here (Quick Actions / Pause→Akcje are presentation only). */
export type QuickActionsFireAvailability = {
  buildSimpleFire: boolean
  buildFirePit: boolean
  lightBranch: boolean
  lightWoodenTorch: boolean
}
type QuickActionsState = {
  open: boolean
  hasShovel: boolean
  nearTown: boolean
  fireAvailability: QuickActionsFireAvailability
  onBuildSimpleFire: (() => boolean) | null
  onBuildFirePit: (() => boolean) | null
  onLightBranch: (() => LightActionResult) | null
  onLightWoodenTorch: (() => LightActionResult) | null
  onWait: ((hours: number) => void) | null
  onRest: ((variant: RestVariant) => RestOutcome) | null
  onDig: (() => void) | null
  onLevel: (() => void) | null
  onPlaceTent: (() => void) | null
  onPlaceTrap: ((kind: TrapKind) => void) | null
  hasTent: boolean
  traps: QuickActionsTraps
  onOpen: (() => void) | null
  onClose: (() => void) | null
}
type MerchantState = {
  open: boolean
  npc: NpcAgent | null
  counts: Partial<Record<ItemKind, number>>
  onBuyShells: ((kind: ItemKind) => TradeResult) | null
  onBuyBarter: ((kind: ItemKind, offer: Partial<Record<ItemKind, number>>) => TradeResult) | null
  onSellShells: ((kind: ItemKind) => TradeResult) | null
}
type TimeSkipState = { visible: boolean; label: string; fadeVisible: boolean; fadeStrength: number }
type BusyState = { visible: boolean; label: string; blurred: boolean; progress: number | null }
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
  /** Cheap — toggles water reflections / other graphics without a rebuild.
   *  Same handler as debug GUI's `onPostProcessingChange`. */
  onPostProcessingChange: (() => void) | null
  onRenderQualityChange: (() => void) | null
  onTerrainShadowChange: (() => void) | null
  onQualityPresetChange: ((preset: QualityPreset) => void) | null
  onShadowMapSizeChange: (() => void) | null
  onLodScaleChange: (() => void) | null
}
type NotesState = { open: boolean }
type WorldMapState = { open: boolean; playerX: number; playerZ: number }
type StatBar = { current: number, max: number }
/** Character screen (plan 105 §"Character Screen") — presentation-only
 *  mirror of `HealthState` + `PlayerNeeds`, pushed once/frame from
 *  `gameLoop.ts` via `Hud.setCharacterStats` (same convention as
 *  `HudState.playerNeeds`). The screen never mutates these directly; UI is a
 *  read-only layer over "Player state → Needs/Health → Character UI" so a
 *  later server-authoritative move doesn't have to unwind UI-owned state. */
export type CharacterStats = { hp: StatBar, stamina: StatBar, vigor: StatBar, hunger: StatBar, thirst: StatBar }
type CharacterScreenState = CharacterStats & { open: boolean }
/** Skills screen (plan 124, progression added by plan 128) — same
 *  presentation-only convention as `CharacterScreenState`: these mirror
 *  `PlayerController.skills`, pushed once/frame from `gameLoop.ts`.
 *  `onToggleSneak` is the one write path back out, wired once via
 *  `configureSkillsScreen` (same pattern as `PauseHandlers`). Flat numbers,
 *  not nested objects, so the per-frame push stays allocation-free. */
type SkillsScreenState = {
  open: boolean
  sneakValue: number
  sneakActive: boolean
  sneakXp: number
  survivalValue: number
  survivalXp: number
  trapsValue: number
  trapsXp: number
  onToggleSneak: (() => void) | null
}
type HudState = {
  time: string
  phase: string
  fps: string
  /** FPS is debug chrome, not player-facing UI (review 007 C6) — hidden by
   *  default, toggled from Ustawienia. */
  showFps: boolean
  exp: string
  weight: string
  held: string
  hint: string
  /** Ratios (0-1) for the four player-needs bars (plan 106). */
  playerNeeds: { stamina: number, vigor: number, hunger: number, thirst: number }
}
type MinimapState = { collapsed: boolean }
export type ToastItem = { id: number; text: string; variant: ToastVariant; fading: boolean }
type ToastState = { items: ToastItem[] }
type TouchChromeState = {
  visible: boolean
  inputEnabled: boolean
  onPause: (() => void) | null
  onQuickActions: (() => void) | null
  onInteract: (() => void) | null
  onAltInteract: (() => void) | null
}

type PauseHandlers = Partial<Omit<PauseMenuState, 'open' | 'seed' | 'playerName' | 'saveStatus'>>

const HUD_HINT_TOUCH = 'Joystick = ruch · przeciągnij = kamera · E = interakcja'
/** Shortened (review 007 C6) — Notatki (Ustawienia) is now canon for the full
 *  keybinding list, so the always-visible HUD hint only needs to point there. */
const HUD_HINT_DESKTOP = 'Esc = pauza · E = interakcja · I = ekwipunek · pełne sterowanie w Notatkach'
const TOAST_VISIBLE_MS = 2200
const TOAST_FADE_MS = 300

type PlayOnce = (url: string, volume?: number) => void
let uiPlayOnce: PlayOnce | null = null

export function configureUiSounds(playOnce: PlayOnce | null): void {
  uiPlayOnce = playOnce
}

function emitUiOpen(): void {
  if (uiPlayOnce) playUiOpen(uiPlayOnce)
}

let npcVoicePlayAt: PlayAt | null = null
/** Quiet enough to sit under the `emitUiOpen()` panel chirp. */
const NPC_VOICE_VOLUME = 0.35

export function configureNpcVoiceSounds(playAt: PlayAt | null): void {
  npcVoicePlayAt = playAt
}

function playNpcVoice(npc: NpcAgent | null, url: string | undefined): void {
  if (npc && url && npcVoicePlayAt) npcVoicePlayAt(url, npc.mesh.position, NPC_VOICE_VOLUME)
}

export function emitUiClick(): void {
  if (uiPlayOnce) playUiClick(uiPlayOnce)
}

export const ui = reactive({
  npcDialogueMenu: { open: false, npc: null, settlement: null, timeOfDay: 0, helpResult: null, onAskSword: null, onOpenTrade: null } as NpcDialogueMenuState,
  villagers: { open: false, entries: [] as VillagerEntry[], page: 0 },
  inventory: { open: false, counts: {}, totalWeight: 0, maxWeight: 0, heldTool: null, onDrop: null, onEquip: null, onUnequip: null, onConsume: null } as InventoryState,
  pauseMenu: {
    open: false, seed: 0, playerName: '', onPause: null, onResume: null, onToggleGui: null,
    onNameChange: null, onNameCommit: null, onSave: null, onRefresh: null,
    onBuildSimpleFire: null, onBuildFirePit: null, onLightBranch: null, onLightWoodenTorch: null,
    onNewGame: null, onQuestLog: null, onVillagers: null, onInventory: null, onWorldMap: null,
    saveStatus: '',
  } as PauseMenuState,
  questLog: { open: false, entries: [], exp: 0, relation: () => 0 } as QuestLogState,
  flavorDialog: { open: false, prompt: null, name: '', line: '' } as FlavorDialogState,
  quickActions: {
    open: false, hasShovel: false, nearTown: false, hasTent: false,
    traps: { simple: false, good: false },
    fireAvailability: { buildSimpleFire: false, buildFirePit: false, lightBranch: false, lightWoodenTorch: false },
    onBuildSimpleFire: null, onBuildFirePit: null, onLightBranch: null, onLightWoodenTorch: null,
    onWait: null, onRest: null, onDig: null, onLevel: null, onPlaceTrap: null, onOpen: null, onClose: null,
  } as QuickActionsState,
  timeSkip: { visible: false, label: '', fadeVisible: false, fadeStrength: 0 } as TimeSkipState,
  merchant: { open: false, npc: null, counts: {}, onBuyShells: null, onBuyBarter: null, onSellShells: null } as MerchantState,
  busy: { visible: false, label: '', blurred: false, progress: null } as BusyState,
  worldConfigScreen: { open: false, config: null, dayNight: null, onTerrainChange: null, onDayNightChange: null, onPostProcessingChange: null, onRenderQualityChange: null, onTerrainShadowChange: null, onQualityPresetChange: null, onShadowMapSizeChange: null, onLodScaleChange: null } as WorldConfigScreenState,
  notes: { open: false } as NotesState,
  worldMap: { open: false, playerX: 0, playerZ: 0 } as WorldMapState,
  characterScreen: {
    open: false,
    hp: { current: 100, max: 100 },
    stamina: { current: 100, max: 100 },
    vigor: { current: 100, max: 100 },
    hunger: { current: 100, max: 100 },
    thirst: { current: 100, max: 100 },
  } as CharacterScreenState,
  skillsScreen: {
    open: false,
    sneakValue: 0,
    sneakActive: false,
    sneakXp: 0,
    survivalValue: 0,
    survivalXp: 0,
    trapsValue: 0,
    trapsXp: 0,
    onToggleSneak: null,
  } as SkillsScreenState,
  hud: {
    time: '--',
    phase: '',
    fps: '',
    showFps: false,
    exp: '',
    weight: '',
    held: '',
    hint: isTouchDevice() ? HUD_HINT_TOUCH : HUD_HINT_DESKTOP,
    playerNeeds: { stamina: 1, vigor: 1, hunger: 1, thirst: 1 },
  } as HudState,
  minimap: { collapsed: false } as MinimapState,
  toast: { items: [] as ToastItem[] } as ToastState,
  touch: {
    visible: false,
    inputEnabled: true,
    onPause: null,
    onQuickActions: null,
    onInteract: null,
    onAltInteract: null,
  } as TouchChromeState,
  openStack: [] as string[],
})

const overlayCloseHandlers = new Map<string, () => void>()
export function registerOverlay(id: string, close: () => void): void { overlayCloseHandlers.set(id, close) }
export function unregisterOverlay(id: string): void { overlayCloseHandlers.delete(id); syncOverlayStack(id, false) }
export function syncOverlayStack(id: string, open: boolean): void { const idx = ui.openStack.indexOf(id); if (open) { if (idx === -1) ui.openStack.push(id) } else if (idx !== -1) ui.openStack.splice(idx, 1) }
export function closeTopOverlay(): void { const top = ui.openStack.at(-1); if (top) overlayCloseHandlers.get(top)?.() }

export function togglePause(): void { if (ui.pauseMenu.open) closePauseMenu(); else openPauseMenu() }
export function openPauseMenu(): void { if (ui.pauseMenu.open) return; ui.pauseMenu.open = true; emitUiOpen(); ui.pauseMenu.onPause?.() }
export function closePauseMenu(): void { if (!ui.pauseMenu.open) return; ui.pauseMenu.open = false; ui.pauseMenu.onResume?.() }
export function isPauseMenuOpen(): boolean { return ui.pauseMenu.open }
export function configurePauseMenu(seed: number, playerName: string, handlers: PauseHandlers): void { ui.pauseMenu.seed = seed; ui.pauseMenu.playerName = playerName; Object.assign(ui.pauseMenu, handlers) }
export function setPauseSeed(seed: number): void { ui.pauseMenu.seed = seed }
export function setPausePlayerName(name: string): void { ui.pauseMenu.playerName = name }
export function setPauseSaveStatus(status: string): void { ui.pauseMenu.saveStatus = status }

export function openQuestLog(entries: readonly QuestListEntry[], exp: number, relation: (name: string) => number): void { ui.questLog.entries = entries; ui.questLog.exp = exp; ui.questLog.relation = relation; ui.questLog.open = true; emitUiOpen() }
export function refreshQuestLog(entries: readonly QuestListEntry[], exp: number, relation: (name: string) => number): void { ui.questLog.entries = entries; ui.questLog.exp = exp; ui.questLog.relation = relation }
export function closeQuestLog(): void { ui.questLog.open = false }
export function isQuestLogOpen(): boolean { return ui.questLog.open }

export function openFlavorDialog(name: string, line: string): void { ui.flavorDialog.prompt = null; ui.flavorDialog.name = name; ui.flavorDialog.line = line; ui.flavorDialog.open = true; emitUiOpen() }
export function setFlavorPrompt(text: string | null): void { if (!ui.flavorDialog.open) ui.flavorDialog.prompt = text }
export function closeFlavorDialog(): void { ui.flavorDialog.open = false }
export function isFlavorDialogOpen(): boolean { return ui.flavorDialog.open }

export function openVillagers(): void { ui.villagers.open = true; ui.villagers.page = 0 }
export function closeVillagers(): void { ui.villagers.open = false }
export function toggleVillagers(): void { if (ui.villagers.open) closeVillagers(); else openVillagers() }
export function refreshVillagers(entries: readonly VillagerRefreshEntry[]): void { ui.villagers.entries = entries.map((e) => ({ ...e, npc: markRaw(e.npc) })) }
export function isVillagersOpen(): boolean { return ui.villagers.open }
export function setVillagersPage(page: number): void { ui.villagers.page = page }

export function openNpcDialogueMenu(npc: NpcAgent, settlement: Settlement, questManager: QuestManager, timeOfDay: number): void { const state = ui.npcDialogueMenu; const override = questManager.onInteract(npc.name); state.npc = markRaw(npc); state.settlement = settlement; state.timeOfDay = timeOfDay; state.helpResult = override ?? { line: npc.getDialogueLine() }; state.open = true; emitUiOpen(); playNpcVoice(npc, pickNpcGreetingSound(npc.voiceActor)) }
function resetNpcDialogueMenu(): void { const state = ui.npcDialogueMenu; state.open = false; state.npc = null; state.settlement = null; state.helpResult = null }
/** `decline: false` means this close is a transition (e.g. into trade — see
 *  `openMerchantFromDialogue`), not the player actually leaving/declining — skip
 *  both `onDecline()` and the farewell line in that case, same guard. */
export function closeNpcDialogueMenu(opts?: { decline?: boolean }): void {
  const state = ui.npcDialogueMenu
  if (!state.open) return
  const npc = state.npc as NpcAgent | null
  if (opts?.decline !== false) {
    state.helpResult?.offer?.onDecline()
    playNpcVoice(npc, npc ? pickNpcFarewellSound(npc.voiceActor) : undefined)
  }
  resetNpcDialogueMenu()
}
export function acceptNpcDialogueOffer(): void {
  const state = ui.npcDialogueMenu
  if (!state.open || !state.helpResult?.offer) return
  const npc = state.npc as NpcAgent | null
  state.helpResult.offer.onAccept()
  playNpcVoice(npc, npc ? pickNpcConfirmationSound(npc.voiceActor) : undefined)
  resetNpcDialogueMenu()
}
export function isNpcDialogueMenuOpen(): boolean { return ui.npcDialogueMenu.open }
export function configureNpcDialogueMenu(handlers: { onAskSword: () => string, onOpenTrade: () => void }): void {
  ui.npcDialogueMenu.onAskSword = handlers.onAskSword
  ui.npcDialogueMenu.onOpenTrade = handlers.onOpenTrade
}

export function openInventory(
  counts: Partial<Record<ItemKind, number>>,
  totalWeight: number,
  maxWeight: number,
  heldTool: ItemKind | null,
  onDrop: (kind: ItemKind) => void,
  onEquip: (kind: ItemKind) => void,
  onUnequip: () => void,
  onConsume: (kind: ItemKind) => void,
): void {
  ui.inventory.counts = { ...counts }
  ui.inventory.totalWeight = totalWeight
  ui.inventory.maxWeight = maxWeight
  ui.inventory.heldTool = heldTool
  ui.inventory.onDrop = onDrop
  ui.inventory.onEquip = onEquip
  ui.inventory.onUnequip = onUnequip
  ui.inventory.onConsume = onConsume
  ui.inventory.open = true
  emitUiOpen()
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

export function configureMerchant(handlers: Pick<MerchantState, 'onBuyShells' | 'onBuyBarter' | 'onSellShells'>): void {
  Object.assign(ui.merchant, handlers)
}
export function openMerchant(counts: Partial<Record<ItemKind, number>>, npc: NpcAgent | null = null): void {
  ui.merchant.counts = { ...counts }
  ui.merchant.npc = npc ? markRaw(npc) : null
  ui.merchant.open = true
}
/** Close dialogue first, then open trade — capture the NPC before reset. */
export function openMerchantFromDialogue(counts: Partial<Record<ItemKind, number>>): void {
  const npc = ui.npcDialogueMenu.npc as NpcAgent | null
  closeNpcDialogueMenu({ decline: false })
  openMerchant(counts, npc)
}
export function refreshMerchant(counts: Partial<Record<ItemKind, number>>): void {
  ui.merchant.counts = { ...counts }
}
export function closeMerchant(): void {
  ui.merchant.open = false
  ui.merchant.npc = null
}
export function isMerchantOpen(): boolean { return ui.merchant.open }

export function configureQuickActions(handlers: Partial<Omit<QuickActionsState, 'open'>>): void { Object.assign(ui.quickActions, handlers) }
export function setQuickActionsHasShovel(hasShovel: boolean): void { ui.quickActions.hasShovel = hasShovel }
export function setQuickActionsHasTent(hasTent: boolean): void { ui.quickActions.hasTent = hasTent }
export function setQuickActionsNearTown(nearTown: boolean): void { ui.quickActions.nearTown = nearTown }
export function setQuickActionsTraps(traps: QuickActionsTraps): void {
  const current = ui.quickActions.traps
  if (current.simple === traps.simple && current.good === traps.good) return
  ui.quickActions.traps = { ...traps }
}
export function setQuickActionsFireAvailability(availability: QuickActionsFireAvailability): void { ui.quickActions.fireAvailability = availability }
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

/** Esc during rest (tent/camp/town) — not wait. Returns true if consumed. */
let abortRestHandler: (() => boolean) | null = null
export function configureAbortRest(handler: (() => boolean) | null): void {
  abortRestHandler = handler
}
export function abortRest(): boolean {
  return abortRestHandler?.() ?? false
}

/** `fadeStrength` drives the grayscale/blur filter opacity (`0` = label only,
 *  `0.5` = wait, `1` = rest). See `TimeSkipOverlay.vue`. */
export function showTimeSkip(label: string, fadeStrength: number): void {
  ui.timeSkip.visible = true
  ui.timeSkip.label = label
  ui.timeSkip.fadeStrength = fadeStrength
  if (fadeStrength > 0) ui.timeSkip.fadeVisible = true
}
/** If a fade is currently showing, only *starts* the fade-out — the panel
 *  stays mounted until `TimeSkipOverlay.vue`'s `transitionend` handler calls
 *  `finishTimeSkipHide()`, so the opacity transition is visible instead of
 *  the filter vanishing instantly. Without an active fade there's nothing to
 *  animate, so hide immediately. */
export function hideTimeSkip(): void {
  if (!ui.timeSkip.visible) return
  if (!ui.timeSkip.fadeVisible || ui.timeSkip.fadeStrength <= 0) {
    ui.timeSkip.visible = false
    ui.timeSkip.fadeStrength = 0
    return
  }
  ui.timeSkip.fadeVisible = false
}
export function finishTimeSkipHide(): void {
  if (!ui.timeSkip.fadeVisible) {
    ui.timeSkip.visible = false
    ui.timeSkip.fadeStrength = 0
  }
}

export function showBusy(label: string, blurred = false, progress: number | null = null): void {
  ui.busy.visible = true
  ui.busy.label = label
  ui.busy.blurred = blurred
  ui.busy.progress = progress
}
export function hideBusy(): void {
  ui.busy.visible = false
  ui.busy.label = ''
  ui.busy.blurred = false
  ui.busy.progress = null
}

/** Esc during a `busy` channel (fire-lighting, cooking, butchering, …) — not
 *  `rest`. Returns true if consumed. Mirrors `abortRest`/`configureAbortRest`. */
let abortBusyHandler: (() => boolean) | null = null
export function configureAbortBusy(handler: (() => boolean) | null): void {
  abortBusyHandler = handler
}
export function abortBusy(): boolean {
  return abortBusyHandler?.() ?? false
}

export function configureWorldConfigScreen(config: WorldConfig, dayNight: DayNightState, handlers: {
  onTerrainChange: () => void
  onDayNightChange: () => void
  onPostProcessingChange: () => void
  onRenderQualityChange: () => void
  onTerrainShadowChange: () => void
  onQualityPresetChange: (preset: QualityPreset) => void
  onShadowMapSizeChange: () => void
  onLodScaleChange: () => void
}): void {
  ui.worldConfigScreen.config = config
  ui.worldConfigScreen.dayNight = dayNight
  ui.worldConfigScreen.onTerrainChange = handlers.onTerrainChange
  ui.worldConfigScreen.onDayNightChange = handlers.onDayNightChange
  ui.worldConfigScreen.onPostProcessingChange = handlers.onPostProcessingChange
  ui.worldConfigScreen.onRenderQualityChange = handlers.onRenderQualityChange
  ui.worldConfigScreen.onTerrainShadowChange = handlers.onTerrainShadowChange
  ui.worldConfigScreen.onQualityPresetChange = handlers.onQualityPresetChange
  ui.worldConfigScreen.onShadowMapSizeChange = handlers.onShadowMapSizeChange
  ui.worldConfigScreen.onLodScaleChange = handlers.onLodScaleChange
}
export function openWorldConfigScreen(): void { ui.worldConfigScreen.open = true }
export function closeWorldConfigScreen(): void { ui.worldConfigScreen.open = false }
export function isWorldConfigScreenOpen(): boolean { return ui.worldConfigScreen.open }

export function openNotes(): void { ui.notes.open = true }
export function closeNotes(): void { ui.notes.open = false }
export function isNotesOpen(): boolean { return ui.notes.open }

export function openWorldMap(playerX: number, playerZ: number): void {
  if (document.pointerLockElement) document.exitPointerLock()
  ui.worldMap.playerX = playerX
  ui.worldMap.playerZ = playerZ
  ui.worldMap.open = true
}
export function closeWorldMap(): void { ui.worldMap.open = false }
export function isWorldMapOpen(): boolean { return ui.worldMap.open }
export function toggleWorldMap(playerX: number, playerZ: number): void {
  if (ui.worldMap.open) closeWorldMap()
  else openWorldMap(playerX, playerZ)
}

export function openCharacterScreen(): void { ui.characterScreen.open = true; emitUiOpen() }
export function closeCharacterScreen(): void { ui.characterScreen.open = false }
export function isCharacterScreenOpen(): boolean { return ui.characterScreen.open }
/** Pushed once/frame by `gameLoop.ts` regardless of whether the screen is
 *  open — same convention as `setHudPlayerNeeds` — with a cheap bail so an
 *  unchanged frame doesn't touch the reactive object. */
export function setCharacterStats(stats: CharacterStats): void {
  const c = ui.characterScreen
  if (
    c.hp.current === stats.hp.current && c.hp.max === stats.hp.max &&
    c.stamina.current === stats.stamina.current && c.stamina.max === stats.stamina.max &&
    c.vigor.current === stats.vigor.current && c.vigor.max === stats.vigor.max &&
    c.hunger.current === stats.hunger.current && c.hunger.max === stats.hunger.max &&
    c.thirst.current === stats.thirst.current && c.thirst.max === stats.thirst.max
  ) return
  c.hp = stats.hp
  c.stamina = stats.stamina
  c.vigor = stats.vigor
  c.hunger = stats.hunger
  c.thirst = stats.thirst
}

export function openSkillsScreen(): void { ui.skillsScreen.open = true; emitUiOpen() }
export function closeSkillsScreen(): void { ui.skillsScreen.open = false }
export function isSkillsScreenOpen(): boolean { return ui.skillsScreen.open }
export function toggleSkillsScreen(): void {
  if (ui.skillsScreen.open) closeSkillsScreen()
  else openSkillsScreen()
}
export function configureSkillsScreen(handlers: { onToggleSneak: () => void }): void {
  ui.skillsScreen.onToggleSneak = handlers.onToggleSneak
}
/** Pushed once/frame by `gameLoop.ts`, same cheap-bail convention as
 *  `setCharacterStats`. */
export function setSkillsState(
  sneakValue: number,
  sneakActive: boolean,
  sneakXp: number,
  survivalValue: number,
  survivalXp: number,
  trapsValue: number,
  trapsXp: number,
): void {
  const s = ui.skillsScreen
  if (
    s.sneakValue === sneakValue && s.sneakActive === sneakActive && s.sneakXp === sneakXp &&
    s.survivalValue === survivalValue && s.survivalXp === survivalXp &&
    s.trapsValue === trapsValue && s.trapsXp === trapsXp
  ) return
  s.sneakValue = sneakValue
  s.sneakActive = sneakActive
  s.sneakXp = sneakXp
  s.survivalValue = survivalValue
  s.survivalXp = survivalXp
  s.trapsValue = trapsValue
  s.trapsXp = trapsXp
}

export function setHudFps(fps: number): void {
  const text = `${Math.round(fps)} FPS`
  if (ui.hud.fps === text) return
  ui.hud.fps = text
}
export function toggleHudFpsVisible(): void { ui.hud.showFps = !ui.hud.showFps }
export function setHudTime(timeOfDay: number): void {
  const time = formatClock(timeOfDay)
  if (ui.hud.time !== time) ui.hud.time = time
  const phase = phaseName(timeOfDay)
  if (ui.hud.phase !== phase) ui.hud.phase = phase
}
export function setHudExp(exp: number): void {
  const text = `exp ${exp}`
  if (ui.hud.exp === text) return
  ui.hud.exp = text
}
export function setHudInventoryWeight(current: number, max: number): void {
  const text = `${current.toFixed(1)}/${max.toFixed(1)} kg`
  if (ui.hud.weight === text) return
  ui.hud.weight = text
}
export function setHudHeldTool(label: string): void {
  const text = label ? `w ręce: ${label}` : ''
  if (ui.hud.held === text) return
  ui.hud.held = text
}
export function setHudPlayerNeeds(needs: { stamina: number, vigor: number, hunger: number, thirst: number }): void {
  const p = ui.hud.playerNeeds
  if (p.stamina === needs.stamina && p.vigor === needs.vigor && p.hunger === needs.hunger && p.thirst === needs.thirst) return
  ui.hud.playerNeeds = needs
}

export function toggleMinimap(): void { ui.minimap.collapsed = !ui.minimap.collapsed }
export function setMinimapCollapsed(collapsed: boolean): void { ui.minimap.collapsed = collapsed }
export function isMinimapCollapsed(): boolean { return ui.minimap.collapsed }

let nextToastId = 1
const toastTimeouts = new Set<number>()
export function showToast(text: string, variant: ToastVariant = 'info'): void {
  const id = nextToastId++
  ui.toast.items.push({ id, text, variant, fading: false })
  const fadeTimeout = window.setTimeout(() => {
    const item = ui.toast.items.find((t) => t.id === id)
    if (item) item.fading = true
    const removeTimeout = window.setTimeout(() => {
      const idx = ui.toast.items.findIndex((t) => t.id === id)
      if (idx !== -1) ui.toast.items.splice(idx, 1)
      toastTimeouts.delete(removeTimeout)
    }, TOAST_FADE_MS)
    toastTimeouts.add(removeTimeout)
    toastTimeouts.delete(fadeTimeout)
  }, TOAST_VISIBLE_MS)
  toastTimeouts.add(fadeTimeout)
}
export function clearToasts(): void {
  for (const t of toastTimeouts) window.clearTimeout(t)
  toastTimeouts.clear()
  ui.toast.items = []
}

type TouchChromeHandlers = Partial<Pick<TouchChromeState, 'onPause' | 'onQuickActions' | 'onInteract' | 'onAltInteract'>>
export function configureTouchChrome(handlers: TouchChromeHandlers): void {
  ui.touch.visible = true
  Object.assign(ui.touch, handlers)
}
export function setTouchInputEnabled(enabled: boolean): void {
  if (ui.touch.inputEnabled === enabled) return
  ui.touch.inputEnabled = enabled
}
export function clearTouchChrome(): void {
  ui.touch.visible = false
  ui.touch.inputEnabled = true
  ui.touch.onPause = null
  ui.touch.onQuickActions = null
  ui.touch.onInteract = null
  ui.touch.onAltInteract = null
}
