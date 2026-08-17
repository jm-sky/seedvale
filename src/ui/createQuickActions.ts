import type { LightActionResult } from '../app/userActions'
import type { TrapKind } from '../world/animalTraps'
import { getMountedVueUi } from '../ui-vue/mount'

/** Which trap kinds are currently in the inventory — one flag per
 *  `TrapKind`, kept live by `createApp.ts`'s `syncQuickActionAvailability`. */
export type QuickActionsTraps = Record<TrapKind, boolean>

export type RestVariant = 'camp' | 'town'
export type RestOutcome = 'ok' | 'too-far' | 'no-blanket'

export type QuickActionsHandlers = {
  /** Same handlers passed to `createPauseMenu`'s fire/torch buttons — these
   *  are a second UI entry point onto identical logic (`app/userActions.ts`),
   *  not a duplicate. Each returns false (consumes nothing) if the player
   *  lacks the resources. */
  onBuildSimpleFire?: () => boolean
  onBuildFirePit?: () => boolean
  onLightBranch?: () => LightActionResult
  onLightWoodenTorch?: () => LightActionResult
  /** Starts a "wait" time skip (1/3/6h, visible fast-forward) — see
   *  `world/timeSkip.ts`. */
  onWait?: (hours: number) => void
  /** Starts an 8h "rest" time skip. Both variants require a blanket in the
   *  inventory — returns `'no-blanket'` (consumes nothing) if missing;
   *  `'town'` additionally requires the player to be near a settlement —
   *  returns `'too-far'` (consumes nothing) if not. The town button is also
   *  hidden via `nearTown` when far. */
  onRest?: (variant: RestVariant) => RestOutcome
  /** Shovel dig / level when the player owns a shovel (HUD only when held). */
  onDig?: () => void
  onLevel?: () => void
  onPlaceTent?: () => void
  /** Sets an animal trap down in front of the player (plan 141) — the same
   *  inventory → world placement shape as `onPlaceTent`. */
  onPlaceTrap?: (kind: TrapKind) => void
  /** Initial shovel ownership for showing dig/level buttons. */
  hasShovel?: boolean
  /** Initial tent ownership for showing "Rozstaw namiot". */
  hasTent?: boolean
  /** Which trap kinds the player currently carries (plan 141). */
  traps?: QuickActionsTraps
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
  if (typeof handlers.hasShovel === 'boolean') {
    getUi()?.setQuickActionsHasShovel(handlers.hasShovel)
  }
  if (typeof handlers.hasTent === 'boolean') {
    getUi()?.setQuickActionsHasTent(handlers.hasTent)
  }
  if (typeof handlers.nearTown === 'boolean') {
    getUi()?.setQuickActionsNearTown(handlers.nearTown)
  }
  if (handlers.traps) {
    getUi()?.setQuickActionsTraps(handlers.traps)
  }

  return {
    isOpen: () => !disposed && (getUi()?.isQuickActionsOpen() ?? false),
    toggle: () => { if (!disposed) getUi()?.toggleQuickActions() },
    close: () => { if (!disposed) getUi()?.closeQuickActions() },
    dispose: () => { if (!disposed) { disposed = true; getUi()?.closeQuickActions() } },
  }
}
