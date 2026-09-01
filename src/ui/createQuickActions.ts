import type { PlacementPreviewKind } from '../app/actions/placementPreviewActions'
import type { LightActionResult } from '../app/userActions'
import type { TrapKind } from '../world/animalTraps'
import type { CropId } from '../world/cropLifecycle'
import { getMountedVueUi } from '../ui-vue/mount'

/** Which trap kinds are currently in the inventory — one flag per
 *  `TrapKind`, kept live by `createApp.ts`'s `syncQuickActionAvailability`. */
export type QuickActionsTraps = Record<TrapKind, boolean>

/** Which crop seed kinds are currently in the inventory (plan 126) — same
 *  live-kept-flag shape as `QuickActionsTraps`. */
export type QuickActionsCropSeeds = Record<CropId, boolean>

export type RestVariant = 'camp' | 'town'
/** `'choose'` — near a settlement with at least one available lodging option;
 *  `onRest` already opened the "Nocuj w mieście" choice panel (plan 168
 *  follow-up) as a side effect, so the caller has nothing further to do.
 *  `'no-lodging'` — near a settlement, but the resolver found no bed, friend,
 *  paid or hay option at all (should be rare: a loaded settlement always
 *  offers hay). */
export type RestOutcome = 'ok' | 'too-far' | 'no-blanket' | 'no-lodging' | 'choose'

export type QuickActionsHandlers = {
  /** Grate upgrade for the nearest qualifying player-built fire (plan 175). */
  onBuildGrate?: () => boolean
  onLightBranch?: () => LightActionResult
  onLightWoodenTorch?: () => LightActionResult
  /** Starts a "wait" time skip (1/3/6h, visible fast-forward) — see
   *  `world/timeSkip.ts`. */
  onWait?: (hours: number) => void
  /** `'camp'` starts an 8h rest time skip and requires a blanket — returns
   *  `'no-blanket'` (consumes nothing) if missing. `'town'` ("Nocuj w
   *  mieście", plan 168) requires the player to be near a settlement —
   *  returns `'too-far'` if not, `'no-lodging'` if the resolver found no
   *  candidate at all — otherwise opens the "Nocuj w mieście" choice panel
   *  (`'choose'`, plan 168 follow-up) listing every available `LodgingOption`
   *  for the player to pick; a paid pick shows its own confirm step before
   *  anything is charged, and only a confirmed/free pick arms movement + only
   *  starts Sleep on arrival. The town button is also hidden via `nearTown`
   *  when far. */
  onRest?: (variant: RestVariant) => RestOutcome
  /** Shovel dig / level when the player owns a shovel (HUD only when held). */
  onDig?: () => void
  onLevel?: () => void
  /** "Zrób górkę" (plan `world-terrain-002` §1) — inverse of `onDig`. */
  onMound?: () => void
  /** "Przygotuj teren" (plan `world-terrain-002` §2) — enters the preview
   *  mode; confirm/cancel happen in-world, not through this panel. */
  onPrepareTerrain?: () => void
  /** Enters the shared placement-preview mode for `kind` (plan `ui-input-004`
   *  §2/§3/§7) — the "Budowa" category's chest/tent/fire actions. */
  onStartPlacementPreview?: (kind: PlacementPreviewKind) => void
  /** Sets an animal trap down in front of the player (plan 141) — the same
   *  inventory → world placement shape as the tent placement preview. */
  onPlaceTrap?: (kind: TrapKind) => void
  /** Puts the carried container back down (plan 164 §8) — shown only while
   *  `hasCarriedContainer` is true. */
  onPutDownContainer?: () => void
  /** Places a new player-built well ahead of the player (plan 127) — shown
   *  alongside dig/level while `hasDiggingTool` is true. */
  onBuildWell?: () => void
  /** Places a new player-built garden plot ahead of the player (plan 174) —
   *  shown alongside dig/level/well the same way, gated by `hasDiggingTool`. */
  onBuildGarden?: () => void
  /** Plants a `tree_seed` from inventory ahead of the player (plan 126). */
  onPlantTree?: () => void
  /** Plants a crop seed of `cropId` ahead of the player (plan 126). */
  onPlantCrop?: (cropId: CropId) => void
  /** Equips the carried `fishing_rod` via the existing `HeldTool`/equipment
   *  mechanism (plan `ui-input-006`) — the Quick Action only equips it; it
   *  does not look for water or start fishing itself. */
  onEquipFishingRod?: () => void
  /** Initial digging-capability ownership for showing dig/level buttons. */
  hasDiggingTool?: boolean
  /** Initial tent ownership for showing "Rozstaw namiot". */
  hasTent?: boolean
  /** Initial unplaced-chest ownership for showing "Postaw skrzynię". */
  hasChest?: boolean
  /** Initial `wooden_torch` ownership for showing "Postaw pochodnię" (plan
   *  items-player-009), same shape as `hasChest`. */
  hasWoodenTorch?: boolean
  /** Initial carried-container flag for showing "Odłóż skrzynię". */
  hasCarriedContainer?: boolean
  /** Which trap kinds the player currently carries (plan 141). */
  traps?: QuickActionsTraps
  /** Initial tree-seed ownership for showing "Zasadź drzewo" (plan 126). */
  hasTreeSeed?: boolean
  /** Initial fishing-rod ownership for showing "Łów ryby" (plan `ui-input-006`). */
  hasFishingRod?: boolean
  /** Which crop seed kinds the player currently carries (plan 126). */
  cropSeeds?: QuickActionsCropSeeds
  /** Initial near-settlement flag for showing "Odpocznij w mieście". */
  nearTown?: boolean
  /** Fired when the panel transitions from closed → open (e.g. release pointer lock). */
  onOpen?: () => void
  /** Fired when the panel transitions from open → closed (e.g. restore pointer lock). */
  onClose?: () => void
}

