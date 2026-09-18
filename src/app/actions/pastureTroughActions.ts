import { pastureTroughCanFill } from '../../settlement/pastureWater'
import { isActionBlocked, type PlayerActionContext } from './actionContext'

/** Short real-time action, same order of magnitude as `playerTrough.ts`'s
 *  `PLAYER_TROUGH_FILL_DURATION_SEC` — the implicit rope bucket can make
 *  several trips during one short busy action (plan settlements-npcs-046 §6). */
const PASTURE_TROUGH_FILL_DURATION_SEC = 3

export type PastureTroughActions = {
  fillPastureTrough: (settlementId: string) => void
}

/**
 * Player fill action for a generated settlement pasture trough (plan
 * settlements-npcs-046). No new water storage: mutation always lands on the
 * existing `Household.water` resolved through `Settlement
 * .resolvePastureWaterUse()` — the same canonical binding livestock drinking
 * at that trough already reads (`livestock.ts`/`animalForaging.ts`). State
 * never mutates on start; a cancelled/interrupted action or a completion-time
 * revalidation failure (settlement streamed out, pair no longer eligible,
 * reserve already full) grants no water.
 *
 * @domain settlements-npcs
 */
export function createPastureTroughActions(ctx: PlayerActionContext): PastureTroughActions {
  const { bundle, busy, toast } = ctx

  const resolveUse = (settlementId: string) =>
    bundle.settlementsManager.getLoaded()
      .find((settlement) => settlement.id === settlementId)
      ?.resolvePastureWaterUse() ?? null

  const fillPastureTrough = (settlementId: string): void => {
    if (isActionBlocked(ctx)) return
    const use = resolveUse(settlementId)
    if (!use) return
    if (!pastureTroughCanFill(use.household)) {
      toast.show('Koryto pełne.', 'error')
      return
    }
    busy.start(PASTURE_TROUGH_FILL_DURATION_SEC, 'Napełnianie koryta…', () => {
      const liveUse = resolveUse(settlementId)
      if (!liveUse || !pastureTroughCanFill(liveUse.household)) return
      liveUse.household.water.fillToCapacity()
      toast.show('Napełniono koryto.')
    })
  }

  return { fillPastureTrough }
}
