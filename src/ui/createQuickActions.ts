import { getMountedVueUi } from '../ui-vue/mount'

export type RestVariant = 'camp' | 'town'
export type RestOutcome = 'ok' | 'too-far' | 'no-blanket'

export type QuickActionsHandlers = {
  /** Same handlers passed to `createPauseMenu`'s fire/torch buttons — these
   *  are a second UI entry point onto identical logic (`app/userActions.ts`),
   *  not a duplicate. Each returns false (consumes nothing) if the player
   *  lacks the resources. */
  onBuildSimpleFire?: () => boolean
  onBuildFirePit?: () => boolean
  onLightTorch?: () => boolean
  /** Starts a "wait" time skip (1/3/6h, visible fast-forward) — see
   *  `world/timeSkip.ts`. */
  onWait?: (hours: number) => void
  /** Starts an 8h "rest" time skip (fades to black). Both variants require a
   *  blanket in the inventory — returns `'no-blanket'` (consumes nothing) if
   *  missing; `'town'` additionally requires the player to be near a
   *  settlement — returns `'too-far'` (consumes nothing) if not. */
  onRest?: (variant: RestVariant) => RestOutcome
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

  return {
    isOpen: () => !disposed && (getUi()?.isQuickActionsOpen() ?? false),
    toggle: () => { if (!disposed) getUi()?.toggleQuickActions() },
    close: () => { if (!disposed) getUi()?.closeQuickActions() },
    dispose: () => { if (!disposed) { disposed = true; getUi()?.closeQuickActions() } },
  }
}