export type QuickActions = {
  isOpen: () => boolean
  toggle: () => void
  close: () => void
  dispose: () => void
}

/** Compatibility facade. The actual quick-actions popover is rendered by Vue
 *  (`ui-vue/screens/QuickActionsScreen.vue`). */
export function createQuickActions(
  _parent: HTMLElement,
  handlers: QuickActionsHandlers = {},
): QuickActions {
  let disposed = false
  const getUi = () => getMountedVueUi()
  getUi()?.configureQuickActions(handlers)
  if (typeof handlers.hasDiggingTool === 'boolean') {
    getUi()?.setQuickActionsHasDiggingTool(handlers.hasDiggingTool)
  }
  if (typeof handlers.hasTent === 'boolean') {
    getUi()?.setQuickActionsHasTent(handlers.hasTent)
  }
  if (typeof handlers.hasChest === 'boolean') {
    getUi()?.setQuickActionsHasChest(handlers.hasChest)
  }
  if (typeof handlers.hasWoodenTorch === 'boolean') {
    getUi()?.setQuickActionsHasWoodenTorch(handlers.hasWoodenTorch)
  }
  if (typeof handlers.hasCarriedContainer === 'boolean') {
    getUi()?.setQuickActionsHasCarriedContainer(handlers.hasCarriedContainer)
  }
  if (typeof handlers.nearTown === 'boolean') {
    getUi()?.setQuickActionsNearTown(handlers.nearTown)
  }
  if (handlers.traps) {
    getUi()?.setQuickActionsTraps(handlers.traps)
  }
  if (typeof handlers.hasTreeSeed === 'boolean') {
    getUi()?.setQuickActionsHasTreeSeed(handlers.hasTreeSeed)
  }
  if (typeof handlers.hasFishingRod === 'boolean') {
    getUi()?.setQuickActionsHasFishingRod(handlers.hasFishingRod)
  }
  if (handlers.cropSeeds) {
    getUi()?.setQuickActionsCropSeeds(handlers.cropSeeds)
  }

  return {
    isOpen: () => !disposed && (getUi()?.isQuickActionsOpen() ?? false),
    toggle: () => { if (!disposed) getUi()?.toggleQuickActions() },
    close: () => { if (!disposed) getUi()?.closeQuickActions() },
    dispose: () => { if (!disposed) { disposed = true; getUi()?.closeQuickActions() } },
  }
}
