import type { PlayerSocialLookup } from '../../ai/reactionChance'
import type { createWorldAudio } from '../../audio/createWorldAudio'
import type { createKeyboard } from '../../input/Keyboard'
import type { createMouseLook } from '../../input/MouseLook'
import type { HeldTool } from '../../items/HeldTool'
import type { Inventory } from '../../items/Inventory'
import type { ItemKind } from '../../items/items'
import type { PlayerController } from '../../player/PlayerController'
import type { PlayerTorch } from '../../player/PlayerTorch'
import type { Hud } from '../../ui/createHud'
import type { Toast } from '../../ui/createToast'
import type { DayNightState } from '../../world/dayNight'
import type { TimeSkip } from '../../world/timeSkip'
import type { TreeLifecycle } from '../../world/treeLifecycle'
import type { BusyAction } from '../busyAction'
import type { RestCampSequence } from '../restCampSequence'
import type { WorldBundle } from '../worldBundle'

/** Everything the player-action modules (`src/app/actions/`) need from the
 *  composition root. It is deliberately one shared context object rather than
 *  a bespoke deps type per module: these actions all sit on the same seam —
 *  "a player interaction mutates world state + `Inventory`, then re-syncs the
 *  HUD/quick actions" — and splitting the context would only duplicate it.
 *
 *  Ownership is unchanged by the extraction: `createApp.ts` still creates and
 *  owns every field here; the action modules only read/mutate through them.
 *  `bundle` is passed by reference on purpose (its fields are replaced in
 *  place by `rebuildWorldBundle`, see `worldBundle.ts`), while values that are
 *  genuinely *reassigned* on a New Game are exposed as live accessors. */
export type PlayerActionContext = {
  bundle: WorldBundle
  player: PlayerController
  inventory: Inventory
  heldTool: HeldTool
  playerTorch: PlayerTorch
  hud: Hud
  toast: Toast
  busy: BusyAction
  timeSkip: TimeSkip
  restCamp: RestCampSequence
  dayNight: DayNightState
  mouseLook: ReturnType<typeof createMouseLook>
  /** Same shared `KeyState` `PlayerController` reads — plan 168's lodging
   *  walk steers the player through it (forced `forward` + look yaw) rather
   *  than a second movement pipeline; also used to detect a manual movement
   *  press as the player's cancel signal. */
  keyboard: ReturnType<typeof createKeyboard>
  /** Relation level + player standing lookup, by NPC name (plan 117) — plan
   *  168's lodging resolver reuses this for "friend" candidates instead of a
   *  second friendship registry. */
  getPlayerSocial: PlayerSocialLookup
  worldAudio: ReturnType<typeof createWorldAudio>
  /** Live accessor — `createApp` replaces the `TreeLifecycle` instance when a
   *  genuinely new world is started, so this must not be captured by value. */
  getTreeLifecycle: () => TreeLifecycle
  /** Post-inventory-mutation sync shared with trade/chop/mine/etc. */
  onInventoryChanged: () => void
  /** Same reward-granting path quest completions use (`createApp.ts`):
   *  per-unit `Inventory.add`/`addInstance`, overflow spills to
   *  `bundle.droppedItems` at the player's feet instead of being lost. */
  grantItem: (kind: ItemKind, count: number) => void
  syncQuickActionAvailability: () => void
  syncHeldHud: () => void
  refreshInventoryScreen: () => void
}

/** The standard "another blocking activity is already running" guard: a busy
 *  channel, an active time skip, or a camp-rest sequence. */
export function isActionBlocked(ctx: PlayerActionContext): boolean {
  return ctx.busy.isActive() || ctx.timeSkip.isActive() || ctx.restCamp.isActive()
}

/** Narrower guard for the two actions that have always only checked the busy
 *  channel and the time skip (corpse burial, tree chop) — kept distinct so the
 *  extraction doesn't silently change when those can start. */
export function isChannelBusy(ctx: PlayerActionContext): boolean {
  return ctx.busy.isActive() || ctx.timeSkip.isActive()
}
