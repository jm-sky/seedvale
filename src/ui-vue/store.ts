import { markRaw, type Raw, reactive } from 'vue'
import type { NpcAgent } from '../ai/NpcAgent'
import type { ActionAvailability, ActionResult } from '../app/actions/actionContracts'
import type { PlacementPreviewKind } from '../app/actions/placementPreviewActions'
import type { PlayAt } from '../audio/createWorldAudio'
import type { BadgeDef } from '../badges/badges'
import type { QualityPreset } from '../config/qualityProfiles'
import type { WorldConfig } from '../config/worldConfig'
import type { InventoryGroupView } from '../items/inventoryView'
import type { ItemKind } from '../items/items'
import type { TradeResult } from '../items/trade'
import type { SharpenResult } from '../items/weaponMaintenance'
import type { CreateSaveResult, SaveSlotInfo } from '../persistence/saveDb'
import type { QuestDialogOverride, QuestListEntry, QuestManager } from '../quests/QuestManager'
import type { Settlement } from '../settlement/createSettlement'
import type { FoodSourceType } from '../settlement/settlementGenerator'
import type { QuickActionsCropSeeds, QuickActionsTraps, QuickActionsWorkContract, RestOutcome, RestVariant } from '../ui/createQuickActions'
import type { ToastVariant } from '../ui/createToast'
import type { TrapKind } from '../world/animalTraps'
import type { CropId } from '../world/cropLifecycle'
import { pickNpcConfirmationSound, pickNpcFarewellSound, pickNpcGreetingSound } from '../ai/npcVoiceLines'
import {
  type AudioVolumeKey,
  type AudioVolumes,
  DEFAULT_AUDIO_VOLUMES,
  normalizeAudioVolumes,
  saveAudioVolumes,
} from '../audio/audioSettings'
import { playUiClick, playUiOpen } from '../audio/uiSounds'
import { DEFAULT_QUALITY_PRESET } from '../config/qualityProfiles'
import { isTouchDevice } from '../input/isTouchDevice'
import { type DayNightState, formatClock, phaseName } from '../world/dayNight'

export type VillagerEntry = { npc: Raw<NpcAgent>; settlementName: string; foodSourceType: FoodSourceType }
type VillagerRefreshEntry = { npc: NpcAgent; settlementName: string; foodSourceType: FoodSourceType }
export const VILLAGERS_PAGE_SIZE = 10

/** A player-placed `Container` the Villagers screen can offer as a helper
 *  delivery target (plan 167 §14) — just enough to render/select one, not
 *  the full `PlacedContainerEntry` (world position/mesh stay app-layer). */
export type VillagerContainerOption = { id: string, label: string }

type NpcDialogueMenuState = {
  open: boolean
  npc: NpcAgent | null
  settlement: Settlement | null
  timeOfDay: number
  helpResult: QuestDialogOverride | null
  canAskSword: boolean
  getCanAskSword: (() => boolean) | null
  onAskSword: (() => string) | null
  onOpenTrade: (() => void) | null
  /** "Poproś o jedzenie"/"Poproś o wodę" (plan 152) — resolved immediately
   *  against the currently-open `npc`, same shape as `onAskSword`. */
  onRequestFood: ((npc: NpcAgent) => string) | null
  onRequestWater: ((npc: NpcAgent) => string) | null
  /** "Opowiedz mi coś o okolicy" (plan world-012 §7) — home guard only, same
   *  "no args, resolved against whatever NPC/settlement is open" shape as
   *  `onAskSword`. */
  onAskAboutArea: (() => string) | null
}
type InventoryState = {
  open: boolean
  counts: Partial<Record<ItemKind, number>>
  groups: readonly InventoryGroupView[]
  totalWeight: number
  maxWeight: number
  totalSize: number
  maxSize: number
  heldTool: ItemKind | null
  onDrop: ((kind: ItemKind) => void) | null
  onEquip: ((kind: ItemKind) => void) | null
  onUnequip: (() => void) | null
  /** "Zjedz"/"Wypij" (plan 106) — only offered for `ITEM_CATALOG[kind].consumable` items. */
  onConsume: ((kind: ItemKind) => void) | null
  onPlaceTrap: ((kind: TrapKind) => void) | null
  onSellInstances: ((instanceIds: readonly string[]) => TradeResult) | null
  onSharpen: ((instanceId: string) => SharpenResult) | null
  /** "Postaw" (plan 164) — places a purchased `chest` in the world ahead of
   *  the player, same ground-suitability flow as `onPlaceTent`. */
  onPlaceContainer: (() => void) | null
}
type PauseMenuState = {
  open: boolean; seed: number; playerName: string; activeSaveName: string
  onPause: (() => void) | null; onResume: (() => void) | null; onToggleGui: (() => void) | null
  onNameChange: ((name: string) => void) | null; onNameCommit: ((name: string) => void) | null
  onSave: (() => void) | null; onSaveAs: ((name: string) => Promise<CreateSaveResult>) | null
  onLoadSave: ((id: string) => void) | null; onListSaves: (() => Promise<SaveSlotInfo[]>) | null
  onRefresh: (() => void) | null
  onBuildSimpleFire: (() => ActionResult) | null; onBuildFirePit: (() => ActionResult) | null; onBuildWoodPile: (() => ActionResult) | null; onBuildGrate: (() => ActionResult) | null
  onLightBranch: (() => ActionResult) | null; onLightWoodenTorch: (() => ActionResult) | null
  onNewGame: ((name: string) => void) | null; onQuestLog: (() => void) | null; onVillagers: (() => void) | null; onInventory: (() => void) | null; onWorldMap: (() => void) | null
  saveStatus: string
}
type QuestLogState = { open: boolean; entries: readonly QuestListEntry[]; exp: number; relation: (name: string) => number }
/** One button in the shared contextual interaction panel (plan `ui-input-002`
 *  §2/§3) — `reasonLabel` explains a disabled action (e.g. missing
 *  materials/capability). `run` is the real domain callback (e.g.
 *  `workOnWell`); Vue never re-derives it from the interaction kind. */
