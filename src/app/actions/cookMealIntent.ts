import type { Inventory } from '../../items/Inventory'
import type { ItemKind } from '../../items/items'
import type { PlayerController } from '../../player/PlayerController'
import type { DayNightState } from '../../world/dayNight'
import type { BusyAction } from '../busyAction'
import type { WorldBundle } from '../worldBundle'
import type { ActionResult } from './actionContracts'
import type { PlacementPreviewActions } from './placementPreviewActions'
import type { SurvivalActionLifecycle, SurvivalActions } from './survivalActions'
import { COOKING_RECIPES, findCookingBatch } from '../../items/campfireCooking'
import {
  type CookingFireRef,
  resolveCookingFireByRef,
  resolveNearbyCookingFire,
} from '../../items/cookingFireResolver'
import { resolveSensibleFoodKind } from '../../items/sensibleFood'
import { isActionBlocked, type PlayerActionContext } from './actionContext'

export type CookMealIntentPhase =
  | 'resolve'
  | 'waiting-for-fire-placement'
  | 'igniting'
  | 'cooking'
  | 'eating'
  | 'done'
  | 'cancelled'

export type CookMealIntentController = {
  startCookMeal: () => void
  cancel: () => void
  isActive: () => boolean
}

type CookMealIntentDeps = {
  ctx: PlayerActionContext
  bundle: WorldBundle
  player: PlayerController
  inventory: Inventory
  dayNight: DayNightState
  survival: Pick<SurvivalActions, 'startIgniteFire' | 'startCookAt' | 'consumeItem'>
  placementPreview: Pick<PlacementPreviewActions, 'start' | 'cancel' | 'isActive'>
  busy: BusyAction
  toast: { show: (text: string, kind?: 'info' | 'error' | 'pickup') => void }
}

const COOKED_FOOD_KINDS: ReadonlySet<ItemKind> = new Set(COOKING_RECIPES.map((recipe) => recipe.output))

/**
 * Single-active player intent for "Ugotuj posiłek" (plan ui-input-010).
 * Owns transient sequencing only — inventory, fires and busy actions remain
 * authoritative in their existing systems.
 *
 * @domain ui-input
 */
export function createCookMealIntent(deps: CookMealIntentDeps): CookMealIntentController {
  const { ctx, bundle, player, inventory, dayNight, survival, placementPreview, busy, toast } = deps
  let phase: CookMealIntentPhase | null = null
  let fireRef: CookingFireRef | null = null

  const clear = (): void => {
    phase = null
    fireRef = null
  }

  const cancel = (): void => {
    if (!phase) return
    if (phase === 'waiting-for-fire-placement' && placementPreview.isActive()) {
      placementPreview.cancel()
    }
    if (phase === 'igniting' || phase === 'cooking') {
      busy.cancel()
    }
    clear()
  }

  const playerPos = (): { x: number, z: number } => ({
    x: player.mesh.position.x,
    z: player.mesh.position.z,
  })

  const resolveFire = (): ReturnType<typeof resolveCookingFireByRef> => {
    if (!fireRef) return null
    return resolveCookingFireByRef(fireRef, bundle.placedFires, bundle.settlementsManager.getLoaded())
  }

  const hasCookableFood = (): boolean =>
    findCookingBatch(inventory, 1, dayNight.elapsedDays) != null

  const tryEatCookedFood = (): void => {
    phase = 'eating'
    const kind = resolveSensibleFoodKind(
      inventory,
      player.needs,
      dayNight.elapsedDays,
      COOKED_FOOD_KINDS,
    )
    if (!kind) {
      clear()
      return
    }
    survival.consumeItem(kind)
    clear()
  }

  const isActive = (): boolean => phase != null

  const beginCook = (): void => {
    const fire = resolveFire()
    if (!fire || !fire.isLit()) {
      cancel()
      return
    }
    if (!hasCookableFood()) {
      toast.show('Potrzebujesz surowego mięsa lub ryby.', 'error')
      cancel()
      return
    }
    phase = 'cooking'
    const lifecycle: SurvivalActionLifecycle = {
      onComplete: (outcome) => {
        if (outcome === 'success') tryEatCookedFood()
        else cancel()
      },
      onCancel: () => cancel(),
    }
    const result = survival.startCookAt(fire, lifecycle)
    if (!result.ok) cancel()
  }

  const beginIgnite = (): void => {
    const fire = resolveFire()
    if (!fire) {
      cancel()
      return
    }
    if (fire.isLit()) {
      beginCook()
      return
    }
    phase = 'igniting'
    const lifecycle: SurvivalActionLifecycle = {
      onComplete: (outcome) => {
        if (outcome === 'success') beginCook()
        else cancel()
      },
      onCancel: () => cancel(),
    }
    const result = survival.startIgniteFire(fire, lifecycle)
    if (!result.ok) cancel()
  }

  const beginPlacement = (): void => {
    phase = 'waiting-for-fire-placement'
    placementPreview.start('fireSimple', {
      onConfirmed: ({ placedFireId }) => {
        fireRef = { source: 'placed', id: placedFireId }
        const fire = resolveFire()
        if (!fire) {
          cancel()
          return
        }
        if (fire.isLit()) beginCook()
        else beginIgnite()
      },
      onCancelled: () => cancel(),
    })
  }

  const startCookMeal = (): void => {
    cancel()
    if (isActionBlocked(ctx)) return
    if (!hasCookableFood()) {
      toast.show('Potrzebujesz surowego mięsa lub ryby.', 'error')
      return
    }
    phase = 'resolve'
    const pos = playerPos()
    const nearby = resolveNearbyCookingFire(
      pos.x,
      pos.z,
      bundle.placedFires,
      bundle.settlementsManager.getLoaded(),
    )
    if (nearby) {
      fireRef = nearby.ref
      if (nearby.lit) beginCook()
      else beginIgnite()
      return
    }
    beginPlacement()
  }

  return { startCookMeal, cancel, isActive }
}

/** Quick action wrapper — returns toast feedback for the Vue layer. */
export function runEatAnything(
  inventory: Inventory,
  player: PlayerController,
  dayNight: DayNightState,
  consumeItem: (kind: ItemKind) => ActionResult,
): { ok: boolean, toast: string, kind: 'info' | 'error' | 'pickup' } {
  const kind = resolveSensibleFoodKind(inventory, player.needs, dayNight.elapsedDays)
  if (!kind) return { ok: false, toast: 'Nie masz nic do jedzenia.', kind: 'error' }
  const result = consumeItem(kind)
  if (!result.ok) return { ok: false, toast: 'Nie masz nic do jedzenia.', kind: 'error' }
  return { ok: true, toast: '', kind: 'pickup' }
}