export type InteractionPanelAction = { label: string; enabled: boolean; reasonLabel: string; run: () => void }
type FlavorDialogState = {
  open: boolean
  prompt: string | null
  promptHighlighted: boolean
  progress: number | null
  name: string
  line: string
  /** Extra actions beyond the implicit Esc/E-close (plan `ui-input-002`) —
   *  empty for the plain flavor-text case, which renders exactly as before. */
  actions: readonly InteractionPanelAction[]
}
export type FireActionId = 'lightBranch' | 'lightWoodenTorch' | 'buildFirePit' | 'buildSimpleFire' | 'buildWoodPile' | 'buildGrate'

/** Each fire action's structural `ActionAvailability` (plan `ui-input-007`)
 *  — kept live by `createApp.ts`'s `syncQuickActionAvailability`, derived
 *  from `userActions.ts`'s `availableX()` functions (the same checks
 *  `execute()` re-runs), not recomputed here (Quick Actions / Pause→Akcje
 *  are presentation only). */
export type QuickActionsFireAvailability = Record<FireActionId, ActionAvailability>

/** Pre-first-sync placeholder — unavailable with nothing missing to report,
 *  since a real check hasn't run yet. */
const NOT_YET_AVAILABLE: ActionAvailability = { available: false, missing: [] }
/** Quick Actions top-level category (plan `ui-input-004` §3) — a presentation
 *  grouping over the same existing actions/availability below, not a second
 *  action registry. `null` at the panel root; selecting a category drills
 *  into it, "Wróć" (or closing the panel) returns to `null`. */
export type QuickActionsCategoryId =
  | 'budowa'
  | 'ogien'
  | 'lopata'
  | 'teren'
  | 'pulapki'
  | 'sadzenie'
  | 'wedkarstwo'
  | 'czekaj'
  | 'skrzynia'
  | 'odpoczynek'
  | 'zlecenia'

type QuickActionsState = {
  open: boolean
  /** `null` at the category-picker root; the selected category while
   *  drilled in. Reset on close (`closeQuickActions`) so reopening never
   *  exposes stale navigation state (implementation notes §6). */
  category: QuickActionsCategoryId | null
  /** Any carried item with the `soil_digging` capability (plan 184) — not
   *  literally a shovel. */
  hasDiggingTool: boolean
  nearTown: boolean
  fireAvailability: QuickActionsFireAvailability
  /** "Zbuduj ognisko" instant entry (Ogień category) — the same `buildSimpleFire`
   *  action as "Budowa"'s placement-preview entry, just a second entry point
   *  (plan items-player-012). `onBuildFirePit` is wired for the same
   *  `FireActionHandlers` contract even though its catalog row is filtered
   *  out of the Ogień category here (it's Budowa-only). */
  onBuildSimpleFire: (() => ActionResult) | null
  onBuildFirePit: (() => ActionResult) | null
  /** "Zbuduj stos drewna" (plan items-player-015) — Budowa-only placement
   *  preview, same "wired for the `FireActionHandlers` contract, filtered
   *  out of Ogień" shape as `onBuildFirePit` above. */
  onBuildWoodPile: (() => ActionResult) | null
  onBuildGrate: (() => ActionResult) | null
  onLightBranch: (() => ActionResult) | null
  onLightWoodenTorch: (() => ActionResult) | null
  onWait: ((hours: number) => void) | null
  onRest: ((variant: RestVariant) => RestOutcome) | null
  onDig: (() => void) | null
  onLevel: (() => void) | null
  /** "Zrób górkę" (plan `world-terrain-002` §1). */
  onMound: (() => void) | null
  /** "Przygotuj teren" (plan `world-terrain-002` §2) — enters the preview mode. */
  onPrepareTerrain: (() => void) | null
  /** Enters the shared placement-preview mode for `kind` (plan `ui-input-004`
   *  §2/§7/§3's "Budowa" category) — replaces the old instant
   *  `onPlaceTent`/`onBuildSimpleFire`/`onBuildFirePit`/new-chest handlers
   *  for Quick Actions specifically; Pause → Akcje keeps its own instant
   *  fire-build handlers unchanged. */
  onStartPlacementPreview: ((kind: PlacementPreviewKind) => void) | null
  onPlaceTrap: ((kind: TrapKind) => void) | null
  hasTent: boolean
  /** Owning at least one unplaced `chest` item (plan `ui-input-004` §3) —
   *  drives "Postaw skrzynię" under "Budowa", same shape as `hasTent`. */
  hasChest: boolean
  /** Owning at least one portable `wooden_torch` item (plan items-player-009)
   *  — drives "Postaw pochodnię" under "Budowa", same shape as `hasChest`.
   *  The recipe's other material (a beam) is checked/consumed at build time,
   *  same as a well/garden's stone/branch cost — not gated here. */
  hasWoodenTorch: boolean
  /** Owning enough `beam` to build a palisade segment (plan items-player-010)
   *  — drives "Postaw segment palisady" under "Budowa", same shape as
   *  `hasWoodenTorch`. */
  hasPalisadeMaterial: boolean
  /** Owning enough `hide` to build a bedroll (plan items-player-013) — drives
   *  "Rozłóż posłanie" under "Budowa", same shape as `hasPalisadeMaterial`. */
  hasBedrollMaterial: boolean
  /** Owning enough `branch` to build a raised sleeping platform (plan
   *  items-player-013) — drives "Zbuduj podest" under "Budowa", same shape
   *  as `hasPalisadeMaterial`. */
  hasPlatformMaterial: boolean
  traps: QuickActionsTraps
  /** True while the player is carrying a placed container (plan 164 §8) —
   *  drives the "Odłóż skrzynię" action, the put-down counterpart of
   *  the new-chest placement preview/inventory's `onPlaceContainer`. */
  hasCarriedContainer: boolean
  onPutDownContainer: (() => void) | null
  /** Places a new player-built well ahead of the player (plan 127) — shown
   *  alongside the other digging actions, gated by `hasDiggingTool` above (a
   *  digging tool is required to start the `pit` stage but never consumed). */
  onBuildWell: (() => void) | null
  /** Places a new player-built garden plot ahead of the player (plan 174) —
   *  shown alongside the other digging actions, same `hasDiggingTool` gate
   *  as `onBuildWell` above. */
  onBuildGarden: (() => void) | null
  /** Initial tree-seed ownership for showing "Zasadź drzewo" (plan 126). */
  hasTreeSeed: boolean
  /** Which crop seed kinds the player currently carries (plan 126). */
  cropSeeds: QuickActionsCropSeeds
  onPlantTree: (() => void) | null
  onPlantCrop: ((cropId: CropId) => void) | null
  /** Owning at least one `fishing_rod` (plan `ui-input-006`) — drives the
   *  "Łów ryby" Quick Action, the main way to equip it for fishing. */
  hasFishingRod: boolean
  /** Equips the carried fishing rod via the existing `HeldTool` mechanism —
   *  does not itself look for water or start fishing. */
  onEquipFishingRod: (() => void) | null
  onOpen: (() => void) | null
  onClose: (() => void) | null
  /** "Zlecenia" category rows (plan npc-014) — every non-terminal work
   *  contract the player currently holds, view/cancel only. */
  workContracts: QuickActionsWorkContract[]
  onCancelWorkContract: ((id: string) => void) | null
}
type MerchantState = {
  open: boolean
  npc: NpcAgent | null
  counts: Partial<Record<ItemKind, number>>
  groups: readonly InventoryGroupView[]
  /** Settles one mixed BUY+OFFER basket atomically (plan ui-input-003) —
   *  supersedes the old single-target onBuyCoins/onBuyBarter/onSellCoins. */
  onSettleTransaction: ((
    purchases: Partial<Record<ItemKind, number>>,
    offer: Partial<Record<ItemKind, number>>,
  ) => TradeResult) | null
  onSellInstances: ((instanceIds: readonly string[]) => TradeResult) | null
}
/** Generic container transfer screen (plan 164 §7) — same "seller/buyer
 *  two-column, visually/interaction-wise based on the merchant screen" shape
 *  the plan asks for, minus prices: `container*` mirrors `merchant`'s stock
 *  column, `player*` mirrors the player's own inventory. Kind-agnostic (any
 *  `ContainerKind`) — `label` is the only per-container-instance text. */
type ContainerScreenState = {
  open: boolean
  label: string
  containerCounts: Partial<Record<ItemKind, number>>
  containerGroups: readonly InventoryGroupView[]
  containerWeightKg: number
  containerMaxSizeUnits: number
  playerCounts: Partial<Record<ItemKind, number>>
  playerGroups: readonly InventoryGroupView[]
  playerTotalWeight: number
  playerMaxWeight: number
  /** Player → container. `amount` lets the row's +/- stepper move more than
   *  one unit per click, same UX as merchant's barter offer stepper. */
  onDeposit: ((kind: ItemKind, amount: number) => void) | null
  /** Container → player. */
  onWithdraw: ((kind: ItemKind, amount: number) => void) | null
  onDepositInstance: ((instanceId: string) => void) | null
  onWithdrawInstance: ((instanceId: string) => void) | null
}
type TimeSkipState = { visible: boolean; label: string; fadeVisible: boolean; fadeStrength: number; progress: number; canCancelRest: boolean; canCancelTerrainPreparation: boolean }
/** Lodging autowalk cancel HUD (plan `ui-input-005`) — separate from
 *  `TimeSkipState` because the walk itself isn't a `timeSkip` (that only
 *  starts once the player arrives), so `ui.timeSkip.visible` is false the
 *  whole time this button needs to show. */
type LodgingWalkState = { active: boolean }
type BusyState = { visible: boolean; label: string; blurred: boolean; progress: number | null }
/** `Przygotuj teren` preview HUD (plan `world-terrain-002` §2) — mirrors
 *  `TerrainPreparationActions.tickPreview`'s per-frame view. */
type TerrainPreparationPreviewState = {
  visible: boolean
  sizeLabel: string
  heightLabel: string
  valid: boolean
  reasonLabel: string
}
/** Shared object-placement preview HUD (plan `ui-input-004` §2/§7) — mirrors
 *  `PlacementPreviewActions.tick`'s per-frame view, same convention as
 *  `TerrainPreparationPreviewState`. */
type PlacementPreviewState = {
  visible: boolean
  label: string
  valid: boolean
  reasonLabel: string
}
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
/** Reputation Badges / Achievements (plan world-007 §9) — `standing` is
 *  `QuestManager.getPlayerStanding()` combined with the cemetery-disturbance
 *  penalty (`badges.ts`'s `communityOffensePenalty`), pushed on demand
 *  (`setCharacterBadges`) rather than once/frame like the rest of this
 *  screen: it only ever changes on a discrete Hidden Find event. */
type CharacterScreenState = CharacterStats & { open: boolean, standing: number, badges: readonly BadgeDef[] }
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
  defenseValue: number
  defenseXp: number
  archeryValue: number
  archeryXp: number
  ridingValue: number
  ridingXp: number
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
  /** Ratios (0-1) for the HUD bars under the clock (plan 106 + issue 034).
   *  `hp` is `HealthState`, not a `PlayerNeeds` pool — same blob so the HUD
   *  has one per-frame push. */
  playerNeeds: { hp: number, stamina: number, vigor: number, hunger: number, thirst: number }
  /** Ranged-aim reticle visibility (plan 186 §1). */
  aiming: boolean
  /** Soft-locked target's projected screen position (viewport fractions
   *  0-1, y from the top) — `null` for Free Aim, which renders at a fixed
   *  screen-space offset instead (plan 186 follow-up: reticle positioning). */
  aimTargetScreen: { x: number, y: number } | null
  /** Primary melee/ranged weapon shortcut labels (plan `ui-input-002` §6) —
   *  empty string hides the corresponding HUD button, same convention as
   *  `held`. Backed by `items/primaryWeapons.ts`, not a separate UI model. */
  primaryMeleeLabel: string
  primaryRangedLabel: string
  /** Dedicated Dismount button (plan fauna-003 §10) — `active` gates the
   *  HUD's own always-visible button, independent of touch-device chrome. */
  mounted: { active: boolean, animalLabel: string, onDismount: (() => void) | null }
}
type AudioSettingsState = { volumes: AudioVolumes }
type MinimapState = { collapsed: boolean }
export type ToastItem = { id: number; text: string; variant: ToastVariant; fading: boolean }
type ToastState = { items: ToastItem[] }
type TouchChromeState = {
  visible: boolean
  inputEnabled: boolean
  cycleTargetAvailable: boolean
  onPause: (() => void) | null
  onQuickActions: (() => void) | null
  onInteract: (() => void) | null
  onInteractUp: (() => void) | null
  onAltInteract: (() => void) | null
  onCycleTarget: (() => void) | null
}

type PauseHandlers = Partial<Omit<PauseMenuState, 'open' | 'seed' | 'playerName' | 'saveStatus' | 'activeSaveName'>>

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
  npcDialogueMenu: { open: false, npc: null, settlement: null, timeOfDay: 0, helpResult: null, canAskSword: false, getCanAskSword: null, onAskSword: null, onOpenTrade: null, onRequestFood: null, onRequestWater: null, onAskAboutArea: null } as NpcDialogueMenuState,
  villagers: { open: false, entries: [] as VillagerEntry[], page: 0, containers: [] as VillagerContainerOption[] },
  inventory: { open: false, counts: {}, groups: [], totalWeight: 0, maxWeight: 0, totalSize: 0, maxSize: 0, heldTool: null, onDrop: null, onEquip: null, onUnequip: null, onConsume: null, onPlaceTrap: null, onSellInstances: null, onSharpen: null, onPlaceContainer: null } as InventoryState,
  pauseMenu: {
    open: false, seed: 0, playerName: '', activeSaveName: '', onPause: null, onResume: null, onToggleGui: null,
    onNameChange: null, onNameCommit: null, onSave: null, onSaveAs: null, onLoadSave: null, onListSaves: null, onRefresh: null,
    onBuildSimpleFire: null, onBuildFirePit: null, onBuildWoodPile: null, onBuildGrate: null, onLightBranch: null, onLightWoodenTorch: null,
    onNewGame: null, onQuestLog: null, onVillagers: null, onInventory: null, onWorldMap: null,
    saveStatus: '',
  } as PauseMenuState,
  questLog: { open: false, entries: [], exp: 0, relation: () => 0 } as QuestLogState,
  flavorDialog: { open: false, prompt: null, promptHighlighted: false, progress: null, name: '', line: '', actions: [] } as FlavorDialogState,
  quickActions: {
    open: false, category: null, hasDiggingTool: false, nearTown: false, hasTent: false, hasChest: false, hasWoodenTorch: false,
    hasPalisadeMaterial: false, hasBedrollMaterial: false, hasPlatformMaterial: false,
    traps: { simple: false, good: false },
    fireAvailability: {
      buildSimpleFire: NOT_YET_AVAILABLE,
      buildFirePit: NOT_YET_AVAILABLE,
      buildWoodPile: NOT_YET_AVAILABLE,
      buildGrate: NOT_YET_AVAILABLE,
      lightBranch: NOT_YET_AVAILABLE,
      lightWoodenTorch: NOT_YET_AVAILABLE,
    },
    onBuildSimpleFire: null, onBuildFirePit: null, onBuildWoodPile: null, onBuildGrate: null, onLightBranch: null, onLightWoodenTorch: null,
    onWait: null, onRest: null,
    onDig: null, onLevel: null, onMound: null, onPrepareTerrain: null, onStartPlacementPreview: null, onPlaceTrap: null, onOpen: null, onClose: null,
    hasCarriedContainer: false, onPutDownContainer: null, onBuildWell: null, onBuildGarden: null,
    hasTreeSeed: false, cropSeeds: { carrot: false, potato: false, cabbage: false },
    onPlantTree: null, onPlantCrop: null,
    hasFishingRod: false, onEquipFishingRod: null,
    workContracts: [], onCancelWorkContract: null,
  } as QuickActionsState,
  timeSkip: { visible: false, label: '', fadeVisible: false, fadeStrength: 0, progress: 0, canCancelRest: false, canCancelTerrainPreparation: false } as TimeSkipState,
  lodgingWalk: { active: false } as LodgingWalkState,
  terrainPreparationPreview: { visible: false, sizeLabel: '', heightLabel: '', valid: false, reasonLabel: '' } as TerrainPreparationPreviewState,
  placementPreview: { visible: false, label: '', valid: false, reasonLabel: '' } as PlacementPreviewState,
  merchant: { open: false, npc: null, counts: {}, groups: [], onSettleTransaction: null, onSellInstances: null } as MerchantState,
  containerScreen: {
    open: false, label: '', containerCounts: {}, containerGroups: [], containerWeightKg: 0, containerMaxSizeUnits: 0,
    playerCounts: {}, playerGroups: [], playerTotalWeight: 0, playerMaxWeight: 0,
    onDeposit: null, onWithdraw: null, onDepositInstance: null, onWithdrawInstance: null,
  } as ContainerScreenState,
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
    standing: 0,
    badges: [],
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
    defenseValue: 0,
    defenseXp: 0,
    archeryValue: 0,
    archeryXp: 0,
    ridingValue: 0,
    ridingXp: 0,
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
    playerNeeds: { hp: 1, stamina: 1, vigor: 1, hunger: 1, thirst: 1 },
    aiming: false,
    aimTargetScreen: null,
    primaryMeleeLabel: '',
    primaryRangedLabel: '',
    mounted: { active: false, animalLabel: '', onDismount: null },
  } as HudState,
  audio: { volumes: { ...DEFAULT_AUDIO_VOLUMES } } as AudioSettingsState,
  minimap: { collapsed: false } as MinimapState,
  toast: { items: [] as ToastItem[] } as ToastState,
  touch: {
    visible: false,
    inputEnabled: true,
    cycleTargetAvailable: false,
    onPause: null,
    onQuickActions: null,
    onInteract: null,
    onInteractUp: null,
    onAltInteract: null,
    onCycleTarget: null,
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

let audioVolumesOnChange: ((volumes: AudioVolumes) => void) | null = null

export function configureAudioVolumes(
  volumes: AudioVolumes,
  onChange: ((volumes: AudioVolumes) => void) | null,
): void {
  const next = normalizeAudioVolumes(volumes)
  ui.audio.volumes.master = next.master
  ui.audio.volumes.ambient = next.ambient
  ui.audio.volumes.sfx = next.sfx
  audioVolumesOnChange = onChange
}

export function setAudioVolume(key: AudioVolumeKey, value: number): void {
  const next = normalizeAudioVolumes({ ...ui.audio.volumes, [key]: value })
  ui.audio.volumes.master = next.master
  ui.audio.volumes.ambient = next.ambient
  ui.audio.volumes.sfx = next.sfx
  saveAudioVolumes(next)
  audioVolumesOnChange?.(next)
}

/** Restore mixer defaults (100%) and persist — same path as the volume sliders. */
export function resetAudioSettings(): void {
  const next = { ...DEFAULT_AUDIO_VOLUMES }
  ui.audio.volumes.master = next.master
  ui.audio.volumes.ambient = next.ambient
  ui.audio.volumes.sfx = next.sfx
  saveAudioVolumes(next)
  audioVolumesOnChange?.(next)
}

/** Restore the factory quality preset through the live World Config handler. */
export function resetGraphicsQuality(): void {
  ui.worldConfigScreen.onQualityPresetChange?.(DEFAULT_QUALITY_PRESET)
}
export function setPauseSeed(seed: number): void { ui.pauseMenu.seed = seed }
export function setPausePlayerName(name: string): void { ui.pauseMenu.playerName = name }
export function setPauseSaveStatus(status: string): void { ui.pauseMenu.saveStatus = status }
export function setPauseActiveSaveName(name: string): void { ui.pauseMenu.activeSaveName = name }

export function openQuestLog(entries: readonly QuestListEntry[], exp: number, relation: (name: string) => number): void { ui.questLog.entries = entries; ui.questLog.exp = exp; ui.questLog.relation = relation; ui.questLog.open = true; emitUiOpen() }
export function refreshQuestLog(entries: readonly QuestListEntry[], exp: number, relation: (name: string) => number): void { ui.questLog.entries = entries; ui.questLog.exp = exp; ui.questLog.relation = relation }
export function closeQuestLog(): void { ui.questLog.open = false }
export function isQuestLogOpen(): boolean { return ui.questLog.open }

export function openFlavorDialog(name: string, line: string, actions: readonly InteractionPanelAction[] = []): void {
  ui.flavorDialog.prompt = null
  ui.flavorDialog.progress = null
  ui.flavorDialog.name = name
  ui.flavorDialog.line = line
  ui.flavorDialog.actions = actions
  ui.flavorDialog.open = true
  emitUiOpen()
}
export function setFlavorPrompt(text: string | null, highlighted = false, progress: number | null = null): void {
  if (!ui.flavorDialog.open) {
    ui.flavorDialog.prompt = text
    ui.flavorDialog.promptHighlighted = highlighted
    ui.flavorDialog.progress = progress
  }
}
export function closeFlavorDialog(): void { ui.flavorDialog.open = false }
export function isFlavorDialogOpen(): boolean { return ui.flavorDialog.open }

export function openVillagers(): void { ui.villagers.open = true; ui.villagers.page = 0 }
export function closeVillagers(): void { ui.villagers.open = false }
export function toggleVillagers(): void { if (ui.villagers.open) closeVillagers(); else openVillagers() }
export function refreshVillagers(
  entries: readonly VillagerRefreshEntry[],
  containers: readonly VillagerContainerOption[] = [],
): void {
  ui.villagers.entries = entries.map((e) => ({ ...e, npc: markRaw(e.npc) }))
  ui.villagers.containers = [...containers]
}
export function isVillagersOpen(): boolean { return ui.villagers.open }
export function setVillagersPage(page: number): void { ui.villagers.page = page }

export function openNpcDialogueMenu(npc: NpcAgent, settlement: Settlement, questManager: QuestManager, timeOfDay: number): void {
  const state = ui.npcDialogueMenu
  const override = questManager.onInteract(npc.name)
  state.npc = markRaw(npc)
  state.settlement = settlement
  state.timeOfDay = timeOfDay
  state.helpResult = override ?? { line: npc.getDialogueLine() }
  state.canAskSword = state.getCanAskSword?.() ?? false
  state.open = true
  emitUiOpen()
  playNpcVoice(npc, pickNpcGreetingSound(npc.voiceActor))
}
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
export function configureNpcDialogueMenu(handlers: {
  onAskSword: () => string
  onOpenTrade: () => void
  getCanAskSword: () => boolean
  onRequestFood: (npc: NpcAgent) => string
  onRequestWater: (npc: NpcAgent) => string
  onAskAboutArea: () => string
}): void {
  ui.npcDialogueMenu.onAskSword = handlers.onAskSword
  ui.npcDialogueMenu.onOpenTrade = handlers.onOpenTrade
  ui.npcDialogueMenu.getCanAskSword = handlers.getCanAskSword
  ui.npcDialogueMenu.onRequestFood = handlers.onRequestFood
  ui.npcDialogueMenu.onRequestWater = handlers.onRequestWater
  ui.npcDialogueMenu.onAskAboutArea = handlers.onAskAboutArea
}

export function openInventory(
  counts: Partial<Record<ItemKind, number>>,
  totalWeight: number,
  maxWeight: number,
  totalSize: number,
  maxSize: number,
  heldTool: ItemKind | null,
  groups: readonly InventoryGroupView[],
  onDrop: (kind: ItemKind) => void,
  onEquip: (kind: ItemKind) => void,
  onUnequip: () => void,
  onConsume: (kind: ItemKind) => void,
  onPlaceTrap: (kind: TrapKind) => void,
  onSellInstances: (instanceIds: readonly string[]) => TradeResult,
  onSharpen: (instanceId: string) => SharpenResult,
  onPlaceContainer: () => void,
): void {
  ui.inventory.counts = { ...counts }
  ui.inventory.groups = groups
  ui.inventory.totalWeight = totalWeight
  ui.inventory.maxWeight = maxWeight
  ui.inventory.totalSize = totalSize
  ui.inventory.maxSize = maxSize
  ui.inventory.heldTool = heldTool
  ui.inventory.onDrop = onDrop
  ui.inventory.onEquip = onEquip
  ui.inventory.onUnequip = onUnequip
  ui.inventory.onConsume = onConsume
  ui.inventory.onPlaceTrap = onPlaceTrap
  ui.inventory.onSellInstances = onSellInstances
  ui.inventory.onSharpen = onSharpen
  ui.inventory.onPlaceContainer = onPlaceContainer
  ui.inventory.open = true
  emitUiOpen()
}
export function refreshInventory(
  counts: Partial<Record<ItemKind, number>>,
  totalWeight: number,
  maxWeight: number,
  totalSize: number,
  maxSize: number,
  heldTool: ItemKind | null,
  groups: readonly InventoryGroupView[],
): void {
  ui.inventory.counts = { ...counts }
  ui.inventory.groups = groups
  ui.inventory.totalWeight = totalWeight
  ui.inventory.maxWeight = maxWeight
  ui.inventory.totalSize = totalSize
  ui.inventory.maxSize = maxSize
  ui.inventory.heldTool = heldTool
}
export function closeInventory(): void {
  ui.inventory.open = false
  ui.inventory.onDrop = null
  ui.inventory.onEquip = null
  ui.inventory.onUnequip = null
  ui.inventory.onSellInstances = null
}
export function isInventoryOpen(): boolean { return ui.inventory.open }

export function configureMerchant(handlers: Pick<MerchantState, 'onSettleTransaction' | 'onSellInstances'>): void {
  Object.assign(ui.merchant, handlers)
}
export function openMerchant(
  counts: Partial<Record<ItemKind, number>>,
  groups: readonly InventoryGroupView[],
  npc: NpcAgent | null = null,
): void {
  ui.merchant.counts = { ...counts }
  ui.merchant.groups = groups
  ui.merchant.npc = npc ? markRaw(npc) : null
  ui.merchant.open = true
}
/** Close dialogue first, then open trade — capture the NPC before reset. */
export function openMerchantFromDialogue(
  counts: Partial<Record<ItemKind, number>>,
  groups: readonly InventoryGroupView[],
): void {
  const npc = ui.npcDialogueMenu.npc as NpcAgent | null
  closeNpcDialogueMenu({ decline: false })
  openMerchant(counts, groups, npc)
}
export function refreshMerchant(
  counts: Partial<Record<ItemKind, number>>,
  groups: readonly InventoryGroupView[],
): void {
  ui.merchant.counts = { ...counts }
  ui.merchant.groups = groups
}
export function closeMerchant(): void {
  ui.merchant.open = false
  ui.merchant.npc = null
}
export function isMerchantOpen(): boolean { return ui.merchant.open }

export function configureContainerScreen(handlers: Pick<ContainerScreenState, 'onDeposit' | 'onWithdraw' | 'onDepositInstance' | 'onWithdrawInstance'>): void {
  Object.assign(ui.containerScreen, handlers)
}
export function openContainerScreen(
  label: string,
  containerCounts: Partial<Record<ItemKind, number>>,
  containerGroups: readonly InventoryGroupView[],
  containerWeightKg: number,
  containerMaxSizeUnits: number,
  playerCounts: Partial<Record<ItemKind, number>>,
  playerGroups: readonly InventoryGroupView[],
  playerTotalWeight: number,
  playerMaxWeight: number,
): void {
  ui.containerScreen.label = label
  ui.containerScreen.containerCounts = { ...containerCounts }
  ui.containerScreen.containerGroups = containerGroups
  ui.containerScreen.containerWeightKg = containerWeightKg
  ui.containerScreen.containerMaxSizeUnits = containerMaxSizeUnits
  ui.containerScreen.playerCounts = { ...playerCounts }
  ui.containerScreen.playerGroups = playerGroups
  ui.containerScreen.playerTotalWeight = playerTotalWeight
  ui.containerScreen.playerMaxWeight = playerMaxWeight
  ui.containerScreen.open = true
  emitUiOpen()
}
export function refreshContainerScreen(
  containerCounts: Partial<Record<ItemKind, number>>,
  containerGroups: readonly InventoryGroupView[],
  containerWeightKg: number,
  containerMaxSizeUnits: number,
  playerCounts: Partial<Record<ItemKind, number>>,
  playerGroups: readonly InventoryGroupView[],
  playerTotalWeight: number,
  playerMaxWeight: number,
): void {
  if (!ui.containerScreen.open) return
  ui.containerScreen.containerCounts = { ...containerCounts }
  ui.containerScreen.containerGroups = containerGroups
  ui.containerScreen.containerWeightKg = containerWeightKg
  ui.containerScreen.containerMaxSizeUnits = containerMaxSizeUnits
  ui.containerScreen.playerCounts = { ...playerCounts }
  ui.containerScreen.playerGroups = playerGroups
  ui.containerScreen.playerTotalWeight = playerTotalWeight
  ui.containerScreen.playerMaxWeight = playerMaxWeight
}
export function closeContainerScreen(): void { ui.containerScreen.open = false }
export function isContainerScreenOpen(): boolean { return ui.containerScreen.open }

export function configureQuickActions(handlers: Partial<Omit<QuickActionsState, 'open'>>): void { Object.assign(ui.quickActions, handlers) }
export function setQuickActionsHasDiggingTool(hasDiggingTool: boolean): void { ui.quickActions.hasDiggingTool = hasDiggingTool }
export function setQuickActionsHasTent(hasTent: boolean): void { ui.quickActions.hasTent = hasTent }
export function setQuickActionsHasChest(hasChest: boolean): void { ui.quickActions.hasChest = hasChest }
export function setQuickActionsHasWoodenTorch(hasWoodenTorch: boolean): void { ui.quickActions.hasWoodenTorch = hasWoodenTorch }
export function setQuickActionsHasPalisadeMaterial(hasPalisadeMaterial: boolean): void { ui.quickActions.hasPalisadeMaterial = hasPalisadeMaterial }
export function setQuickActionsHasBedrollMaterial(hasBedrollMaterial: boolean): void { ui.quickActions.hasBedrollMaterial = hasBedrollMaterial }
export function setQuickActionsHasPlatformMaterial(hasPlatformMaterial: boolean): void { ui.quickActions.hasPlatformMaterial = hasPlatformMaterial }
export function setQuickActionsHasCarriedContainer(hasCarriedContainer: boolean): void { ui.quickActions.hasCarriedContainer = hasCarriedContainer }
export function setQuickActionsNearTown(nearTown: boolean): void { ui.quickActions.nearTown = nearTown }
export function setQuickActionsTraps(traps: QuickActionsTraps): void {
  const current = ui.quickActions.traps
  if (current.simple === traps.simple && current.good === traps.good) return
  ui.quickActions.traps = { ...traps }
}
export function setQuickActionsFireAvailability(availability: QuickActionsFireAvailability): void { ui.quickActions.fireAvailability = availability }
export function setQuickActionsHasTreeSeed(hasTreeSeed: boolean): void { ui.quickActions.hasTreeSeed = hasTreeSeed }
export function setQuickActionsHasFishingRod(hasFishingRod: boolean): void { ui.quickActions.hasFishingRod = hasFishingRod }
export function setQuickActionsCropSeeds(cropSeeds: QuickActionsCropSeeds): void {
  const current = ui.quickActions.cropSeeds
  if (current.carrot === cropSeeds.carrot && current.potato === cropSeeds.potato && current.cabbage === cropSeeds.cabbage) return
  ui.quickActions.cropSeeds = { ...cropSeeds }
}
export function setQuickActionsWorkContracts(workContracts: QuickActionsWorkContract[]): void {
  ui.quickActions.workContracts = workContracts
}
export function openQuickActions(): void {
  if (ui.quickActions.open) return
  ui.quickActions.open = true
  ui.quickActions.onOpen?.()
}
export function closeQuickActions(): void {
  if (!ui.quickActions.open) return
  ui.quickActions.open = false
  // Reset drill-down navigation so reopening never shows a stale category
  // (plan `ui-input-004` implementation notes §6).
  ui.quickActions.category = null
  ui.quickActions.onClose?.()
}
export function toggleQuickActions(): void { if (ui.quickActions.open) closeQuickActions(); else openQuickActions() }
export function isQuickActionsOpen(): boolean { return ui.quickActions.open }
export function selectQuickActionsCategory(category: QuickActionsCategoryId): void { ui.quickActions.category = category }
export function backToQuickActionsCategories(): void { ui.quickActions.category = null }

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
export function updateTimeSkipRestUi(progress: number | null, canCancelRest: boolean): void {
  ui.timeSkip.progress = progress ?? 0
  ui.timeSkip.canCancelRest = canCancelRest
}
/** Mirrors `updateTimeSkipRestUi`, but for the `Przygotuj teren` work
 *  session's own cancel button — kept separate from `canCancelRest` since a
 *  terrain-prep `timeSkip` runs at `fadeStrength: 0.5`, not the `1` that
 *  gates the rest-cancel branch in `gameLoop.ts`. */
export function setCanCancelTerrainPreparation(canCancel: boolean): void {
  ui.timeSkip.canCancelTerrainPreparation = canCancel
}
/** Drives the lodging autowalk's own "Anuluj [Esc]" HUD button (plan
 *  `ui-input-005`) — called every frame from `gameLoop.ts` straight off
 *  `RestActions.isLodgingActive()`, mirroring `setCanCancelTerrainPreparation`. */
export function setLodgingWalkActive(active: boolean): void {
  ui.lodgingWalk.active = active
}
export function hideTimeSkip(): void {
  if (!ui.timeSkip.visible) return
  ui.timeSkip.progress = 0
  ui.timeSkip.canCancelRest = false
  ui.timeSkip.canCancelTerrainPreparation = false
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
    ui.timeSkip.progress = 0
    ui.timeSkip.canCancelRest = false
    ui.timeSkip.canCancelTerrainPreparation = false
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

/** Esc during the `Przygotuj teren` preview or an active preparation-work
 *  session (plan `world-terrain-002`) — checked between `abortRest` and
 *  `abortBusy` in `App.vue`'s Esc chain. Mirrors `abortRest`/`abortBusy`. */
let abortTerrainPreparationHandler: (() => boolean) | null = null
export function configureAbortTerrainPreparation(handler: (() => boolean) | null): void {
  abortTerrainPreparationHandler = handler
}
export function abortTerrainPreparation(): boolean {
  return abortTerrainPreparationHandler?.() ?? false
}

/** Explicit size/height/confirm buttons for the `Przygotuj teren` preview
 *  (plan `ui-input-002` — desktop and mobile both lacked any UI for
 *  `[+/-]`/`[,/.]`/`[E]`). Thin wrappers over the same
 *  `TerrainPreparationActions` functions the keyboard path already calls —
 *  no parallel resize/confirm logic. */
export type TerrainPreparationControls = {
  grow: () => void
  shrink: () => void
  raise: () => void
  lower: () => void
  confirm: () => void
}
let terrainPreparationControlsHandler: TerrainPreparationControls | null = null
export function configureTerrainPreparationControls(handler: TerrainPreparationControls | null): void {
  terrainPreparationControlsHandler = handler
}
export function growTerrainPreparation(): void {
  terrainPreparationControlsHandler?.grow()
}
export function shrinkTerrainPreparation(): void {
  terrainPreparationControlsHandler?.shrink()
}
export function raiseTerrainPreparation(): void {
  terrainPreparationControlsHandler?.raise()
}
export function lowerTerrainPreparation(): void {
  terrainPreparationControlsHandler?.lower()
}
export function confirmTerrainPreparation(): void {
  terrainPreparationControlsHandler?.confirm()
}

export function showTerrainPreparationPreview(view: {
  sizeLabel: string
  heightLabel: string
  valid: boolean
  reasonLabel: string
}): void {
  ui.terrainPreparationPreview.visible = true
  ui.terrainPreparationPreview.sizeLabel = view.sizeLabel
  ui.terrainPreparationPreview.heightLabel = view.heightLabel
  ui.terrainPreparationPreview.valid = view.valid
  ui.terrainPreparationPreview.reasonLabel = view.reasonLabel
}
export function hideTerrainPreparationPreview(): void {
  ui.terrainPreparationPreview.visible = false
}

/** Esc during the shared object-placement preview (plan `ui-input-004` §2) —
 *  checked in `App.vue`'s Esc chain alongside `abortTerrainPreparation`.
 *  Mirrors `abortTerrainPreparation`/`configureAbortTerrainPreparation`. */
let abortPlacementPreviewHandler: (() => boolean) | null = null
export function configureAbortPlacementPreview(handler: (() => boolean) | null): void {
  abortPlacementPreviewHandler = handler
}
export function abortPlacementPreview(): boolean {
  return abortPlacementPreviewHandler?.() ?? false
}

/** Explicit confirm button for the placement-preview panel — thin wrapper
 *  over the same `PlacementPreviewActions.confirm` the keyboard `[E]` path
 *  already calls, mirroring `confirmTerrainPreparation`. */
let placementPreviewConfirmHandler: (() => void) | null = null
export function configurePlacementPreviewConfirm(handler: (() => void) | null): void {
  placementPreviewConfirmHandler = handler
}
export function confirmPlacementPreview(): void {
  placementPreviewConfirmHandler?.()
}

export function showPlacementPreview(view: { label: string, valid: boolean, reasonLabel: string }): void {
  ui.placementPreview.visible = true
  ui.placementPreview.label = view.label
  ui.placementPreview.valid = view.valid
  ui.placementPreview.reasonLabel = view.reasonLabel
}
export function hidePlacementPreview(): void {
  ui.placementPreview.visible = false
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
export function toggleCharacterScreen(): void {
  if (ui.characterScreen.open) closeCharacterScreen()
  else openCharacterScreen()
}
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

/** Pushed on demand — after a Hidden Find resolves, and once at startup —
 *  never once/frame (see `CharacterScreenState`'s doc comment). */
export function setCharacterBadges(standing: number, badges: readonly BadgeDef[]): void {
  ui.characterScreen.standing = standing
  ui.characterScreen.badges = badges
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
  defenseValue: number,
  defenseXp: number,
  archeryValue: number,
  archeryXp: number,
  ridingValue: number,
  ridingXp: number,
): void {
  const s = ui.skillsScreen
  if (
    s.sneakValue === sneakValue && s.sneakActive === sneakActive && s.sneakXp === sneakXp &&
    s.survivalValue === survivalValue && s.survivalXp === survivalXp &&
    s.trapsValue === trapsValue && s.trapsXp === trapsXp &&
    s.defenseValue === defenseValue && s.defenseXp === defenseXp &&
    s.archeryValue === archeryValue && s.archeryXp === archeryXp &&
    s.ridingValue === ridingValue && s.ridingXp === ridingXp
  ) return
  s.sneakValue = sneakValue
  s.sneakActive = sneakActive
  s.sneakXp = sneakXp
  s.survivalValue = survivalValue
  s.survivalXp = survivalXp
  s.trapsValue = trapsValue
  s.trapsXp = trapsXp
  s.defenseValue = defenseValue
  s.defenseXp = defenseXp
  s.archeryValue = archeryValue
  s.archeryXp = archeryXp
  s.ridingValue = ridingValue
  s.ridingXp = ridingXp
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
/** Primary melee/ranged weapon shortcut buttons — empty label hides the
 *  button. `label` is `''` when no weapon of that kind has been equipped
 *  yet, or it's no longer in inventory (`primaryWeapons.ts`). */
export function setHudPrimaryWeapons(meleeLabel: string, rangedLabel: string): void {
  ui.hud.primaryMeleeLabel = meleeLabel
  ui.hud.primaryRangedLabel = rangedLabel
}
export type PrimaryWeaponShortcuts = { equipMelee: () => void, equipRanged: () => void }
let primaryWeaponShortcutsHandler: PrimaryWeaponShortcuts | null = null
export function configurePrimaryWeaponShortcuts(handler: PrimaryWeaponShortcuts | null): void {
  primaryWeaponShortcutsHandler = handler
}
export function equipPrimaryMelee(): void {
  primaryWeaponShortcutsHandler?.equipMelee()
}
export function equipPrimaryRanged(): void {
  primaryWeaponShortcutsHandler?.equipRanged()
}
export function setHudPlayerNeeds(needs: { hp: number, stamina: number, vigor: number, hunger: number, thirst: number }): void {
  const p = ui.hud.playerNeeds
  if (
    p.hp === needs.hp &&
    p.stamina === needs.stamina &&
    p.vigor === needs.vigor &&
    p.hunger === needs.hunger &&
    p.thirst === needs.thirst
  ) return
  ui.hud.playerNeeds = needs
}
export function setHudAiming(aiming: boolean, targetScreen: { x: number, y: number } | null = null): void {
  ui.hud.aiming = aiming
  ui.hud.aimTargetScreen = targetScreen
}
/** Dedicated Dismount button (plan fauna-003 §10). Pushed once on mount/
 *  dismount by `app/actions/mountActions.ts` via the vanilla `Hud` facade. */
export function setHudMounted(mounted: boolean, animalLabel: string, onDismount: (() => void) | null): void {
  ui.hud.mounted.active = mounted
  ui.hud.mounted.animalLabel = animalLabel
  ui.hud.mounted.onDismount = onDismount
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

type TouchChromeHandlers = Partial<Pick<TouchChromeState, 'onPause' | 'onQuickActions' | 'onInteract' | 'onInteractUp' | 'onAltInteract' | 'onCycleTarget'>>
export function configureTouchChrome(handlers: TouchChromeHandlers): void {
  ui.touch.visible = true
  Object.assign(ui.touch, handlers)
}
export function setCycleTargetAvailable(available: boolean): void {
  if (ui.touch.cycleTargetAvailable === available) return
  ui.touch.cycleTargetAvailable = available
}
export function setTouchInputEnabled(enabled: boolean): void {
  if (ui.touch.inputEnabled === enabled) return
  ui.touch.inputEnabled = enabled
}
export function clearTouchChrome(): void {
  ui.touch.visible = false
  ui.touch.inputEnabled = true
  ui.touch.cycleTargetAvailable = false
  ui.touch.onPause = null
  ui.touch.onQuickActions = null
  ui.touch.onInteract = null
  ui.touch.onInteractUp = null
  ui.touch.onAltInteract = null
  ui.touch.onCycleTarget = null
}
